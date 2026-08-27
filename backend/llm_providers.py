"""
Which chat model to talk to, and how to construct it.

The app asks very little of a model: every call is `.invoke(prompt)` and a read
of `.content`. There is no tool calling, no structured-output binding, no
streaming and no async anywhere, and JSON is coaxed out by prompting and then
de-fenced with a regex. That is why this can be a table rather than an
integration layer -- the providers differ only in what they name their
constructor arguments, and a difference that small is data, not logic.

Imports are deliberately lazy. `backend/requirements.txt` ships one provider
package; anyone pointing this at a different model installs one more and
nothing else changes. Importing the whole matrix eagerly would make every
deployment carry five SDKs to use one.
"""

import importlib
import importlib.util
import logging
import os
from dataclasses import dataclass, field
from typing import Any, Dict, Optional, Tuple

import model_prefs

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Provider:
    """How to build one provider's LangChain chat model."""

    package: str                       # what to pip install
    module: str                        # what to import
    class_name: str
    default_model: str                 # "" means the user must name one
    max_tokens_kwarg: str              # every provider spells this differently
    key_kwarg: Optional[str] = None    # None: this provider takes no API key
    key_env: Tuple[str, ...] = ()      # conventional names, in priority order
    key_required: bool = True          # False: the SDK wants one, the server does not
    base_url_kwarg: Optional[str] = None
    default_base_url: Optional[str] = None
    needs_base_url: bool = False
    # What to tell someone who has not got it. Defaults to the pip line, which
    # is right for every provider that is a Python package and wrong for the
    # one that is a CLI.
    install_hint: Optional[str] = None


PROVIDERS: Dict[str, Provider] = {
    "google": Provider(
        package="langchain-google-genai",
        module="langchain_google_genai",
        class_name="ChatGoogleGenerativeAI",
        default_model="gemini-2.5-flash",
        max_tokens_kwarg="max_output_tokens",
        key_kwarg="google_api_key",
        key_env=("GOOGLE_API_KEY", "GEMINI_API_KEY"),
    ),
    "openai": Provider(
        package="langchain-openai",
        module="langchain_openai",
        class_name="ChatOpenAI",
        default_model="gpt-4o-mini",
        max_tokens_kwarg="max_tokens",
        key_kwarg="api_key",
        key_env=("OPENAI_API_KEY",),
        base_url_kwarg="base_url",
    ),
    "anthropic": Provider(
        package="langchain-anthropic",
        module="langchain_anthropic",
        class_name="ChatAnthropic",
        default_model="claude-sonnet-5",
        max_tokens_kwarg="max_tokens",
        key_kwarg="api_key",
        key_env=("ANTHROPIC_API_KEY",),
    ),
    "groq": Provider(
        package="langchain-groq",
        module="langchain_groq",
        class_name="ChatGroq",
        default_model="llama-3.3-70b-versatile",
        max_tokens_kwarg="max_tokens",
        key_kwarg="api_key",
        key_env=("GROQ_API_KEY",),
    ),
    # No API key, which is the entire point: this is the path that runs with no
    # accounts and no bill. The default model is a coding-tuned one because the
    # most demanding prompt in the app is "write SQL for this question".
    "ollama": Provider(
        package="langchain-ollama",
        module="langchain_ollama",
        class_name="ChatOllama",
        default_model="qwen2.5-coder:7b",
        max_tokens_kwarg="num_predict",
        base_url_kwarg="base_url",
        default_base_url="http://localhost:11434",
    ),
    # Claude, reached through the Claude Code CLI rather than through an API
    # key: no package to install and no key to paste, because the binary on
    # the user's PATH is already signed in as them. Separate from "anthropic"
    # only in how it authenticates -- the models are the same Claude models.
    "claude": Provider(
        package="",
        module="claude_code_llm",
        class_name="ChatClaudeCode",
        default_model="sonnet",
        max_tokens_kwarg="max_tokens",
        install_hint=(
            "Needs the Claude Code CLI: npm install -g "
            "@anthropic-ai/claude-code, then `claude auth login`."
        ),
    ),
    # One entry for the long tail -- OpenRouter, LM Studio, vLLM, Together,
    # llama.cpp's server. They all speak the OpenAI wire format, so pointing
    # ChatOpenAI at a different base URL is the whole integration.
    "openai-compatible": Provider(
        package="langchain-openai",
        module="langchain_openai",
        class_name="ChatOpenAI",
        default_model="",
        max_tokens_kwarg="max_tokens",
        key_kwarg="api_key",
        key_env=("OPENAI_API_KEY",),
        # A local LM Studio / vLLM / llama.cpp server has no auth, but the
        # OpenAI SDK refuses to construct without something in the field. So
        # the key stays optional here and a placeholder is sent when absent.
        key_required=False,
        base_url_kwarg="base_url",
        needs_base_url=True,
    ),
}

DEFAULT_PROVIDER = "google"
DEFAULT_MAX_TOKENS = 8192


class ProviderError(RuntimeError):
    """Configuration or installation problem, phrased for whoever deployed this."""


@dataclass(frozen=True)
class Config:
    """A resolved, ready-to-build model configuration."""

    provider: str
    model: str
    api_key: Optional[str]
    base_url: Optional[str]
    max_tokens: int
    # Which of the four ways this was arrived at: a choice saved from the
    # picker, the environment, a probe of the machine, or the fallback. Only
    # reported -- nothing branches on it -- but it is the difference between
    # "why is it using that model" having an answer and not.
    source: str = "environment"
    # Constructor arguments that only make sense for one provider. Ollama is
    # the only one that runs on your own hardware, so it is the only one with
    # anything to say about GPUs, threads and how long weights stay resident.
    runtime: Dict[str, Any] = field(default_factory=dict)

    @property
    def usable(self) -> bool:
        """True when this could actually be constructed."""
        spec = PROVIDERS[self.provider]
        if spec.key_kwarg and spec.key_required and not self.api_key:
            return False
        if spec.needs_base_url and not self.base_url:
            return False
        return bool(self.model)


def package_available(provider: str) -> bool:
    """Is the module this provider needs importable, without importing it?"""
    spec = PROVIDERS[provider]
    try:
        return importlib.util.find_spec(spec.module) is not None
    except (ImportError, ValueError):
        return False


def install_hint(provider: str) -> str:
    spec = PROVIDERS[provider]
    return spec.install_hint or f"pip install {spec.package}"


def key_for(provider: str) -> Tuple[Optional[str], Optional[str]]:
    """
    This provider's API key and where it came from.

    A key typed into the picker beats one in the environment: it was set
    later, and by the person actually sitting there. Both beat nothing.
    """
    spec = PROVIDERS[provider]
    stored = model_prefs.key_for(provider)
    if stored:
        return stored, "saved"
    generic = (os.getenv("EDI_LLM_API_KEY") or "").strip()
    if generic:
        return generic, "environment"
    for name in spec.key_env:
        value = (os.getenv(name) or "").strip()
        if value:
            return value, "environment"
    return None, None


def _int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _optional_int_env(name: str) -> Optional[int]:
    """An int if one was set and parses, otherwise nothing at all."""
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


def _ollama_runtime() -> Dict[str, Any]:
    """
    The knobs that exist because the model is running on your machine.

    All unset by default: Ollama's own choices are informed by hardware this
    process cannot see, and second-guessing them is how you end up spilling a
    model out of VRAM. These are here for when its choice is wrong, and for
    the person who wants to pin it.
    """
    runtime: Dict[str, Any] = {}

    # Layers to put on the GPU. 0 forces CPU, which is worth having when a
    # card is busy with something else or the driver is misbehaving.
    num_gpu = _optional_int_env("EDI_OLLAMA_NUM_GPU")
    if num_gpu is not None:
        runtime["num_gpu"] = num_gpu

    # CPU threads. Only bites when some or all of the model is on the CPU.
    num_thread = _optional_int_env("EDI_OLLAMA_NUM_THREAD")
    if num_thread is not None:
        runtime["num_thread"] = num_thread

    # Context window. Worth raising on a wide sheet: the SQL prompt carries
    # the schema and sample rows, and a context too small to hold them is
    # silently truncated from the front -- so the model loses the schema and
    # writes confident SQL against columns it can no longer see.
    num_ctx = _optional_int_env("EDI_OLLAMA_NUM_CTX")
    if num_ctx is not None:
        runtime["num_ctx"] = num_ctx

    # How long the weights stay loaded after a request. Ollama unloads after
    # five minutes, and the reload is paid by whoever asks the next question.
    keep_alive = (os.getenv("EDI_OLLAMA_KEEP_ALIVE") or "").strip()
    if keep_alive:
        runtime["keep_alive"] = keep_alive

    # There is deliberately no switch here for turning thinking off. It is the
    # first thing anyone reaches for on a reasoning model and it does not do
    # what they want: measured on qwen3:4b, thinking on answered a
    # categorisation in 521 tokens with the single word "SPECIFIC_DATA", while
    # reasoning=False produced 850 tokens beginning "We are given a query:" --
    # the reasoning did not stop, it stopped being labelled, and arrived in the
    # answer instead. langchain-ollama did not accept the argument at all until
    # 0.3.4, and that release wants a langchain-core that langchain 0.3.19
    # cannot import. A knob that needs a breaking upgrade to deliver a worse
    # answer is not worth having.

    return runtime


def build_config(
    provider: str,
    model: str = "",
    base_url: Optional[str] = None,
    source: str = "environment",
) -> Config:
    """Fill in everything the caller did not name, for one provider."""
    if provider not in PROVIDERS:
        known = ", ".join(sorted(PROVIDERS))
        raise ProviderError(
            f"'{provider}' is not a provider. Choose one of: {known}."
        )
    spec = PROVIDERS[provider]

    model = (model or "").strip()
    if not model:
        model = (os.getenv("EDI_LLM_MODEL") or "").strip()
    if not model and provider == "google":
        model = (os.getenv("GEMINI_MODEL") or "").strip()
    if not model:
        model = spec.default_model

    api_key, _ = key_for(provider)

    base_url = (base_url or "").strip()
    if not base_url and (os.getenv("EDI_LLM_PROVIDER") or "").strip().lower() == provider:
        base_url = (os.getenv("EDI_LLM_BASE_URL") or "").strip()
    if not base_url:
        base_url = spec.default_base_url or ""

    return Config(
        provider=provider,
        model=model,
        api_key=api_key or None,
        base_url=base_url or None,
        max_tokens=_int_env("EDI_LLM_MAX_TOKENS", DEFAULT_MAX_TOKENS),
        runtime=_ollama_runtime() if provider == "ollama" else {},
        source=source,
    )


def resolve() -> Config:
    """
    Work out which model to use, in four steps and in this order.

    1. **A choice saved from the picker.** It wins over the environment
       because it was made later and by the person at the keyboard -- and
       because it can only ever have been written on an install where that is
       allowed. See model_prefs.control_allowed().
    2. **EDI_LLM_PROVIDER**, which is how a deployment is configured.
    3. **GOOGLE_API_KEY on its own**, which is what this looked like before it
       had a registry. An existing deployment that sets only that must keep
       resolving to exactly what it resolved to then: Gemini, GEMINI_MODEL.
    4. **Whatever is running on this machine.** A fresh clone with no .env
       finds a model that answers rather than reporting a missing Google key,
       which is the difference between the app working out of the box and not.
       Whichever it lands on is a starting point, not a suggestion: the
       picker exists so nobody has to live with this function's guess.
    """
    saved = model_prefs.choice()
    if saved and saved["provider"] in PROVIDERS:
        return build_config(
            saved["provider"], saved["model"], saved["base_url"], source="saved",
        )

    provider = (os.getenv("EDI_LLM_PROVIDER") or "").strip().lower()
    if provider:
        if provider not in PROVIDERS:
            known = ", ".join(sorted(PROVIDERS))
            raise ProviderError(
                f"EDI_LLM_PROVIDER is set to '{provider}', which is not a "
                f"provider. Choose one of: {known}."
            )
        return build_config(provider, source="environment")

    if (os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY") or "").strip():
        return build_config("google", source="environment")

    # Imported here rather than at the top because model_catalog imports this
    # module. It only reaches the network for providers that already have a
    # key, so an unconfigured install pays for one look at localhost and one
    # `claude auth status`, not six timeouts.
    try:
        import model_catalog

        detected = model_catalog.detect()
    except Exception as exc:  # noqa: BLE001 - detection is a convenience
        logger.debug("Model detection failed: %s", exc)
        detected = None

    if detected:
        logger.info(
            "No model configured; using the %s found on this machine (%s).",
            detected["provider"], detected["model"],
        )
        return build_config(
            detected["provider"], detected["model"], detected.get("base_url"),
            source="detected",
        )

    return build_config(DEFAULT_PROVIDER, source="default")


def describe(config: Config) -> str:
    """Why a config is not usable, or an empty string when it is."""
    spec = PROVIDERS[config.provider]
    if config.provider == "claude":
        # Checked here because it is the one provider whose availability is a
        # property of the machine rather than of the configuration. Only the
        # binary, not the login: `claude auth status` costs 400ms and this
        # runs on every model construction, so being signed out surfaces from
        # the first call instead.
        import claude_code_llm

        if not claude_code_llm.binary_path():
            return install_hint("claude")
    if not config.model:
        return (
            f"No model set for provider '{config.provider}'. "
            "Name one with EDI_LLM_MODEL."
        )
    if spec.key_kwarg and spec.key_required and not config.api_key:
        wanted = " or ".join(spec.key_env) if spec.key_env else "EDI_LLM_API_KEY"
        return f"No API key for provider '{config.provider}'. Set {wanted}."
    if spec.needs_base_url and not config.base_url:
        return (
            f"Provider '{config.provider}' needs the endpoint to talk to. "
            "Set EDI_LLM_BASE_URL."
        )
    return ""


# Model families that do their reasoning inside the completion and will not
# take a temperature. Matched loosely on the name, since providers version
# them (o3-mini, o4-mini-2025-04-16, gpt-5-mini).
_REASONING_PREFIXES = ("o1", "o1-", "o3", "o4", "gpt-5")


def _is_reasoning_model(model):
    """Best-effort: does this model refuse temperature and max_tokens?"""
    name = (model or "").lower().rsplit("/", 1)[-1]
    return any(name == p or name.startswith(p + "-") for p in _REASONING_PREFIXES)


def build(config: Config, temperature: float = 0.4):
    """
    Construct the LangChain chat model described by `config`.

    Raises ProviderError rather than letting an ImportError surface, because
    the useful thing to say is which package is missing and how to install it.
    """
    problem = describe(config)
    if problem:
        raise ProviderError(problem)

    spec = PROVIDERS[config.provider]

    try:
        module = importlib.import_module(spec.module)
    except ImportError as exc:
        raise ProviderError(
            f"Provider '{config.provider}' is not installed. "
            f"{install_hint(config.provider)}"
        ) from exc

    kwargs = {"model": config.model}

    # Reasoning models reject both of the knobs below. OpenAI's o-series and
    # gpt-5 accept only the default temperature and refuse `max_tokens`
    # outright, wanting `max_completion_tokens` instead -- so sending either
    # fails the request rather than being ignored.
    #
    # This is a name check, which is a guess, but the failure it prevents is a
    # hard 400 on every single call. A model it does not recognise still works
    # if the endpoint tolerates the arguments, which is the common case.
    if _is_reasoning_model(config.model):
        kwargs["max_completion_tokens" if spec.max_tokens_kwarg == "max_tokens"
               else spec.max_tokens_kwarg] = config.max_tokens
    else:
        kwargs["temperature"] = temperature
        kwargs[spec.max_tokens_kwarg] = config.max_tokens
    if spec.key_kwarg:
        kwargs[spec.key_kwarg] = config.api_key or "not-needed"
    if spec.base_url_kwarg and config.base_url:
        kwargs[spec.base_url_kwarg] = config.base_url

    cls = getattr(module, spec.class_name)

    # Provider-specific runtime knobs, last so an explicit setting wins.
    #
    # Filtered against what this installation actually accepts. These are
    # optional extras rather than anything the app needs, and the versions
    # people have vary; a pydantic model rejects an unknown field outright, so
    # an unfiltered spread would turn "you set an option your client is too old
    # for" into "the model cannot be constructed at all".
    if config.runtime:
        accepted = set(getattr(cls, "model_fields", {}) or {})
        for name, value in config.runtime.items():
            if not accepted or name in accepted:
                kwargs[name] = value
            else:
                logger.warning(
                    "Ignoring %s: this version of %s does not accept it.",
                    name, spec.package,
                )

    return cls(**kwargs)
