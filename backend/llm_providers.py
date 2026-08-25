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
import os
from dataclasses import dataclass
from typing import Dict, Optional, Tuple


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

    @property
    def usable(self) -> bool:
        """True when this could actually be constructed."""
        spec = PROVIDERS[self.provider]
        if spec.key_kwarg and spec.key_required and not self.api_key:
            return False
        if spec.needs_base_url and not self.base_url:
            return False
        return bool(self.model)


def _int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def resolve() -> Config:
    """
    Work out which model to use from the environment.

    Back-compatibility matters more than tidiness here: an existing deployment
    sets GOOGLE_API_KEY and nothing else, and must keep working untouched. So
    an unset EDI_LLM_PROVIDER means exactly what it meant before -- Gemini,
    with GEMINI_MODEL choosing the variant.
    """
    provider = (os.getenv("EDI_LLM_PROVIDER") or DEFAULT_PROVIDER).strip().lower()
    if provider not in PROVIDERS:
        known = ", ".join(sorted(PROVIDERS))
        raise ProviderError(
            f"EDI_LLM_PROVIDER is set to '{provider}', which is not a provider. "
            f"Choose one of: {known}."
        )

    spec = PROVIDERS[provider]

    model = (os.getenv("EDI_LLM_MODEL") or "").strip()
    if not model and provider == "google":
        model = (os.getenv("GEMINI_MODEL") or "").strip()
    if not model:
        model = spec.default_model

    api_key = (os.getenv("EDI_LLM_API_KEY") or "").strip()
    if not api_key:
        for name in spec.key_env:
            api_key = (os.getenv(name) or "").strip()
            if api_key:
                break

    base_url = (os.getenv("EDI_LLM_BASE_URL") or "").strip() or spec.default_base_url

    return Config(
        provider=provider,
        model=model,
        api_key=api_key or None,
        base_url=base_url or None,
        max_tokens=_int_env("EDI_LLM_MAX_TOKENS", DEFAULT_MAX_TOKENS),
    )


def describe(config: Config) -> str:
    """Why a config is not usable, or an empty string when it is."""
    spec = PROVIDERS[config.provider]
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
            f"Provider '{config.provider}' needs the {spec.package} package. "
            f"Install it with: pip install {spec.package}"
        ) from exc

    kwargs = {
        "model": config.model,
        "temperature": temperature,
        spec.max_tokens_kwarg: config.max_tokens,
    }
    if spec.key_kwarg:
        kwargs[spec.key_kwarg] = config.api_key or "not-needed"
    if spec.base_url_kwarg and config.base_url:
        kwargs[spec.base_url_kwarg] = config.base_url

    return getattr(module, spec.class_name)(**kwargs)
