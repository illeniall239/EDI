import logging
import os

from dotenv import load_dotenv

import llm_providers

logger = logging.getLogger(__name__)


# Load environment variables
load_dotenv()

# Which model, and how to reach it. See llm_providers.py for the full matrix.
# An existing deployment that sets only GOOGLE_API_KEY resolves to exactly what
# it resolved to before this module grew a registry: Gemini, GEMINI_MODEL.
LLM_CONFIG = llm_providers.resolve()

# Kept as module attributes because the rest of the app reads them, and
# /api/health reports on them.
LLM_PROVIDER = LLM_CONFIG.provider
LLM_MODEL = LLM_CONFIG.model
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = LLM_CONFIG.model if LLM_CONFIG.provider == "google" else None

def _build_llm(temperature=0.4):
    """
    Construct a chat model for the configured provider.

    Deliberately does not set convert_system_message_to_human on Gemini: it is
    deprecated in langchain-google-genai, and Gemini handles system messages
    natively.

    It also degrades instruction-following. Asked for SQL with "no fences" in
    the system message, the model emitted markdown fences 10/10 times with the
    flag on versus 4/10 with it off. That is not why it was removed, though --
    _execute_sql_query_directly already strips fences, and tightening the
    prompt wording to "no markdown code fences" took both conditions to 0/10.
    So this is hygiene, not a correctness fix.
    """
    return llm_providers.build(LLM_CONFIG, temperature=temperature)


def apply(config):
    """
    Move this process onto a different model.

    Builds first and rebinds afterwards, so a configuration that cannot be
    constructed -- a key that is wrong, a package that is missing -- leaves
    the working model in place and raises instead of taking the app down.

    Like hydrate() in main.py, this writes module globals and so assumes an
    instance serves one request at a time. That is already the assumption the
    data handler makes, and switching models is a thing a person does between
    questions rather than during one.
    """
    global LLM, LLM_CONFIG, LLM_PROVIDER, LLM_MODEL, GEMINI_MODEL

    llm = llm_providers.build(config)

    LLM_CONFIG = config
    LLM_PROVIDER = config.provider
    LLM_MODEL = config.model
    GEMINI_MODEL = config.model if config.provider == "google" else None
    LLM = llm
    logger.info("LLM switched to %s via %s", config.model, config.provider)
    return llm


def llm_status():
    """
    What /api/health should say about the model.

    Reported rather than merely logged because the failure this guards against
    is silent: a missing key degrades the app into fallback responses that look
    like bad answers rather than like a misconfiguration.
    """
    return {
        "provider": LLM_CONFIG.provider,
        "model": LLM_CONFIG.model or None,
        "configured": LLM is not None,
        "detail": llm_providers.describe(LLM_CONFIG) or None,
        # How this model came to be the one in use: picked in the app, set in
        # the environment, found on the machine, or fallen back to. Worth
        # reporting because "why is it using that" is otherwise unanswerable
        # from outside, and the answer changed when the picker was added.
        "source": LLM_CONFIG.source,
        # Only Ollama has these, and only when they were set. Empty means
        # every choice was left to Ollama, which is the default and usually
        # right -- but if someone has pinned the model to the CPU or given it
        # a small context, that is the first thing worth knowing when answers
        # are slow or wrong.
        "runtime": dict(LLM_CONFIG.runtime) or None,
    }


LLM = None
_problem = llm_providers.describe(LLM_CONFIG)
if _problem:
    # Never raise at import: the app is expected to come up and explain itself
    # rather than fail to start, and several routes work with no model at all.
    logger.info(f"LLM not configured: {_problem}")
else:
    try:
        LLM = _build_llm()
        logger.info(f"LLM initialized: {LLM_CONFIG.model} via {LLM_CONFIG.provider}")
    except Exception as e:
        logger.error(f"Failed to initialize LLM: {e}")
        LLM = None


# Global application state flags (managed by app.py logic)
# These are here to reflect the original global scope but will be primarily
# controlled and utilized within the app.py's UI flow.
conversation_active = False
operation_cancelled = False # This will be managed by AgentServices for query processing
conversation_paused = False
