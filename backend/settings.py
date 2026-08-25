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

# Where uploaded datasets live. Vercel Functions have a read-only filesystem
# apart from /tmp, which does not survive between invocations, so the dataset
# is re-read from Supabase on each request.
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
SUPABASE_DATASET_BUCKET = os.getenv("SUPABASE_DATASET_BUCKET", "datasets")


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
