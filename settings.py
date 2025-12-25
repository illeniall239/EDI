import os
from dotenv import load_dotenv
from langchain_groq import ChatGroq

# Load environment variables
load_dotenv()

# API keys from environment
GROQ_API_KEY = os.getenv("NEXT_PUBLIC_GROQ_API_KEY")
AZURE_SPEECH_KEY = os.getenv("AZURE_API_KEY")
AZURE_SERVICE_REGION = os.getenv("AZURE_REGION")

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
    print("NEXT_PUBLIC_GROQ_API_KEY not found in environment variables")
    print("Please set NEXT_PUBLIC_GROQ_API_KEY in your .env file")
    LLM = None

def initialize_llm():
    """
    Create a fresh LLM instance for synthetic dataset generation.
    This ensures no context contamination between generations.
    """
    if not GROQ_API_KEY:
        print("NEXT_PUBLIC_GROQ_API_KEY not found in environment variables")
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