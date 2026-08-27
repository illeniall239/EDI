"""
What models this machine can actually reach, right now.

The picker is only worth having if it knows the answer without being told. So
rather than listing the providers and hoping, this asks: Ollama for the
models it has pulled, the Claude Code CLI whether it is signed in, and every
hosted provider with a key present for its own model list. What comes back is
what a person can click on.

It reports; it does not advise. Which model is the right one depends on the
sheet, the question, the hardware and whose bill it is, and this module knows
none of that.

Everything here is a read. Nothing in this module spends a model call, and
nothing here can change what the app is configured to do -- that is
model_prefs' job, and it is guarded.

Probes are deliberately built on urllib rather than requests or httpx. They
run at import on an unconfigured install, and adding a dependency to the
default requirements to ask Ollama what it has would be a poor trade.
"""

import concurrent.futures
import json
import logging
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional

import llm_providers
import model_prefs

logger = logging.getLogger(__name__)

# Long enough for a hosted provider on a slow connection, short enough that
# six of them in parallel cannot make the dropdown feel broken.
PROBE_TIMEOUT = 6

# How long a built catalog is reused. Opening the dropdown twice in a row
# should not re-probe six endpoints; noticing that you just started Ollama
# should not take a restart.
CACHE_SECONDS = 20

LABELS = {
    "ollama": "Ollama",
    # Two ways to the same models, so the labels name the difference: one
    # authenticates with an API key, the other with the CLI login already on
    # this machine.
    "claude": "Claude",
    "anthropic": "Anthropic API",
    "google": "Google",
    "openai": "OpenAI",
    "groq": "Groq",
    "openai-compatible": "OpenAI-compatible",
}

# The order providers are tried in when nobody has chosen yet, and the order
# they are listed in.
#
# It is the order PROVIDERS declares them, not a ranking. Something has to go
# first when three of them answer, and any rule for that would be this
# module's opinion about somebody else's hardware, bill and data -- so the
# rule is "the order they were written down", which at least does not pretend
# to be advice. The picker is one click away regardless.
TRY_ORDER = tuple(llm_providers.PROVIDERS)

# Hosts that mean the model is running on this machine. Everything else is
# somebody's server, however the request gets there.
_LOOPBACK = ("localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]", "host.docker.internal")

# Substrings that mean "not a chat model". Every hosted list endpoint returns
# embeddings, speech and image models alongside the ones that can answer a
# question, and offering those in this picker would just be a way to get a
# confusing error.
_NOT_CHAT = (
    "embed", "whisper", "tts", "dall-e", "moderation", "audio", "realtime",
    "image", "rerank", "guard", "search", "transcribe", "sora", "veo", "imagen",
)

_cache: Dict[str, Any] = {"at": 0.0, "value": None}


def _get_json(url: str, headers: Optional[Dict[str, str]] = None) -> Optional[Any]:
    request = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=PROBE_TIMEOUT) as response:
            return json.loads(response.read().decode("utf-8", "replace"))
    except (urllib.error.URLError, OSError, ValueError, TimeoutError) as exc:
        logger.debug("Probe failed for %s: %s", url, exc)
        return None


def _is_chat_model(name: str) -> bool:
    lowered = name.lower()
    return not any(word in lowered for word in _NOT_CHAT)


def _base(url: str) -> str:
    return (url or "").rstrip("/")


def runs_on_this_machine(provider: str, base_url: Optional[str]) -> bool:
    """
    Does using this provider keep the sheet on this machine?

    Asked of the endpoint rather than the provider name, because the answer
    is not a property of the name. `openai-compatible` is LM Studio on
    localhost for one person and OpenRouter for the next, and those are
    opposite answers to the only question the front page makes a promise
    about.

    Claude is the case worth being careful with: the binary is local, the
    login is the user's own, and the rows still go to Anthropic. So it
    answers False here -- not as a mark against it, but because the front
    page makes a specific promise about where the data goes and this is the
    function that has to be right about it.
    """
    if provider not in ("ollama", "openai-compatible"):
        return False
    if not base_url:
        return False
    host = urllib.parse.urlparse(base_url).hostname or ""
    return host.lower() in _LOOPBACK


def probe_ollama(base_url: str) -> Dict[str, Any]:
    payload = _get_json(f"{_base(base_url)}/api/tags")
    if payload is None:
        return {"reachable": False, "models": []}
    models = [
        entry.get("name") for entry in (payload.get("models") or [])
        if entry.get("name")
    ]
    return {"reachable": True, "models": sorted(models)}


def probe_openai_compatible(base_url: str, api_key: Optional[str]) -> Dict[str, Any]:
    # LM Studio, vLLM and llama.cpp all mount /models under whatever base they
    # were given, which is usually already .../v1.
    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    payload = _get_json(f"{_base(base_url)}/models", headers)
    if payload is None:
        return {"reachable": False, "models": []}
    models = [entry.get("id") for entry in (payload.get("data") or []) if entry.get("id")]
    return {"reachable": True, "models": sorted(m for m in models if _is_chat_model(m))}


def probe_openai(api_key: str) -> Dict[str, Any]:
    payload = _get_json(
        "https://api.openai.com/v1/models",
        {"Authorization": f"Bearer {api_key}"},
    )
    if payload is None:
        return {"reachable": False, "models": []}
    models = [entry.get("id") for entry in (payload.get("data") or []) if entry.get("id")]
    return {"reachable": True, "models": sorted(m for m in models if _is_chat_model(m))}


def probe_groq(api_key: str) -> Dict[str, Any]:
    payload = _get_json(
        "https://api.groq.com/openai/v1/models",
        {"Authorization": f"Bearer {api_key}"},
    )
    if payload is None:
        return {"reachable": False, "models": []}
    models = [entry.get("id") for entry in (payload.get("data") or []) if entry.get("id")]
    return {"reachable": True, "models": sorted(m for m in models if _is_chat_model(m))}


def probe_anthropic(api_key: str) -> Dict[str, Any]:
    payload = _get_json(
        "https://api.anthropic.com/v1/models?limit=100",
        {"x-api-key": api_key, "anthropic-version": "2023-06-01"},
    )
    if payload is None:
        return {"reachable": False, "models": []}
    models = [entry.get("id") for entry in (payload.get("data") or []) if entry.get("id")]
    return {"reachable": True, "models": sorted(models, reverse=True)}


def probe_google(api_key: str) -> Dict[str, Any]:
    payload = _get_json(
        "https://generativelanguage.googleapis.com/v1beta/models"
        f"?key={urllib.parse.quote(api_key)}&pageSize=200"
    )
    if payload is None:
        return {"reachable": False, "models": []}
    models = []
    for entry in payload.get("models") or []:
        name = (entry.get("name") or "").split("/")[-1]
        # generateContent is the only method this app uses; the list also
        # carries embedding and token-counting models.
        if name and "generateContent" in (entry.get("supportedGenerationMethods") or []):
            models.append(name)
    return {"reachable": True, "models": sorted(m for m in models if _is_chat_model(m))}


def probe_claude_code() -> Dict[str, Any]:
    import claude_code_llm

    status = claude_code_llm.auth_status()
    if not status.get("installed"):
        return {"reachable": False, "models": [], "detail": "The claude CLI is not on PATH."}
    if not status.get("logged_in"):
        return {
            "reachable": False,
            "models": [],
            "detail": "The claude CLI is installed but not signed in. Run `claude auth login`.",
        }
    plan = status.get("plan")
    return {
        "reachable": True,
        "models": list(claude_code_llm.MODEL_ALIASES),
        # Both halves of this are load-bearing. The credentials are the
        # user's and stay on their machine; the spreadsheet rows do not.
        "detail": f"Signed in{f' on the {plan} plan' if plan else ''} through the "
                  "Claude Code CLI. Your question and result rows go to Anthropic.",
    }


def base_url_for(provider: str) -> Optional[str]:
    spec = llm_providers.PROVIDERS[provider]
    saved = model_prefs.load()
    if saved.get("provider") == provider and saved.get("base_url"):
        return saved["base_url"]
    env = (os.getenv("EDI_LLM_BASE_URL") or "").strip()
    if env and (os.getenv("EDI_LLM_PROVIDER") or "").strip().lower() == provider:
        return env
    return spec.default_base_url


def _probe(provider: str) -> Dict[str, Any]:
    """One provider's live state. Never raises -- a dead probe is a result."""
    spec = llm_providers.PROVIDERS[provider]
    api_key, key_source = llm_providers.key_for(provider)
    base_url = base_url_for(provider)

    entry: Dict[str, Any] = {
        "id": provider,
        "label": LABELS.get(provider, provider),
        "local": runs_on_this_machine(provider, base_url),
        "installed": llm_providers.package_available(provider),
        "needs_key": bool(spec.key_kwarg and spec.key_required),
        "has_key": bool(api_key),
        "key_source": key_source,
        "base_url": base_url,
        "default_model": spec.default_model,
        "reachable": False,
        "models": [],
        "detail": None,
    }

    if not entry["installed"]:
        entry["detail"] = (
            f"Needs the {spec.package} package: pip install {spec.package}"
        )
        return entry

    try:
        if provider == "claude":
            entry.update(probe_claude_code())
        elif provider == "ollama":
            entry.update(probe_ollama(base_url))
            if not entry["reachable"]:
                entry["detail"] = (
                    f"Nothing answering on {base_url}. Start it with `ollama serve`."
                )
            elif not entry["models"]:
                entry["detail"] = (
                    "Running, but no models pulled. Try `ollama pull qwen2.5-coder:7b`."
                )
        elif provider == "openai-compatible":
            if not base_url:
                entry["detail"] = "Set the endpoint to talk to."
            else:
                entry.update(probe_openai_compatible(base_url, api_key))
                if not entry["reachable"]:
                    entry["detail"] = f"Nothing answering on {base_url}."
        elif not api_key:
            entry["detail"] = "No API key yet."
        elif provider == "openai":
            entry.update(probe_openai(api_key))
        elif provider == "anthropic":
            entry.update(probe_anthropic(api_key))
        elif provider == "groq":
            entry.update(probe_groq(api_key))
        elif provider == "google":
            entry.update(probe_google(api_key))
    except Exception as exc:  # noqa: BLE001 - a probe must never break the page
        logger.debug("Probe for %s raised: %s", provider, exc)
        entry["detail"] = "Could not be reached."

    if api_key and not entry["reachable"] and not entry["detail"]:
        entry["detail"] = "The key was not accepted, or the provider is unreachable."
    return entry


def catalog(refresh: bool = False) -> List[Dict[str, Any]]:
    """Every provider, with what it can actually offer. Cached briefly."""
    now = time.monotonic()
    if not refresh and _cache["value"] is not None and now - _cache["at"] < CACHE_SECONDS:
        return _cache["value"]

    names = list(llm_providers.PROVIDERS)
    # Probed together: six sequential network round trips would make opening
    # a dropdown feel like loading a page.
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(names)) as pool:
        entries = list(pool.map(_probe, names))

    # Ones that can actually answer first, then declaration order. Sorting on
    # reachability is a usability call rather than a preference -- a provider
    # with no key has nothing to click -- and nothing below that reorders the
    # working ones.
    rank = {name: i for i, name in enumerate(TRY_ORDER)}
    entries.sort(key=lambda e: (not e["reachable"], rank.get(e["id"], len(rank))))
    _cache["at"] = now
    _cache["value"] = entries
    return entries


def invalidate() -> None:
    """Forget the cached catalog -- after a key is added, or one is removed."""
    _cache["at"] = 0.0
    _cache["value"] = None


# Names that suggest a model can write SQL, which is the one genuinely
# demanding thing this app asks of one. Only ever used to pick a starting
# point for an install nobody has configured -- it never reorders the list
# anyone sees, and `check_model.py` is what actually answers whether a model
# is any good.
_PROMISING = ("coder", "code", "qwen", "instruct", "llama", "mistral", "gemma", "phi")


def _best_guess(entry: Dict[str, Any]) -> str:
    """Which of a provider's models to start on."""
    models = entry["models"]
    if entry["default_model"] in models:
        return entry["default_model"]
    for word in _PROMISING:
        for name in models:
            if word in name.lower():
                return name
    return models[0]


def detect() -> Optional[Dict[str, str]]:
    """
    Something that will work, for an install nobody has configured.

    This is what makes the app usable on a fresh clone: with no .env and no
    saved choice, it finds a model that answers instead of reporting that
    GOOGLE_API_KEY is missing. First one that works, in declaration order --
    see TRY_ORDER for why that is not a ranking.
    """
    entries = {entry["id"]: entry for entry in catalog()}
    for name in TRY_ORDER:
        entry = entries.get(name)
        if not entry or not entry["reachable"] or not entry["models"]:
            continue
        return {
            "provider": entry["id"],
            "model": _best_guess(entry),
            "base_url": entry["base_url"],
        }
    return None
