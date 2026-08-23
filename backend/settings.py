import os
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI

# Load environment variables
load_dotenv()

# API keys from environment
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")

# Pinned rather than a floating alias so behaviour does not shift underneath
# the app; override with GEMINI_MODEL to try a different one.
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# Where uploaded datasets live. Vercel Functions have a read-only filesystem
# apart from /tmp, which does not survive between invocations, so the dataset
# is re-read from Supabase on each request.
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
SUPABASE_DATASET_BUCKET = os.getenv("SUPABASE_DATASET_BUCKET", "datasets")


def _build_llm(temperature=0.4):
    """
    Construct a Gemini chat model.

    Deliberately does not set convert_system_message_to_human. Besides being
    deprecated, folding the system prompt into the human turn measurably
    weakens instruction-following: with it enabled the model wrapped generated
    SQL in markdown fences despite being told not to, which the SQL parsing
    downstream then has to strip. Gemini handles system messages natively.
    """
    return ChatGoogleGenerativeAI(
        model=GEMINI_MODEL,
        temperature=temperature,  # lower keeps structured output consistent
        google_api_key=GOOGLE_API_KEY,
        max_output_tokens=8192,   # enough for complete responses
    )


LLM = None
if GOOGLE_API_KEY:
    try:
        LLM = _build_llm()
        print(f"LLM initialized successfully with {GEMINI_MODEL} via Google Gemini")
    except Exception as e:
        print(f"Failed to initialize LLM: {str(e)}")
        print("Please check your GOOGLE_API_KEY environment variable")
        LLM = None
else:
    print("GOOGLE_API_KEY not found in environment variables")
    print("Please set GOOGLE_API_KEY in your .env file")
    LLM = None


def initialize_llm():
    """
    Create a fresh LLM instance for synthetic dataset generation.
    This ensures no context contamination between generations.
    """
    if not GOOGLE_API_KEY:
        print("GOOGLE_API_KEY not found in environment variables")
        return None

    try:
        fresh_llm = _build_llm()
        print(f"Fresh LLM instance created successfully with {GEMINI_MODEL} via Google Gemini")
        return fresh_llm
    except Exception as e:
        print(f"Failed to create fresh LLM instance: {str(e)}")
        return None


# Global application state flags (managed by app.py logic)
# These are here to reflect the original global scope but will be primarily
# controlled and utilized within the app.py's UI flow.
conversation_active = False
operation_cancelled = False # This will be managed by AgentServices for query processing
conversation_paused = False
