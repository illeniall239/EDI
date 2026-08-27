"""
Claude, reached through the Claude Code CLI.

The model here is Claude -- the same Sonnet, Opus, Haiku and Fable the
`anthropic` provider serves. What is different is only the door: instead of an
API key, this goes through the `claude` binary already on the user's PATH and
already signed in as them. Someone who uses Claude Code therefore has a
working model in the picker with nothing to configure.

Be exact about what it is, because it is easy to oversell: this is not a free
path and not a credential-less one. It runs on that person's own Claude
subscription -- `claude auth status` reports a plan or it reports nothing --
and the credentials stay where the CLI put them. EDI never reads them, never
stores them, and never sends them anywhere. It runs a binary that is already
signed in, as the user who is already signed in.

Which is the same rule the whole picker follows: whatever authenticates a
model belongs to the person running this, and never leaves their machine.

**How it is invoked matters a great deal.** Claude Code is an agent, and its
default prompt carries a tool harness this app has no use for. Measured on
claude 2.1.246, asking for one word:

    default flags                     22,000 token prefix, 25s, $0.052 first call
    --safe-mode --system-prompt        21,999 token prefix -- no better
    + tools disallowed                  4,372 token prefix, 3.6s, $0.0019 warm

So the flags below are not decoration. Disabling the tools is what takes the
prefix from 22k to 4.4k, and `--system-prompt` is what stops the agent
scaffolding from reinterpreting a request for bare SQL as a coding task.

Two things to know before choosing this over an API key:

- **It is a subprocess per call**, and EDI makes two per question. Steady state
  is ~3.6s each. The first call after five idle minutes pays the prompt cache
  again -- roughly 25s -- because the CLI starts a new session every time and
  there is no way to hold one open from here.
- **`total_cost_usd` in the response is list price**, not what a Pro or Max
  subscriber is billed. It is reported in the logs at debug level and nowhere
  else, because quoting it at someone on a subscription would be wrong.
"""

import json
import logging
import os
import shutil
import subprocess
import tempfile
from typing import Any, Dict, List, Optional

from langchain_core.callbacks import CallbackManagerForLLMRun
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, SystemMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from pydantic import Field

logger = logging.getLogger(__name__)

# Aliases the CLI resolves to whatever is current, plus nothing else: a full
# model id works too and is passed through untouched, but hardcoding a list of
# them here would go stale the week after it was written.
MODEL_ALIASES = ("sonnet", "opus", "haiku", "fable")

DEFAULT_MODEL = "sonnet"

# Every tool the harness would otherwise define. Named explicitly rather than
# with a wildcard because --disallowedTools takes names; an unknown name here
# is ignored, so a CLI that adds a tool costs us a few hundred tokens of prefix
# rather than an error.
_DISALLOWED_TOOLS = (
    "Bash BashOutput KillShell Edit Write Read Glob Grep WebFetch WebSearch "
    "NotebookEdit Task TodoWrite SlashCommand ExitPlanMode"
)

_DEFAULT_SYSTEM_PROMPT = (
    "You are a helpful assistant embedded in a spreadsheet application. "
    "Answer the request directly and completely. Do not ask to use tools, "
    "and do not describe what you are about to do -- just do it."
)


class ClaudeCodeError(RuntimeError):
    """The CLI is missing, timed out, or reported a failure."""


def binary_path() -> Optional[str]:
    """Where `claude` lives, or None if it is not on PATH."""
    return shutil.which(os.getenv("EDI_CLAUDE_CODE_BINARY") or "claude")


def _run(args: List[str], timeout: int = 20) -> Optional[str]:
    """Run the CLI and return stdout, or None if that did not work."""
    path = binary_path()
    if not path:
        return None
    try:
        done = subprocess.run(
            [path, *args],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            timeout=timeout, cwd=tempfile.gettempdir(),
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if done.returncode != 0:
        return None
    return (done.stdout or "").strip() or None


def version() -> Optional[str]:
    """The CLI's version string, or None if it cannot be run at all."""
    return _run(["--version"])


def auth_status() -> Dict[str, Any]:
    """
    Whether the CLI on this machine is signed in, and to what.

    Installed is not the same as usable: `claude` on PATH with nobody logged
    in produces a model that fails on first use, and offering that in a picker
    is worse than not offering it. `claude auth status` answers in about 400ms
    without spending anything, which is cheap enough to ask each time the
    catalog is built.

    It also returns the account's email address and organisation. Those are
    deliberately dropped here rather than passed up: nothing in this app needs
    to know who you are, and a field that exists is a field that ends up in a
    log.
    """
    if not binary_path():
        return {"installed": False, "logged_in": False}

    raw = _run(["auth", "status"], timeout=30)
    if not raw:
        return {"installed": True, "logged_in": False}
    try:
        payload = json.loads(raw)
    except (ValueError, TypeError):
        return {"installed": True, "logged_in": False}

    return {
        "installed": True,
        "logged_in": bool(payload.get("loggedIn")),
        "plan": payload.get("subscriptionType") or None,
        "auth_method": payload.get("authMethod") or None,
    }


def _render(messages: List[BaseMessage]) -> tuple:
    """
    Flatten a message list into (system prompt, user text).

    The CLI takes one prompt on stdin and one system prompt as a flag, so a
    conversation has to be rendered rather than passed. In practice this app
    sends either a bare string or a system/human pair, and the transcript form
    below is the fallback for the rest.
    """
    system_parts, turns = [], []
    for message in messages:
        text = message.content
        if isinstance(text, list):
            # Multimodal content blocks: keep the text, drop the rest, since
            # there is nothing here that sends an image.
            text = "".join(
                part.get("text", "") for part in text if isinstance(part, dict)
            )
        text = (text or "").strip()
        if not text:
            continue
        if isinstance(message, SystemMessage):
            system_parts.append(text)
        elif message.type == "ai":
            turns.append(f"Assistant: {text}")
        else:
            turns.append(f"Human: {text}")

    system = "\n\n".join(system_parts) or _DEFAULT_SYSTEM_PROMPT
    if len(turns) == 1 and turns[0].startswith("Human: "):
        # The common case. Sending it bare rather than as a labelled
        # transcript keeps the model from answering in the same format.
        return system, turns[0][len("Human: "):]
    return system, "\n\n".join(turns)


class ChatClaudeCode(BaseChatModel):
    """Claude, run through the locally installed Claude Code CLI."""

    model: str = DEFAULT_MODEL
    # Accepted so the provider table can construct this the same way it
    # constructs every other model, and then ignored: `claude -p` exposes
    # neither. Silently dropping them is the honest option -- the alternative
    # is refusing to build over a knob nobody set deliberately.
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    timeout: int = Field(default=300)
    system_prompt: Optional[str] = None

    @property
    def _llm_type(self) -> str:
        return "claude-code-cli"

    @property
    def _identifying_params(self) -> Dict[str, Any]:
        return {"model": self.model}

    def _generate(
        self,
        messages: List[BaseMessage],
        stop: Optional[List[str]] = None,
        run_manager: Optional[CallbackManagerForLLMRun] = None,
        **kwargs: Any,
    ) -> ChatResult:
        # `stop` is unsupported by the CLI and there is nowhere to put it.
        # Nothing in this app passes one.
        path = binary_path()
        if not path:
            raise ClaudeCodeError(
                "The Claude Code CLI is not on PATH. Install it with "
                "`npm install -g @anthropic-ai/claude-code`, or pick a "
                "different model."
            )

        system, prompt = _render(messages)
        if self.system_prompt:
            system = self.system_prompt

        argv = [
            path, "-p",
            "--output-format", "json",
            "--model", self.model,
            # Disables CLAUDE.md, skills, plugins, hooks, MCP and custom
            # agents. Auth is untouched, which is the point -- --bare would
            # also strip the harness but reads only ANTHROPIC_API_KEY, and a
            # subscription login is exactly what we are here to use.
            "--safe-mode",
            "--strict-mcp-config",
            "--disable-slash-commands",
            # Hundreds of these would otherwise accumulate in the user's
            # `claude --resume` picker, one per question asked of a sheet.
            "--no-session-persistence",
            "--system-prompt", system,
            "--disallowedTools", _DISALLOWED_TOOLS,
        ]

        try:
            done = subprocess.run(
                argv,
                input=prompt,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=self.timeout,
                # Somewhere with nothing in it. --safe-mode already stops
                # CLAUDE.md discovery; this stops the CLI from treating
                # whatever directory uvicorn was started in as a workspace.
                cwd=tempfile.gettempdir(),
            )
        except subprocess.TimeoutExpired as exc:
            raise ClaudeCodeError(
                f"Claude Code did not answer within {self.timeout}s."
            ) from exc
        except OSError as exc:
            raise ClaudeCodeError(f"Could not run Claude Code: {exc}") from exc

        if done.returncode != 0:
            detail = (done.stderr or done.stdout or "").strip()[:400]
            raise ClaudeCodeError(
                f"Claude Code exited with {done.returncode}: {detail}"
            )

        try:
            payload = json.loads(done.stdout)
        except (ValueError, TypeError) as exc:
            raise ClaudeCodeError(
                "Claude Code returned something that was not JSON: "
                f"{(done.stdout or '')[:200]}"
            ) from exc

        if payload.get("is_error"):
            raise ClaudeCodeError(
                f"Claude Code reported an error: {payload.get('result')}"
            )

        text = payload.get("result")
        if not isinstance(text, str):
            raise ClaudeCodeError("Claude Code returned no text.")

        usage = payload.get("usage") or {}
        logger.debug(
            "claude-code %s: %sms, %s in / %s out, cache %s read %s written "
            "(list price $%.4f, not what a subscription is billed)",
            self.model, payload.get("duration_api_ms"),
            usage.get("input_tokens"), usage.get("output_tokens"),
            usage.get("cache_read_input_tokens"),
            usage.get("cache_creation_input_tokens"),
            payload.get("total_cost_usd") or 0.0,
        )

        message = AIMessage(
            content=text,
            response_metadata={
                "model": self.model,
                "duration_api_ms": payload.get("duration_api_ms"),
            },
            usage_metadata={
                "input_tokens": usage.get("input_tokens") or 0,
                "output_tokens": usage.get("output_tokens") or 0,
                "total_tokens": (usage.get("input_tokens") or 0)
                + (usage.get("output_tokens") or 0),
            },
        )
        return ChatResult(generations=[ChatGeneration(message=message)])
