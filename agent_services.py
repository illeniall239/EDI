import uuid
import os
import subprocess
import matplotlib.pyplot as plt
import json
import pandas as pd
import re
import logging
import settings

# Supabase client for persistent memory
try:
    from supabase import create_client, Client
    SUPABASE_AVAILABLE = True
    print("[OK] Supabase import successful in agent_services.py")
except ImportError as e:
    SUPABASE_AVAILABLE = False
    print(f"[ERROR] ImportError in agent_services.py: {str(e)}")
    print("Warning: supabase-py not found. Install with 'pip install supabase' for persistent conversation memory.")
except Exception as e:
    SUPABASE_AVAILABLE = False
    print(f"[ERROR] Unexpected error importing supabase: {str(e)}")
    print("Warning: supabase import failed for unknown reason.")
from langchain_community.agent_toolkits.sql.base import create_sql_agent
from langchain.agents.agent_types import AgentType
from langchain_community.agent_toolkits.sql.toolkit import SQLDatabaseToolkit
from langchain_community.tools.sql_database.tool import QuerySQLDataBaseTool
from langchain_core.chat_history import InMemoryChatMessageHistory
try:
    from langchain.memory import ConversationBufferMemory
    LANGCHAIN_MEMORY_AVAILABLE = True
except Exception:
    LANGCHAIN_MEMORY_AVAILABLE = False
# Import for Langchain Pandas Agent
try:
    from langchain_experimental.agents.agent_toolkits.pandas.base import create_pandas_dataframe_agent
    LANGCHAIN_PANDAS_AGENT_AVAILABLE = True
except ImportError:
    LANGCHAIN_PANDAS_AGENT_AVAILABLE = False
    print("Warning: langchain_experimental.agents.agent_toolkits.pandas.base not found. Langchain Pandas Agent will not be available. Try 'pip install langchain-experimental'.")

import seaborn as sns
import numpy as np # Often needed with pandas and plotting
from typing import Tuple, Optional, Dict
import textwrap

# Import Plotly
try:
    import plotly.express as px
    import plotly.graph_objects as go
    PLOTLY_AVAILABLE = True
except ImportError:
    PLOTLY_AVAILABLE = False
    print("Warning: Plotly is not installed. 3D interactive visualizations will not be available. Run 'pip install plotly'")

# Configure logging with UTF-8 encoding to handle emojis on Windows
import sys
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('visualization_debug.log', encoding='utf-8')
    ]
)
logger = logging.getLogger('AgentServices')

# Set console encoding to UTF-8 for Windows
if sys.platform.startswith('win'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except AttributeError:
        # Python < 3.7 doesn't have reconfigure
        pass

# CustomSQLDatabaseToolkit definition
class CustomSQLDatabaseToolkit(SQLDatabaseToolkit):
    def __init__(self, db, llm):
        super().__init__(db=db, llm=llm)
        self.db = db # Ensure db is stored
        self.llm = llm # Ensure llm is stored

    def get_tools(self):
        # Overriding to ensure QuerySQLDataBaseTool is correctly initialized with the provided llm
        return [
            QuerySQLDataBaseTool(db=self.db, llm=self.llm),
        ]

class AgentServices:
    def __init__(self, llm, speech_util_instance, charts_dir=None):
        self.llm = llm
        self.speech_util = speech_util_instance
        self.operation_cancelled_flag = False
        
        # Use a simple path in a web-accessible location
        try:
            if charts_dir:
                self.charts_dir = os.path.abspath(charts_dir)
            else:
                # Save directly to static/visualizations directory for web access
                self.charts_dir = os.path.abspath("static/visualizations")
                logger.debug(f"Setting visualization directory to: {self.charts_dir}")
            
            # Ensure the directory exists
            if not os.path.exists(self.charts_dir):
                logger.debug(f"Creating directory: {self.charts_dir}")
                os.makedirs(self.charts_dir, exist_ok=True)
                logger.info(f"Created charts directory: {self.charts_dir}")
            else:
                logger.debug(f"Directory already exists: {self.charts_dir}")
            
            # Test write permissions
            try:
                test_file = os.path.join(self.charts_dir, "test.txt")
                with open(test_file, 'w') as f:
                    f.write("test")
                os.remove(test_file)
                logger.info(f"Confirmed write permissions for: {self.charts_dir}")
            except Exception as e:
                logger.error(f"Cannot write to {self.charts_dir}: {str(e)}")
                # Fall back to static directory if path is not writable
                self.charts_dir = os.path.abspath("static")
                logger.info(f"Falling back to: {self.charts_dir}")
                os.makedirs(self.charts_dir, exist_ok=True)
                
                # Try to create visualizations subdirectory
                vis_dir = os.path.join(self.charts_dir, "visualizations")
                try:
                    os.makedirs(vis_dir, exist_ok=True)
                    self.charts_dir = vis_dir
                    logger.info(f"Created and using visualizations subdirectory: {self.charts_dir}")
                except Exception as subdir_err:
                    logger.error(f"Could not create visualizations subdirectory: {str(subdir_err)}")
        
        except Exception as e:
            logger.error(f"Error setting up visualization directory: {str(e)}")
            # Ultimate fallback - use current directory
            self.charts_dir = os.path.abspath(".")
            logger.info(f"Using fallback directory: {self.charts_dir}")
            os.makedirs(self.charts_dir, exist_ok=True)

        self.agent_executor = None
        # Maintain low-level chat histories and wrap them with a ConversationBufferMemory
        self.chat_history = InMemoryChatMessageHistory()
        if LANGCHAIN_MEMORY_AVAILABLE:
            self.memory = ConversationBufferMemory(memory_key="chat_history", return_messages=True, chat_memory=self.chat_history)
        else:
            # Fallback: keep history only (no true memory features)
            self.memory = None
        self.chat_histories = {}  # Map: chat_id -> InMemoryChatMessageHistory
        self.current_chat_id = None  # Track current active chat
        self.inferred_context = None
        self.data_summary = None
        self.analysis_results = []
        self.visualizations = []
        self.data_handler = None
        
        # Initialize Supabase client for persistent memory
        self.supabase_client = None
        if SUPABASE_AVAILABLE:
            try:
                supabase_url = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
                supabase_key = os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
                logger.debug(f"🔍 Supabase URL from env: {supabase_url}")
                logger.debug(f"🔍 Supabase key from env: {'***' + supabase_key[-10:] if supabase_key else None}")
                
                if supabase_url and supabase_key:
                    self.supabase_client: Client = create_client(supabase_url, supabase_key)
                    logger.info("✅ Supabase client initialized for persistent conversation memory")
                else:
                    logger.warning("⚠️ Supabase credentials not found in environment variables")
                    logger.debug(f"URL present: {bool(supabase_url)}, Key present: {bool(supabase_key)}")
            except Exception as e:
                logger.error(f"❌ Failed to initialize Supabase client: {str(e)}")
                self.supabase_client = None
        else:
            logger.warning("⚠️ Supabase not available - conversation memory will not persist across restarts")

    def initialize_agents(self, data_handler_instance):
        self.data_handler = data_handler_instance
        db_sqlalchemy = self.data_handler.get_db_sqlalchemy_object()
        
        # Initialize the data cleaning agent
        self.data_cleaning_agent = DataCleaningAgent(self.llm)
        

        if db_sqlalchemy and self.llm:
            toolkit = CustomSQLDatabaseToolkit(db=db_sqlalchemy, llm=self.llm)
            
            # Create a custom system message for better responses
            system_message = """You are EDI.ai, a conversational AI assistant. You're naturally friendly, helpful, and enjoy chatting with users about any topic. 

Your specialty is data analysis, but you can discuss anything the user wants to talk about. When the conversation turns to other topics, respond naturally and helpfully while occasionally mentioning your data expertise when relevant.

Conversational Guidelines:
- Respond to greetings warmly and naturally
- Answer personal questions (how are you, who are you, etc.) in a friendly manner
- Handle thanks graciously
- Engage in small talk and casual conversation
- Be personable and human-like in your responses
- When appropriate, gently guide conversations toward data analysis opportunities

When working with data:
1. ALWAYS provide complete, contextual answers in natural language
2. NEVER return just a single value or word - always explain what the data means
3. Include relevant context and insights from the data
4. Use proper sentences and formatting
5. If you find specific data points, explain their significance
6. Make your responses informative and helpful to the user
7. Provide insights that help the user understand the data better
8. When querying data, include relevant context columns (developer, publisher, ratings, etc.)
9. Always provide a complete picture by including related data points
10. Explain what the data suggests about trends, patterns, or insights

Remember: You're a helpful assistant who happens to excel at data analysis, not a rigid data-only machine. Be conversational, engaging, and helpful across all topics while showcasing your data expertise when relevant."""
            
            self.agent_executor = create_sql_agent(
                llm=self.llm,
                toolkit=toolkit,
                handle_parsing_errors=True,
                verbose=True,
                agent_type=AgentType.ZERO_SHOT_REACT_DESCRIPTION,
                memory=self.memory if self.memory else None,
                return_intermediate_steps=True,  # This helps with debugging
                agent_kwargs={"system_message": system_message}
            )
        else:
            if not self.llm:
                print("Warning: SQL Agent could not be initialized. LLM missing.")
            elif not db_sqlalchemy:
                print("Info: SQL Agent will be initialized when data is loaded.")
            else:
                print("Warning: SQL Agent could not be initialized. Unknown issue.")
            self.agent_executor = None
        if self.memory:
            self.memory.clear()

    def reset_state(self):
        if self.memory:
            self.memory.clear()
        self.inferred_context = None
        self.data_summary = None
        self.analysis_results = []
        self.visualizations = []
        self.operation_cancelled_flag = False # Critical: reset cancellation flag
        
        # Clear all chat memories to prevent context contamination
        self.chat_histories.clear()
        self.current_chat_id = None
        
        # Force reinitialize LLM to clear any internal state/memory
        if hasattr(self, 'llm') and self.llm:
            print("🧹 Clearing LLM context for fresh synthetic dataset generation")
            # The LLM will be reinitialized on next use, ensuring clean context

    # NEW: Chat-specific memory management methods
    def switch_chat_context(self, chat_id: str):
        """Switch to specific chat's memory context with persistent loading from Supabase"""
        logger.info(f"🔄 Switching to chat context: {chat_id}")
        
        # Save current chat state if we have one
        if self.current_chat_id and self.chat_history:
            logger.debug(f"💾 Saving context for previous chat: {self.current_chat_id}")
            self.chat_histories[self.current_chat_id] = self.chat_history
        
        # Switch to new chat's memory or create new one
        if chat_id in self.chat_histories:
            # History already exists in current session
            logger.debug(f"📥 Restoring context for chat: {chat_id}")
            self.chat_history = self.chat_histories[chat_id]
        else:
            # Create new memory and load from Supabase if available
            logger.debug(f"🆕 Creating new context for chat: {chat_id}")
            self.chat_history = InMemoryChatMessageHistory()
            
            # PERSISTENT MEMORY: Load chat history from Supabase database
            try:
                chat_messages = self._load_chat_messages_from_supabase(chat_id)
                if chat_messages:
                    logger.info(f"📚 Populating memory with {len(chat_messages)} messages from database")
                    for i, message in enumerate(chat_messages):
                        role = message.get('role')
                        content = message.get('content', '')
                        logger.debug(f"📝 Loading message {i+1}: {role} -> {content[:50]}...")
                        if role == 'user':
                            self.chat_history.add_user_message(content)
                        elif role == 'assistant':
                            self.chat_history.add_ai_message(content)
                    logger.info(f"✅ Successfully restored conversation context from database")
                    logger.debug(f"🧠 Final memory state: {len(self.chat_history.messages)} messages total")
                else:
                    logger.debug(f"📭 No previous conversation history found for chat: {chat_id}")
            except Exception as e:
                logger.error(f"❌ Failed to load conversation history from database: {str(e)}")
                logger.debug("🔄 Continuing with empty memory")
            
            self.chat_histories[chat_id] = self.chat_history
        
        # Update current chat reference
        self.current_chat_id = chat_id
        
        # Update agent executor with new memory if initialized
        if self.agent_executor and hasattr(self.agent_executor, 'memory') and LANGCHAIN_MEMORY_AVAILABLE:
            # Re-wrap current chat_history in ConversationBufferMemory
            self.memory = ConversationBufferMemory(memory_key="chat_history", return_messages=True, chat_memory=self.chat_history)
            self.agent_executor.memory = self.memory
            logger.debug(f"🔧 Updated agent executor memory for chat: {chat_id}")
    
    def clear_chat_context(self, chat_id: str):
        """Clear specific chat's context"""
        logger.info(f"🗑️ Clearing context for chat: {chat_id}")
        
        if chat_id in self.chat_histories:
            self.chat_histories[chat_id].clear()
            del self.chat_histories[chat_id]
        
        # If this was the current chat, reset to default memory
        if self.current_chat_id == chat_id:
            self.chat_history = InMemoryChatMessageHistory()
            self.current_chat_id = None
            if self.agent_executor and hasattr(self.agent_executor, 'memory') and LANGCHAIN_MEMORY_AVAILABLE:
                self.memory = ConversationBufferMemory(memory_key="chat_history", return_messages=True, chat_memory=self.chat_history)
                self.agent_executor.memory = self.memory

    def switch_kb_context(self, kb_id: str, chat_id: str):
        """
        Switch to Knowledge Base context.

        Similar to switch_chat_context but also initializes RAG engine
        and loads KB-specific resources (structured data, extracted tables).

        Args:
            kb_id: Knowledge base ID
            chat_id: Chat ID for conversation history
        """
        logger.info(f"🔄 Switching to KB context: {kb_id}")

        # Initialize RAG engine for this KB if not already done
        if not hasattr(self, 'kb_rag_engines'):
            self.kb_rag_engines = {}

        if kb_id not in self.kb_rag_engines:
            logger.info(f"🆕 Initializing RAG engine for KB: {kb_id}")
            try:
                from kb_rag_engine import KnowledgeBaseRAG
                self.kb_rag_engines[kb_id] = KnowledgeBaseRAG(
                    llm=self.llm,
                    embedding_model='sentence-transformers/all-MiniLM-L6-v2',
                    supabase_client=self.supabase_client
                )
                logger.info(f"✅ RAG engine initialized for KB: {kb_id}")
            except Exception as e:
                logger.error(f"❌ Failed to initialize RAG engine: {e}")
                raise

        # Load structured data context for this KB
        self._load_kb_structured_data(kb_id)

        # Switch to the chat context for conversation history
        self.switch_chat_context(chat_id)

        # Store current KB context
        self.current_kb_id = kb_id
        logger.info(f"✅ KB context switched successfully")

    def _load_kb_structured_data(self, kb_id: str):
        """
        Load structured data and extracted tables for Knowledge Base.

        Args:
            kb_id: Knowledge base ID
        """
        logger.debug(f"📊 Loading structured data for KB: {kb_id}")

        if not self.supabase_client:
            logger.warning("⚠️ Supabase client not available")
            return

        try:
            # Load structured data files (CSV, Excel)
            struct_result = self.supabase_client.table('kb_structured_data') \
                .select('*') \
                .eq('kb_id', kb_id) \
                .execute()

            # Load extracted tables from documents
            tables_result = self.supabase_client.table('kb_extracted_tables') \
                .select('*') \
                .eq('kb_id', kb_id) \
                .execute()

            structured_files = struct_result.data if struct_result.data else []
            extracted_tables = tables_result.data if tables_result.data else []

            # Store in instance for quick access
            if not hasattr(self, 'kb_structured_data'):
                self.kb_structured_data = {}

            self.kb_structured_data[kb_id] = {
                'structured_files': structured_files,
                'extracted_tables': extracted_tables
            }

            logger.info(f"📊 Loaded {len(structured_files)} structured files, {len(extracted_tables)} extracted tables")

        except Exception as e:
            logger.error(f"❌ Failed to load KB structured data: {e}")

    def _dispatch_kb_query(self, kb_id: str, query: str, chat_id: str) -> Tuple[str, Optional[Dict]]:
        """
        Classify and route Knowledge Base queries.

        Query types:
        - 'rag': Pure document Q&A (vector similarity search)
        - 'sql': Structured data queries
        - 'prediction': Predictive analytics
        - 'hybrid': Combination of RAG + SQL/Predictions

        Args:
            kb_id: Knowledge base ID
            query: User's natural language query
            chat_id: Chat ID for context

        Returns:
            Tuple of (response_text, visualization_dict)
        """
        logger.info(f"🔀 Dispatching KB query for KB: {kb_id}")
        logger.debug(f"Query: {query}")

        # Ensure KB context is loaded
        if not hasattr(self, 'current_kb_id') or self.current_kb_id != kb_id:
            self.switch_kb_context(kb_id, chat_id)

        # Get RAG engine
        rag_engine = self.kb_rag_engines.get(kb_id)
        if not rag_engine:
            return "Error: RAG engine not initialized for this knowledge base.", None

        # Classify query type
        query_type = rag_engine.classify_query_type(query)
        logger.info(f"📋 Query classified as: {query_type}")

        try:
            # Route based on query type
            if query_type == 'rag':
                # Pure document Q&A
                logger.info("📚 Executing RAG query...")
                result = rag_engine.query_kb(kb_id, query, top_k=5)

                # Format response with sources
                response = result['response']
                if result.get('sources'):
                    response += "\n\n**Sources:**\n"
                    for src in result['sources'][:3]:  # Show top 3 sources
                        response += f"- [Source {src['number']}] {src['content'][:100]}...\n"

                return response, None

            elif query_type == 'sql':
                # Structured data query
                logger.info("🗄️ Executing SQL query on structured data...")

                # Get structured data for this KB
                kb_data = self.kb_structured_data.get(kb_id, {})
                structured_files = kb_data.get('structured_files', [])

                if not structured_files:
                    # Fall back to RAG if no structured data
                    logger.warning("⚠️ No structured data found, falling back to RAG")
                    result = rag_engine.query_kb(kb_id, query, top_k=5)
                    return result['response'], None

                # Use first available structured dataset
                dataset = structured_files[0]
                temp_db_path = dataset.get('temp_db_path')

                if temp_db_path and os.path.exists(temp_db_path):
                    # Load data and use existing SQL agent logic
                    from sqlalchemy import create_engine
                    engine = create_engine(f'sqlite:///{temp_db_path}')
                    df = pd.read_sql_table('data_table', engine)

                    # Use existing dispatch logic (simplified for now)
                    response = f"Found dataset: {dataset['filename']} with {dataset['row_count']} rows.\n\n"
                    response += f"Query: {query}\n(SQL query execution would happen here)"
                    return response, None
                else:
                    return "Error: Structured data file not found.", None

            elif query_type == 'prediction':
                # Predictive analytics query
                logger.info("🔮 Executing predictive analytics query...")

                # Get available datasets for prediction
                kb_data = self.kb_structured_data.get(kb_id, {})
                structured_files = kb_data.get('structured_files', [])
                extracted_tables = kb_data.get('extracted_tables', [])

                # Priority: extracted tables, then structured files
                data_source = None
                if extracted_tables:
                    data_source = extracted_tables[0]
                    source_type = 'extracted_table'
                elif structured_files:
                    data_source = structured_files[0]
                    source_type = 'structured_file'

                if not data_source:
                    return "No data available for predictive analysis in this knowledge base.", None

                # Load data from temp SQLite DB
                temp_db_path = data_source.get('temp_db_path')
                if not temp_db_path or not os.path.exists(temp_db_path):
                    return "Error: Data file not found for predictive analysis.", None

                from sqlalchemy import create_engine
                engine = create_engine(f'sqlite:///{temp_db_path}')
                df = pd.read_sql_table('data_table', engine)

                # Use existing _dispatch_prediction_query method
                # Parse prediction parameters from query (simplified)
                params = {
                    'target_column': None,  # Auto-detect in _dispatch_prediction_query
                    'prediction_type': 'forecast',
                    'periods': 12
                }

                return self._dispatch_prediction_query(params, df, query)

            else:  # hybrid
                # Combine RAG + SQL/Predictions
                logger.info("🔀 Executing hybrid query...")

                # Get document context from RAG
                rag_result = rag_engine.query_kb(kb_id, query, top_k=3)

                # Get structured data context
                kb_data = self.kb_structured_data.get(kb_id, {})
                structured_files = kb_data.get('structured_files', [])

                # Combine contexts
                response = rag_result['response']

                if structured_files:
                    response += f"\n\n**Available Datasets:**\n"
                    for ds in structured_files:
                        response += f"- {ds['filename']}: {ds['row_count']} rows\n"

                if rag_result.get('sources'):
                    response += "\n\n**Document Sources:**\n"
                    for src in rag_result['sources'][:2]:
                        response += f"- [Source {src['number']}] {src['content'][:100]}...\n"

                return response, None

        except Exception as e:
            logger.error(f"❌ Error dispatching KB query: {e}")
            return f"Error processing knowledge base query: {str(e)}", None

    def _get_conversation_context_string(self, max_messages: int = 6) -> str:
        """Get formatted conversation context for LLM prompts"""
        logger.debug(f"🔍 Getting conversation context...")
        logger.debug(f"🔍 Memory exists: {self.memory is not None}")
        logger.debug(f"🔍 Memory exists and has messages: {bool(self.memory and hasattr(self.memory, 'chat_memory'))}")
        logger.debug(f"🔍 Messages count: {len(self.memory.chat_memory.messages) if self.memory and hasattr(self.memory, 'chat_memory') else 0}")
        
        if not self.memory or not self.memory.chat_memory.messages:
            logger.debug("🔍 No memory or messages available for context")
            return ""
        
        recent_messages = self.memory.chat_memory.messages[-max_messages:] if len(self.memory.chat_memory.messages) > 0 else []
        if not recent_messages:
            logger.debug("🔍 No recent messages found")
            return ""
        
        logger.debug(f"🔍 Building context from {len(recent_messages)} recent messages")
        context_str = "Recent conversation context:\n"
        for i, msg in enumerate(recent_messages[-4:]):  # Show last 4 messages max
            role = "User" if msg.type == "human" else "Assistant"
            content = msg.content[:100] + "..." if len(msg.content) > 100 else msg.content
            context_str += f"{role}: {content}\n"
            logger.debug(f"🔍 Context message {i+1}: {role} -> {content}")
        
        final_context = context_str + "\n"
        logger.debug(f"🔍 Final context string: {repr(final_context)}")
        return final_context

    def _load_chat_messages_from_supabase(self, chat_id: str) -> list:
        """Load chat messages from Supabase database for the given chat_id"""
        if not self.supabase_client:
            logger.warning("⚠️ Supabase client not available - cannot load chat history")
            return []
        
        try:
            logger.debug(f"📥 Loading chat messages from Supabase for chat_id: {chat_id}")
            
            # Query the chats table for messages
            response = self.supabase_client.table('chats').select('messages').eq('id', chat_id).single().execute()
            
            if response.data and response.data.get('messages'):
                messages = response.data['messages']
                logger.info(f"✅ Loaded {len(messages)} messages from Supabase for chat: {chat_id}")
                return messages
            else:
                logger.debug(f"📭 No messages found in Supabase for chat: {chat_id}")
                return []
                
        except Exception as e:
            logger.error(f"❌ Failed to load chat messages from Supabase: {str(e)}")
            return []

    def cancel_operation(self):
        print("AgentServices: Cancel operation requested.")
        self.operation_cancelled_flag = True

    def clear_cancel_flag(self):
        # print("AgentServices: Cancel flag cleared.")
        self.operation_cancelled_flag = False

    def generate_confirmation_message(self, question):
        prompt = f"""
        Generate a brief confirmation message (1-2 sentences) for the following user query.
        The message should:
        1. Acknowledge that the query was understood (don't always use the same words)
        2. Indicate that it's being processed
        3. Be friendly and varied (don't always use the same words)
        4. Not exceed 15 words
        5. If there is a "No speech could be recognized" scenario or the user is not saying anything, acknowledge that no input was heard (don't always use the same words), Politely ask the user to repeat their query.

        User query: "{question}"

        Confirmation message:
        """
        return self.llm.invoke(prompt).content.strip()


    def generate_pandas_code(self, question, query_category):
        """Generate pandas code using LLM based on query and category."""
        logger.debug(f"Entering generate_pandas_code with question: {question}, category: {query_category}")
        
        if self.operation_cancelled_flag:
            logger.info("Operation cancelled flag detected in generate_pandas_code")
            return None, "I've stopped processing that request as you requested."
        
        if self.data_handler.get_df() is None:
            logger.error("No DataFrame available in data_handler")
            return None, "I need some data to work with first. Please upload a dataset."

        try:
            column_mapping = self.data_handler.get_column_mapping()
            df = self.data_handler.get_df()
            logger.debug(f"DataFrame shape: {df.shape}, columns: {df.columns.tolist()}")
            
            plotly_instruction = ""
            if PLOTLY_AVAILABLE:
                logger.debug("Plotly is available, including Plotly instructions")
                plotly_instruction = """
        - For 3D visualizations or complex interactive plots, PREFER `plotly.express as px`.
          - Generate the Plotly figure object (e.g., `fig = px.scatter_3d(...)`).
          - Create a unique HTML filename: `chart_filename = f"generated_charts/plot_{uuid.uuid4()}.html"`
          - Save the figure: `fig.write_html(chart_filename)`
          - Assign the `chart_filename` string to `result`.
        - For simpler 2D plots, you can use `matplotlib.pyplot as plt`.
          - Create the plot and assign the figure to `result` (e.g., `result = plt.gcf()`).
        """
            else:
                logger.debug("Plotly not available, using Matplotlib instructions only")
                plotly_instruction = """
        - For visualizations, use `matplotlib.pyplot as plt`.
          - Create the plot and assign the figure to `result` (e.g., `result = plt.gcf()`).
        """

            # Log the prompt being sent to LLM
            logger.debug("Sending code generation prompt to LLM")
            
            prompt = f"""
You are an expert Python programmer specializing in pandas, matplotlib, and plotly. Generate executable Python code to address the following query on a pandas DataFrame named 'df'.

Query: "{question}"
Query Category: {query_category}
Column Mapping: {json.dumps(column_mapping, indent=2)}
DataFrame Info (first 5 rows):
{df.head().to_string()}
DataFrame dtypes:
{df.dtypes.to_string()}

Instructions:
1. Your code will be executed in a function, so DO NOT use 'return' statements.
2. Instead, set your results to a variable named 'result'.
3. For VISUALIZATION:
    {plotly_instruction}
4. For DATA_CLEANING or FILTER_DATA: Assign the modified DataFrame to 'result'.
5. DO NOT include import statements for `pandas as pd`, `numpy as np`, `matplotlib.pyplot as plt`, `plotly.express as px`, or `uuid`. These are already available in the execution scope.
6. Ensure the code handles errors, edge cases, and invalid inputs gracefully within a try-except block. Assign any error message string to 'result' in case of failure.
7. DO NOT attempt file I/O operations other than saving plots as instructed (e.g., `fig.write_html()` for Plotly, or matplotlib saving handled externally).
8. Keep code simple and focused on the specific task.
9. If using matplotlib, create a new figure with `plt.figure()` before plotting.

Code template:
'''python
# Initialize result variable that will be captured
result = None
# Ensure 'generated_charts' directory exists for Plotly charts
# os.makedirs("generated_charts", exist_ok=True) # This will be handled by the calling function

try:
    # Your code here
    # Example for Plotly:
    # if PLOTLY_AVAILABLE and query_implies_3d_or_interactive: # You decide this based on the query
    #     import uuid # uuid is available
    #     import plotly.express as px # px is available
    #     fig = px.scatter_3d(df, x='col1', y='col2', z='col3')
    #     chart_filename = f"generated_charts/plot_{{uuid.uuid4()}}.html"
    #     # The directory 'generated_charts' will be created if it doesn't exist by the calling code.
    #     fig.write_html(chart_filename)
    #     result = chart_filename
    # else: # Example for Matplotlib
    #     import matplotlib.pyplot as plt # plt is available
    #     plt.figure()
    #     df['some_column'].plot(kind='hist')
    #     result = plt.gcf() # Get current figure

    # ... your actual code based on the query ...

except Exception as e:
    # Handle errors
    print(f"Error during code execution: {{str(e)}}")
    result = f"Error: {{str(e)}}" # Store error message in result for feedback
'''
"""
            try:
                if self.operation_cancelled_flag: 
                    return None, "I've stopped processing that request as you requested."
                response = self.llm.invoke(prompt).content.strip()
                if self.operation_cancelled_flag: 
                    return None, "I've stopped processing that request as you requested."

                code_match = re.search(r"```(?:python)?\s*(.*?)```", response, re.DOTALL) or \
                            re.search(r"'''(?:python)?\s*(.*?)'''", response, re.DOTALL)
                if code_match:
                    code = code_match.group(1).strip()
                    code_lines = code.split('\n')
                    filtered_lines = []
                    for line in code_lines:
                        if line.strip().startswith(('import pandas', 'import numpy', 'import os')):
                            continue
                        filtered_lines.append(line)
                    code = '\n'.join(filtered_lines)
                    logger.debug(f"Generated code length: {len(code) if code else 0}")
                    return code, None
                else:
                    lines = response.split('\n')
                    potential_code = []
                    in_code_block = False
                    for line in lines:
                        if "result =" in line or "df." in line or "plt." in line or (PLOTLY_AVAILABLE and "px." in line):
                            in_code_block = True
                        if in_code_block:
                            potential_code.append(line)
                    if potential_code:
                        reconstructed_code = "result = None\ntry:\n    " + "\n    ".join(potential_code) + \
                                            "\nexcept Exception as e:\n    print(f\"Error: {str(e)}\")\n    result = f\"Error: {str(e)}\""
                        logger.debug(f"Generated code length: {len(reconstructed_code) if reconstructed_code else 0}")
                        return reconstructed_code, None
                    return None, "Could not extract valid Python code from the response."
            except Exception as e:
                logger.exception("Error in generate_pandas_code LLM invocation")
                return None, f"Error generating pandas code: {str(e)}"
        except Exception as e:
            logger.exception("Error in generate_pandas_code setup")
            return None, f"Error in code generation setup: {str(e)}"

    def validate_code(self, code):
        """Validate code for common mistakes before execution."""
        if not code:
            return False, "No code to validate."

        dangerous_patterns = [
            r'open\(',
            r'subprocess\.',
            r'eval\(',
            r'exec\(',
            r'__import__\('
        ]

        for pattern in dangerous_patterns:
            if re.search(pattern, code):
                if 'fig.write_html' in code and pattern == r'open\(': # Allow fig.write_html
                    continue
                return False, f"Code contains potentially unsafe operations: {pattern}"

        try:
            compile(code, '<string>', 'exec')
            return True, "Code validation passed."
        except SyntaxError as e:
            return False, f"Code contains syntax errors: {str(e)}"

    def safe_execute_pandas_code(self, code, query_category):
        """Safely execute generated pandas code in a restricted environment."""
        if query_category == 'VISUALIZATION':
            # Ensure we're using a fresh figure
            plt.close('all')
        
        if self.operation_cancelled_flag:
            logger.info("Operation cancelled flag detected in safe_execute_pandas_code")
            return None, "I've stopped processing that request as you requested."
        
        if not code:
            logger.error("No code provided for execution")
            return None, "No code to execute."

        try:
            is_valid, validation_message = self.validate_code(code)
            logger.debug(f"Code validation result - Valid: {is_valid}, Message: {validation_message}")
            
            if not is_valid:
                logger.error(f"Code validation failed: {validation_message}")
                return None, f"Code validation failed: {validation_message}"

            df_copy_for_execution = self.data_handler.get_df().copy()
            logger.debug(f"Created DataFrame copy for execution, shape: {df_copy_for_execution.shape}")

            # Set up execution environment
            safe_globals = {
                'pd': pd,
                'np': np,
                'plt': plt,
                'df': df_copy_for_execution,
                'uuid': uuid,
                'os': os,
                'print': print,
                'sns': sns,
                '__builtins__': {
                    'print': print, 'len': len, 'range': range, 'dict': dict, 'list': list,
                    'set': set, 'str': str, 'int': int, 'float': float, 'bool': bool,
                    'tuple': tuple, 'zip': zip, 'round': round, 'sum': sum, 'min': min,
                    'max': max, 'abs': abs, 'all': all, 'any': any, 'enumerate': enumerate,
                    'filter': filter, 'map': map, 'sorted': sorted, 'Exception': Exception,
                    'TypeError': TypeError, 'ValueError': ValueError, '__import__': __import__
                }
            }
            
            if PLOTLY_AVAILABLE:
                logger.debug("Adding Plotly to execution environment")
                safe_globals['px'] = px
                safe_globals['go'] = go
                safe_globals['PLOTLY_AVAILABLE'] = True
            else:
                logger.debug("Plotly not available in execution environment")
                safe_globals['PLOTLY_AVAILABLE'] = False
            
            safe_locals = {'result': None}
            
            # Execute the code
            logger.debug("Executing code in restricted environment")
            exec(code, safe_globals, safe_locals)
            
            if self.operation_cancelled_flag:
                logger.info("Operation cancelled during code execution")
                return None, "I've stopped processing that request as you requested."
            
            execution_result = safe_locals.get('result')
            logger.debug(f"Execution result type: {type(execution_result)}")

            if query_category == 'VISUALIZATION':
                logger.debug("Processing visualization result")
                
                if isinstance(execution_result, plt.Figure):
                    logger.debug("Found matplotlib Figure result")
                    viz_paths, message = self._save_matplotlib_figure(execution_result)
                    logger.debug(f"Save matplotlib result: paths={viz_paths}, message={message}")
                    return viz_paths, message
                elif plt.get_fignums():  # Check for any open figures
                    logger.debug("Found open matplotlib figures")
                    viz_paths, message = self._save_matplotlib_figure(plt.gcf())
                    logger.debug(f"Save matplotlib result: paths={viz_paths}, message={message}")
                    return viz_paths, message
                elif isinstance(execution_result, str) and execution_result.endswith(".html"):
                    logger.debug("Found plotly HTML result")
                    viz_paths, message = self._save_plotly_figure(execution_result)
                    logger.debug(f"Save plotly result: paths={viz_paths}, message={message}")
                    return viz_paths, message
                else:
                    logger.warning(f"Unexpected visualization result type: {type(execution_result)}")
                    return None, "No valid visualization was produced"
                    
            # Handle non-visualization results
            logger.debug(f"Returning non-visualization result of type: {type(execution_result)}")
            return execution_result, "Execution completed successfully."
            
        except Exception as e:
            logger.exception("Error in safe_execute_pandas_code")
            return None, f"Error executing generated code: {str(e)}"

    def _save_matplotlib_figure(self, fig):
        """Helper method to save Matplotlib figures."""
        logger.debug("Entering _save_matplotlib_figure")
        try:
            logger.debug("Configuring Matplotlib figure size")
            fig.set_size_inches(12, 8)  # Larger figure size
            logger.debug("Setting Matplotlib xticks rotation")
            plt.xticks(rotation=45, ha='right')
            logger.debug("Adjusting Matplotlib subplots")
            plt.subplots_adjust(bottom=0.2)
            logger.debug("Applying Matplotlib tight_layout")
            plt.tight_layout(pad=2.0)
            
            logger.debug("Generating unique filename for Matplotlib figure")
            # Simple filename with no subdirectories
            filename = f"viz_{uuid.uuid4().hex[:8]}.png"
            logger.debug(f"Generated filename: {filename}")
            filepath = os.path.join(self.charts_dir, filename)
            logger.debug(f"Full filepath for Matplotlib figure: {filepath}")
            
            logger.info(f"Attempting to save Matplotlib figure to: {filepath}")
            
            # Save the figure with higher DPI 
            try:
                logger.debug(f"Calling fig.savefig() for: {filepath}")
                fig.savefig(filepath, 
                           bbox_inches='tight', 
                           dpi=300,  # Increased DPI for better quality
                           format='png'  # Explicitly set format
                )
                logger.info(f"Successfully saved Matplotlib figure to: {filepath} using fig.savefig()")
                plt.close(fig)
                logger.debug(f"Closed figure after saving: {filepath}")
                
                # Return a dictionary with visualization paths and filename as required by frontend
                visualization_paths = {
                    "type": "matplotlib_figure",
                    "path": filepath,
                    "filename": filename  # Add filename key for frontend
                }
                logger.debug(f"Returning visualization paths: {visualization_paths}")
                return visualization_paths, "Visualization created successfully."
            except Exception as e_fig_save:
                logger.error(f"fig.savefig() failed for {filepath}: {str(e_fig_save)}")
                logger.debug(f"Attempting plt.savefig() as fallback for: {filepath}")
                try:
                    # Ensure the figure is the current figure for plt.savefig()
                    plt.figure(fig.number) # Set current figure
                    plt.savefig(filepath, 
                              bbox_inches='tight', 
                              dpi=300,  # Increased DPI for better quality
                              format='png'  # Explicitly set format
                    )
                    logger.info(f"Successfully saved Matplotlib figure to: {filepath} using plt.savefig()")
                    plt.close(fig)
                    logger.debug(f"Closed figure after fallback save: {filepath}")
                    
                    # Return a dictionary with visualization paths and filename as required by frontend
                    visualization_paths = {
                        "type": "matplotlib_figure",
                        "path": filepath,
                        "filename": filename  # Add filename key for frontend
                    }
                    logger.debug(f"Returning visualization paths: {visualization_paths}")
                    return visualization_paths, "Visualization created successfully."
                except Exception as e_plt_save:
                    logger.error(f"plt.savefig() also failed for {filepath}: {str(e_plt_save)}")
                    plt.close(fig) # Attempt to close the figure even if save fails
                    logger.debug(f"Closed figure after all save attempts failed: {filepath}")
                    return None, f"Failed to save visualization after multiple attempts: {str(e_plt_save)}"
            
        except Exception as e_main:
            logger.exception("Overall error in _save_matplotlib_figure")
            if 'fig' in locals() and fig is not None:
                try:
                    plt.close(fig) # Clean up in case of any other error
                    logger.debug("Closed figure due to an overall error in _save_matplotlib_figure")
                except Exception as e_close_fig:
                    logger.error(f"Failed to close figure during error handling: {str(e_close_fig)}")
            return None, f"Error in figure preparation or saving: {str(e_main)}"

    def _save_plotly_figure(self, html_content):
        """Helper method to save Plotly figures."""
        logger.debug("Entering _save_plotly_figure")
        try:
            logger.debug("Generating unique filename for Plotly figure")
            # Simple filename with no subdirectories
            filename = f"viz_{uuid.uuid4().hex[:8]}.html"
            logger.debug(f"Generated filename: {filename}")
            filepath = os.path.join(self.charts_dir, filename)
            logger.debug(f"Full filepath for Plotly figure: {filepath}")
            
            logger.info(f"Attempting to save Plotly figure to: {filepath}")
            
            # Save the HTML content
            try:
                logger.debug(f"Opening file for writing: {filepath}")
                with open(filepath, 'w', encoding='utf-8') as f:
                    logger.debug(f"Writing HTML content to: {filepath}")
                    f.write(html_content)
                    logger.debug(f"Finished writing HTML content to: {filepath}")
                logger.info(f"Successfully saved Plotly figure to: {filepath}")
                
                # Return a dictionary with visualization path and filename as required by frontend
                visualization_paths = {
                    "type": "plotly_html",
                    "path": filepath,
                    "filename": filename  # Add filename key for frontend
                }
                logger.debug(f"Returning visualization paths: {visualization_paths}")
                return visualization_paths, "Visualization created successfully."
            except Exception as e_initial_save:
                logger.error(f"Failed to save Plotly figure to {filepath}: {str(e_initial_save)}")
                logger.debug("Attempting to save Plotly figure to temporary directory as fallback")
                try:
                    import tempfile
                    temp_dir = tempfile.gettempdir()
                    logger.debug(f"Using temporary directory: {temp_dir}")
                    fallback_filepath = os.path.join(temp_dir, filename)
                    logger.debug(f"Full fallback filepath for Plotly figure: {fallback_filepath}")
                    logger.debug(f"Opening fallback file for writing: {fallback_filepath}")
                    with open(fallback_filepath, 'w', encoding='utf-8') as f:
                        logger.debug(f"Writing HTML content to fallback file: {fallback_filepath}")
                        f.write(html_content)
                        logger.debug(f"Finished writing HTML content to fallback file: {fallback_filepath}")
                    logger.info(f"Successfully saved Plotly figure to fallback temp location: {fallback_filepath}")
                    
                    # Return a dictionary with visualization path and filename as required by frontend
                    visualization_paths = {
                        "type": "plotly_html",
                        "path": fallback_filepath,
                        "filename": filename  # Add filename key for frontend
                    }
                    logger.debug(f"Returning visualization paths: {visualization_paths}")
                    return visualization_paths, "Visualization created successfully."
                except Exception as e_fallback_save:
                    logger.error(f"Failed to save Plotly figure to temporary directory: {str(e_fallback_save)}")
                    return None, f"Failed to save Plotly figure after multiple attempts: {str(e_fallback_save)}"
                
        except Exception as e_main:
            logger.exception("Overall error in _save_plotly_figure")
            return None, f"Error saving Plotly figure: {str(e_main)}"

    def categorize_query(self, question: str) -> tuple[str, int]:
        """Categorize the query and return confidence score"""
        logger.info(f"🔍 === CATEGORIZING QUERY ===")
        logger.info(f"📝 Input: '{question}'")
        
        # Get basic categorization first
        logger.info(f"🎯 Running basic categorization...")
        initial_category = self._categorize_query_basic(question)
        logger.info(f"🎯 Basic categorization result: {initial_category}")
        
        # Return basic categorization directly (clarification system removed)
        default_confidence = 70
        logger.info(f"📊 Returning basic categorization: {initial_category} with default {default_confidence}% confidence")
        return initial_category, default_confidence
    
    def _categorize_query_basic(self, question: str) -> str:
        """Categorize the query to determine the appropriate processing method"""
        question_lower = question.lower()

        # Use LLM to detect missing values queries - no more pattern matching
        missing_values_check_prompt = f"""
        Is this user query about missing values, null values, or empty data? Answer only "YES" or "NO".
        
        Query: "{question}"
        
        Examples of missing values queries:
        - "show me missing values"
        - "how to handle missing data" 
        - "what should I do about null values"
        - "remove missing values"
        - "fill empty cells"
        - "deal with missing information"
        """
        
        try:
            response = self.llm.invoke(missing_values_check_prompt)
            if response.content.strip().upper() == "YES":
                return "MISSING_VALUES"
        except Exception as e:
            logger.error(f"LLM missing values detection failed: {str(e)}")

        # --- Pattern-based pre-filtering for critical categories ---
        question_lower = question.lower()
        
        # Force DUPLICATE_CHECK for any duplicate-related query
        duplicate_keywords = ['duplicate', 'duplicates', 'deduplicate', 'deduplication']
        duplicate_patterns = [
            r'are there.*duplicate', r'any.*duplicate', r'check.*duplicate', r'find.*duplicate',
            r'remove.*duplicate', r'delete.*duplicate', r'drop.*duplicate', r'eliminate.*duplicate'
        ]
        
        if (any(keyword in question_lower for keyword in duplicate_keywords) or
            any(re.search(pattern, question_lower) for pattern in duplicate_patterns)):
            logger.info(f"Pre-filtered as DUPLICATE_CHECK: {question}")
            return "DUPLICATE_CHECK"

        # Force PREDICTION for prediction-related queries
        prediction_keywords = ['predict', 'forecast', 'projection', 'future', 'will be', 'next year', 'next quarter', 'estimate']
        prediction_patterns = [
            r'predict.*\b(next|future|upcoming)\b',
            r'forecast.*\b(sales|revenue|theme|popularity)\b',
            r'what will.*\bbe\b.*\b(next|in \d+)\b',
            r'estimate.*\bfuture\b',
            r'\bwill\b.*\bbe\b.*\b(dominant|popular|highest)\b',
            r'which.*will.*be.*\b(next|dominant|popular)\b'
        ]

        if (any(keyword in question_lower for keyword in prediction_keywords) or
            any(re.search(pattern, question_lower) for pattern in prediction_patterns)):
            logger.info(f"Pre-filtered as PREDICTION: {question}")
            return "PREDICTION"

        # --- LLM-based categorization first ---
        logger.info(f"🤖 Running LLM-based categorization...")
        valid_categories = [
            'SPECIFIC_DATA', 'GENERAL', 'VISUALIZATION',
            'TRANSLATION', 'ANALYSIS', 'MISSING_VALUES', 'DUPLICATE_CHECK', 'SPREADSHEET_COMMAND', 'JUNK_DETECTION', 'PREDICTION'
        ]
        
        try:
            llm_prompt = f"""
You are an expert data assistant. Categorize the following user query as one of: {', '.join(valid_categories)}.

Query: "{question}"

Guidelines for categorization:
- SPREADSHEET_COMMAND: Requests to format cells, adjust columns, sort data, or perform spreadsheet operations (e.g., "make A2 bold", "autofit columns", "sort ascending", "sort descending", "widen column", "set cell color", "make cell italic", "resize column").
- SPECIFIC_DATA: Queries asking about specific data points, counts, rankings, or data context/summary (e.g., "what is this data about", "data summary", "how many", "which has the most", "data context")
- GENERAL: General questions about data science concepts, not about the current dataset
- VISUALIZATION: Requests for charts, graphs, plots, or visual representations
- DUPLICATE_CHECK: ALL queries about checking for OR removing duplicate rows (e.g., "are there duplicates", "remove duplicates", "check for duplicates", "delete duplicates", "find duplicates", "drop duplicates", "deduplicate", "how many duplicates"). This includes BOTH checking AND removal operations.
- TRANSLATION: Requests to translate data content
- ANALYSIS: Requests for statistical analysis, correlations, patterns
- MISSING_VALUES: Queries about null/empty values
- JUNK_DETECTION: Requests to find, identify, flag, or clean junk/spam/meaningless responses in text columns (e.g., "find junk responses", "detect spam", "identify meaningless text", "flag gibberish", "clean bad responses", "add junk column")
- PREDICTION: Requests to predict, forecast, or estimate future values or trends (e.g., "predict theme popularity for next year", "forecast sales", "what will be dominant in 2026", "which theme will be popular next quarter")

IMPORTANT: Any query containing words like "duplicate", "duplicates", "deduplicate" should ALWAYS be categorized as DUPLICATE_CHECK, never SPREADSHEET_COMMAND.

Only output the category name, nothing else.
"""
            logger.info(f"🤖 Sending query to LLM for categorization...")
            logger.info(f"🤖 LLM Prompt: {llm_prompt}")
            
            llm_response = self.llm.invoke(llm_prompt)
            logger.info(f"🤖 LLM Raw response: '{llm_response.content}'")
            
            category = llm_response.content.strip().upper()
            logger.info(f"🤖 LLM Parsed category: '{category}'")
            
            if category in valid_categories:
                logger.info(f"✅ LLM successfully categorized query as: {category}")
                return category
            else:
                logger.info(f"LLM categorization uncertain or invalid ('{category}'), falling back to pattern-based categorization.")
        except Exception as e:
            logger.error(f"LLM categorization failed: {str(e)}. Falling back to pattern-based categorization.")

        # --- Pattern-based fallback ---
        # First check for spreadsheet formatting commands
        if any(keyword in question_lower for keyword in [
            'bold', 'italic', 'underline', 'cell format', 'make cell', 'set cell',
            'font color', 'background color', 'cell color', 'highlight',
            'autofit', 'auto fit', 'fit columns', 'column width', 'resize column',
            'widen column', 'narrow column', 'adjust column', 'make column'
        ]):
            return "SPREADSHEET_COMMAND"
        
        # Check for translation requests (including bulk translation)
        if any(keyword in question_lower for keyword in [
            'translate', 'translation', 'convert to', 'in english', 'in spanish', 'in french', 'in german',
            'to english', 'to spanish', 'to french', 'to german', 'change language',
            'bulk translate', 'translate all', 'translate multiple', 'batch translate', 'mass translate'
        ]):
            return "TRANSLATION"
        
        # Check explicitly for data context/summary queries first (highest priority)
        data_context_keywords = [
            'what is this data about', 'what is the data about', 'data about',
            'data context', 'data summary', 'summary of data', 'what does this data contain',
            'what does the data show', 'what does this data represent'
        ]
        
        for keyword in data_context_keywords:
            if keyword in question_lower:
                logger.debug(f"🔍 Detected data context keyword: '{keyword}' in query: '{question_lower}'")
                return "SPECIFIC_DATA"
        
        # Check explicitly for duplicate removal requests (high priority)
        duplicate_keywords = [
            'remove duplicate', 'drop duplicate', 'deduplicate', 'deduplication',
            'delete duplicate', 'get rid of duplicate', 'eliminate duplicate', 
            'unique rows', 'remove duplicates', 'drop duplicates'
        ]
        
        # Enhanced patterns for duplicate removal that include question forms
        duplicate_patterns = [
            r'can you.+(?:remove|get rid of|delete|drop|eliminate).+duplicate',
            r'could you.+(?:remove|get rid of|delete|drop|eliminate).+duplicate',
            r'would you.+(?:remove|get rid of|delete|drop|eliminate).+duplicate',
            r'please.+(?:remove|get rid of|delete|drop|eliminate).+duplicate',
            r'how (?:can|do) (?:I|we|you).+(?:remove|get rid of|delete|drop|eliminate).+duplicate',
            r'is it possible to.+(?:remove|get rid of|delete|drop|eliminate).+duplicate'
        ]
        
        # Check for direct keyword matches
        for keyword in duplicate_keywords:
            if keyword in question_lower:
                logger.debug(f"🔍 Detected duplicate removal keyword: '{keyword}' in query: '{question_lower}'")
                return "DUPLICATE_CHECK"
                
        # Check for question pattern matches
        for pattern in duplicate_patterns:
            if re.search(pattern, question_lower):
                logger.debug(f"🔍 Detected duplicate removal pattern: '{pattern}' in query: '{question_lower}'")
                return "DUPLICATE_CHECK"
        
            
        # Check for specific data queries (has highest priority after spreadsheet/translation/transformation)
        # These are queries about specific data points, rankings, etc.
        specific_data_patterns = [
            # Patterns for data context and summary queries
            r'what\s+is\s+(this|the)\s+data\s+about',
            r'data\s+(context|summary|overview)',
            r'summary\s+of\s+(data|the\s+data)',
            r'what\s+does\s+(this|the)\s+data\s+(contain|show|represent)',
            # Patterns for queries about rankings, counts, etc.
            r'(which|what)\s+\w+\s+(has|have|had)\s+the\s+(most|highest|greatest|maximum|max|largest|best)',
            r'(which|what)\s+\w+\s+(has|have|had)\s+the\s+(least|lowest|smallest|minimum|min|worst)',
            r'(top|bottom)\s+\d+',
            r'(most|least)\s+\w+',
            r'how\s+many',
            r'count\s+of',
            r'total\s+number',
            # Patterns for queries that should return a visualization
            r'compare.*between',
            r'relationship\s+between',
            r'correlation',
            r'distribution\s+of',
            r'trend\s+of',
            r'frequency\s+of',
            r'percentage\s+of'
        ]
        
        # Check if any specific data pattern matches
        for pattern in specific_data_patterns:
            if re.search(pattern, question_lower):
                logger.debug(f"Detected specific data pattern: '{pattern}' in query: '{question_lower}'")
                
                # Check if the query contains visualization keywords - if so, return VISUALIZATION
                visualization_keywords = [
                    'chart', 'graph', 'plot', 'visualize', 'visualization', 'histogram',
                    'scatter', 'bar chart', 'pie chart', 'line graph', 'show me'
                ]
                
                if any(keyword in question_lower for keyword in visualization_keywords):
                    logger.debug(f"Query contains visualization keywords, categorizing as VISUALIZATION")
                    return "VISUALIZATION"
                
                # Otherwise, return SPECIFIC_DATA
                logger.debug(f"Categorizing as SPECIFIC_DATA")
                return "SPECIFIC_DATA"
            
        # Then check for visualization requests
        # Only if it's not a cell formatting command
        if not any(cell_cmd in question_lower for cell_cmd in ['cell', 'make', 'set']) and \
           any(keyword in question_lower for keyword in [
            'chart', 'graph', 'plot', 'visualize', 'visualization', 'histogram',
            'scatter', 'bar chart', 'pie chart', 'line graph', 'show me'
        ]):
            return "VISUALIZATION"
            
        # Check for data analysis requests
        if any(keyword in question_lower for keyword in [
            'analyze', 'analysis', 'insight', 'trend', 'pattern', 'correlation',
            'regression', 'statistics', 'stat', 'mean', 'average', 'median',
            'mode', 'standard deviation', 'variance', 'distribution'
        ]):
            return "ANALYSIS"
            
        # Default to general query
        return "GENERAL"

    def _extract_prediction_parameters(self, question: str, df: pd.DataFrame) -> Dict:
        """
        Extract prediction parameters from natural language using LLM.

        Returns: {
            'target_column': str,
            'prediction_type': 'auto' | 'forecast' | 'regression' | 'classification' | 'trend',
            'periods': int,
            'feature_columns': List[str] (optional)
        }
        """
        logger.info(f"🧠 Extracting prediction parameters from: {question}")

        # Get column context
        columns = df.columns.tolist()
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        temporal_cols = [col for col in columns if pd.api.types.is_datetime64_any_dtype(df[col]) or
                         any(word in col.lower() for word in ['date', 'time', 'year', 'month', 'quarter', 'day'])]

        # LLM extraction prompt - Enhanced for 7 query types
        extraction_prompt = f"""
Extract prediction parameters from this query.

Dataset columns: {', '.join(columns)}
Numeric columns: {', '.join(numeric_cols)}
Temporal columns: {', '.join(temporal_cols) if temporal_cols else 'None'}

User query: "{question}"

FIRST, identify the QUERY TYPE:
1. "comparative_prediction" - Comparing entities (e.g., "compare Product A vs B")
2. "whatif_scenario" - What-if analysis (e.g., "what if sales increase by 20%")
3. "probability_query" - Probability questions (e.g., "how likely is X")
4. "extremes_prediction" - Finding peaks/troughs (e.g., "when will sales peak")
5. "multi_target_prediction" - Multiple targets (e.g., "predict sales and revenue")
6. "conditional_prediction" - Filtered predictions (e.g., "predict if region = NA")
7. "simple_prediction" - Standard single-target

Return ONLY valid JSON matching the query type:

## For comparative_prediction:
{{"query_type": "comparative_prediction", "target_column": "column_name", "comparison_dimension": "column_to_split_by", "comparison_values": ["value1", "value2"], "prediction_type": "auto", "periods": 10}}

## For whatif_scenario:
{{"query_type": "whatif_scenario", "target_column": "column_name", "scenarios": [{{"name": "scenario_description", "modifications": [{{"column": "col", "operation": "multiply", "value": 1.2}}]}}], "prediction_type": "auto"}}

## For probability_query:
{{"query_type": "probability_query", "target_column": "column_name", "probability_type": "class_likelihood", "specific_class": "class_name", "periods": 10}}

## For extremes_prediction:
{{"query_type": "extremes_prediction", "target_column": "column_name", "extremes_type": "maximum", "periods": 12}}

## For multi_target_prediction:
{{"query_type": "multi_target_prediction", "target_columns": ["col1", "col2"], "prediction_type": "auto", "periods": 10, "analyze_relationships": true}}

## For conditional_prediction:
{{"query_type": "conditional_prediction", "target_column": "column_name", "conditions": [{{"column": "col", "operator": "equals", "value": "value"}}], "condition_logic": "AND", "prediction_type": "auto", "periods": 10}}

## For simple_prediction:
{{"query_type": "simple_prediction", "target_column": "column_name", "prediction_type": "auto", "periods": 10, "time_specification": {{"type": "relative", "value": "next year", "unit": "months"}}}}

Time parsing:
- "next week" = 7 periods (days)
- "next month" = 1 period (months)
- "next quarter" = 3 periods (months)
- "next year" = 12 periods (months)
- "July 2026" = specific_date with auto-calculated periods
- "before holiday season" = event_based

Return ONLY JSON, no other text.
"""

        try:
            response = self.llm.invoke(extraction_prompt)
            content = response.content.strip()

            # Clean potential markdown formatting
            if content.startswith('```'):
                content = content.split('\n', 1)[1]
                content = content.rsplit('```', 1)[0]

            params = json.loads(content)

            # Validate based on query type
            query_type = params.get('query_type', 'simple_prediction')
            from difflib import get_close_matches

            # Handle multi-target predictions
            if query_type == 'multi_target_prediction':
                target_columns = params.get('target_columns', [])
                validated_columns = []
                for col in target_columns:
                    if col not in columns:
                        matches = get_close_matches(col, columns, n=1, cutoff=0.6)
                        if matches:
                            validated_columns.append(matches[0])
                            logger.info(f"✅ Fuzzy matched column: {col} → {matches[0]}")
                        else:
                            return {'error': f"Could not find column '{col}'. Available: {', '.join(columns[:5])}"}
                    else:
                        validated_columns.append(col)
                params['target_columns'] = validated_columns

            # Handle single target column (all other query types)
            elif params.get('target_column'):
                if params['target_column'] not in columns:
                    matches = get_close_matches(params.get('target_column', ''), columns, n=1, cutoff=0.6)
                    if matches:
                        params['target_column'] = matches[0]
                        logger.info(f"✅ Fuzzy matched column: {matches[0]}")
                    else:
                        return {'error': f"Could not find column '{params.get('target_column')}'. Available columns: {', '.join(columns[:5])}{'...' if len(columns) > 5 else ''}"}

            # Validate comparison dimension for comparative predictions
            if query_type == 'comparative_prediction' and params.get('comparison_dimension'):
                if params['comparison_dimension'] not in columns:
                    matches = get_close_matches(params['comparison_dimension'], columns, n=1, cutoff=0.6)
                    if matches:
                        params['comparison_dimension'] = matches[0]
                        logger.info(f"✅ Fuzzy matched comparison dimension: {matches[0]}")

            logger.info(f"✅ Extracted parameters ({query_type}): {params}")
            return params

        except json.JSONDecodeError as e:
            logger.error(f"JSON decode error: {e}")
            return {'error': "I couldn't understand which column to predict. Could you be more specific about what you want to predict?"}
        except Exception as e:
            logger.error(f"Parameter extraction failed: {e}")
            return {'error': f"I encountered an error extracting prediction parameters: {str(e)}"}

    def _format_prediction_response(self, result: Dict, original_query: str) -> str:
        """Format prediction results as markdown (mirrors ChatSidebar formatPredictionResponse)"""
        markdown = f"## 🔮 Prediction Results\n\n"
        markdown += f"**Query**: {original_query}\n\n"
        markdown += f"**Method**: {result.get('method', 'Unknown')} ({result.get('prediction_type', 'auto')})\n\n"

        if result.get('description'):
            markdown += f"{result.get('description')}\n\n"

        # Model performance metrics
        if result.get('model_performance', {}).get('metrics'):
            markdown += f"### 📊 Model Performance\n\n"
            metrics = result['model_performance']['metrics']
            for key, value in metrics.items():
                if value is not None:
                    # Format percentage metrics
                    if key in ['mape', 'accuracy', 'precision', 'recall', 'f1']:
                        display = f"{value * 100:.2f}%" if value <= 1 else f"{value:.2f}%"
                    else:
                        display = f"{value:.4f}"
                    markdown += f"- **{key.upper()}**: {display}\n"
            markdown += "\n"

        # Top predictions (first 10)
        predictions = result.get('predictions', [])
        if predictions:
            markdown += f"### 🎯 Predictions\n\n"

            # Determine table format based on prediction type
            pred_type = result.get('prediction_type', 'auto')

            if pred_type in ['forecast', 'trend']:
                # Time series predictions
                markdown += "| Period | Predicted Value | Confidence Interval |\n"
                markdown += "|--------|----------------|---------------------|\n"

                for pred in predictions[:10]:
                    period = pred.get('timestamp', pred.get('period', '?'))
                    if isinstance(period, str) and 'T' in period:
                        period = period.split('T')[0]
                    value = pred.get('predicted_value', pred.get('trend_value', 0))
                    lower = pred.get('lower_bound', value * 0.9)
                    upper = pred.get('upper_bound', value * 1.1)
                    markdown += f"| {period} | {value:.2f} | {lower:.2f} - {upper:.2f} |\n"

            elif pred_type == 'classification':
                # Classification predictions
                markdown += "| Index | Predicted Class | Confidence |\n"
                markdown += "|-------|----------------|------------|\n"

                for pred in predictions[:10]:
                    idx = pred.get('row_index', pred.get('period', '?'))
                    predicted = pred.get('predicted', pred.get('predicted_value', 'Unknown'))
                    confidence = pred.get('confidence', 0)
                    markdown += f"| {idx} | {predicted} | {confidence * 100:.1f}% |\n"

            else:
                # Regression predictions
                markdown += "| Index | Actual | Predicted | Residual |\n"
                markdown += "|-------|--------|-----------|----------|\n"

                for pred in predictions[:10]:
                    idx = pred.get('row_index', pred.get('period', '?'))
                    actual = pred.get('actual', 0)
                    predicted = pred.get('predicted', pred.get('predicted_value', 0))
                    residual = pred.get('residual', actual - predicted)
                    markdown += f"| {idx} | {actual:.2f} | {predicted:.2f} | {residual:.2f} |\n"

            markdown += "\n"

        # Feature importance
        if result.get('feature_importance'):
            markdown += f"### 🎯 Feature Importance\n\n"
            for feature, importance in sorted(result['feature_importance'].items(), key=lambda x: x[1], reverse=True)[:5]:
                markdown += f"- **{feature}**: {importance:.4f}\n"
            markdown += "\n"

        # Model selection reason
        if result.get('model_performance', {}).get('selection_reason'):
            markdown += f"### 💡 Model Selection\n\n{result['model_performance']['selection_reason']}\n\n"

        # Recommendations
        if result.get('recommendations'):
            markdown += f"### 📌 Recommendations\n\n"
            for rec in result['recommendations']:
                markdown += f"- {rec}\n"
            markdown += "\n"

        # Summary
        if result.get('summary'):
            markdown += f"### 📝 Summary\n\n{result['summary']}\n"

        return markdown

    def _format_prediction_response_enhanced(self, result: Dict, original_query: str, query_type: str) -> str:
        """Enhanced dispatcher for formatting prediction responses based on query type."""

        # Route to specialized formatters based on query type
        if query_type == "comparative_prediction":
            return self._format_comparative_response(result, original_query)
        elif query_type == "whatif_scenario":
            return self._format_whatif_response(result, original_query)
        elif query_type == "probability_query":
            return self._format_probability_response(result, original_query)
        elif query_type == "extremes_prediction":
            return self._format_extremes_response(result, original_query)
        elif query_type == "multi_target_prediction":
            return self._format_multitarget_response(result, original_query)
        elif query_type == "conditional_prediction":
            return self._format_conditional_response(result, original_query)
        else:
            # Fall back to original formatter for simple predictions
            return self._format_prediction_response(result, original_query)

    def _format_comparative_response(self, result: Dict, original_query: str) -> str:
        """Format comparative prediction results."""
        markdown = f"## 🔍 Comparative Prediction Analysis\n\n"
        markdown += f"**Query**: {original_query}\n\n"

        comparison_dimension = result.get('comparison_dimension', 'entities')
        entities = result.get('entities', {})
        comparison_metrics = result.get('comparison_metrics', {})
        winner = result.get('winner', 'N/A')

        markdown += f"### 📊 Comparison: {comparison_dimension}\n\n"
        markdown += f"**Winner**: {winner} (highest average prediction)\n\n"

        # Comparison table
        markdown += "| Entity | Avg Prediction | Trend |\n"
        markdown += "|--------|---------------|-------|\n"
        for entity, metrics in comparison_metrics.items():
            avg = metrics.get('avg_prediction', 0)
            trend = metrics.get('trend', 'unknown')
            emoji = "📈" if trend == "increasing" else "📉" if trend == "decreasing" else "➡️"
            markdown += f"| {entity} | {avg:.2f} | {emoji} {trend} |\n"

        markdown += "\n"
        return markdown

    def _format_whatif_response(self, result: Dict, original_query: str) -> str:
        """Format what-if scenario analysis results."""
        markdown = f"## 🔮 What-If Scenario Analysis\n\n"
        markdown += f"**Query**: {original_query}\n\n"

        target_column = result.get('target_column', 'target')
        comparison_metrics = result.get('comparison_metrics', {})
        insights = result.get('insights', '')

        markdown += f"### 📊 Scenario Comparison for {target_column}\n\n"

        if insights:
            markdown += f"**Key Insight**: {insights}\n\n"

        # Scenario comparison table
        markdown += "| Scenario | Avg Prediction | Change from Baseline | Elasticity |\n"
        markdown += "|----------|---------------|---------------------|------------|\n"
        for scenario, metrics in comparison_metrics.items():
            avg = metrics.get('scenario_avg', 0)
            pct_change = metrics.get('percent_change', 0)
            elasticity = metrics.get('elasticity', 0)
            direction = metrics.get('direction', 'no change')
            emoji = "🔺" if direction == "increase" else "🔻" if direction == "decrease" else "➡️"
            markdown += f"| {scenario} | {avg:.2f} | {emoji} {pct_change:+.1f}% | {elasticity:.2f} |\n"

        markdown += "\n"
        return markdown

    def _format_probability_response(self, result: Dict, original_query: str) -> str:
        """Format probability analysis results."""
        markdown = f"## 📊 Probability Analysis\n\n"
        markdown += f"**Query**: {original_query}\n\n"

        prob_type = result.get('type', 'unknown')
        target_column = result.get('target_column', 'target')
        confidence = result.get('confidence', 'unknown')

        markdown += f"### 🎲 Probability Results for {target_column}\n\n"
        markdown += f"**Confidence Level**: {confidence}\n\n"

        if prob_type == "class_likelihood":
            specific_class = result.get('specific_class')

            if specific_class:
                # Single class probability
                probability = result.get('probability', 0)
                markdown += f"**Probability of '{specific_class}'**: {probability * 100:.1f}%\n\n"

                all_probs = result.get('all_probabilities', {})
                if all_probs:
                    markdown += "#### All Class Probabilities\n\n"
                    markdown += "| Class | Probability |\n"
                    markdown += "|-------|-------------|\n"
                    for cls, prob in sorted(all_probs.items(), key=lambda x: x[1], reverse=True):
                        marker = "✓" if cls == specific_class else ""
                        markdown += f"| {cls} {marker} | {prob * 100:.1f}% |\n"
            else:
                # All class probabilities
                probabilities = result.get('probabilities', {})
                most_likely = result.get('most_likely_class', 'N/A')
                confidence_val = result.get('confidence', 0)

                markdown += f"**Most Likely Class**: {most_likely} ({confidence_val * 100:.1f}%)\n\n"
                markdown += "| Class | Probability |\n"
                markdown += "|-------|-------------|\n"
                for cls, prob in probabilities.items():
                    marker = "⭐" if cls == most_likely else ""
                    markdown += f"| {cls} {marker} | {prob * 100:.1f}% |\n"

        elif prob_type == "threshold_exceeding":
            threshold = result.get('threshold', 0)
            prob_exceeding = result.get('probability_exceeding_threshold', 0)
            prob_below = result.get('probability_below_threshold', 0)
            avg_prediction = result.get('avg_prediction', 0)

            markdown += f"**Threshold**: {threshold:.2f}\n"
            markdown += f"**Average Prediction**: {avg_prediction:.2f}\n\n"
            markdown += f"- Probability **exceeding** threshold: {prob_exceeding * 100:.1f}%\n"
            markdown += f"- Probability **below** threshold: {prob_below * 100:.1f}%\n\n"

            sim_details = result.get('simulation_details', {})
            if sim_details:
                pred_range = sim_details.get('prediction_range', {})
                markdown += f"#### Simulation Details ({sim_details.get('n_simulations', 0)} runs)\n\n"
                markdown += f"- Range: {pred_range.get('min', 0):.2f} - {pred_range.get('max', 0):.2f}\n"
                markdown += f"- Median: {pred_range.get('median', 0):.2f}\n"

        markdown += "\n"
        return markdown

    def _format_extremes_response(self, result: Dict, original_query: str) -> str:
        """Format extremes prediction results."""
        markdown = f"## 📊 Prediction Extremes Analysis\n\n"
        markdown += f"**Query**: {original_query}\n\n"

        target_column = result.get('target_column', 'target')
        extremes_type = result.get('extremes_type', 'both')
        periods_analyzed = result.get('periods_analyzed', 0)

        markdown += f"### 🎯 Extremes for {target_column}\n\n"
        markdown += f"**Analyzed Periods**: {periods_analyzed}\n\n"

        # Peak information
        if 'peak' in result:
            peak = result['peak']
            markdown += f"#### 📈 Peak (Maximum)\n\n"
            markdown += f"- **Value**: {peak.get('value', 0):.2f}\n"
            markdown += f"- **Period**: {peak.get('period', 'N/A')}\n"
            markdown += f"- **Timing**: {peak.get('timing_description', 'unknown')}\n"

            ci = peak.get('confidence_interval', {})
            if ci:
                markdown += f"- **Confidence Interval**: {ci.get('lower', 0):.2f} - {ci.get('upper', 0):.2f}\n"
            markdown += "\n"

        # Trough information
        if 'trough' in result:
            trough = result['trough']
            markdown += f"#### 📉 Trough (Minimum)\n\n"
            markdown += f"- **Value**: {trough.get('value', 0):.2f}\n"
            markdown += f"- **Period**: {trough.get('period', 'N/A')}\n"
            markdown += f"- **Timing**: {trough.get('timing_description', 'unknown')}\n"

            ci = trough.get('confidence_interval', {})
            if ci:
                markdown += f"- **Confidence Interval**: {ci.get('lower', 0):.2f} - {ci.get('upper', 0):.2f}\n"
            markdown += "\n"

        # Trend analysis
        if 'trend_analysis' in result:
            trend = result['trend_analysis']
            markdown += f"#### 📊 Overall Trend Analysis\n\n"
            markdown += f"- **Direction**: {trend.get('overall_direction', 'unknown')}\n"
            markdown += f"- **Volatility**: {trend.get('volatility', 0):.2f}\n"

            value_range = trend.get('value_range', {})
            markdown += f"- **Range**: {value_range.get('min', 0):.2f} - {value_range.get('max', 0):.2f} (Δ {value_range.get('range', 0):.2f})\n"

        markdown += "\n"
        return markdown

    def _format_multitarget_response(self, result: Dict, original_query: str) -> str:
        """Format multi-target prediction results."""
        markdown = f"## 🎯 Multi-Target Prediction Analysis\n\n"
        markdown += f"**Query**: {original_query}\n\n"

        targets = result.get('targets', {})
        correlations = result.get('correlations', {})
        combined_insights = result.get('combined_insights', '')

        markdown += f"### 📊 Predictions for {len(targets)} Targets\n\n"

        # Target summaries
        for target, target_result in targets.items():
            if 'error' in target_result:
                markdown += f"#### ❌ {target}\n\n{target_result['error']}\n\n"
            else:
                predictions = target_result.get('predictions', [])
                if predictions:
                    avg_pred = sum(p.get('predicted_value', 0) for p in predictions) / len(predictions)
                    markdown += f"#### ✓ {target}\n\n"
                    markdown += f"- **Average Prediction**: {avg_pred:.2f}\n"
                    markdown += f"- **Method**: {target_result.get('method', 'unknown')}\n\n"

        # Correlations
        if correlations:
            markdown += f"### 🔗 Target Correlations\n\n"
            markdown += "| Target Pair | Correlation |\n"
            markdown += "|-------------|-------------|\n"
            for (col1, col2), corr in sorted(correlations.items(), key=lambda x: abs(x[1]), reverse=True):
                strength = "Strong" if abs(corr) > 0.7 else "Moderate" if abs(corr) > 0.4 else "Weak"
                emoji = "🔴" if abs(corr) > 0.7 else "🟡" if abs(corr) > 0.4 else "⚪"
                markdown += f"| {col1} ↔ {col2} | {emoji} {corr:.2f} ({strength}) |\n"
            markdown += "\n"

        if combined_insights:
            markdown += f"### 💡 Combined Insights\n\n{combined_insights}\n\n"

        return markdown

    def _format_conditional_response(self, result: Dict, original_query: str) -> str:
        """Format conditional prediction results."""
        markdown = f"## 🔍 Conditional Prediction Analysis\n\n"
        markdown += f"**Query**: {original_query}\n\n"

        filter_desc = result.get('filter_description', 'unknown')
        filtered_rows = result.get('filtered_rows', 0)
        total_rows = result.get('total_rows', 0)
        filter_pct = result.get('filter_percentage', 0)

        markdown += f"### 📊 Filter Applied\n\n"
        markdown += f"**Condition**: `{filter_desc}`\n\n"
        markdown += f"**Filtered Data**: {filtered_rows:,} rows ({filter_pct:.1f}% of {total_rows:,} total)\n\n"

        # Comparison to full dataset
        comparison = result.get('comparison_to_full_dataset', {})
        if comparison:
            filtered_avg = comparison.get('filtered_avg', 0)
            full_avg = comparison.get('full_dataset_avg', 0)
            difference = comparison.get('difference', '0%')

            markdown += f"### 📈 Comparison to Full Dataset\n\n"
            markdown += f"- **Filtered Average**: {filtered_avg:.2f}\n"
            markdown += f"- **Full Dataset Average**: {full_avg:.2f}\n"
            markdown += f"- **Difference**: {difference}\n\n"

        # Prediction details
        prediction_result = result.get('prediction_result', {})
        if prediction_result and 'predictions' in prediction_result:
            predictions = prediction_result['predictions']
            markdown += f"### 🎯 Predictions ({len(predictions)} periods)\n\n"
            markdown += f"**Method**: {prediction_result.get('method', 'unknown')}\n\n"

            # Show first 5 predictions
            if predictions:
                markdown += "| Period | Predicted Value |\n"
                markdown += "|--------|----------------|\n"
                for pred in predictions[:5]:
                    period = pred.get('period', pred.get('timestamp', '?'))
                    value = pred.get('predicted_value', 0)
                    markdown += f"| {period} | {value:.2f} |\n"

                if len(predictions) > 5:
                    markdown += f"\n*...and {len(predictions) - 5} more periods*\n"

        markdown += "\n"
        return markdown

    def _generate_prediction_visualization(self, result: Dict) -> Optional[Dict[str, str]]:
        """Return visualization from prediction results (PredictiveAnalyzer already generates them)"""
        try:
            # Check if visualization already exists in result
            if result.get('visualization'):
                logger.info(f"✅ Using existing visualization from PredictiveAnalyzer")
                return result['visualization']

            # If no visualization exists, return None
            # The PredictiveAnalyzer should always generate visualizations, so this shouldn't happen
            logger.info("No visualization found in prediction results")
            return None

        except Exception as e:
            logger.error(f"Visualization extraction failed: {e}")
            return None

    def _dispatch_prediction_query(self, params: Dict, df: pd.DataFrame, question: str) -> Tuple[str, Optional[Dict]]:
        """
        Route prediction queries to appropriate handlers based on query_type.

        Returns: (markdown_response, visualization_dict)
        """
        from predictive_analysis import PredictiveAnalyzer

        analyzer = PredictiveAnalyzer(df, llm_client=self.llm)
        query_type = params.get('query_type', 'simple_prediction')

        logger.info(f"🎯 Dispatching {query_type} prediction query")

        try:
            # Route to appropriate method based on query type
            if query_type == 'comparative_prediction':
                result = analyzer.compare_predictions(
                    target_column=params['target_column'],
                    comparison_dimension=params['comparison_dimension'],
                    comparison_values=params['comparison_values'],
                    prediction_type=params.get('prediction_type', 'auto'),
                    periods=params.get('periods', 10)
                )

            elif query_type == 'whatif_scenario':
                result = analyzer.whatif_analysis(
                    target_column=params['target_column'],
                    scenarios=params['scenarios'],
                    prediction_type=params.get('prediction_type', 'auto')
                )

            elif query_type == 'probability_query':
                result = analyzer.calculate_probability(
                    target_column=params['target_column'],
                    probability_type=params['probability_type'],
                    specific_class=params.get('specific_class'),
                    threshold=params.get('threshold'),
                    operator=params.get('operator', 'exceeds'),
                    periods=params.get('periods', 10)
                )

            elif query_type == 'extremes_prediction':
                result = analyzer.find_prediction_extremes(
                    target_column=params['target_column'],
                    extremes_type=params.get('extremes_type', 'both'),
                    periods=params.get('periods', 12),
                    temporal_col=params.get('temporal_col')
                )

            elif query_type == 'multi_target_prediction':
                result = analyzer.predict_multiple_targets(
                    target_columns=params['target_columns'],
                    prediction_type=params.get('prediction_type', 'auto'),
                    periods=params.get('periods', 10),
                    analyze_relationships=params.get('analyze_relationships', True)
                )

            elif query_type == 'conditional_prediction':
                result = analyzer.conditional_predict(
                    target_column=params['target_column'],
                    conditions=params['conditions'],
                    condition_logic=params.get('condition_logic', 'AND'),
                    prediction_type=params.get('prediction_type', 'auto'),
                    periods=params.get('periods', 10)
                )

            else:  # simple_prediction
                # Handle advanced time horizons for simple predictions
                time_spec = params.get('time_specification')
                if time_spec and time_spec.get('type') != 'relative':
                    # Parse time specification and adjust periods
                    parsed_time = analyzer._parse_time_horizon(
                        time_spec.get('value', ''),
                        reference_date=pd.Timestamp.now()
                    )
                    params['periods'] = parsed_time.get('periods', params.get('periods', 10))

                result = analyzer.auto_predict(
                    target_column=params['target_column'],
                    prediction_type=params.get('prediction_type', 'auto'),
                    periods=params.get('periods', 10),
                    feature_cols=params.get('feature_columns')
                )

            # Check for errors in result
            if 'error' in result:
                error_response = f"I couldn't complete the prediction: {result['error']}"
                # Add error to memory
                if hasattr(self, 'chat_history') and self.chat_history:
                    self.chat_history.add_ai_message(error_response)
                return error_response, None

            # Format response based on query type
            response = self._format_prediction_response_enhanced(result, question, query_type)
            visualization = self._generate_prediction_visualization(result)

            # Add response to memory
            if hasattr(self, 'chat_history') and self.chat_history:
                self.chat_history.add_ai_message(response)
            logger.debug(f"💾 Added {query_type} prediction response to conversation memory")

            return response, visualization

        except Exception as e:
            logger.error(f"Prediction dispatch error for {query_type}: {e}")
            error_response = f"I encountered an error while processing your prediction query: {str(e)}"
            # Add error to memory
            if hasattr(self, 'chat_history') and self.chat_history:
                self.chat_history.add_ai_message(error_response)
            return error_response, None

    def process_spreadsheet_command(self, question: str) -> str:
        """DEPRECATED: Spreadsheet operations now handled by Univer frontend.

        This method previously generated Luckysheet API calls but has been disabled
        as all spreadsheet operations now execute directly through the Univer FacadeAPI
        on the frontend via UniverAdapter.
        """
        logger.info("process_spreadsheet_command called but is deprecated - operations now use Univer")
        return "Spreadsheet operations are now handled directly by the Univer frontend. This endpoint is deprecated."

    def _process_missing_values(self, question: str, df: pd.DataFrame) -> str:
        """
        Simple LLM-driven missing values handler. No pattern matching, just intelligent conversation.
        """
        try:
            # First, analyze the missing values to understand the data
            missing_analysis = self.data_handler.analyze_missing_values()
            
            if not missing_analysis:
                return "No missing values found in the dataset."

            # Use LLM to understand what the user wants and provide appropriate response
            llm_prompt = f"""
            You are a data analysis expert. The user asked: "{question}"
            
            Current missing values situation:
            {chr(10).join([f"Column '{col}': {info['missing_count']} missing ({info['missing_percentage']:.1f}%) - System recommends: {info['recommendation']} (Reason: {info['reason']})" for col, info in missing_analysis.items()])}
            
            If they're asking for advice/analysis:
            - Provide comprehensive analysis with pros/cons of different approaches for each column
            - Present the system's recommendations (not the user's suggestions)
            - Make it clear these are your recommendations based on data analysis
            - Ask what approach they'd like to take
            - Use plain text only, no markdown formatting, no meta-commentary
            - Be direct and helpful
            
            If they're giving clear instructions to take action:
            - Return exactly one of these action codes:
            - "ACTION:REMOVE_ROWS" - to delete rows with missing data
            - "ACTION:FILL_VALUES" - to fill missing values using smart strategies  
            - "ACTION:DROP_COLUMNS" - to remove columns with too many missing values
            - "ACTION:CUSTOM_FILL:[strategy]" - for custom filling strategies
            
            Important: No markdown, no meta-commentary, just direct helpful response.
            """
            
            response = self.llm.invoke(llm_prompt)
            llm_response = response.content.strip()
            
            # Check if LLM returned an action code
            if llm_response.startswith("ACTION:"):
                action = llm_response.replace("ACTION:", "")
                
                if action == "REMOVE_ROWS":
                    # Remove rows with missing values
                    original_count = len(df)
                    df_cleaned = df.dropna()
                    rows_removed = original_count - len(df_cleaned)
                    
                    if rows_removed == 0:
                        return "No rows contained missing values, so no rows were removed."
                    
                    self.data_handler.update_df_and_db(df_cleaned)
                    return f"DATA_MODIFIED:🗑️ Removed {rows_removed} rows containing missing values. Dataset now contains {len(df_cleaned)} rows (was {original_count})."
                    
                elif action == "FILL_VALUES":
                    # Apply intelligent filling
                    result = self.data_handler.handle_missing_values()
                    return f"DATA_MODIFIED:🔧 Applied intelligent filling strategies:\n{result}"
                    
                elif action == "DROP_COLUMNS":
                    # Drop columns with too many missing values (>50%)
                    columns_to_drop = [col for col, info in missing_analysis.items() 
                                     if info['missing_percentage'] > 50]
                    if columns_to_drop:
                        df_cleaned = df.drop(columns=columns_to_drop)
                        self.data_handler.update_df_and_db(df_cleaned)
                        return f"DATA_MODIFIED:🗑️ Dropped columns with >50% missing values: {', '.join(columns_to_drop)}"
                    else:
                        return "No columns have >50% missing values, so no columns were dropped."
                        
                elif action.startswith("CUSTOM_FILL:"):
                    # Custom filling strategy
                    strategy = action.replace("CUSTOM_FILL:", "")
                    # Implement custom strategy here
                    result = self.data_handler.handle_missing_values()  # For now, use default
                    return f"DATA_MODIFIED:🔧 Applied {strategy} strategy for missing values:\n{result}"
            
            # If no action code, return the LLM's advice/analysis
            return llm_response

        except Exception as e:
            logger.error(f"❌ Error processing missing values: {str(e)}")
            return "I had trouble analyzing the missing values in your data. Could you try rephrasing your question or check if your data is properly formatted?"

    def process_non_visualization_query(self, question: str, query_category: str, is_speech: bool = False, mode: str = "simple") -> str:
        """Process non-visualization queries with improved error handling."""
        logger.debug(f"🔧 === PROCESS NON-VISUALIZATION QUERY ===")
        logger.debug(f"💬 Question: {question}")
        logger.debug(f"📂 Category: {query_category}")
        
        if self.operation_cancelled_flag:
            return "I've stopped processing that request as you requested."

        # Add user message to memory
        # Record user message in chat history
        if hasattr(self, 'chat_history') and self.chat_history:
            self.chat_history.add_user_message(question)

        # Handle speech confirmation if needed
        if is_speech and self.speech_util:
            confirmation = self.generate_confirmation_message(question)
            self.speech_util.text_to_speech(confirmation)
            print(confirmation)
            if self.operation_cancelled_flag:
                return "I've stopped processing that request as you requested."

        # Get current dataframe
        current_df = self.data_handler.get_df() if self.data_handler else None

        try:
            # Missing values are now handled in main process_query - no duplicate handling needed here

            # Process based on query category
            if query_category in ['SPECIFIC_DATA', 'ANALYSIS']:
                if self.operation_cancelled_flag:
                    return "I've stopped processing that request as you requested."

                # CONTEXT-AWARE PROCESSING: Check if query is about conversation vs dataset FIRST
                conversation_context = self._get_conversation_context_string()
                logger.debug(f"🔍 Conversation context being passed to LLM: {repr(conversation_context)}")
                
                # Use LLM to determine if this is about conversation context or dataset
                context_check_prompt = f"""You must analyze this user query and respond in exactly one of two ways:

{conversation_context}User question: "{question}"

RESPOND WITH EXACTLY ONE OF THESE:

1. If the question asks about information from our conversation history above, give a direct helpful answer to the user. Examples:
   - If they ask "what is my name?" and you see "my name is John" in history → "Your name is John"
   - If they ask "what did I tell you?" and you see relevant info → summarize what they told you
   - If they ask about their name but no name was shared → "I don't see you mentioning your name in our conversation yet. What would you like me to call you?"

2. If the question is about dataset analysis, data queries, charts, or database operations → respond with exactly: "DATASET_QUERY"

CRITICAL: Your response will be shown directly to the user. Do NOT include meta-commentary, analysis, or explanations. Give either:
- A direct, helpful user-facing answer from conversation history, OR  
- Exactly "DATASET_QUERY"

No other format is acceptable."""

                try:
                    context_response = self.llm.invoke(context_check_prompt)
                    response_content = context_response.content.strip()
                    logger.debug(f"🤖 LLM context check response: {repr(response_content)}")
                    
                    if response_content == "DATASET_QUERY":
                        # This is clearly a dataset query, proceed to database
                        logger.debug("📊 Query classified as dataset query, proceeding to database")
                    elif "DATASET_QUERY" in response_content:
                        # LLM included DATASET_QUERY but with extra text - treat as dataset query
                        logger.debug("📊 Query contains DATASET_QUERY, treating as dataset query")
                    else:
                        # This should be a conversation-based response - validate it's user-friendly
                        if len(response_content) > 0 and not any(phrase in response_content.lower() for phrase in 
                            ["analyze", "determine", "the user asked", "look in", "check conversation"]):
                            # Looks like a proper user-facing response
                            logger.debug("🧠 Query answered from conversation context")
                            return response_content
                        else:
                            # LLM gave diagnostic text instead of user response - provide fallback
                            logger.warning(f"⚠️ LLM gave diagnostic response instead of user-facing answer: {response_content}")
                            return "I'm not sure I understand your question. Could you please rephrase it?"
                    
                    # If we reach here, it's a dataset query - check database availability and proceed
                    logger.debug(f"🔍 Dataset query detected, checking data handler state...")
                    logger.debug(f"🔍 self.data_handler is None: {self.data_handler is None}")
                    if self.data_handler is not None:
                        db_obj = self.data_handler.get_db_sqlalchemy_object()
                        logger.debug(f"🔍 get_db_sqlalchemy_object() is None: {db_obj is None}")
                        df = self.data_handler.get_df()
                        logger.debug(f"🔍 get_df() is None: {df is None}")
                        if df is not None:
                            logger.debug(f"🔍 DataFrame shape: {df.shape}")
                    
                    if self.data_handler is None or self.data_handler.get_db_sqlalchemy_object() is None:
                        logger.error("❌ Database not available - data_handler or db_sqlalchemy_object is None")
                        return "I need some data to work with first. Could you please upload a dataset so I can help analyze it?"
                    
                    # Execute dataset query based on mode
                    if mode.lower() == "simple":
                        logger.debug("🔧 Using SIMPLE mode - direct SQL execution...")
                        response = self._execute_sql_query_directly(question)
                        logger.debug(f"✅ Simple mode execution completed: {response}")
                        # Apply enhanced template formatting to Simple mode as well
                        return self._format_sql_response(response, question)
                    else:  # complex mode
                        logger.debug("🔧 Using COMPLEX mode - agent executor...")
                        try:
                            enhanced_question = f"""
                            Answer this question about the data: "{question}"
                            
                            IMPORTANT: When querying the data, include relevant context columns and provide comprehensive analysis.
                            """
                            agent_response = self.agent_executor.invoke({"input": enhanced_question})["output"]
                            logger.debug(f"✅ Complex mode execution completed: {agent_response}")
                            return self._format_sql_response(agent_response, question)
                        except Exception as agent_error:
                            logger.error(f"❌ Complex mode failed: {str(agent_error)}")
                            return "I had trouble with the complex analysis. You might want to try Simple mode or rephrase your question."
                        
                except Exception as sql_error:
                    logger.error(f"❌ Error in context-aware processing: {str(sql_error)}")
                    return "I had some trouble with that request. Could you try asking in a different way or let me know more about what you're looking for?"

            elif query_category == 'GENERAL_DATA_SCIENCE':
                if self.operation_cancelled_flag:
                    return "I've stopped processing that request as you requested."

                data_science_prompt = f"As an expert in data science, answer the following question concisely, focusing on key concepts and practical advice. If the question is too broad, provide a high-level overview and suggest ways to narrow it down. Do not exceed 4-5 sentences. Question: {question}"
                response_content = self.llm.invoke(data_science_prompt)
                response = response_content.content.strip()

                if self.operation_cancelled_flag:
                    return "I've stopped processing that request as you requested."

                return response


            elif query_category in ['DATA_CLEANING', 'FILTER_DATA']:
                if self.operation_cancelled_flag:
                    return "I've stopped processing that request as you requested."

                if current_df is None:
                    return "I need some data to work with first. Please upload a dataset so I can help with data processing."

                code, error = self.generate_pandas_code(question, query_category)
                if self.operation_cancelled_flag:
                    return "I've stopped processing that request as you requested."

                if error:
                    return error

                modified_df, exec_message = self.safe_execute_pandas_code(code, query_category)
                if self.operation_cancelled_flag:
                    return "I've stopped processing that request as you requested."

                if isinstance(modified_df, pd.DataFrame):
                    self.data_handler.update_df_and_db(modified_df)
                    return f"Data {query_category.lower().replace('_data', '')} successful. The dataset now contains {len(modified_df)} rows."
                else:
                    return exec_message or f"Failed to {query_category.lower().replace('_data', '')} data after attempts."

            elif query_category == 'DATA_EXPORT':
                if self.operation_cancelled_flag:
                    return "I've stopped processing that request as you requested."

                if current_df is None:
                    return "I need some data to export first. Please upload a dataset and then I can help export it in your preferred format."

                file_format_match = re.search(r'(csv|excel|json|parquet|pickle)', question.lower())
                file_format = file_format_match.group(1) if file_format_match else "csv"
                return self.data_handler.export_data(file_format)

            elif query_category == 'TRANSLATION':
                if self.operation_cancelled_flag:
                    return "I've stopped processing that request as you requested."

                if current_df is None:
                    return "I need some data to translate first. Please upload a dataset and I can help translate text within it."

                # Process translation request
                try:
                    logger.debug("🌐 Processing translation request...")
                    translation_result = self._process_translation_request(question, current_df)
                    logger.debug(f"✅ Translation completed: {translation_result}")
                    return translation_result
                    
                except Exception as translation_error:
                    logger.error(f"❌ Translation error: {str(translation_error)}")
                    return f"I encountered an issue processing your translation request: {str(translation_error)}"

            else:  # General conversation and non-data queries
                if self.operation_cancelled_flag:
                    return "I've stopped processing that request as you requested."

                # Get recent conversation history for context using the proper method
                context_str = self._get_conversation_context_string(max_messages=6)

                # Handle general conversation naturally while mentioning data expertise when appropriate
                conversation_prompt = f"""You are EDI.ai, a conversational AI assistant.

{context_str}Current question: "{question}"

Be friendly, engaging, and helpful. Your specialty is data analysis, but you can chat about anything. When appropriate, mention your data expertise or suggest how you might help with data-related tasks, but don't force it into every response.

IMPORTANT: 
- Keep ALL responses very short and concise (1-3 sentences maximum). Be brief but warm and natural.
- Be context-aware: Don't repeat greetings if you've already greeted the user in this conversation
- Only say "hello" or greet if this is genuinely the start of conversation or user greets you first
- For personal questions (who are you, what can you do, your purpose): give brief, friendly answers without repeating previous greetings
- For thanks: respond graciously in 1 sentence
- For general topics: engage naturally but briefly
- For questions outside your expertise: give concise helpful guidance

Keep responses conversational, human-like, SHORT, and context-aware."""
                response_content = self.llm.invoke(conversation_prompt)
                response = response_content.content.strip()
                
                # Note: AI response will be added to memory by unified system in process_query
                return response

        except Exception as e:
            logger.error(f"❌ Error processing query: {str(e)}")
            logger.exception("💥 Full exception details:")
            return "I had some trouble with that request. Could you try asking in a different way? I'm here to help with data analysis and general questions."

    def process_query(self, question: str, is_speech: bool = False, mode: str = "simple") -> Tuple[str, Optional[Dict[str, str]]]:
        """Process the user's query and return a response."""
        try:
            if self.operation_cancelled_flag:
                return "I've stopped processing that request as you requested.", None
                
            if not question:
                return "I'm ready to help! What would you like to know or do with your data?", None
                
            # Log the question for debugging
            logger.info(f"🚀 === PROCESSING QUERY START ===")
            logger.info(f"📝 Query: '{question}'")
            logger.info(f"🎤 Speech mode: {is_speech}")
            logger.info(f"⚙️ Mode: {mode}")
            
            # Get query category with confidence
            logger.info(f"🔍 Starting query categorization...")
            query_category, confidence = self.categorize_query(question)
            logger.info(f"✅ Query categorized as: {query_category} (confidence: {confidence}%)")
            
            # Skip clarification - proceed directly with query processing
            logger.info(f"✅ Proceeding directly with query processing (ambiguity detection removed)")
            
            # Execute based on final category
            logger.info(f"🎯 === EXECUTING QUERY TYPE: {query_category} ===")
            
            # Handle missing values queries first
            if query_category == "MISSING_VALUES":
                logger.info("📊 Processing as MISSING_VALUES request")
                df = self.data_handler.get_df()
                if df is not None:
                    response = self._process_missing_values(question, df)
                    # UNIFIED MEMORY: Add AI response to memory
                    if response and not response.startswith("I encountered an error"):
                        if hasattr(self, 'chat_history') and self.chat_history:
                            self.chat_history.add_ai_message(response)
                        logger.debug(f"💾 Added missing values response to unified conversation memory")
                    return response, None
                else:
                    no_data_response = "I need some data to analyze first. Please upload a dataset and I can help identify and handle missing values."
                    # Don't add "no data" responses to memory
                    return no_data_response, None

            # Handle prediction queries
            if query_category == "PREDICTION":
                logger.info("🔮 Processing as PREDICTION request")
                df = self.data_handler.get_df()
                if df is not None:
                    # Extract prediction parameters using LLM
                    prediction_params = self._extract_prediction_parameters(question, df)

                    if 'error' in prediction_params:
                        error_response = prediction_params['error']
                        # Add error to memory
                        if hasattr(self, 'chat_history') and self.chat_history:
                            self.chat_history.add_ai_message(error_response)
                        return error_response, None

                    # Dispatch to appropriate prediction handler based on query type
                    return self._dispatch_prediction_query(prediction_params, df, question)
                else:
                    no_data_response = "I need data to generate predictions. Please upload a dataset first."
                    # Don't add "no data" responses to memory
                    return no_data_response, None

            # Rest of the existing code for handling other categories
            question_lower = question.lower()
            
            # Check for duplicate removal patterns
            # Include patterns that start with "can you", "could you", etc.
            duplicate_patterns = [
                'remove duplicate', 'drop duplicate', 'deduplicate', 'deduplication',
                'delete duplicate', 'get rid of duplicate', 'eliminate duplicate', 
                'unique rows', 'remove duplicates', 'drop duplicates'
            ]
            
            # Enhanced patterns for questions about duplicate removal
            question_patterns = [
                r'can you.+(?:remove|get rid of|delete|drop|eliminate).+duplicate',
                r'could you.+(?:remove|get rid of|delete|drop|eliminate).+duplicate',
                r'would you.+(?:remove|get rid of|delete|drop|eliminate).+duplicate',
                r'please.+(?:remove|get rid of|delete|drop|eliminate).+duplicate',
                r'how (?:can|do) (?:I|we|you).+(?:remove|get rid of|delete|drop|eliminate).+duplicate',
                r'is it possible to.+(?:remove|get rid of|delete|drop|eliminate).+duplicate'
            ]
            
            # Check for direct keyword matches
            is_duplicate_removal = any(pattern in question_lower for pattern in duplicate_patterns)
            
            # If no direct match, check for question patterns
            if not is_duplicate_removal:
                is_duplicate_removal = any(re.search(pattern, question_lower) for pattern in question_patterns)
            if is_duplicate_removal:
                    matched_patterns = [p for p in question_patterns if re.search(p, question_lower)]
                    logger.info(f"🔍 Matched question patterns: {matched_patterns}")
            
            if is_duplicate_removal:
                logger.info("🧹 === DIRECT DUPLICATE REMOVAL DETECTION ===")
                logger.info(f"💬 Query: {question}")
                matched_keywords = [p for p in duplicate_patterns if p in question_lower]
                if matched_keywords:
                    logger.info(f"🔍 Matched keywords: {matched_keywords}")
                
                df = self.data_handler.get_df()
                if df is not None:
                    logger.info(f"📊 DataFrame loaded with shape: {df.shape}")
                    response = self._process_duplicate_removal(question, df)
                    
                    # Check if the response indicates data modification
                    data_modified = False
                    if response.startswith("DATA_MODIFIED:"):
                        data_modified = True
                        response = response.replace("DATA_MODIFIED:", "", 1).strip()
                        
                    # Special handling for data modifications
                    # Return without any metadata to avoid frontend visualization processing
                    return response, None
                else:
                    logger.error("❌ No data loaded for duplicate removal")
                    return "I need some data to work with first. Please upload a dataset and I can help remove duplicates.", None
                
            # For other queries, use the category-based approach
            query_category, confidence = self.categorize_query(question)
            logger.info(f"Query categorized as: {query_category} (confidence: {confidence}%)")
            
            # Process based on category
            if query_category == "VISUALIZATION":
                # Handle visualization requests
                logger.info("Processing as visualization request")
                response, visualization_data = self._process_visualization_request(question)
                
                # Debug logging for visualization response
                logger.debug(f"Visualization response: {response}")
                logger.debug(f"Visualization data: {visualization_data}")
                
                return response, visualization_data
            elif query_category == "SPREADSHEET_COMMAND":
                # Handle spreadsheet command requests
                logger.info("Processing as SPREADSHEET_COMMAND request")
                response = self.process_spreadsheet_command(question)
                
                # Return without any metadata to avoid frontend visualization processing
                return response, None
            elif query_category == "TRANSLATION":
                # Handle translation requests
                logger.info("Processing as translation request")
                df = self.data_handler.get_df()
                if df is not None:
                    response = self._process_translation_request(question, df)
                    
                    # Return without any metadata to avoid frontend visualization processing
                    return response, None
                else:
                    return "I need some data to translate first. Please upload a dataset and I can help translate text within it.", None
            elif query_category == "JUNK_DETECTION":
                # Handle junk detection requests
                logger.info("🧹 Processing as JUNK_DETECTION request")
                logger.info("🧹 This should use AI to analyze data quality, not literal text search")
                df = self.data_handler.get_df()
                if df is not None:
                    response = self._process_junk_detection_request(question, df)
                    return response, None
                else:
                    return "I need some data to analyze first. Please upload a dataset and I can help detect junk responses in text columns.", None
            elif query_category == "DUPLICATE_CHECK":
                # Handle duplicate checking and removal requests
                logger.info("Processing as DUPLICATE_CHECK request")
                df = self.data_handler.get_df()
                if df is not None:
                    # Determine if this is checking or removal
                    check_patterns = [
                        r'are there any duplicates',
                        r'does.*have duplicates',
                        r'how many duplicates',
                        r'count.*duplicates',
                        r'find.*duplicates',
                        r'any duplicate',
                        r'check.*duplicate'
                    ]
                    is_check_only = any(re.search(p, question.lower()) for p in check_patterns)
                    
                    if is_check_only:
                        # Simple duplicate checking
                        response = self._check_duplicates_simple(question, df)
                    else:
                        # Complex duplicate removal
                        response = self._process_duplicate_removal(question, df)
                        
                        # Keep DATA_MODIFIED prefix so main endpoint can detect data changes
                        # and include refresh data in response
                    
                    # UNIFIED MEMORY: Add AI response to memory
                    if response and not response.startswith("I encountered an error"):
                        # Store the response without DATA_MODIFIED prefix in memory for context
                        memory_response = response.replace("DATA_MODIFIED:", "", 1).strip() if response.startswith("DATA_MODIFIED:") else response
                        if hasattr(self, 'chat_history') and self.chat_history:
                            self.chat_history.add_ai_message(memory_response)
                        logger.debug(f"💾 Added duplicate check response to unified conversation memory")
                    
                    return response, None
                else:
                    no_data_response = "No data loaded for duplicate checking."
                    # Don't add "no data" responses to memory
                    return no_data_response, None
            else:
                # Double-check for duplicate-related queries that might have been miscategorized
                if "duplicate" in question_lower:
                    logger.info("Potential duplicate removal query detected in GENERAL category, recategorizing")
                    df = self.data_handler.get_df()
                    if df is not None:
                        response = self._process_duplicate_removal(question, df)
                        
                        # Check if the response indicates data modification
                        data_modified = False
                        memory_response = response
                        if response.startswith("DATA_MODIFIED:"):
                            data_modified = True
                            response = response.replace("DATA_MODIFIED:", "", 1).strip()
                            memory_response = response  # Use clean response for memory
                        
                        # UNIFIED MEMORY: Add AI response to memory
                        if response and not response.startswith("I encountered an error"):
                            if hasattr(self, 'chat_history') and self.chat_history:
                                self.chat_history.add_ai_message(memory_response)
                            logger.debug(f"💾 Added miscategorized duplicate response to unified conversation memory")
                            
                        # Return without any metadata to avoid frontend visualization processing
                        return response, None
                    else:
                        no_data_response = "No data loaded for duplicate removal."
                        # Don't add "no data" responses to memory
                        return no_data_response, None
                
                # Handle other types of queries
                logger.info(f"Processing as {query_category} request")
                response = self.process_non_visualization_query(question, query_category, is_speech, mode)
                
                # UNIFIED MEMORY: Always add AI response to memory regardless of category
                if response and not response.startswith("I encountered an error"):
                    if hasattr(self, 'chat_history') and self.chat_history:
                        self.chat_history.add_ai_message(response)
                    logger.debug(f"💾 Added AI response to unified conversation memory")
                
                return response, None
        except Exception as e:
            logger.error(f"Error processing query: {str(e)}")
            logger.exception("Full exception details:")
            error_response = "I had trouble processing your request. Could you try rephrasing your question or providing more details about what you'd like me to do?"
            # Don't add error responses to memory
            return error_response, None

    def _process_visualization_request(self, question: str) -> Tuple[str, Optional[Dict[str, str]]]:
        """
        Process a visualization request and generate an appropriate visualization.
        
        Args:
            question: The user's question/request (e.g., "visualize sales by region")
            
        Returns:
            A tuple containing (response message, visualization info dictionary)
            The visualization info contains paths to generated visualization files
        """
        logger.debug(f"📊 === PROCESSING VISUALIZATION REQUEST ===")
        logger.debug(f"💬 Query: {question}")
        
        if self.operation_cancelled_flag:
            return "I've stopped processing that request as you requested.", None
            
        if not self.data_handler or self.data_handler.get_df() is None:
            return "I need some data to create visualizations. Please upload a dataset first.", None
            
        df = self.data_handler.get_df()
        logger.debug(f"📊 DataFrame shape: {df.shape}")
        
        try:
            # Generate code to create the visualization
            code, error = self.generate_pandas_code(question, "VISUALIZATION")
            
            if error or not code:
                return f"Failed to generate visualization code: {error}", None
                
            # Execute the generated code safely
            visualization_paths, execution_message = self.safe_execute_pandas_code(code, "VISUALIZATION")
            
            if not visualization_paths:
                return f"Error executing visualization code: {execution_message}", None
                
            # Add to visualizations history
            self.visualizations.append({
                "question": question,
                "paths": visualization_paths,
                "timestamp": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")
            })
            
            # For the frontend, we need to ensure the visualization is in the expected format
            logger.debug(f"Original visualization paths object: {visualization_paths}")
            
            # Store the original query in visualization metadata for future analysis
            visualization_paths['original_query'] = question
            
            # If we already have a 'filename' key, use it as is
            if "filename" in visualization_paths:
                logger.debug(f"Using existing filename: {visualization_paths['filename']}")
                return "Visualization created successfully.", visualization_paths
            
            # Otherwise, extract filename from path
            filename = os.path.basename(visualization_paths.get('path', ''))
            if not filename:
                # Try alternative keys if 'path' is not found
                for key, value in visualization_paths.items():
                    if isinstance(value, str) and (value.endswith('.png') or value.endswith('.html')):
                        filename = os.path.basename(value)
                        break
            
            if filename:
                logger.debug(f"Extracted filename: {filename}")
                visualization_paths['filename'] = filename
                visualization_paths['original_query'] = question
                return "Visualization created successfully.", visualization_paths
            else:
                logger.error(f"Could not extract filename from visualization paths: {visualization_paths}")
                return "Visualization created but filename could not be determined.", None
                
        except Exception as e:
            logger.error(f"❌ Visualization error: {str(e)}")
            logger.exception("Full exception details:")
            return f"Error processing visualization request: {str(e)}", None

    def analyze_chart_with_gemini(self, image_path: str, original_query: str) -> Dict[str, str]:
        """
        Analyze a chart image using Gemini Vision API and return structured insights.
        
        Args:
            image_path: Path to the chart image
            original_query: The user's original question that generated the chart
            
        Returns:
            Dictionary with analysis results including chart_type, purpose, patterns, insights
        """
        logger.debug(f"🔍 === ANALYZING CHART WITH GEMINI ===")
        logger.debug(f"🖼️ Image path: {image_path}")
        logger.debug(f"💬 Original query: {original_query}")
        
        try:
            import google.generativeai as genai
            import PIL.Image
            
            # Configure Gemini with API key from settings
            genai.configure(api_key=settings.GOOGLE_API_KEY)
            
            # Use Gemini 2.0 Flash for vision capabilities
            model = genai.GenerativeModel('gemini-2.0-flash-exp')
            
            # Load the image
            full_image_path = os.path.join(self.charts_dir, os.path.basename(image_path))
            if not os.path.exists(full_image_path):
                # Try the path as provided
                full_image_path = image_path
                
            if not os.path.exists(full_image_path):
                raise FileNotFoundError(f"Chart image not found: {full_image_path}")
                
            logger.debug(f"📁 Loading image from: {full_image_path}")
            image = PIL.Image.open(full_image_path)
            
            # Create the analysis prompt
            prompt = f"""
The user asked: "{original_query}"

Based on this request, analyze the generated visualization and provide insights in this exact format:

**Chart Type & Purpose:**
[What type of chart was created to answer their question? How does this visualization address their specific request?]

**Key Patterns & Trends:**
[What trends directly answer their question? Any patterns that relate to their inquiry? Relevant statistical observations]

**Actionable Insights:**
[Based on their original question, what decisions can they make? What follow-up questions should they consider? Specific recommendations related to their inquiry]

Focus on their original intent: "{original_query}"
Keep the analysis concise but thorough, focusing on business value and practical insights.
"""
            
            logger.debug("🤖 Sending request to Gemini Vision API...")
            response = model.generate_content([prompt, image])
            
            if response.text:
                logger.debug("✅ Received analysis from Gemini")
                
                # Parse the response into structured format
                analysis_text = response.text.strip()
                
                # Try to extract sections
                sections = {
                    'chart_type': '',
                    'patterns': '',
                    'insights': '',
                    'full_analysis': analysis_text
                }
                
                # Simple parsing - look for section headers
                lines = analysis_text.split('\n')
                current_section = None
                section_content = []
                
                for line in lines:
                    line_lower = line.lower().strip()
                    if 'chart type' in line_lower and 'purpose' in line_lower:
                        if current_section and section_content:
                            sections[current_section] = '\n'.join(section_content).strip()
                        current_section = 'chart_type'
                        section_content = []
                    elif 'patterns' in line_lower and 'trends' in line_lower:
                        if current_section and section_content:
                            sections[current_section] = '\n'.join(section_content).strip()
                        current_section = 'patterns'
                        section_content = []
                    elif 'actionable' in line_lower and 'insights' in line_lower:
                        if current_section and section_content:
                            sections[current_section] = '\n'.join(section_content).strip()
                        current_section = 'insights'
                        section_content = []
                    elif line.strip() and not line.startswith('**'):
                        if current_section:
                            section_content.append(line)
                
                # Don't forget the last section
                if current_section and section_content:
                    sections[current_section] = '\n'.join(section_content).strip()
                
                sections['source'] = 'gemini'
                sections['confidence'] = 'high'
                
                logger.debug(f"📊 Analysis completed successfully")
                return sections
                
            else:
                logger.warning("⚠️ Gemini returned no content")
                return self._generate_fallback_analysis(image_path, original_query)
                
        except Exception as e:
            logger.error(f"❌ Error analyzing chart with Gemini: {str(e)}")
            logger.exception("Full exception details:")
            return self._generate_fallback_analysis(image_path, original_query)
    
    def _generate_fallback_analysis(self, image_path: str, original_query: str) -> Dict[str, str]:
        """
        Generate basic fallback analysis when Gemini vision fails.
        """
        logger.debug("🔄 Generating fallback analysis...")
        
        try:
            # Extract basic info from image filename and current data
            filename = os.path.basename(image_path)
            chart_type = "chart"
            
            # Try to infer chart type from query
            query_lower = original_query.lower()
            if any(word in query_lower for word in ['bar', 'column']):
                chart_type = "bar chart"
            elif any(word in query_lower for word in ['line', 'trend', 'time']):
                chart_type = "line chart"
            elif any(word in query_lower for word in ['scatter', 'correlation']):
                chart_type = "scatter plot"
            elif any(word in query_lower for word in ['pie', 'distribution']):
                chart_type = "pie chart"
            elif any(word in query_lower for word in ['histogram', 'frequency']):
                chart_type = "histogram"
            
            # Get basic data info if available
            data_info = ""
            if self.data_handler and self.data_handler.get_df() is not None:
                df = self.data_handler.get_df()
                data_info = f"Dataset contains {len(df)} rows and {len(df.columns)} columns."
            
            fallback = {
                'chart_type': f"A {chart_type} was created to explore: \"{original_query}\". {data_info}",
                'patterns': f"This visualization shows data patterns related to your query. The chart displays quantitative relationships that help answer your question about {original_query.lower()}.",
                'insights': f"Based on the visualization generated for \"{original_query}\", consider examining the highest and lowest values, looking for trends over time if applicable, and identifying any outliers that might need further investigation.",
                'full_analysis': f"**Chart Type & Purpose:** A {chart_type} addressing: \"{original_query}\"\n\n**Patterns:** Basic data visualization showing relationships in your dataset.\n\n**Insights:** Review the chart for patterns that answer your original question.",
                'source': 'fallback',
                'confidence': 'medium'
            }
            
            logger.debug("✅ Fallback analysis generated")
            return fallback
            
        except Exception as e:
            logger.error(f"❌ Error in fallback analysis: {str(e)}")
            return {
                'chart_type': 'Chart analysis unavailable',
                'patterns': 'Unable to analyze patterns at this time',
                'insights': 'Please review the chart manually for insights',
                'full_analysis': 'Chart analysis is temporarily unavailable. Please review the visualization manually.',
                'source': 'error',
                'confidence': 'low'
            }

    def _process_translation_request(self, question: str, df: pd.DataFrame) -> str:
        """
        Process a translation request for a column of data.
        Identifies the column to translate, translates all values, and adds a new column with translated content.
        
        Args:
            question: The user's question/request (e.g., "translate column A")
            df: The current DataFrame
            
        Returns:
            A success/error message string
        """
        logger.debug(f"🌐 === PROCESSING TRANSLATION REQUEST ===")
        logger.debug(f"💬 Question: {question}")
        logger.debug(f"📊 DataFrame shape: {df.shape}")
        
        if not self.llm:
            return "LLM not available for translation."
        
        # Check if this is a bulk translation request
        bulk_patterns = [
            'translate all columns', 'bulk translate', 'translate multiple columns',
            'translate columns', 'translate all data', 'batch translate',
            'translate everything', 'mass translate'
        ]
        
        if any(pattern in question.lower() for pattern in bulk_patterns):
            return self._process_bulk_translation_request(question, df)
        
        try:
            # Step 1: Extract the column name to translate from the user's question
            extract_prompt = f"""
            Extract the name of the column to translate from this request:
            "{question}"
            
            The available columns in the dataset are: {', '.join(df.columns)}
            Return ONLY the exact column name, nothing else.
            """
            
            column_name_response = self.llm.invoke(extract_prompt).content.strip()
            # Clean up potential quotes or extra text
            column_name = column_name_response.replace('"', '').replace("'", '').strip()
            
            logger.debug(f"🔍 Extracted column name: {column_name}")
            
            # Step 2: Validate column exists
            if column_name not in df.columns:
                # Try fuzzy matching if exact match fails
                matches = [col for col in df.columns if column_name.lower() in col.lower()]
                if matches:
                    column_name = matches[0]
                    logger.debug(f"📌 Using fuzzy match: {column_name}")
                else:
                    return f"Column '{column_name}' not found in dataset. Available columns: {', '.join(df.columns)}"
            
            # Step 3: Extract target language if specified (default to English)
            target_language = "English"  # Default
            language_match = re.search(r'to\s+([a-zA-Z]+)', question.lower())
            if language_match:
                target_language = language_match.group(1).title()
                logger.debug(f"🌍 Target language detected: {target_language}")
            
            # Step 4: Create a new column name for the translated data
            new_column_name = f"{column_name}_Translated"
            # Ensure the new column name is unique
            counter = 1
            while new_column_name in df.columns:
                new_column_name = f"{column_name}_Translated_{counter}"
                counter += 1
            
            logger.debug(f"🏷️ New column name: {new_column_name}")
            
            # Step 5: Get unique values to translate (for efficiency)
            unique_values = df[column_name].dropna().unique()
            logger.debug(f"🔢 Found {len(unique_values)} unique values to translate")
            
            if len(unique_values) == 0:
                return f"Column '{column_name}' has no data to translate."
            
            # Step 6: Translate in batches if there are many unique values
            translations = {}
            batch_size = 25  # Adjust based on token limits
            
            for i in range(0, len(unique_values), batch_size):
                batch = unique_values[i:i+batch_size]
                logger.debug(f"🔄 Processing batch {i//batch_size + 1}/{(len(unique_values)-1)//batch_size + 1} with {len(batch)} items")
                
                # Create a numbered list for clear value identification
                batch_text = "\n".join([f"{j+1}. {value}" for j, value in enumerate(batch)])
                
                translation_prompt = f"""
                Translate the following {len(batch)} values from column '{column_name}' to {target_language}.
                Maintain the same structure and format, just translate the text.
                If a value appears to be a code, ID, or number, keep it unchanged.
                
                Values to translate:
                {batch_text}
                
                Return ONLY the translations as a numbered list matching the original numbering, like this:
                1. [translation1]
                2. [translation2]
                ...and so on.
                """
                
                try:
                    translation_response = self.llm.invoke(translation_prompt).content.strip()
                    
                    # Parse the response to get translations
                    translation_lines = translation_response.split('\n')
                    for j, line in enumerate(translation_lines):
                        if j >= len(batch):
                            break
                            
                        # Extract just the translated value, removing numbering
                        match = re.match(r'^\d+\.\s*(.*?)$', line.strip())
                        if match:
                            translated_value = match.group(1).strip()
                            original_value = batch[j]
                            translations[original_value] = translated_value
                            logger.debug(f"✅ Translated: '{original_value}' → '{translated_value}'")
                except Exception as e:
                    logger.error(f"❌ Error translating batch: {str(e)}")
                    return f"Error translating values: {str(e)}"
            
            # Step 7: Apply translations to create a new column
            logger.debug(f"🔄 Creating new column with translations")
            df[new_column_name] = df[column_name].map(translations)
            
            # Handle values that weren't in the training set (like NaN)
            df[new_column_name] = df[new_column_name].fillna(df[column_name])
            
            # Step 8: Update the database with the new DataFrame
            self.data_handler.update_df_and_db(df)
            
            return f"✅ Successfully translated column '{column_name}' to {target_language}. New column '{new_column_name}' created with translations."
            
        except Exception as e:
            logger.error(f"❌ Translation error: {str(e)}")
            logger.exception("Full exception details:")
            return f"Error processing translation request: {str(e)}"

    def _process_bulk_translation_request(self, question: str, df: pd.DataFrame) -> str:
        """
        Process a bulk translation request for multiple columns of data.
        Like an Excel macro - translates multiple columns and places translated columns after the originals.
        
        Args:
            question: The user's question/request (e.g., "translate all columns to English")
            df: The current DataFrame
            
        Returns:
            A success/error message string
        """
        logger.debug(f"🌐🔄 === PROCESSING BULK TRANSLATION REQUEST ===")
        logger.debug(f"💬 Question: {question}")
        logger.debug(f"📊 DataFrame shape: {df.shape}")
        
        if not self.llm:
            return "LLM not available for bulk translation."
        
        try:
            # Step 1: Analyze the request to determine which columns to translate and target language
            analysis_prompt = f"""
            Analyze this bulk translation request: "{question}"
            
            Available columns in the dataset: {', '.join(df.columns)}
            
            Extract the following information:
            1. Which columns should be translated? Options:
               - "all" for all columns
               - ["col1", "col2"] for specific columns
               - "range:A-E" for a range of columns (A through E)
               - "first:5" for first N columns
               - "last:3" for last N columns
            2. What is the target language? (default: English)
            3. Should we skip columns that appear to contain only numbers/IDs?
            
            Return your analysis in this exact JSON format:
            {{
                "columns_to_translate": "all" or ["column1", "column2"] or "range:A-E" or "first:5" or "last:3",
                "target_language": "English",
                "skip_numeric_columns": true,
                "reasoning": "Brief explanation of your analysis"
            }}
            """
            
            analysis_response = self.llm.invoke(analysis_prompt)
            try:
                # Parse the JSON response - handle markdown code blocks
                import json
                response_content = analysis_response.content.strip()
                
                # Remove markdown code block formatting if present
                response_content = re.sub(r'^```(?:json)?\s*', '', response_content, flags=re.IGNORECASE | re.MULTILINE)
                response_content = re.sub(r'```$', '', response_content, flags=re.MULTILINE)
                response_content = response_content.strip()
                
                analysis = json.loads(response_content)
                logger.debug(f"🔍 Bulk translation analysis: {analysis}")
                
                columns_spec = analysis.get('columns_to_translate', 'all')
                target_language = analysis.get('target_language', 'English')
                skip_numeric = analysis.get('skip_numeric_columns', True)
                reasoning = analysis.get('reasoning', '')
                
            except (json.JSONDecodeError, Exception) as e:
                logger.error(f"❌ Failed to parse LLM response as JSON: {str(e)}")
                # Default fallback
                columns_spec = 'all'
                target_language = 'English'
                skip_numeric = True
                reasoning = "Using default settings due to parsing error."
            
            # Step 2: Determine which columns to translate based on the specification
            columns_to_translate = []
            
            if columns_spec == 'all':
                columns_to_translate = list(df.columns)
            elif isinstance(columns_spec, list):
                # Specific columns listed
                columns_to_translate = [col for col in columns_spec if col in df.columns]
            elif isinstance(columns_spec, str):
                if columns_spec.startswith('range:'):
                    # Range specification like "range:A-E"
                    range_spec = columns_spec.split(':')[1]
                    if '-' in range_spec:
                        start_col, end_col = range_spec.split('-')
                        start_idx = ord(start_col.upper()) - 65  # A=0, B=1, etc.
                        end_idx = ord(end_col.upper()) - 65
                        if 0 <= start_idx < len(df.columns) and 0 <= end_idx < len(df.columns):
                            columns_to_translate = list(df.columns[start_idx:end_idx+1])
                elif columns_spec.startswith('first:'):
                    # First N columns
                    n = int(columns_spec.split(':')[1])
                    columns_to_translate = list(df.columns[:n])
                elif columns_spec.startswith('last:'):
                    # Last N columns
                    n = int(columns_spec.split(':')[1])
                    columns_to_translate = list(df.columns[-n:])
            
            if not columns_to_translate:
                return "No valid columns found to translate based on your request."
            
            # Step 3: Filter out numeric/ID columns if requested
            if skip_numeric:
                text_columns = []
                for col in columns_to_translate:
                    # Check if column contains mostly text data
                    sample_values = df[col].dropna().head(10)
                    if len(sample_values) > 0:
                        # Check if most values are strings and not just numbers
                        text_count = sum(1 for val in sample_values if isinstance(val, str) and not str(val).replace('.', '').replace('-', '').isdigit())
                        if text_count > len(sample_values) * 0.5:  # More than 50% are text
                            text_columns.append(col)
                        else:
                            logger.debug(f"🔢 Skipping column '{col}' - appears to contain mostly numeric/ID data")
                columns_to_translate = text_columns
            
            if not columns_to_translate:
                return "No text columns found to translate. All columns appear to contain numeric or ID data."
            
            logger.debug(f"📋 Columns to translate: {columns_to_translate}")
            logger.debug(f"🌍 Target language: {target_language}")
            
            # Step 4: Create a copy of the dataframe to work with
            df_working = df.copy()
            translation_results = []
            total_translations = 0
            
            # Step 5: Process each column for translation
            for col_idx, column_name in enumerate(columns_to_translate):
                logger.debug(f"🔄 Processing column {col_idx + 1}/{len(columns_to_translate)}: {column_name}")
                
                # Create new column name for translated data
                new_column_name = f"{column_name}_Translated"
                counter = 1
                while new_column_name in df_working.columns:
                    new_column_name = f"{column_name}_Translated_{counter}"
                    counter += 1
                
                # Get unique values to translate (for efficiency)
                unique_values = df_working[column_name].dropna().unique()
                logger.debug(f"🔢 Found {len(unique_values)} unique values in '{column_name}'")
                
                if len(unique_values) == 0:
                    logger.debug(f"⚠️ Column '{column_name}' has no data to translate, skipping")
                    continue
                
                # Translate in batches
                translations = {}
                batch_size = 20  # Smaller batch size for bulk operations
                
                for i in range(0, len(unique_values), batch_size):
                    batch = unique_values[i:i+batch_size]
                    
                    # Create a numbered list for clear value identification
                    batch_text = "\n".join([f"{j+1}. {value}" for j, value in enumerate(batch)])
                    
                    translation_prompt = f"""
                    Translate the following {len(batch)} values from column '{column_name}' to {target_language}.
                    Maintain the same structure and format, just translate the text.
                    If a value appears to be a code, ID, or number, keep it unchanged.
                    
                    Values to translate:
                    {batch_text}
                    
                    Return ONLY the translations as a numbered list matching the original numbering, like this:
                    1. [translation1]
                    2. [translation2]
                    ...and so on.
                    """
                    
                    try:
                        translation_response = self.llm.invoke(translation_prompt).content.strip()
                        
                        # Parse the response to get translations
                        translation_lines = translation_response.split('\n')
                        for j, line in enumerate(translation_lines):
                            if j >= len(batch):
                                break
                                
                            # Extract just the translated value, removing numbering
                            match = re.match(r'^\d+\.\s*(.*?)$', line.strip())
                            if match:
                                translated_value = match.group(1).strip()
                                original_value = batch[j]
                                translations[original_value] = translated_value
                                total_translations += 1
                    except Exception as e:
                        logger.error(f"❌ Error translating batch for column '{column_name}': {str(e)}")
                        # Continue with other columns even if one fails
                        continue
                
                # Apply translations to create new column
                if translations:
                    df_working[new_column_name] = df_working[column_name].map(translations)
                    # Handle values that weren't translated (like NaN)
                    df_working[new_column_name] = df_working[new_column_name].fillna(df_working[column_name])
                    translation_results.append(f"'{column_name}' → '{new_column_name}'")
                    logger.debug(f"✅ Created translated column: {new_column_name}")
            
            if not translation_results:
                return "No translations were completed. Please check your data and try again."
            
            # Step 6: Reorder columns to place all translated columns after all originals
            new_column_order = []
            translated_columns = [col for col in df_working.columns if col.endswith('_Translated')]
            
            # First, add all original columns (untranslated)
            for original_col in df.columns:
                new_column_order.append(original_col)
            
            # Then, add all translated columns in the same order as their originals
            for original_col in df.columns:
                for trans_col in translated_columns:
                    if trans_col.startswith(f"{original_col}_Translated"):
                        new_column_order.append(trans_col)
            
            # Add any remaining translated columns that didn't match the pattern
            for trans_col in translated_columns:
                if trans_col not in new_column_order:
                    new_column_order.append(trans_col)
            
            # Reorder the dataframe
            df_working = df_working[new_column_order]
            
            # Step 7: Update the database with the new DataFrame
            self.data_handler.update_df_and_db(df_working)
            
            # Step 8: Create summary message
            summary = f"✅ Bulk translation completed successfully!\n"
            summary += f"📊 Translated {len(translation_results)} columns to {target_language}\n"
            summary += f"🔄 Total unique values translated: {total_translations}\n"
            summary += f"📋 New columns created:\n"
            for result in translation_results:
                summary += f"   • {result}\n"
            summary += f"🗂️ Translated columns placed after their original columns"
            
            return summary
            
        except Exception as e:
            logger.error(f"❌ Bulk translation error: {str(e)}")
            logger.exception("Full exception details:")
            return f"Error processing bulk translation request: {str(e)}"

    def _check_duplicates_simple(self, question: str, df: pd.DataFrame) -> str:
        """
        Simple duplicate checking without removal.
        Args:
            question: The user's question/request
            df: The current DataFrame
        Returns:
            A message with duplicate count information
        """
        logger.debug(f"🔍 === SIMPLE DUPLICATE CHECK ===")
        logger.debug(f"💬 Question: {question}")
        logger.debug(f"📊 DataFrame shape: {df.shape}")
        
        if df is None or df.empty:
            return "No data loaded or data is empty, cannot check for duplicates."
        
        try:
            # Simple duplicate count
            num_duplicates = df.duplicated().sum()
            total_rows = len(df)
            
            if num_duplicates > 0:
                percentage = (num_duplicates / total_rows) * 100
                return f"Found {num_duplicates} duplicate rows out of {total_rows} total rows ({percentage:.1f}% of data)."
            else:
                return "No duplicate rows found in the dataset."
                
        except Exception as e:
            logger.error(f"❌ Error checking duplicates: {str(e)}")
            return f"Error checking for duplicates: {str(e)}"

    def _process_duplicate_removal(self, question: str, df: pd.DataFrame) -> str:
        """
        Process a request to check for or remove duplicate rows from the data.
        Uses LLM to intelligently identify deduplication parameters and performs the operation.
        Args:
            question: The user's question/request (e.g., "remove duplicates", "are there any duplicates?")
            df: The current DataFrame
        Returns:
            A success/error message string with details about the changes made
        """
        logger.debug(f"🧹 === PROCESSING DUPLICATE REMOVAL REQUEST ===")
        logger.debug(f"💬 Question: {question}")
        logger.debug(f"📊 DataFrame shape before: {df.shape}")
        
        if df is None or df.empty:
            logger.error("No data loaded or empty dataframe")
            return "No data loaded or data is empty, cannot check or remove duplicates."
            
        # --- Intent detection ---
        check_patterns = [
            r'are there any duplicates',
            r'does.*have duplicates',
            r'how many duplicates',
            r'count.*duplicates',
            r'find.*duplicates',
            r'any duplicate',
            r'list.*duplicates',
            r'which.*duplicates',
            r'show.*duplicates',
            r'get.*duplicates',
        ]
        remove_patterns = [
            r'remove duplicate',
            r'drop duplicate',
            r'deduplicate',
            r'delete duplicate',
            r'eliminate duplicate',
        ]
        question_lower = question.lower()
        is_check = any(re.search(p, question_lower) for p in check_patterns)
        is_remove = any(re.search(p, question_lower) for p in remove_patterns)

        if is_check and not is_remove:
            # Only check for duplicates, do not remove
            num_duplicates = df.duplicated().sum()
            if num_duplicates > 0:
                return f"There are {num_duplicates} duplicate rows in your data."
            else:
                return "No duplicate rows found in your data."

        # --- Existing code for removal ---
        try:
            # Step 1: Use LLM to analyze the request and determine deduplication parameters
            analysis_prompt = f"""
            Analyze this duplicate removal request: "{question}"
            
            Available columns in the dataset: {', '.join(df.columns)}
            
            Extract the following information:
            1. What columns should be used for detecting duplicates? If not specified, respond with "all columns".
            2. What keep strategy should be used? Options are 'first' (default), 'last', or 'none' (remove all duplicates).
            
            Return your analysis in this exact JSON format:
            {{
                "subset_columns": ["column1", "column2"] or null if all columns should be used,
                "keep_strategy": "first" or "last" or false (for 'none'),
                "reasoning": "Brief explanation of your analysis"
            }}
            """
            
            analysis_response = self.llm.invoke(analysis_prompt)
            try:
                # Parse the JSON response - handle markdown code blocks
                import json
                response_content = analysis_response.content.strip()
                
                # Remove markdown code block formatting if present
                response_content = re.sub(r'^```(?:json)?\s*', '', response_content, flags=re.IGNORECASE | re.MULTILINE)
                response_content = re.sub(r'```$', '', response_content, flags=re.MULTILINE)
                response_content = response_content.strip()
                
                analysis = json.loads(response_content)
                logger.debug(f"🔍 Deduplication analysis: {analysis}")
                
                subset_columns = analysis.get('subset_columns')
                keep_strategy = analysis.get('keep_strategy')
                reasoning = analysis.get('reasoning', '')
                
                # IMPORTANT: Ensure we always keep at least one instance of each duplicate
                # Only allow 'first' or 'last' as keep_strategy, never False (which would drop all duplicates)
                if keep_strategy is False or keep_strategy == 'none':
                    logger.warning("Detected 'none' keep strategy - overriding to 'first' to keep one instance of each duplicate")
                    keep_strategy = 'first'
                
                # Validate that subset_columns are valid column names if specified
                if subset_columns:
                    valid_columns = [col for col in subset_columns if col in df.columns]
                    if not valid_columns and subset_columns:
                        logger.warning(f"None of the specified columns {subset_columns} exist in the DataFrame")
                        subset_columns = None
                    else:
                        subset_columns = valid_columns
                
                logger.debug(f"📋 Using columns: {subset_columns}")
                logger.debug(f"📋 Using keep strategy: {keep_strategy}")
                
            except (json.JSONDecodeError, Exception) as e:
                logger.error(f"❌ Failed to parse LLM response as JSON: {str(e)}")
                logger.error(f"Response content: {analysis_response.content}")
                
                # Extract column information manually and initialize variables
                subset_columns = None
                keep_strategy = 'first'  # Default value to avoid variable scope issues
                reasoning = "Extracted from question using pattern matching."
                
            # Move column_match outside the try block to fix scope issue
            column_match = re.search(r'(?:based on|using|with|for|in|from|of|by)\s+(?:column(?:s)?\s+)?([A-Za-z0-9_,\s]+)', question.lower())
            
            if column_match:
                # Extract column names or references
                column_refs = column_match.group(1).strip().split(',')
                column_refs = [ref.strip() for ref in column_refs]
                logger.debug(f"📋 Column references detected: {column_refs}")
                
                # Convert column references to actual column names
                subset_columns = []
                for ref in column_refs:
                    # Check if it's a letter reference (like 'A', 'B', etc.)
                    if len(ref) == 1 and ref.isalpha():
                        # Convert to 0-based index
                        col_idx = ord(ref.upper()) - 65  # A=0, B=1, etc.
                        if 0 <= col_idx < len(df.columns):
                            subset_columns.append(df.columns[col_idx])
                            logger.debug(f"✅ Matched column letter '{ref}' to column name '{df.columns[col_idx]}'")
                    else:
                        # Try to match by name
                        matches = [col for col in df.columns if ref.lower() in col.lower()]
                        if matches:
                            subset_columns.extend(matches)
                            logger.debug(f"✅ Matched name '{ref}' to columns {matches}")
                
                # Determine keep strategy - DEFAULT TO 'first' to ensure we keep one instance
            if 'keep last' in question.lower():
                keep_strategy = 'last'
                # We don't allow 'keep none' as it would remove all instances
            
            # SAFEGUARD: Implement direct duplicate removal instead of generating code
            # This is a more reliable approach that avoids code generation issues
            try:
                # Count duplicates before removal
                original_count = len(df)
                
                # First, let's properly check for duplicates
                if subset_columns:
                    duplicated_mask = df.duplicated(subset=subset_columns, keep=False)
                    total_duplicated_rows = duplicated_mask.sum()
                    num_duplicate_sets = df[duplicated_mask].groupby(subset_columns).size().count() if total_duplicated_rows > 0 else 0
                    
                    # Apply drop_duplicates with the appropriate keep strategy
                    df_deduped = df.drop_duplicates(subset=subset_columns, keep=keep_strategy)
                else:
                    duplicated_mask = df.duplicated(keep=False)
                    total_duplicated_rows = duplicated_mask.sum()
                    num_duplicate_sets = len(df[duplicated_mask].drop_duplicates()) if total_duplicated_rows > 0 else 0
                    
                    # Apply drop_duplicates with the appropriate keep strategy
                    df_deduped = df.drop_duplicates(keep=keep_strategy)
                
                new_count = len(df_deduped)
                rows_removed = original_count - new_count
            
                # Enhanced logging for better debugging
                logger.debug(f"📊 Direct deduplication analysis:")
                logger.debug(f"   Original count: {original_count}")
                logger.debug(f"   New count: {new_count}")
                logger.debug(f"   Rows removed: {rows_removed}")
                logger.debug(f"   Total rows flagged as duplicates: {total_duplicated_rows}")
                logger.debug(f"   Duplicate sets found: {num_duplicate_sets}")
                
                # Additional validation - show sample duplicates if any exist
                if total_duplicated_rows > 0:
                    logger.debug("🔍 Sample duplicate rows found:")
                    if subset_columns:
                        sample_duplicates = df[df.duplicated(subset=subset_columns, keep=False)].head(5)
                    else:
                        sample_duplicates = df[df.duplicated(keep=False)].head(5)
                    logger.debug(f"   Sample duplicates shape: {sample_duplicates.shape}")
                    for idx, row in sample_duplicates.iterrows():
                        logger.debug(f"   Row {idx}: {dict(row)}")
                else:
                    logger.debug("✅ No duplicate rows detected in the dataset")
            
                # If successful, update the database with the new DataFrame
                if isinstance(df_deduped, pd.DataFrame):
                    self.data_handler.update_df_and_db(df_deduped)
            
                    # Format the response with details about what was done
                    if rows_removed > 0:
                        if subset_columns:
                            column_str = ", ".join(subset_columns)
                            response = f"✅ Successfully removed {rows_removed} duplicate rows based on columns: {column_str}. The dataset now contains {new_count} rows."
                        else:
                            response = f"✅ Successfully removed {rows_removed} duplicate rows while keeping one instance of each unique row. The dataset now contains {new_count} rows."
                        
                        # Add data modification flag for frontend
                        response = f"DATA_MODIFIED: {response}"
                        
                        return response
                    else:
                        # Let's also do a comprehensive duplicate check before returning
                        comprehensive_check = self._comprehensive_duplicate_check(df, subset_columns)
                        return f"No duplicate rows found in the dataset based on the specified criteria. {comprehensive_check}"
                else:
                    logger.error("❌ Direct deduplication failed")
                    return "Failed to remove duplicates. Please try again with more specific criteria."
                    
            except Exception as direct_error:
                logger.error(f"❌ Error in direct deduplication: {str(direct_error)}")
                
                # Fall back to even simpler approach
                try:
                    logger.debug("Falling back to simplest possible approach")
                    original_count = len(df)
                    # Always use keep='first' to ensure we keep one instance of each unique row
                    df_deduped = df.drop_duplicates(keep='first')
                    new_count = len(df_deduped)
                    rows_removed = original_count - new_count
                    
                    if rows_removed > 0:
                        self.data_handler.update_df_and_db(df_deduped)
                        response = f"✅ Successfully removed {rows_removed} duplicate rows while keeping one instance of each unique row. The dataset now contains {new_count} rows."
                        response = f"DATA_MODIFIED: {response}"
                        return response
                    else:
                        return "No duplicate rows found in the dataset."
                except Exception as fallback_error:
                    logger.error(f"❌ Even fallback deduplication failed: {str(fallback_error)}")
                    return "Failed to remove duplicates due to an unexpected error. Please try again later."
            
        except Exception as e:
            logger.error(f"❌ Duplicate removal error: {str(e)}")
            logger.exception("Full exception details:")
            return f"Error processing duplicate removal request: {str(e)}"
    
    def _comprehensive_duplicate_check(self, df: pd.DataFrame, subset_columns=None) -> str:
        """Perform a comprehensive duplicate check for debugging purposes."""
        try:
            total_rows = len(df)
            
            if subset_columns:
                # Check duplicates based on specified columns
                dup_mask = df.duplicated(subset=subset_columns, keep=False)
                total_dups = dup_mask.sum()
                unique_count = df.drop_duplicates(subset=subset_columns).shape[0]
                
                check_result = f"\n📊 Comprehensive check (columns: {', '.join(subset_columns)}): "
                check_result += f"{total_rows} total rows, {unique_count} unique, {total_dups} flagged as duplicates."
            else:
                # Check duplicates across all columns
                dup_mask = df.duplicated(keep=False)
                total_dups = dup_mask.sum()
                unique_count = df.drop_duplicates().shape[0]
                
                check_result = f"\n📊 Comprehensive check (all columns): "
                check_result += f"{total_rows} total rows, {unique_count} unique, {total_dups} flagged as duplicates."
            
            # If duplicates exist, show sample
            if total_dups > 0:
                if subset_columns:
                    sample_dups = df[df.duplicated(subset=subset_columns, keep=False)].head(3)
                else:
                    sample_dups = df[df.duplicated(keep=False)].head(3)
                
                check_result += f"\n🔍 Sample duplicates found:"
                for idx, row in sample_dups.iterrows():
                    if subset_columns:
                        sample_data = {col: row[col] for col in subset_columns}
                    else:
                        sample_data = dict(row.head(3))  # Show first 3 columns
                    check_result += f"\n   Row {idx}: {sample_data}"
            
            return check_result
            
        except Exception as e:
            return f"\n❌ Error in comprehensive duplicate check: {str(e)}"

    def _execute_sql_query_directly(self, question: str) -> str:
        """
        Generate and execute a SQL query directly based on the user's natural language question.
        Args:
            question: The user's natural language question about the data
        Returns:
            A string response with the query results or error message
        """
        logger.debug(f"🔍 === EXECUTE SQL QUERY DIRECTLY ===")
        logger.debug(f"💬 Question: {question}")
        if self.agent_executor is None:
            return "SQL agent is not initialized. Please try again later."
        try:
            # --- Get current column names from data_handler ---
            column_names = []
            if self.data_handler is not None:
                df = self.data_handler.get_df()
                if df is not None:
                    column_names = list(df.columns)
            # Step 1: Generate SQL Query from the natural language question
            sql_prompt = f"""
            Generate a single SQL query to answer this question about the data: "{question}"
            Follow these guidelines:
            - The table name is always 'data'. Do NOT use any other table name.
            - The columns in the 'data' table are: {', '.join(column_names)}
            - Use ONLY these columns in your SQL.
            - Return ONLY the SQL query, nothing else
            - Do not use any markdown formatting, just the raw SQL
            - Use proper SQL syntax compatible with SQLite
            - Include any necessary GROUP BY, ORDER BY, or LIMIT clauses
            - For questions about "most" or "highest", use ORDER BY and LIMIT
            - For questions about "least" or "lowest", use ORDER BY ASC and LIMIT
            - Limit results to top 10 rows unless otherwise specified
            - Use appropriate JOINs if needed (but only with the 'data' table)
            - Make column names readable in the results
            
            IMPORTANT: Include relevant context columns in your SELECT statement. For example:
            - If asking about games, include name, developer, publisher, release_date, positive_ratings, negative_ratings
            - If asking about ratings, include both positive and negative ratings for context
            - If asking about sales/owners, include price and other relevant metrics
            - Always include the primary identifier (name or appid) along with the specific metric being queried
            
            Query:
            """
            # Get SQL query from LLM
            sql_response = self.llm.invoke(sql_prompt)
            sql_query = sql_response.content.strip()
            # --- Remove markdown code block formatting if present ---
            sql_query = re.sub(r'^```(?:sql)?\s*', '', sql_query, flags=re.IGNORECASE | re.MULTILINE)
            sql_query = re.sub(r'```$', '', sql_query, flags=re.MULTILINE)
            sql_query = sql_query.strip()
            logger.debug(f"🔍 Generated SQL Query (pre-rewrite): {sql_query}")
            # --- Post-process to force table name to 'data' ---
            sql_query = re.sub(r'(FROM|from)\s+\w+', 'FROM data', sql_query)
            sql_query = re.sub(r'(JOIN|join)\s+\w+', 'JOIN data', sql_query)
            logger.debug(f"🔍 Generated SQL Query (post-rewrite): {sql_query}")
            
            # Step 2: Execute the SQL query
            # Get the SQL database object
            db = self.data_handler.get_db_sqlalchemy_object()
            
            # Check what type of object we're dealing with
            logger.debug(f"Database object type: {type(db)}")
            
            # Use the appropriate method to run the query based on the object type
            rows = []
            columns = []
            
            # Use LangChain's built-in run method if available (for SQLDatabase)
            if hasattr(db, "run"):
                logger.debug("Using db.run() method for SQLDatabase object")
                result = db.run(sql_query)
                
                # The result is likely a string, so we need to parse it
                logger.debug(f"Query result type: {type(result)}")
                logger.debug(f"Query result: {result}")
                
                # COMMENTED OUT: Agent executor fallback - using direct SQL results instead
                # Since we can't get structured data this way, let's use the agent executor
                # try:
                #     enhanced_question = f"""
                #     Answer this question about the data: "{question}"
                #     
                #     IMPORTANT: When querying the data, include relevant context columns such as:
                #     - For games: name, developer, publisher, release_date, positive_ratings, negative_ratings
                #     - For ratings: both positive and negative ratings for comparison
                #     - For sales/owners: include price and other relevant metrics
                #     
                #     Provide a complete answer that includes all relevant context from the data.
                #     """
                #     agent_response = self.agent_executor.invoke({"input": enhanced_question})["output"]
                #     # Format the response to ensure it's contextual and helpful
                #     return self._format_sql_response(agent_response, question)
                # except Exception as agent_error:
                #     logger.error(f"Error using agent executor: {str(agent_error)}")
                #     return "I had trouble querying your data. Could you try rephrasing your question or check if your dataset is properly formatted?"
                
                # Process and format the direct SQL result
                return self._format_direct_sql_result(result, question, sql_query)
                
            # Use SQLAlchemy's connect method if available
            elif hasattr(db, "connect"):
                logger.debug("Using db.connect() method for SQLAlchemy object")
                from sqlalchemy import text
                
                with db.connect() as conn:
                    result = conn.execute(text(sql_query))
                    rows = result.fetchall()
                    columns = result.keys()
            
            # Use the engine directly if it's available
            elif hasattr(db, "engine") and hasattr(db.engine, "connect"):
                logger.debug("Using db.engine.connect() method")
                from sqlalchemy import text
                
                with db.engine.connect() as conn:
                    result = conn.execute(text(sql_query))
                    rows = result.fetchall()
                    columns = result.keys()
            
            # If none of the above methods work, try using the execute_query toolkit
            else:
                logger.debug("Using execute_query from SQL toolkit")
                query_tool = [tool for tool in self.agent_executor.tools if hasattr(tool, "name") and tool.name == "sql_db_query"]
                
                if query_tool:
                    result = query_tool[0].run(sql_query)
                    # Process the result based on its format
                    logger.debug(f"Query tool result type: {type(result)}")
                    return result
                else:
                    # COMMENTED OUT: Agent executor fallback - user now controls mode selection
                    # Fall back to using the agent executor
                    # enhanced_question = f"""
                    # Answer this question about the data: "{question}"
                    # 
                    # IMPORTANT: When querying the data, include relevant context columns such as:
                    # - For games: name, developer, publisher, release_date, positive_ratings, negative_ratings
                    # - For ratings: both positive and negative ratings for comparison
                    # - For sales/owners: include price and other relevant metrics
                    # 
                    # Provide a complete answer that includes all relevant context from the data.
                    # """
                    # agent_response = self.agent_executor.invoke({"input": enhanced_question})["output"]
                    # # Format the response to ensure it's contextual and helpful
                    # return self._format_sql_response(agent_response, question)
                    
                    # Return error instead of automatic fallback
                    return "Unable to process query with direct SQL. Please try Complex mode if you need advanced analysis."
            
            # Check if we got any results
            if not rows:
                return "No data found matching your query."
                
            # Step 3: Format results as markdown table
            table_header = "| " + " | ".join(columns) + " |"
            table_separator = "| " + " | ".join(["---" for _ in columns]) + " |"
            
            table_rows = []
            for row in rows:
                # Format each value appropriately
                formatted_values = []
                for val in row:
                    if val is None:
                        formatted_values.append("NULL")
                    elif isinstance(val, (int, float)):
                        # Round float values to whole numbers
                        if isinstance(val, float):
                            formatted_values.append(str(round(val)))
                        else:
                            formatted_values.append(str(val))
                    else:
                        # Escape any pipe characters in strings
                        formatted_values.append(str(val).replace("|", "\\|"))
                
                table_rows.append("| " + " | ".join(formatted_values) + " |")
            
            # Combine into final table
            result_table = "\n".join([table_header, table_separator] + table_rows)
            
            # Step 4: Generate a natural language summary of the results
            result_summary_prompt = f"""
            I executed the following SQL query to answer the question: "{question}"
            
            SQL Query:
            ```sql
            {sql_query}
            ```
            
            The query returned {len(rows)} rows with the following columns: {', '.join(columns)}
            
            Here are the results:
            {result_table}
            
            Please provide a concise summary of these results in natural language that directly answers the user's question.
            - Start with a direct answer to the question
            - Include specific numbers and data points from the results
            - Round all numbers to whole numbers (no decimals)
            - Limit to 3-4 sentences maximum
            - Do not say "Based on the query results" or similar phrases
            - Do not mention that you ran SQL or queried a database
            - Just give the facts and insights directly
            """
            
            # Get summary from LLM
            summary_response = self.llm.invoke(result_summary_prompt)
            result_summary = summary_response.content.strip()
            
            # Step 5: Combine table and summary into final response
            final_response = f"""
{result_summary}

**Query Results:**
{result_table}
"""
            
            return final_response
            
        except Exception as e:
            logger.error(f"❌ Error executing SQL query directly: {str(e)}")
            logger.exception("Full exception details:")
            
            # COMMENTED OUT: Agent executor fallback - user now controls mode selection
            # Fall back to using the agent executor directly
            # try:
            #     logger.debug("Falling back to using the agent executor directly")
            #     enhanced_question = f"""
            #     Answer this question about the data: "{question}"
            #     
            #     IMPORTANT: When querying the data, include relevant context columns such as:
            #     - For games: name, developer, publisher, release_date, positive_ratings, negative_ratings
            #     - For ratings: both positive and negative ratings for comparison
            #     - For sales/owners: include price and other relevant metrics
            #     
            #     Provide a complete answer that includes all relevant context from the data.
            #     """
            #     agent_response = self.agent_executor.invoke({"input": enhanced_question})["output"]
            #     # Format the response to ensure it's contextual and helpful
            #     return self._format_sql_response(agent_response, question)
            # except Exception as agent_error:
            #     logger.error(f"Error using agent executor fallback: {str(agent_error)}")
            #     return "I had trouble understanding your question about the data. Could you try rephrasing it or being more specific about what information you're looking for?"
            
            # Return error instead of automatic fallback
            return "Unable to process query with available SQL tools. Please try Complex mode for advanced analysis."

    def _format_direct_sql_result(self, result: str, question: str, sql_query: str) -> str:
        """
        Format direct SQL result into a user-friendly response.
        
        Args:
            result: The raw result string from db.run()
            question: The original user question
            sql_query: The SQL query that was executed
            
        Returns:
            A formatted, user-friendly response
        """
        try:
            # Log the raw result for debugging
            logger.debug(f"🔍 Formatting direct SQL result: {result}")
            
            # Handle empty or "I don't know" results
            if not result or result.strip().lower() in ['i don\'t know', 'none', '']:
                return f"I couldn't find any data to answer your question: '{question}'. Please make sure your data is properly loaded and try rephrasing your question."
            
            # Use LLM to format the result with proper context and comprehensive insights
            format_prompt = f"""
            CONTEXT:
            - User asked: "{question}"
            - SQL query executed: {sql_query}
            - Raw result: {result}
            - Data type: Product feedback/review data with columns like Product_Name, User_Score, Feedback
            
            TASK: Create a comprehensive but focused business response (not too long, not too short).
            
            RESPONSE STRUCTURE:
            [2-3 sentences providing immediate context and key findings - explain what this data represents and the main takeaway]
            
            Key highlights:
            • [Business-meaningful insight with specific numbers]
            • [Performance or customer satisfaction implication]
            • [Data scope and coverage details]
            • [Product or business context when relevant]
            
            Insights:
            • [What this means for their business]
            • [Pattern or trend observation]
            • [Actionable suggestion or next step]
            
            IMPORTANT GUIDELINES:
            - Interpret SQL results correctly (e.g., COUNT(*) = total records, AVG(User_Score) = average rating)
            - Use business-friendly language (not "first value is 100" but "100 total records")
            - Round all numbers to whole numbers (no decimals)
            - Provide context about what the numbers mean for their business
            - Include actionable insights users can act on
            - Be comprehensive but not overwhelming
            - NO template text like "RESPONSE FORMAT:" should appear in the final response
            
            EXAMPLE for summary statistics (100 records, 7.93 avg, 5 min, 10 max):
            "You have 100 product reviews in your dataset with an average user rating of 8 out of 10. This indicates generally positive customer feedback across your product lineup, with ratings spanning the full range from 5 to 10.

            Key highlights:
            • 100 total product reviews analyzed across all items
            • Strong average rating of 8/10 shows good customer satisfaction
            • Rating distribution spans 5-10, indicating varied but generally positive feedback
            • Data covers products like Coffee Maker, Gaming Mouse, 4K Monitor, and others
            
            Insights:
            • Your products are performing well with above-average ratings
            • The wide rating range (5-10) suggests different products have varying reception
            • Consider analyzing which specific products drive the highest ratings for expansion opportunities"
            """
            
            formatted_response = self.llm.invoke(format_prompt).content.strip()
            logger.debug(f"✅ Formatted response: {formatted_response}")
            
            return formatted_response
            
        except Exception as e:
            logger.error(f"❌ Error formatting direct SQL result: {str(e)}")
            # Fallback: return the raw result with some basic formatting
            return f"Here's what I found for your question '{question}':\n\n{result}"

    def _format_sql_response(self, raw_response: str, question: str) -> str:
        """
        Format a raw SQL response into a proper, contextual answer with conversational tone and follow-up suggestions.
        
        Args:
            raw_response: The raw response from the SQL agent
            question: The original user question
            
        Returns:
            A properly formatted response with context, explanation, and follow-up questions
        """
        # Always enhance responses to make them more conversational and comprehensive
        enhanced_prompt = f"""
        The user asked: "{question}"
        
        The data result is: "{raw_response}"
        
        Please provide a professional but friendly response using this EXACT structure:

        [Brief direct answer in 1-2 sentences]

        Key Details:
        - [Developer/Publisher information]
        - [Release date and rating numbers]
        - [Any other relevant factual details]

        Why This Matters:
        - [Significance or context insight]
        - [What makes this result interesting]
        - [Additional analysis or implications]

        Explore Further:
        - [Generate a specific follow-up question based on the actual data and analysis results]
        - [Suggest a complementary analysis that would provide additional insights]
        - [Recommend a visualization or comparison that would enhance understanding]

        CRITICAL FORMATTING RULES:
        - Use markdown bullet points (-) for all structured information
        - Keep the brief answer to 1-2 sentences maximum
        - Each bullet point should be concise and focused
        - Round all numbers to whole numbers (no decimals)
        - Always use the exact section headers: "Key Details:", "Why This Matters:", "Explore Further:"
        - Leave blank lines between sections
        
        For the "Explore Further" section, generate intelligent follow-up suggestions that:
        - Reference specific columns, values, or patterns from the actual data
        - Suggest logical next steps based on the analysis performed  
        - Include different analysis types (comparative, temporal, correlational)
        - Recommend relevant visualizations when appropriate
        - Use actual data context rather than generic suggestions
        
        Do not mention that you're processing data results or SQL queries.
        Write as a knowledgeable data analyst providing clear, helpful insights.
        """
        
        try:
            enhanced_response = self.llm.invoke(enhanced_prompt).content.strip()
            # Convert any literal \n characters to actual newlines for proper markdown rendering
            enhanced_response = enhanced_response.replace('\\n', '\n')
            return enhanced_response
        except Exception as e:
            logger.error(f"Error enhancing SQL response: {str(e)}")
            # Fallback to a basic enhancement with follow-up questions
            return f"Based on the data, {raw_response}.\n\nKey Details:\n- This represents the result for your query: '{question}'\n\nYou might also want to explore:\n- What other games are highly rated?\n- How do ratings compare across different categories?\n- What trends can we see in the data?"

    def _process_junk_detection_request(self, question: str, df: pd.DataFrame) -> str:
        """
        Process a junk detection request using the DataCleaningAgent.
        
        Args:
            question: The user's question about junk detection
            df: The current DataFrame
            
        Returns:
            A response with junk detection results or instructions
        """
        logger.debug(f"🧹 === PROCESSING JUNK DETECTION REQUEST ===")
        logger.debug(f"💬 Question: {question}")
        logger.debug(f"📊 DataFrame shape: {df.shape}")
        
        if not hasattr(self, 'data_cleaning_agent') or not self.data_cleaning_agent:
            return "Data cleaning agent is not available. Please try again later."
        
        try:
            # Use LLM to analyze the request and extract parameters
            analysis_prompt = f"""
            Analyze this junk detection request: "{question}"
            
            Available columns in the dataset: {', '.join(df.columns)}
            
            Extract the following information:
            1. Which column should be analyzed for junk? (specify column name or "auto-detect")
            2. Should we create a junk flag column? (yes/no)
            3. Any specific examples of what user considers junk?
            4. What confidence threshold should be used? (0-100, default 65)
            
            Return your analysis in this JSON format:
            {{
                "column_name": "column_name" or "auto-detect",
                "create_flag_column": true/false,
                "user_examples": ["example1", "example2"] or [],
                "confidence_threshold": 65,
                "question_context": "brief description of what the column represents"
            }}
            """
            
            analysis_response = self.llm.invoke(analysis_prompt)
            
            try:
                import json
                response_content = analysis_response.content.strip()
                # Remove markdown code blocks if present
                response_content = response_content.replace('```json', '').replace('```', '').strip()
                analysis = json.loads(response_content)
            except json.JSONDecodeError:
                logger.error(f"Failed to parse analysis response: {response_content}")
                return "I had trouble understanding your junk detection request. Please specify which column to analyze."
            
            # Determine target column
            column_name = analysis.get('column_name')
            if column_name == "auto-detect" or not column_name:
                # Find text columns automatically
                text_columns = []
                for col in df.columns:
                    if df[col].dtype == 'object':
                        # Check if it's likely text (not just IDs)
                        sample_values = df[col].dropna().head(5).astype(str)
                        avg_length = sample_values.str.len().mean()
                        if avg_length > 5:  # Likely text, not just IDs
                            text_columns.append(col)
                
                if not text_columns:
                    return "No suitable text columns found for junk detection. Please specify a column name."
                elif len(text_columns) == 1:
                    column_name = text_columns[0]
                else:
                    return f"Multiple text columns found: {', '.join(text_columns)}. Please specify which column to analyze."
            
            if column_name not in df.columns:
                return f"Column '{column_name}' not found. Available columns: {', '.join(df.columns)}"
            
            # Check if column is suitable for junk detection
            if df[column_name].dtype != 'object':
                return f"Column '{column_name}' doesn't appear to contain text data. Junk detection works best with text columns."
            
            # Perform junk detection
            question_context = analysis.get('question_context', f"Responses in column '{column_name}'")
            user_examples = analysis.get('user_examples', [])
            confidence_threshold = analysis.get('confidence_threshold', 65)
            
            results = self.data_cleaning_agent.detect_junk_responses(
                df, column_name, question_context, user_examples, confidence_threshold
            )
            
            if 'error' in results:
                return f"Junk detection failed: {results['error']}"
            
            # Check if user wants to create a flag column
            create_flag_column = analysis.get('create_flag_column', False)
            
            if create_flag_column and results['flagged_count'] > 0:
                # Create the junk flag column
                updated_df = self.data_cleaning_agent.create_junk_flag_column(df, column_name, results)
                # Update the data in data_handler
                self.data_handler.update_df(updated_df)
                flag_message = f"\n\n✅ Created '{column_name}_junk_flag' column with 1s marking junk responses.\n\nDATA_MODIFIED: Added junk flag column to dataset."
            else:
                flag_message = ""
            
            # Format response
            response = f"""**Junk Detection Results for '{column_name}'**

📊 **Summary:**
• Total responses analyzed: {results['total_responses']:,}
• Junk responses flagged: {results['flagged_count']:,} ({results['flagged_percentage']}%)
• Confidence threshold: {results['confidence_threshold']}%

"""
            
            if results['flagged_count'] > 0:
                response += f"""🚫 **Sample Flagged Responses:**
"""
                for i, item in enumerate(results['sample_flagged'], 1):
                    response += f"{i}. \"{item['text']}\" (confidence: {item['confidence']}% - {item['reason']})\n"
                
                if results['flagged_count'] > len(results['sample_flagged']):
                    response += f"\n...and {results['flagged_count'] - len(results['sample_flagged'])} more flagged responses."
            else:
                response += "✅ No junk responses detected with the current criteria."
            
            response += flag_message
            
            if not create_flag_column and results['flagged_count'] > 0:
                response += f"\n\n💡 **Tip:** Say \"add junk flag column to {column_name}\" to mark these responses in your data."
            
            return response
            
        except Exception as e:
            logger.error(f"❌ Error in junk detection processing: {str(e)}")
            return f"Error processing junk detection request: {str(e)}"

    def process_clarification_choice(self, choice_id: str, original_query: str, category: str) -> Tuple[str, Optional[Dict[str, str]]]:
        """
        Process user's clarification choice and execute the appropriate action.
        
        Args:
            choice_id: User's selected option ID
            original_query: Original user query
            category: Selected category
            
        Returns:
            Tuple of response and visualization data
        """
        try:
            # Process clarification choice directly (clarification system removed)
            logger.info(f"🎯 Processing clarification choice: {choice_id} for category: {category}")
            
            # Simply execute the original query normally
            logger.info(f"🎯 Executing query: '{original_query}' (clarification system removed)")
            
            # Process the query normally 
            return self.process_query(original_query)
                
        except Exception as e:
            logger.error(f"❌ Error processing clarification choice: {str(e)}")
            return f"Error processing your choice: {str(e)}", None
    
    def _execute_with_category(self, question: str, forced_category: str) -> Tuple[str, Optional[Dict[str, str]]]:
        """Execute a query with a specific category, bypassing categorization."""
        try:
            logger.info(f"🔧 Executing with forced category: {forced_category}")
            
            # Execute based on the forced category
            if forced_category == "JUNK_DETECTION":
                df = self.data_handler.get_df()
                if df is not None:
                    response = self._process_junk_detection_request(question, df)
                    return response, None
                else:
                    return "I need some data to analyze first. Please upload a dataset and I can help detect junk responses in text columns.", None
                    
            elif forced_category == "SPREADSHEET_COMMAND":
                response = self.process_spreadsheet_command(question)
                return response, None
                
            elif forced_category == "SPECIFIC_DATA":
                df = self.data_handler.get_df()
                if df is not None:
                    response = self._process_non_visualization_query(question, df)
                    return response, None
                else:
                    return "I need some data to analyze first. Please upload a dataset.", None
                    
            elif forced_category == "VISUALIZATION":
                response, visualization_data = self._process_visualization_request(question)
                return response, visualization_data
                
            elif forced_category == "DUPLICATE_CHECK":
                df = self.data_handler.get_df()
                if df is not None:
                    response = self._check_duplicates_simple(question, df)
                    return response, None
                else:
                    return "I need some data to check for duplicates. Please upload a dataset first.", None
                    
            elif forced_category == "MISSING_VALUES":
                df = self.data_handler.get_df()
                if df is not None:
                    response = self._process_missing_values(question, df)
                    return response, None
                else:
                    return "I need some data to analyze missing values. Please upload a dataset first.", None
                    
            elif forced_category == "TRANSLATION":
                df = self.data_handler.get_df()
                if df is not None:
                    response = self._process_translation_request(question, df)
                    return response, None
                else:
                    return "I need some data to translate. Please upload a dataset first.", None
                    
            elif forced_category == "ANALYSIS":
                df = self.data_handler.get_df()
                if df is not None:
                    response = self._process_non_visualization_query(question, df)
                    return response, None
                else:
                    return "I need some data to analyze. Please upload a dataset first.", None
                    
            else:
                return f"Category '{forced_category}' is not yet implemented.", None
                
        except Exception as e:
            logger.error(f"❌ Error executing with forced category {forced_category}: {str(e)}")
            return f"Error executing your request: {str(e)}", None

    def get_available_columns_for_extraction(self) -> Dict[str, any]:
        """
        Get available columns with their metadata for the extraction dialog.
        
        Returns:
            Dictionary with column information including names, types, sample data, and statistics
        """
        logger.debug(f"📋 === GETTING AVAILABLE COLUMNS FOR EXTRACTION ===")
        
        if not self.data_handler or self.data_handler.get_df() is None:
            return {
                "success": False,
                "error": "No data loaded",
                "columns": []
            }
        
        try:
            df = self.data_handler.get_df()
            logger.debug(f"📊 DataFrame shape: {df.shape}")
            
            columns_info = []
            
            for col in df.columns:
                # Get column metadata
                col_info = {
                    "name": col,
                    "type": str(df[col].dtype),
                    "non_null_count": int(df[col].notna().sum()),
                    "total_count": len(df),
                    "unique_count": int(df[col].nunique()),
                    "sample_values": []
                }
                
                # Get sample values (first 3 non-null unique values)
                sample_values = df[col].dropna().unique()[:3]
                col_info["sample_values"] = [str(val) for val in sample_values]
                
                # Calculate completeness percentage
                col_info["completeness_percentage"] = round((col_info["non_null_count"] / col_info["total_count"]) * 100, 1)
                
                # Determine if column appears to be text, numeric, date, etc.
                if df[col].dtype in ['object', 'string']:
                    col_info["data_category"] = "Text"
                elif df[col].dtype in ['int64', 'int32', 'float64', 'float32']:
                    col_info["data_category"] = "Numeric"
                elif df[col].dtype in ['datetime64[ns]', 'datetime64']:
                    col_info["data_category"] = "Date/Time"
                else:
                    col_info["data_category"] = "Other"
                
                columns_info.append(col_info)
            
            logger.debug(f"✅ Retrieved information for {len(columns_info)} columns")
            
            return {
                "success": True,
                "total_rows": len(df),
                "total_columns": len(df.columns),
                "columns": columns_info
            }
            
        except Exception as e:
            logger.error(f"❌ Error getting column information: {str(e)}")
            logger.exception("Full exception details:")
            return {
                "success": False,
                "error": f"Error retrieving column information: {str(e)}",
                "columns": []
            }

    def extract_selected_columns(self, selected_columns: list, new_sheet_name: str = None) -> Dict[str, any]:
        """
        Extract selected columns and prepare data for a new Luckysheet.
        
        Args:
            selected_columns: List of column names to extract
            new_sheet_name: Optional name for the new sheet
            
        Returns:
            Dictionary with extraction results and Luckysheet-compatible data
        """
        logger.debug(f"🔧 === EXTRACTING SELECTED COLUMNS ===")
        logger.debug(f"📋 Selected columns: {selected_columns}")
        
        if not self.data_handler or self.data_handler.get_df() is None:
            return {
                "success": False,
                "error": "No data loaded",
                "sheet_data": None
            }
        
        if not selected_columns:
            return {
                "success": False,
                "error": "No columns selected for extraction",
                "sheet_data": None
            }
        
        try:
            df = self.data_handler.get_df()
            logger.debug(f"📊 Original DataFrame shape: {df.shape}")
            
            # Validate that all selected columns exist
            missing_columns = [col for col in selected_columns if col not in df.columns]
            if missing_columns:
                return {
                    "success": False,
                    "error": f"Columns not found: {', '.join(missing_columns)}",
                    "sheet_data": None
                }
            
            # Extract the selected columns
            extracted_df = df[selected_columns].copy()
            logger.debug(f"📊 Extracted DataFrame shape: {extracted_df.shape}")
            
            # Generate sheet name if not provided
            if not new_sheet_name:
                import datetime
                timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
                new_sheet_name = f"Extracted_Data_{timestamp}"
            
            # Convert DataFrame to Luckysheet format
            sheet_data = self._convert_dataframe_to_luckysheet_format(extracted_df, new_sheet_name)
            
            # Create summary information
            extraction_summary = {
                "original_rows": len(df),
                "original_columns": len(df.columns),
                "extracted_rows": len(extracted_df),
                "extracted_columns": len(extracted_df.columns),
                "selected_columns": selected_columns,
                "sheet_name": new_sheet_name
            }
            
            logger.debug(f"✅ Successfully extracted {len(selected_columns)} columns")
            
            return {
                "success": True,
                "message": f"Successfully extracted {len(selected_columns)} columns with {len(extracted_df)} rows",
                "summary": extraction_summary,
                "sheet_data": sheet_data,
                "sheet_name": new_sheet_name
            }
            
        except Exception as e:
            logger.error(f"❌ Error extracting columns: {str(e)}")
            logger.exception("Full exception details:")
            return {
                "success": False,
                "error": f"Error extracting columns: {str(e)}",
                "sheet_data": None
            }

    def _convert_dataframe_to_luckysheet_format(self, df: pd.DataFrame, sheet_name: str) -> Dict[str, any]:
        """
        Convert a pandas DataFrame to Luckysheet-compatible format.
        
        Args:
            df: DataFrame to convert
            sheet_name: Name for the sheet
            
        Returns:
            Dictionary in Luckysheet format
        """
        logger.debug(f"🔄 Converting DataFrame to Luckysheet format")
        
        try:
            # Create the cell data in Luckysheet format
            cell_data = []
            
            # Add header row - only for the selected columns
            for col_idx, column in enumerate(df.columns):
                cell_data.append({
                    "r": 0,  # row index
                    "c": col_idx,  # column index
                    "v": {
                        "v": str(column),  # value
                        "ct": {"fa": "General", "t": "g"},  # cell type
                        "m": str(column),  # formatted value
                        "bl": 1,  # bold
                        "bg": "#f0f0f0"  # background color for header
                    }
                })
            
            # Add data rows - only for the selected columns
            for row_idx, (_, row) in enumerate(df.iterrows(), start=1):
                for col_idx, value in enumerate(row):
                    # Handle different data types
                    if pd.isna(value):
                        display_value = ""
                        cell_type = "g"
                    elif isinstance(value, (int, float)):
                        display_value = str(value)
                        cell_type = "n"  # numeric
                    else:
                        display_value = str(value)
                        cell_type = "g"  # general
                    
                    cell_data.append({
                        "r": row_idx,
                        "c": col_idx,
                        "v": {
                            "v": display_value,
                            "ct": {"fa": "General", "t": cell_type},
                            "m": display_value
                        }
                    })
            
            # Create the sheet configuration - only for the selected columns
            sheet_config = {
                "name": sheet_name,
                "color": "",
                "index": str(uuid.uuid4()),
                "status": 1,
                "order": 0,
                "hide": 0,
                "row": len(df) + 1,  # +1 for header
                "column": len(df.columns),  # Only the selected columns
                "defaultRowHeight": 19,
                "defaultColWidth": 73,
                "celldata": cell_data,
                "config": {
                    "merge": {},
                    "borders": {},
                    "rowhidden": {},
                    "colhidden": {},
                    "rowlen": {},
                    "columnlen": {},
                    "customHeight": {},
                    "customWidth": {}
                },
                "scrollLeft": 0,
                "scrollTop": 0,
                "luckysheet_select_save": [
                    {
                        "left": 0,
                        "width": 73,
                        "top": 0,
                        "height": 19,
                        "left_move": 0,
                        "width_move": 73,
                        "top_move": 0,
                        "height_move": 19,
                        "row": [0, 0],
                        "column": [0, 0],
                        "row_focus": 0,
                        "column_focus": 0
                    }
                ],
                "luckysheet_selection_range": [],
                "zoomRatio": 1,
                "showGridLines": 1,
                "dataVerification": {},
                "hyperlink": {},
                "dynamicArray": {},
                "dynamicArray_compute": {},
                "allowEdit": True,
                "filter_select": {},
                "filter": {},
                "luckysheet_alternateformat_save": [],
                "luckysheet_alternateformat_save_modelCustom": [],
                "luckysheet_conditionformat_save": {},
                "frozen": {},
                "chart": [],
                "isPivotTable": False,
                "pivotTable": {},
                "image": {},
                "showRowBar": True,
                "showColumnBar": True,
                "sheetFormulaBar": True,
                "calccain": []
            }
            
            logger.debug(f"✅ Converted to Luckysheet format: {len(cell_data)} cells")
            return sheet_config
            
        except Exception as e:
            logger.error(f"❌ Error converting to Luckysheet format: {str(e)}")
            logger.exception("Full exception details:")
            return None

class DataCleaningAgent:
    """AI-powered data cleaning agent for detecting junk responses in open-text fields."""
    
    def __init__(self, llm):
        self.llm = llm
        self.logger = logging.getLogger(__name__)
    
    def detect_junk_responses(self, df, column_name, question_context=None, user_examples=None, confidence_threshold=65):
        """
        Detect junk responses in a specific column using AI analysis.
        
        Args:
            df: pandas DataFrame containing the data
            column_name: name of the column to analyze
            question_context: optional context about what the column represents
            user_examples: optional list of user-provided junk examples
            confidence_threshold: minimum confidence score to flag as junk (0-100)
            
        Returns:
            dict with analysis results including flagged responses, confidence scores, and summary
        """
        try:
            if column_name not in df.columns:
                return {"error": f"Column '{column_name}' not found in dataset"}
            
            column_data = df[column_name].dropna()
            if column_data.empty:
                return {"error": f"Column '{column_name}' is empty"}
            
            self.logger.info(f"🔍 Analyzing {len(column_data)} responses in column '{column_name}'")
            
            # Get sample responses for context
            sample_responses = column_data.head(10).tolist()
            
            # Prepare context for AI analysis
            context_info = self._prepare_analysis_context(
                column_name, question_context, sample_responses, user_examples
            )
            
            # Analyze responses in batches to avoid token limits
            batch_size = 50
            all_results = []
            
            for i in range(0, len(column_data), batch_size):
                batch = column_data.iloc[i:i+batch_size]
                batch_results = self._analyze_response_batch(batch, context_info)
                all_results.extend(batch_results)
            
            # Filter results by confidence threshold
            flagged_responses = [
                result for result in all_results 
                if result['confidence'] >= confidence_threshold
            ]
            
            # Create summary
            summary = {
                "total_responses": len(column_data),
                "flagged_count": len(flagged_responses),
                "flagged_percentage": round((len(flagged_responses) / len(column_data)) * 100, 1),
                "confidence_threshold": confidence_threshold,
                "flagged_responses": flagged_responses,
                "sample_flagged": flagged_responses[:5] if flagged_responses else []
            }
            
            self.logger.info(f"✅ Junk detection complete: {len(flagged_responses)}/{len(column_data)} flagged ({summary['flagged_percentage']}%)")
            
            return summary
            
        except Exception as e:
            self.logger.error(f"❌ Error in junk detection: {str(e)}")
            return {"error": f"Junk detection failed: {str(e)}"}
    
    def _prepare_analysis_context(self, column_name, question_context, sample_responses, user_examples):
        """Prepare context information for AI analysis."""
        context = {
            "column_name": column_name,
            "question_context": question_context or f"Analysis of responses in column '{column_name}'",
            "sample_responses": sample_responses,
            "user_examples": user_examples or []
        }
        return context
    
    def _analyze_response_batch(self, batch_responses, context_info):
        """Analyze a batch of responses for junk detection."""
        try:
            responses_list = batch_responses.tolist()
            
            prompt = f"""
            You are analyzing survey responses for data quality. Your task is to identify "junk" responses that are not meaningful or relevant.

            CONTEXT:
            - Column: {context_info['column_name']}
            - Question context: {context_info['question_context']}
            - Sample valid responses: {context_info['sample_responses'][:5]}
            
            USER-PROVIDED JUNK EXAMPLES:
            {context_info['user_examples'] if context_info['user_examples'] else "None provided"}

            JUNK RESPONSE INDICATORS:
            1. Gibberish text (random characters, keyboard mashing)
            2. Single characters or very short meaningless responses
            3. Responses completely unrelated to the question context
            4. Repeated characters or patterns (aaaa, 1111, etc.)
            5. Test responses ("test", "testing", "asdf")
            6. Non-responsive answers ("I don't know", "nothing", "n/a") when specific input expected
            7. Spam-like content or promotional text
            8. Responses in wrong language if English expected

            RESPONSES TO ANALYZE:
            {responses_list}

            INSTRUCTIONS:
            For each response, provide a JSON object with:
            - "text": the original response text
            - "is_junk": true/false
            - "confidence": confidence score 0-100
            - "reason": brief explanation why it's flagged as junk

            Return ONLY a valid JSON array with no additional text:
            [
              {{"text": "response1", "is_junk": false, "confidence": 20, "reason": "Relevant and meaningful"}},
              {{"text": "response2", "is_junk": true, "confidence": 95, "reason": "Gibberish text"}}
            ]
            """
            
            response = self.llm.invoke(prompt)
            result_text = response.content.strip()
            
            # Parse JSON response with robust markdown cleaning
            try:
                # First, try to extract JSON from markdown code blocks using regex
                import re
                
                # Look for JSON inside markdown code blocks
                markdown_pattern = r'```(?:json)?\s*\n?(.*?)\n?```'
                markdown_match = re.search(markdown_pattern, result_text, re.DOTALL | re.IGNORECASE)
                
                if markdown_match:
                    # Extract JSON from markdown block
                    json_content = markdown_match.group(1).strip()
                    self.logger.info(f"Extracted JSON from markdown block: {len(json_content)} characters")
                else:
                    # No markdown blocks found, use original text
                    json_content = result_text
                    self.logger.info(f"No markdown blocks found, parsing raw content: {len(json_content)} characters")
                
                # Parse the cleaned JSON
                results = json.loads(json_content)
                self.logger.info(f"Successfully parsed JSON with {len(results)} items")
                
                # Filter only junk responses
                junk_responses = [r for r in results if r.get('is_junk', False)]
                self.logger.info(f"Found {len(junk_responses)} junk responses out of {len(results)} total")
                
                return junk_responses
                
            except json.JSONDecodeError as e:
                self.logger.error(f"Failed to parse AI response as JSON: {str(e)}")
                self.logger.error(f"Raw response content: {result_text}")
                return []
                
        except Exception as e:
            self.logger.error(f"Error analyzing response batch: {str(e)}")
            return []
    
    def create_junk_flag_column(self, df, column_name, junk_results):
        """
        Add a junk flag column to the dataframe based on detection results.
        
        Args:
            df: pandas DataFrame
            column_name: name of the column that was analyzed
            junk_results: results from detect_junk_responses
            
        Returns:
            DataFrame with new junk flag column added
        """
        try:
            flag_column_name = f"{column_name}_junk_flag"
            df[flag_column_name] = 0
            
            # Create a mapping of text to junk status
            junk_texts = {item['text']: 1 for item in junk_results.get('flagged_responses', [])}
            
            # Apply flags based on text matching
            for idx, row in df.iterrows():
                text_value = str(row[column_name]) if pd.notna(row[column_name]) else ""
                if text_value in junk_texts:
                    df.at[idx, flag_column_name] = 1
            
            self.logger.info(f"✅ Created junk flag column '{flag_column_name}'")
            return df
            
        except Exception as e:
            self.logger.error(f"❌ Error creating junk flag column: {str(e)}")
            return df

class UniversalClarificationSystem:
    """Universal system for handling ambiguous user queries by asking for clarification."""
    
    def __init__(self, llm):
        self.llm = llm
        self.logger = logging.getLogger(__name__)
        self.user_preferences = {}  # Store user preference patterns
        self.confidence_threshold = 75  # Queries below this trigger clarification
    
    def analyze_query_confidence(self, question: str, initial_category: str) -> tuple[str, int, list]:
        """
        Analyze query confidence and detect potential alternative interpretations.
        
        Args:
            question: User's query
            initial_category: Initially detected category
            
        Returns:
            tuple: (category, confidence_score, alternative_categories)
        """
        self.logger.info(f"🔬 === CLARIFICATION SYSTEM ANALYSIS START ===")
        self.logger.info(f"📝 Query: '{question}'")
        self.logger.info(f"🎯 Initial category: {initial_category}")
        
        try:
            analysis_prompt = f"""
            Analyze this user query for ambiguity and confidence: "{question}"
            
            Initially categorized as: {initial_category}
            
            Your task:
            1. Rate confidence (0-100%) that the initial category is correct
            2. Identify alternative valid interpretations
            3. Consider common user intentions
            
            Categories available:
            - SPECIFIC_DATA: Ask about data points, summaries, context
            - VISUALIZATION: Create charts, graphs, plots
            - JUNK_DETECTION: Find/identify/flag junk/spam responses
            - ANALYSIS: Statistical analysis, correlations, patterns
            - SPREADSHEET_COMMAND: Format cells, sort, filter data
            - DUPLICATE_CHECK: Find/remove duplicate rows
            - TRANSLATION: Translate text content
            - MISSING_VALUES: Handle null/empty values
            
            Common ambiguity patterns:
            - "find X" could mean: analyze X, search X, highlight X, filter to show X
            - "show me X" could mean: display data, create visualization, generate report
            - "clean data" could mean: remove duplicates, fix missing values, identify junk
            - "highlight X" could mean: format cells, mark important data, filter data
            
            Return ONLY this JSON:
            {{
                "confidence": 85,
                "primary_category": "JUNK_DETECTION",
                "alternatives": [
                    {{"category": "SPREADSHEET_COMMAND", "reason": "Could want to highlight/search in spreadsheet", "likelihood": 30}},
                    {{"category": "ANALYSIS", "reason": "Might want statistical analysis of junk patterns", "likelihood": 20}}
                ],
                "is_ambiguous": false,
                "user_intent_keywords": ["find", "junk", "identify"]
            }}
            """
            
            self.logger.info(f"🤖 Sending confidence analysis to LLM...")
            self.logger.info(f"🤖 Analysis prompt: {analysis_prompt}")
            
            response = self.llm.invoke(analysis_prompt)
            self.logger.info(f"🤖 LLM raw response: '{response.content}'")
            
            raw_content = response.content.strip().replace('```json', '').replace('```', '').strip()
            self.logger.info(f"🤖 Cleaned response: '{raw_content}'")
            
            result = json.loads(raw_content)
            self.logger.info(f"🤖 Parsed JSON result: {result}")
            
            confidence = result.get('confidence', 50)
            category = result.get('primary_category', initial_category)
            alternatives = result.get('alternatives', [])
            
            self.logger.info(f"✅ Query confidence analysis complete:")
            self.logger.info(f"   - Confidence: {confidence}%")
            self.logger.info(f"   - Category: {category}")
            self.logger.info(f"   - Alternatives: {alternatives}")
            self.logger.info(f"   - Threshold check: {confidence}% {'<' if confidence < self.confidence_threshold else '>='} {self.confidence_threshold}%")
            
            return category, confidence, alternatives
            
        except Exception as e:
            self.logger.error(f"❌ Error in confidence analysis: {str(e)}")
            # Fallback: assume medium confidence
            return initial_category, 60, []
    
    def generate_clarification_options(self, question: str, primary_category: str, alternatives: list) -> dict:
        """
        Generate user-friendly clarification response as conversational text.
        
        Args:
            question: Original user query
            primary_category: Primary detected category
            alternatives: List of alternative interpretations
            
        Returns:
            dict: Regular response with conversational clarification text
        """
        try:
            # Generate conversational text explaining the options
            response_parts = [f"I can help you with \"{question}\" in several ways:"]
            
            # Add primary option first (recommended)
            primary_description = self._get_category_description(primary_category)
            if primary_description:
                response_parts.append(f"• **{primary_description}** (Recommended)")
            
            # Add alternative options
            for alt in alternatives:
                if alt.get('likelihood', 0) >= 20:  # Only show likely alternatives
                    alt_description = self._get_category_description(alt['category'])
                    if alt_description and alt_description != primary_description:
                        response_parts.append(f"• {alt_description}")
            
            # Add general option
            response_parts.append("• Or if you have something else in mind, just let me know!")
            
            # Combine into conversational response
            response_parts.append("\nWhat would you like me to do?")
            
            conversational_response = "\n\n".join(response_parts)
            
            # Return as a regular response, not special clarification type
            return {
                "type": "regular",
                "message": conversational_response,
                "original_query": question
            }
            
        except Exception as e:
            self.logger.error(f"❌ Error generating clarification response: {str(e)}")
            return {
                "type": "regular",
                "message": "I'm not sure how to help with that. Could you please rephrase your question or tell me more specifically what you'd like me to do?"
            }
    
    def _get_category_description(self, category: str) -> str:
        """Get conversational description for a category."""
        
        category_descriptions = {
            "JUNK_DETECTION": "Analyze data quality and identify junk or spam responses",
            "SPREADSHEET_COMMAND": "Format or manipulate your spreadsheet with visual changes",
            "SPECIFIC_DATA": "Query and analyze specific information from your data",
            "VISUALIZATION": "Create charts, graphs, or visual representations",
            "ANALYSIS": "Perform statistical analysis, find correlations, or identify patterns",
            "DUPLICATE_CHECK": "Find, analyze, or remove duplicate rows from your dataset",
            "MISSING_VALUES": "Identify and handle missing or null values in your data",
            "TRANSLATION": "Translate text content in your data to different languages"
        }
        
        return category_descriptions.get(category, "Help with your data request")
    
    def _create_option_for_category(self, category: str, question: str, is_primary: bool = False) -> dict:
        """Create a user-friendly option for a specific category."""
        
        option_templates = {
            "JUNK_DETECTION": {
                "id": "junk_analysis",
                "title": "🧹 Analyze data quality",
                "description": "Identify and summarize junk/spam responses with confidence scores",
                "category": "JUNK_DETECTION"
            },
            "SPREADSHEET_COMMAND": {
                "id": "spreadsheet_action", 
                "title": "🎨 Format or manipulate spreadsheet",
                "description": "Apply formatting, highlighting, or other visual changes to cells",
                "category": "SPREADSHEET_COMMAND"
            },
            "SPECIFIC_DATA": {
                "id": "data_query",
                "title": "📊 Query and analyze data",
                "description": "Get specific information, summaries, or insights from your data",
                "category": "SPECIFIC_DATA"
            },
            "VISUALIZATION": {
                "id": "create_chart",
                "title": "📈 Create visualization",
                "description": "Generate charts, graphs, or visual representations of your data",
                "category": "VISUALIZATION"
            },
            "ANALYSIS": {
                "id": "statistical_analysis",
                "title": "🔬 Perform statistical analysis",
                "description": "Run correlations, patterns analysis, or other statistical operations",
                "category": "ANALYSIS"
            },
            "DUPLICATE_CHECK": {
                "id": "duplicate_handling",
                "title": "🔍 Handle duplicate data",
                "description": "Find, analyze, or remove duplicate rows from your dataset",
                "category": "DUPLICATE_CHECK"
            },
            "MISSING_VALUES": {
                "id": "missing_data",
                "title": "🔧 Handle missing values",
                "description": "Identify, analyze, or fix missing/null values in your data",
                "category": "MISSING_VALUES"
            },
            "TRANSLATION": {
                "id": "translate_content",
                "title": "🌍 Translate content",
                "description": "Translate text content in your data to different languages",
                "category": "TRANSLATION"
            }
        }
        
        template = option_templates.get(category)
        if template:
            option = template.copy()
            if is_primary:
                option["title"] = f"✨ {option['title']} (Recommended)"
            return option
        
        return None
    
    def process_user_choice(self, choice_id: str, original_query: str, category: str) -> tuple[str, str]:
        """
        Process user's clarification choice and prepare for execution.
        
        Args:
            choice_id: User's selected option ID
            original_query: Original user query
            category: Selected category
            
        Returns:
            tuple: (processed_query, final_category)
        """
        try:
            # Learn user preference
            self._learn_user_preference(original_query, choice_id, category)
            
            # If user chose "other", ask for more details
            if choice_id == "other":
                return original_query, "CLARIFY_MORE"
            
            # Otherwise, return the query with the selected category
            self.logger.info(f"✅ User chose {choice_id} for query: '{original_query}'")
            return original_query, category
            
        except Exception as e:
            self.logger.error(f"❌ Error processing user choice: {str(e)}")
            return original_query, category
    
    def _learn_user_preference(self, query: str, choice_id: str, category: str):
        """Learn user preferences for similar future queries."""
        try:
            # Extract key patterns from the query
            key_patterns = self._extract_key_patterns(query)
            
            # Store preference
            for pattern in key_patterns:
                if pattern not in self.user_preferences:
                    self.user_preferences[pattern] = {}
                
                if category not in self.user_preferences[pattern]:
                    self.user_preferences[pattern][category] = 0
                
                self.user_preferences[pattern][category] += 1
            
            self.logger.debug(f"📚 Learned preference: {key_patterns} → {category}")
            
        except Exception as e:
            self.logger.error(f"❌ Error learning user preference: {str(e)}")
    
    def _extract_key_patterns(self, query: str) -> list:
        """Extract key patterns from user query for learning."""
        patterns = []
        query_lower = query.lower()
        
        # Action verbs
        action_verbs = ['find', 'show', 'create', 'make', 'generate', 'analyze', 'identify', 'clean', 'remove', 'fix']
        for verb in action_verbs:
            if verb in query_lower:
                patterns.append(f"action:{verb}")
        
        # Subject nouns
        subjects = ['junk', 'duplicate', 'chart', 'graph', 'data', 'trend', 'pattern', 'missing', 'null']
        for subject in subjects:
            if subject in query_lower:
                patterns.append(f"subject:{subject}")
        
        # Combined patterns
        if 'junk' in query_lower and 'find' in query_lower:
            patterns.append("pattern:find_junk")
        if 'show' in query_lower and 'trend' in query_lower:
            patterns.append("pattern:show_trend")
        
        return patterns
    
    def check_learned_preferences(self, query: str) -> tuple[str, int]:
        """
        Check if we've learned user preferences for this type of query.
        
        Args:
            query: User's query
            
        Returns:
            tuple: (preferred_category, confidence_boost)
        """
        try:
            patterns = self._extract_key_patterns(query)
            category_scores = {}
            
            for pattern in patterns:
                if pattern in self.user_preferences:
                    for category, count in self.user_preferences[pattern].items():
                        category_scores[category] = category_scores.get(category, 0) + count
            
            if category_scores:
                # Get the most preferred category
                preferred_category = max(category_scores.items(), key=lambda x: x[1])
                confidence_boost = min(30, preferred_category[1] * 10)  # Max 30 point boost
                
                self.logger.debug(f"📈 Learned preference boost: {preferred_category[0]} (+{confidence_boost}%)")
                return preferred_category[0], confidence_boost
            
        except Exception as e:
            self.logger.error(f"❌ Error checking learned preferences: {str(e)}")
        
        return None, 0