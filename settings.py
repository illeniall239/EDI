import os
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI

# Load environment variables
load_dotenv()

# API keys from environment
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
AZURE_SPEECH_KEY = os.getenv("AZURE_API_KEY")
AZURE_SERVICE_REGION = os.getenv("AZURE_REGION")

# Initialize Google Gemini LLM
LLM = None
if GOOGLE_API_KEY:
    try:
        LLM = ChatGoogleGenerativeAI(
            model="gemini-2.0-flash",
            temperature=0.4,  # Lower temperature for more consistent, structured outputs
            google_api_key=GOOGLE_API_KEY,
            max_output_tokens=8192,  # Set max tokens to ensure complete responses
        )
        print("LLM initialized successfully with Gemini model")
    except Exception as e:
        print(f"Failed to initialize LLM: {str(e)}")
        print("Please check your GOOGLE_API_KEY environment variable")
        LLM = None
else:
    print("GOOGLE_API_KEY not found in environment variables")
    print("Please set GOOGLE_API_KEY in your .env file or environment")
    LLM = None

# Global application state flags (managed by app.py logic)
# These are here to reflect the original global scope but will be primarily
# controlled and utilized within the app.py's UI flow.
conversation_active = False
operation_cancelled = False # This will be managed by AgentServices for query processing
conversation_paused = False