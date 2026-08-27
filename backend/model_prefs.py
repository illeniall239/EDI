"""
Which model the person using this chose, and any keys they typed in.

Everything here lives in a file on the machine running the backend, next to
the workspaces. It is never returned by an endpoint, never logged, and never
sent anywhere: the only thing the browser is ever told about a key is whether
one exists. That is the entire security model, and it works because the
default deployment of this app is somebody's own laptop -- the server and the
user are the same person.

Which is also why runtime switching is refused on a public deployment. There
"the server" is somebody else's disk, and a visitor pasting their OpenAI key
into a dropdown would be handing it to a stranger. See `control_allowed()`.
"""

import json
import logging
import os
import stat
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

FILENAME = "model.json"


def _data_dir() -> Path:
    # The same directory the SQLite workspace store uses, resolved the same
    # way, so everything this install owns sits in one place a person can
    # delete.
    return Path(os.getenv("EDI_DATA_DIR") or ".edi-data").expanduser()


def _path() -> Path:
    return _data_dir() / FILENAME


def _flag(name: str) -> Optional[bool]:
    raw = (os.getenv(name) or "").strip().lower()
    if raw in ("1", "true", "yes", "on"):
        return True
    if raw in ("0", "false", "no", "off"):
        return False
    return None


def control_allowed() -> bool:
    """
    May the browser change which model this backend uses, or store a key?

    Yes when EDI is running for the person in front of it, no when it is on a
    public URL. There is no sign-in, so "who is asking" is not a question this
    app can answer -- the proxy for it is EDI_LIMITS_ENABLED, which the README
    already tells you to set before anyone else can reach the deployment. If
    that is on, this is off.

    EDI_ALLOW_MODEL_SWITCHING overrides in both directions, for the two cases
    the proxy gets wrong: a private deployment that wants the caps on anyway,
    and a shared one that has limits off but still should not let visitors
    repoint the server at an endpoint of their choosing.
    """
    explicit = _flag("EDI_ALLOW_MODEL_SWITCHING")
    if explicit is not None:
        return explicit
    return _flag("EDI_LIMITS_ENABLED") is not True


def load() -> Dict[str, Any]:
    """The saved preferences, or an empty dict when there are none."""
    path = _path()
    try:
        with open(path, encoding="utf-8") as handle:
            data = json.load(handle)
    except FileNotFoundError:
        return {}
    except (OSError, ValueError) as exc:
        # A corrupt prefs file must not stop the app coming up; the env-based
        # configuration underneath it is still perfectly good.
        logger.warning("Ignoring unreadable %s: %s", path, exc)
        return {}
    return data if isinstance(data, dict) else {}


def _write(data: Dict[str, Any]) -> None:
    path = _path()
    path.parent.mkdir(parents=True, exist_ok=True)
    # Written to a temp file and moved, so an interrupted write cannot leave
    # a half-parsed file that the next start silently discards.
    temp = path.with_suffix(".tmp")
    with open(temp, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)
    try:
        # Owner-only. This does what you would hope on macOS and Linux; on
        # Windows it sets little more than the read-only bit, and what
        # actually keeps the file private there is that it sits under the
        # user's own profile. Worth knowing before storing a key on a
        # multi-user Windows box.
        os.chmod(temp, stat.S_IRUSR | stat.S_IWUSR)
    except OSError:
        pass
    os.replace(temp, path)


def choice() -> Optional[Dict[str, Any]]:
    """The saved provider/model, or None if nobody has picked one."""
    data = load()
    provider = (data.get("provider") or "").strip()
    if not provider:
        return None
    return {
        "provider": provider,
        "model": (data.get("model") or "").strip(),
        "base_url": (data.get("base_url") or "").strip() or None,
    }


def save_choice(provider: str, model: str, base_url: Optional[str] = None) -> None:
    data = load()
    data["provider"] = provider
    data["model"] = model
    if base_url:
        data["base_url"] = base_url
    else:
        data.pop("base_url", None)
    _write(data)


def clear_choice() -> None:
    """Go back to whatever the environment says."""
    data = load()
    for field in ("provider", "model", "base_url"):
        data.pop(field, None)
    _write(data)


def key_for(provider: str) -> Optional[str]:
    keys = load().get("keys") or {}
    value = keys.get(provider)
    return value.strip() if isinstance(value, str) and value.strip() else None


def providers_with_keys() -> set:
    keys = load().get("keys") or {}
    return {name for name, value in keys.items() if isinstance(value, str) and value.strip()}


def save_key(provider: str, api_key: str) -> None:
    data = load()
    keys = data.setdefault("keys", {})
    keys[provider] = api_key.strip()
    _write(data)


def forget_key(provider: str) -> bool:
    data = load()
    keys = data.get("keys") or {}
    if provider not in keys:
        return False
    keys.pop(provider)
    data["keys"] = keys
    _write(data)
    return True


def location() -> str:
    """Where the file is, for telling a person what to delete."""
    return str(_path())
