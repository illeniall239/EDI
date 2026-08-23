import os
from dotenv import load_dotenv
from langchain_groq import ChatGroq

# Load environment variables
load_dotenv()

# API keys from environment
GROQ_API_KEY = os.getenv("GROQ_API_KEY") or os.getenv("NEXT_PUBLIC_GROQ_API_KEY")

# Where uploaded datasets live. Vercel Functions have a read-only filesystem
# apart from /tmp, which does not survive between invocations, so the dataset
# is re-read from Supabase Storage on each request.
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
SUPABASE_DATASET_BUCKET = os.getenv("SUPABASE_DATASET_BUCKET", "datasets")

# Initialize Kimi LLM via Groq
LLM = None
if GROQ_API_KEY:
    try:
        LLM = ChatGroq(
            model="moonshotai/kimi-k2-instruct-0905",
            temperature=0.4,  # Lower temperature for more consistent, structured outputs
            groq_api_key=GROQ_API_KEY,
            max_tokens=8192,  # Set max tokens to ensure complete responses
        )
        print("LLM initialized successfully with Kimi model via Groq")
    except Exception as e:
        print(f"Failed to initialize LLM: {str(e)}")
        print("Please check your NEXT_PUBLIC_GROQ_API_KEY environment variable")
        LLM = None
else:
    print("GROQ_API_KEY not found in environment variables")
    print("Please set GROQ_API_KEY in your .env file")
    LLM = None

def initialize_llm():
    """
    Create a fresh LLM instance for synthetic dataset generation.
    This ensures no context contamination between generations.
    """
    if not GROQ_API_KEY:
        print("GROQ_API_KEY not found in environment variables")
        return None

    try:
        fresh_llm = ChatGroq(
            model="moonshotai/kimi-k2-instruct-0905",
            temperature=0.4,  # Lower temperature for more consistent, structured outputs
            groq_api_key=GROQ_API_KEY,
            max_tokens=8192,  # Set max tokens to ensure complete responses
        )
        print("Fresh LLM instance created successfully with Kimi via Groq")
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