import uuid
import os
import json
import pandas as pd
import re
import logging

# Conversation history is read back through the stores package, the same way
# workspaces are, so this module needs no database client of its own.
import stores
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

import numpy as np # Often needed with pandas and plotting
from typing import Tuple, Optional, Dict, Any
from sqlalchemy import text as sa_text

import sys
from llm_text import content_of

# The log messages carry emoji; a Windows console defaults to a codepage that
# cannot encode them, and the resulting UnicodeEncodeError takes down the
# handler rather than the message.
if sys.platform.startswith('win'):
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

logger = logging.getLogger('AgentServices')

# The most result rows ever put in front of the model.
#
# Nothing bounded this before. What a query returns is not what the sheet
# holds -- an aggregate comes back as four rows -- but "list every order in
# the North region" on an 80,000-row sheet returns 20,117, and every one of
# them was pasted into the prompt. Measured on that sheet: 65s when the model
# got through it, and a 1.69MB dump of raw Python tuples when it did not,
# because db.run() stringifies every row and the formatting call that failed
# on the result fell through to printing it.
#
# Bounding the sample costs no accuracy because the numbers do not come from
# it: the count and the column totals are computed over the whole result set
# in _result_facts(), and the arithmetic that answers most questions already
# happened in SQL before any of this.
MAX_PROMPT_ROWS = 200

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
    def __init__(self, llm):
        self.llm = llm
        self.operation_cancelled_flag = False
        
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
        self.data_handler = None
        
        # No database client here on purpose: history is read through the
        # stores package, which is the one thing that knows where this install
        # keeps its data.
        #
        # What stood here was a database client of its own, built with a key
        # that row-level security gave nothing to, so the select it ran could
        # only ever come back empty. It logged a line about initialising
        # persistent conversation memory on the way past, which is why nobody
        # looked.

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
            
            # Serves two purposes, and mostly the second one.
            #
            # In Complex mode the ReAct loop below runs: the model queries,
            # reads the result and decides what to do next. That needs a model
            # that can hold ReAct's format together over several turns.
            #
            # In Simple mode -- the default, and the great majority of traffic
            # -- the loop never runs, but _execute_sql_query_directly still
            # reaches into this executor for its sql_db_query tool to run SQL
            # it generated itself. So the agent is load-bearing either way, and
            # deleting it would break the common path, not just the rare one.
            #
            # That split is what keeps modest local models viable: on the
            # default path nothing has to survive ReAct parsing.
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
                logger.error("Warning: SQL Agent could not be initialized. LLM missing.")
            elif not db_sqlalchemy:
                logger.debug("Info: SQL Agent will be initialized when data is loaded.")
            else:
                logger.error("Warning: SQL Agent could not be initialized. Unknown issue.")
            self.agent_executor = None
        if self.memory:
            self.memory.clear()

    def reset_state(self):
        if self.memory:
            self.memory.clear()
        self.inferred_context = None
        self.data_summary = None
        self.analysis_results = []
        self.operation_cancelled_flag = False # Critical: reset cancellation flag
        
        # Clear all chat memories to prevent context contamination
        self.chat_histories.clear()
        self.current_chat_id = None
        
        # Force reinitialize LLM to clear any internal state/memory
        if hasattr(self, 'llm') and self.llm:
            logger.debug("🧹 Clearing LLM context")
            # The LLM will be reinitialized on next use, ensuring clean context

    # NEW: Chat-specific memory management methods
    def switch_chat_context(self, chat_id: str):
        """
        Point memory at a chat, reloading it from the store when necessary.

        Two things made this fail quietly before. It was never called from
        anywhere -- so chat_id was accepted by /api/query, passed around, and
        used for nothing -- and it rebound self.memory only when an agent
        executor happened to exist, leaving the context builder reading a
        different history object than the one being written to.

        It reloads whenever the in-process history is empty rather than
        trusting the cache, because initialize_agents() clears memory and
        hydrate() calls it on every request. Without that check the cache
        holds the emptied history and the stored conversation is never read
        back.
        """
        if not chat_id:
            return

        if self.current_chat_id and self.chat_history:
            self.chat_histories[self.current_chat_id] = self.chat_history

        history = self.chat_histories.get(chat_id)
        if history is None or not history.messages:
            history = InMemoryChatMessageHistory()
            try:
                stored = self._load_chat_messages(chat_id)
                for message in stored:
                    role = message.get('role')
                    content = message.get('content', '')
                    if not content:
                        continue
                    if role == 'user':
                        history.add_user_message(content)
                    elif role == 'assistant':
                        history.add_ai_message(content)
                if stored:
                    logger.info("\U0001f4da Restored %d messages for chat %s",
                                len(history.messages), chat_id)
            except Exception as exc:
                logger.error("Could not restore conversation for %s: %s", chat_id, exc)
            self.chat_histories[chat_id] = history

        self.chat_history = history
        self.current_chat_id = chat_id

        # Rebound every time, not only when an agent executor exists: the
        # context the prompts are built from is read off self.memory, so a
        # stale binding here is the difference between a chat with a memory
        # and one without.
        if LANGCHAIN_MEMORY_AVAILABLE:
            self.memory = ConversationBufferMemory(
                memory_key="chat_history", return_messages=True,
                chat_memory=self.chat_history,
            )
            if self.agent_executor is not None and hasattr(self.agent_executor, 'memory'):
                self.agent_executor.memory = self.memory

    def _get_conversation_context_string(self, max_messages: int = 6) -> str:
        """Get formatted conversation context for LLM prompts"""
        logger.debug("🔍 Getting conversation context...")
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

    def _standalone_question(self, question: str, conversation_context: str) -> str:
        """
        The question with what it points at filled in, or unchanged.

        "And what about just the South?" carries no column, no table and no
        verb. Handed to the router it looks nothing like a question about the
        sheet, so it was sent to the conversation branch and answered "the
        conversation does not contain the answer" -- while the number sat in
        the sheet the whole time. Handed to the SQL step it is no better.
        Resolving it first means both of them see a whole question.

        Guarded rather than trusted. A model asked to rewrite will sometimes
        explain instead, and a confident mangling is worse than the fragment:
        anything empty, multi-line or long is discarded in favour of what the
        user actually typed.
        """
        if not conversation_context.strip():
            return question

        prompt = f"""{conversation_context}The user now says: "{question}"

Rewrite that as a question which stands on its own, replacing "it", "that",
"there", "that one" and similar with whatever they refer to in the conversation
above. Keep the user's own wording wherever you can. If it already stands on
its own, give it back unchanged.

Reply with the question and nothing else."""

        try:
            rewritten = content_of(self.llm.invoke(prompt))
        except Exception as exc:
            logger.error(f"Could not resolve the question against the conversation: {exc}")
            return question

        first_line = (rewritten or "").strip().split("\n")[0].strip().strip('"').strip()
        if not first_line or len(first_line) > 300:
            logger.debug("Ignoring an unusable rewrite: %r", (rewritten or "")[:120])
            return question
        if first_line != question:
            logger.debug("Resolved %r -> %r", question, first_line)
        return first_line

    def _load_chat_messages(self, chat_id: str) -> list:
        """
        Load a chat's messages from the store.

        This used to reach for a database client of its own rather than going
        through the store, which meant the default install had no memory
        across restarts at all: the client was never there, the loader
        returned nothing, and the model began every question with an empty
        history while the frontend went on displaying the conversation. The
        chat looked continuous and was not.
        """
        # A chat only gets a row once it has been saved, and until then the
        # client sends a placeholder -- "default" for the one every new
        # workspace opens with. On Postgres chats.id is a uuid column, so
        # asking for that placeholder is not an empty result but a 400, which
        # cost a round trip and an error line on every single question.
        try:
            uuid.UUID(str(chat_id))
        except (ValueError, AttributeError, TypeError):
            logger.debug(f"📭 Chat '{chat_id}' has never been saved; nothing to load")
            return []

        try:
            chat = stores.fetch_chat(chat_id)
        except Exception as e:
            logger.error(f"❌ Failed to load chat messages: {str(e)}")
            return []

        messages = (chat or {}).get("messages") or []
        if messages:
            logger.info(f"✅ Loaded {len(messages)} messages for chat: {chat_id}")
        else:
            logger.debug(f"📭 No stored messages for chat: {chat_id}")
        return messages

    def cancel_operation(self):
        logger.debug("AgentServices: Cancel operation requested.")
        self.operation_cancelled_flag = True

    def clear_cancel_flag(self):
        # print("AgentServices: Cancel flag cleared.")
        self.operation_cancelled_flag = False

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
            
            # Log the prompt being sent to LLM
            logger.debug("Sending code generation prompt to LLM")

            prompt = f"""
You are an expert Python programmer specializing in pandas. Generate executable Python code to address the following query on a pandas DataFrame named 'df'.

Query: "{question}"
Query Category: {query_category}
Column Mapping: {json.dumps(column_mapping, indent=2)}
DataFrame Info (first 5 rows):
{df.head().to_string()}
DataFrame dtypes:
{df.dtypes.to_string()}

Instructions:
1. Your code will be executed in a function, so DO NOT use 'return' statements.
2. Instead, assign the modified DataFrame to a variable named 'result'.
3. DO NOT include import statements for `pandas as pd` or `numpy as np`. These are already available in the execution scope.
4. Ensure the code handles errors, edge cases, and invalid inputs gracefully within a try-except block. Assign any error message string to 'result' in case of failure.
5. DO NOT attempt any file I/O.
6. Keep code simple and focused on the specific task.

Code template:
'''python
# Initialize result variable that will be captured
result = None

try:
    # ... your actual code based on the query ...
    result = df

except Exception as e:
    # Handle errors
    logger.error(f"Error during code execution: {{str(e)}}")
    result = f"Error: {{str(e)}}" # Store error message in result for feedback
'''
"""
            try:
                if self.operation_cancelled_flag: 
                    return None, "I've stopped processing that request as you requested."
                response = content_of(self.llm.invoke(prompt))
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
                        if "result =" in line or "df." in line:
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
                'df': df_copy_for_execution,
                'uuid': uuid,
                'os': os,
                'print': print,
                '__builtins__': {
                    'print': print, 'len': len, 'range': range, 'dict': dict, 'list': list,
                    'set': set, 'str': str, 'int': int, 'float': float, 'bool': bool,
                    'tuple': tuple, 'zip': zip, 'round': round, 'sum': sum, 'min': min,
                    'max': max, 'abs': abs, 'all': all, 'any': any, 'enumerate': enumerate,
                    'filter': filter, 'map': map, 'sorted': sorted, 'Exception': Exception,
                    'TypeError': TypeError, 'ValueError': ValueError, '__import__': __import__
                }
            }
            
            safe_locals = {'result': None}
            
            # Execute the code
            logger.debug("Executing code in restricted environment")
            exec(code, safe_globals, safe_locals)
            
            if self.operation_cancelled_flag:
                logger.info("Operation cancelled during code execution")
                return None, "I've stopped processing that request as you requested."
            
            execution_result = safe_locals.get('result')
            logger.debug(f"Execution result type: {type(execution_result)}")

            # Handle non-visualization results
            logger.debug(f"Returning non-visualization result of type: {type(execution_result)}")
            return execution_result, "Execution completed successfully."
            
        except Exception as e:
            logger.exception("Error in safe_execute_pandas_code")
            return None, f"Error executing generated code: {str(e)}"

    def categorize_query(self, question: str) -> tuple[str, int]:
        """Categorize the query and return confidence score"""
        logger.info("🔍 === CATEGORIZING QUERY ===")
        logger.info(f"📝 Input: '{question}'")
        
        # Get basic categorization first
        logger.info("🎯 Running basic categorization...")
        initial_category = self._categorize_query_basic(question)
        logger.info(f"🎯 Basic categorization result: {initial_category}")
        
        # Return basic categorization directly (clarification system removed)
        default_confidence = 70
        logger.info(f"📊 Returning basic categorization: {initial_category} with default {default_confidence}% confidence")
        return initial_category, default_confidence
    
    def _categorize_query_basic(self, question: str) -> str:
        """Categorize the query to determine the appropriate processing method"""
        # MISSING_VALUES used to be decided by its own yes/no call to the
        # model before this one ran, which is one round trip to answer a
        # question the categoriser below already answers -- it has
        # MISSING_VALUES among its categories. Its examples were folded into
        # that prompt instead. Worth about a second and a half per question,
        # and this ran twice.

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

        # --- LLM-based categorization first ---
        logger.info("🤖 Running LLM-based categorization...")
        valid_categories = [
            'SPECIFIC_DATA', 'GENERAL', 'VISUALIZATION', 
            'TRANSLATION', 'ANALYSIS', 'MISSING_VALUES', 'DUPLICATE_CHECK', 'SPREADSHEET_COMMAND', 'JUNK_DETECTION'
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
- MISSING_VALUES: Queries about null, empty or missing data -- finding it, counting it, filling it or removing it (e.g. "show me missing values", "how to handle missing data", "what should I do about null values", "fill empty cells", "deal with missing information")
- JUNK_DETECTION: Requests to find, identify, flag, or clean junk/spam/meaningless responses in text columns (e.g., "find junk responses", "detect spam", "identify meaningless text", "flag gibberish", "clean bad responses", "add junk column")

IMPORTANT: Any query containing words like "duplicate", "duplicates", "deduplicate" should ALWAYS be categorized as DUPLICATE_CHECK, never SPREADSHEET_COMMAND.

Only output the category name, nothing else.
"""
            logger.info("🤖 Sending query to LLM for categorization...")
            logger.info(f"🤖 LLM Prompt: {llm_prompt}")
            
            llm_response = self.llm.invoke(llm_prompt)
            logger.info(f"🤖 LLM Raw response: '{content_of(llm_response)}'")
            
            category = content_of(llm_response).upper()
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
                    logger.debug("Query contains visualization keywords, categorizing as VISUALIZATION")
                    return "VISUALIZATION"
                
                # Otherwise, return SPECIFIC_DATA
                logger.debug("Categorizing as SPECIFIC_DATA")
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
            llm_response = content_of(response)
            
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

    def process_non_visualization_query(self, question: str, query_category: str, mode: str = "simple") -> str:
        """Process non-visualization queries with improved error handling."""
        logger.debug("🔧 === PROCESS NON-VISUALIZATION QUERY ===")
        logger.debug(f"💬 Question: {question}")
        logger.debug(f"📂 Category: {query_category}")
        
        if self.operation_cancelled_flag:
            return "I've stopped processing that request as you requested."

        # The conversation as it stood BEFORE this question, captured here
        # because the question is about to join it.
        #
        # Built after the append, which is what used to happen, "what did I
        # just ask you?" saw itself as the most recent line of context and the
        # model answered by quoting the question back at the user.
        prior_context = ""
        if hasattr(self, 'chat_history') and self.chat_history:
            prior_context = self._get_conversation_context_string()
            self.chat_history.add_user_message(question)

        # Get current dataframe
        current_df = self.data_handler.get_df() if self.data_handler else None

        try:
            # Missing values are now handled in main process_query - no duplicate handling needed here

            # Process based on query category
            if query_category in ['SPECIFIC_DATA', 'ANALYSIS']:
                if self.operation_cancelled_flag:
                    return "I've stopped processing that request as you requested."

                # CONTEXT-AWARE PROCESSING: "what did I just ask you?" should be
                # answered from the conversation, not from the sheet.
                conversation_context = prior_context
                resolved_question = question

                # With no history there is nothing to answer from, so this check
                # can only do harm -- it spends a model call and hands the model
                # an opportunity to reply with prose that gets shown to the user
                # as the answer. Most questions arrive on a fresh chat.
                if not conversation_context.strip():
                    logger.debug("No conversation history; going straight to the dataset")
                else:
                    # Fill in what the question points at before deciding what
                    # it is. "And what about just the South?" has no columns, no
                    # table and no verb to classify or to turn into SQL, so it
                    # was read as a question about the conversation and answered
                    # "the conversation does not contain the answer" -- with the
                    # number sitting in the sheet the whole time.
                    resolved_question = self._standalone_question(
                        question, conversation_context
                    )

                    # A closed one-word classification, then a separate call to
                    # write the answer -- rather than one prompt offering "reply
                    # with this token, or else write the answer yourself".
                    #
                    # That earlier shape failed open: anything which was not the
                    # token became the user's answer verbatim, and its branches
                    # were not mutually exclusive, since a data question really
                    # is absent from the conversation history. Measured on a
                    # local 13B it took the prose branch 6 times in 12, once
                    # replying "the total revenue for the South region is
                    # $500,000" with no data and no query behind it. Requiring an
                    # opt-in marker instead made it worse, not better: the same
                    # model then opted in 12 times out of 12.
                    #
                    # Asking for one word out of two is the version weak models
                    # get right -- 4/4 on data questions in the same test -- and
                    # anything unrecognised falls through to the dataset, where a
                    # misrouted question produces a wrong query rather than an
                    # invented number.
                    route_prompt = f"""Classify what the user's message is asking about. Answer with one word.

{conversation_context}User message: "{resolved_question}"

DATA     - anything about the spreadsheet: numbers, rows, columns, totals,
           charts, filtering, sorting, analysis
HISTORY  - something said earlier in the conversation above

Answer with exactly one word, DATA or HISTORY, and nothing else."""

                    route = "DATA"
                    try:
                        reply = content_of(self.llm.invoke(route_prompt)).upper()
                        # Only a clear, unambiguous HISTORY diverts away from the
                        # data. A reply mentioning both, or neither, is a data
                        # question as far as this is concerned.
                        if "HISTORY" in reply and "DATA" not in reply:
                            route = "HISTORY"
                        elif "DATA" not in reply and "HISTORY" not in reply:
                            logger.warning(
                                "Routing check returned neither word, treating as a "
                                "dataset query: %r", reply[:120]
                            )
                    except Exception as exc:
                        logger.error(f"Routing check failed, treating as a dataset query: {exc}")

                    if route == "HISTORY":
                        # Now, and only now, ask it to actually answer. Separating
                        # the decision from the writing means a model that rambles
                        # cannot turn a data question into prose.
                        answer_prompt = f"""{conversation_context}The user asks: "{question}"

Answer using only the conversation above. Address the user directly. If the
conversation does not contain the answer, say so plainly and briefly."""
                        try:
                            answer = content_of(self.llm.invoke(answer_prompt))
                            if answer:
                                logger.debug("Query answered from conversation context")
                                return answer
                        except Exception as exc:
                            logger.error(f"Conversation answer failed: {exc}")


                try:
                    # Not answered from conversation history, so it is a question
                    # about the data. Check the database is there and run it.
                    logger.debug("🔍 Dataset query detected, checking data handler state...")
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
                        self._last_derived = []
                        self._last_resolved = (
                            resolved_question if resolved_question != question else None
                        )
                        response = self._execute_sql_query_directly(
                            resolved_question, conversation_context
                        )
                        logger.debug(f"✅ Simple mode execution completed: {response}")
                        # Apply enhanced template formatting to Simple mode as well
                        answer = self._format_sql_response(response, resolved_question)
                        return self._with_answer_notes(answer)
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
                response = content_of(response_content)

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
                context_str = prior_context

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
                response = content_of(response_content)
                
                # Note: AI response will be added to memory by unified system in process_query
                return response

        except Exception as e:
            logger.error(f"❌ Error processing query: {str(e)}")
            logger.exception("💥 Full exception details:")
            return "I had some trouble with that request. Could you try asking in a different way? I'm here to help with data analysis and general questions."

    def process_query(self, question: str, mode: str = "simple") -> Tuple[str, Optional[Dict[str, str]]]:
        """Process the user's query and return a response."""
        try:
            if self.operation_cancelled_flag:
                return "I've stopped processing that request as you requested.", None
                
            if not question:
                return "I'm ready to help! What would you like to know or do with your data?", None
                
            # Log the question for debugging
            logger.info("🚀 === PROCESSING QUERY START ===")
            logger.info(f"📝 Query: '{question}'")
            logger.info(f"⚙️ Mode: {mode}")
            
            # Get query category with confidence
            logger.info("🔍 Starting query categorization...")
            query_category, confidence = self.categorize_query(question)
            logger.info(f"✅ Query categorized as: {query_category} (confidence: {confidence}%)")
            
            # Skip clarification - proceed directly with query processing
            logger.info("✅ Proceeding directly with query processing (ambiguity detection removed)")
            
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
                        logger.debug("💾 Added missing values response to unified conversation memory")
                    return response, None
                else:
                    no_data_response = "I need some data to analyze first. Please upload a dataset and I can help identify and handle missing values."
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
                    if response.startswith("DATA_MODIFIED:"):
                        response = response.replace("DATA_MODIFIED:", "", 1).strip()
                        
                    # Special handling for data modifications
                    # Return without any metadata to avoid frontend visualization processing
                    return response, None
                else:
                    logger.error("❌ No data loaded for duplicate removal")
                    return "I need some data to work with first. Please upload a dataset and I can help remove duplicates.", None
                
            # Reuse the category from the top of this function rather than
            # asking again. The question has not changed since, so the second
            # call returned the same answer the first one did, for another
            # round trip to the model.
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
                        logger.debug("💾 Added duplicate check response to unified conversation memory")
                    
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
                        memory_response = response
                        if response.startswith("DATA_MODIFIED:"):
                            response = response.replace("DATA_MODIFIED:", "", 1).strip()
                            memory_response = response  # Use clean response for memory
                        
                        # UNIFIED MEMORY: Add AI response to memory
                        if response and not response.startswith("I encountered an error"):
                            if hasattr(self, 'chat_history') and self.chat_history:
                                self.chat_history.add_ai_message(memory_response)
                            logger.debug("💾 Added miscategorized duplicate response to unified conversation memory")
                            
                        # Return without any metadata to avoid frontend visualization processing
                        return response, None
                    else:
                        no_data_response = "No data loaded for duplicate removal."
                        # Don't add "no data" responses to memory
                        return no_data_response, None
                
                # Handle other types of queries
                logger.info(f"Processing as {query_category} request")
                response = self.process_non_visualization_query(question, query_category, mode)
                
                # UNIFIED MEMORY: Always add AI response to memory regardless of category
                if response and not response.startswith("I encountered an error"):
                    if hasattr(self, 'chat_history') and self.chat_history:
                        self.chat_history.add_ai_message(response)
                    logger.debug("💾 Added AI response to unified conversation memory")
                
                return response, None
        except Exception as e:
            logger.error(f"Error processing query: {str(e)}")
            logger.exception("Full exception details:")
            error_response = "I had trouble processing your request. Could you try rephrasing your question or providing more details about what you'd like me to do?"
            # Don't add error responses to memory
            return error_response, None

    # Chart types the frontend renderer knows how to draw.
    SUPPORTED_CHART_TYPES = ("bar", "line", "area", "pie", "scatter")

    def _describe_columns(self, df, max_distinct: int = 12) -> str:
        """
        Describe the columns for a prompt, including the actual values of
        low-cardinality text columns.

        Without this the model guesses at contents and writes filters that
        match nothing -- asking for "dramas per channel" on a table where every
        row is a drama produced `WHERE Genre = 'Drama'`, and Genre holds
        Romance/Family/etc., so the query returned zero rows. Showing the real
        values stops it inventing predicates.
        """
        lines = []
        for col in df.columns:
            series = df[col]
            if pd.api.types.is_numeric_dtype(series):
                lines.append(f"- {col} (numeric)")
                continue
            if pd.api.types.is_datetime64_any_dtype(series):
                lines.append(f"- {col} (date)")
                continue

            distinct = series.dropna().astype(str).unique()
            if 0 < len(distinct) <= max_distinct:
                values = ", ".join(repr(v) for v in sorted(distinct)[:max_distinct])
                lines.append(f"- {col} (text; values: {values})")
            else:
                sample = ", ".join(repr(v) for v in distinct[:3])
                lines.append(f"- {col} (text; {len(distinct)} distinct, e.g. {sample})")
        return "\n".join(lines)

    def _generate_chart_spec(self, question: str) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        """
        Build a declarative chart spec for the frontend to render.

        Replaces the previous approach of asking the LLM for matplotlib code and
        exec()ing it. That wrote a PNG to local disk, which does not survive on
        serverless -- the file lives only on the instance that made it, so a
        later request for the image can land elsewhere and 404. It also meant
        running model-generated code on every chart request.

        Here the model only picks a chart type and writes SQL. We run the SQL
        ourselves and hand back the rows, so the output is data rather than an
        image and nothing generated is executed as code.

        Returns (spec, error).
        """
        df = self.data_handler.get_df() if self.data_handler else None
        if df is None:
            return None, "No data loaded."

        prompt = f"""
Pick a chart and write the SQL to populate it, answering: "{question}"

The table is named 'data'. Its columns are:
{self._describe_columns(df)}

Reply with a single JSON object and nothing else:
{{
  "chart_type": one of {list(self.SUPPORTED_CHART_TYPES)},
  "title": short chart title,
  "x_key": the column from your SELECT used for the category / x-axis,
  "series": [list of numeric columns from your SELECT to plot],
  "sql": the SQLite query
}}

Rules:
- Use ONLY the columns listed above in the SQL.
- Do NOT invent WHERE filters. Only filter on a value shown above, and only if
  the question actually asks to narrow the data. Every row is already a record
  of the thing being asked about.
- Alias every computed column (e.g. COUNT(*) AS drama_count) and use those
  aliases in "x_key" and "series" -- they must match your SELECT exactly.
- "series" must be numeric columns. "x_key" must not appear in "series".
- Aggregate rather than returning raw rows, and ORDER BY the main series
  descending unless the question implies otherwise.
- Return at most 20 rows so the chart stays readable.
- For "pie", use exactly one series.
- Return raw JSON. No markdown code fences, no commentary.
"""
        try:
            raw = content_of(self.llm.invoke(prompt))
        except Exception as e:
            logger.exception("Chart spec generation failed")
            return None, f"Could not generate a chart: {str(e)}"

        # Defensive: the model is told not to fence, but strip them if present.
        raw = re.sub(r'^```(?:json)?\s*', '', raw, flags=re.IGNORECASE | re.MULTILINE)
        raw = re.sub(r'```$', '', raw, flags=re.MULTILINE).strip()

        try:
            spec = json.loads(raw)
        except json.JSONDecodeError as e:
            logger.error(f"Chart spec was not valid JSON: {raw[:300]}")
            return None, f"Could not understand the chart definition: {str(e)}"

        chart_type = str(spec.get("chart_type", "")).lower().strip()
        if chart_type not in self.SUPPORTED_CHART_TYPES:
            logger.warning(f"Unsupported chart_type {chart_type!r}, defaulting to bar")
            chart_type = "bar"

        sql = (spec.get("sql") or "").strip().rstrip(";")
        if not sql:
            return None, "The chart definition did not include a query."

        # Only ever read. The model writes this SQL, so anything that could
        # modify the dataset is rejected outright rather than sanitised.
        lowered = re.sub(r'\s+', ' ', sql.lower())
        if not lowered.startswith("select") and not lowered.startswith("with"):
            return None, "Only read-only chart queries are allowed."
        if re.search(r'\b(insert|update|delete|drop|alter|create|replace|attach|pragma)\b', lowered):
            return None, "Only read-only chart queries are allowed."

        try:
            # Hand read_sql_query a Connection rather than the Engine: an
            # explicit connection scopes the read and is accepted by every
            # pandas/SQLAlchemy 2.0 combination.
            with self.data_handler.engine.connect() as conn:
                rows_df = pd.read_sql_query(sa_text(sql), conn)
        except Exception as e:
            logger.error(f"Chart SQL failed: {sql} -> {e}")
            return None, f"The chart query could not be run: {str(e)}"

        if rows_df.empty:
            return None, "That chart would have no data to show."

        rows_df = rows_df.head(50)
        result_columns = list(rows_df.columns)

        x_key = spec.get("x_key")
        if x_key not in result_columns:
            x_key = result_columns[0]

        series = [c for c in (spec.get("series") or []) if c in result_columns and c != x_key]
        if not series:
            # Fall back to whatever numeric columns the query actually returned.
            series = [c for c in result_columns
                      if c != x_key and pd.api.types.is_numeric_dtype(rows_df[c])]
        if not series:
            return None, "The chart query returned nothing numeric to plot."
        if chart_type == "pie":
            series = series[:1]
        else:
            # The renderer's palette is monochrome, and greys only stay
            # distinguishable for three steps: #ffffff/#b3b3b3/#6e6e6e sit at
            # dE 22.9 apart, while a fourth step drops adjacent pairs under the
            # dE 15 floor where they read as the same colour. Cap rather than
            # emit series nobody can tell apart.
            series = series[:3]

        # NaN is not valid JSON, and the x axis reads better as text.
        rows_df = rows_df.where(pd.notnull(rows_df), None)
        rows_df[x_key] = rows_df[x_key].astype(str)

        return {
            "type": "chart_spec",
            "chart_type": chart_type,
            "title": spec.get("title") or question,
            "x_key": x_key,
            "series": [{"key": c, "label": c.replace("_", " ").title()} for c in series],
            "data": json.loads(rows_df.to_json(orient="records", date_format="iso")),
            "sql": sql,
            "original_query": question,
        }, None

    def _process_visualization_request(self, question: str) -> Tuple[str, Optional[Dict[str, str]]]:
        """
        Process a visualization request and generate an appropriate visualization.
        
        Args:
            question: The user's question/request (e.g., "visualize sales by region")
            
        Returns:
            A tuple containing (response message, visualization info dictionary)
            The visualization info contains paths to generated visualization files
        """
        logger.debug("📊 === PROCESSING VISUALIZATION REQUEST ===")
        logger.debug(f"💬 Query: {question}")
        
        if self.operation_cancelled_flag:
            return "I've stopped processing that request as you requested.", None
            
        if not self.data_handler or self.data_handler.get_df() is None:
            return "I need some data to create visualizations. Please upload a dataset first.", None
            
        df = self.data_handler.get_df()
        logger.debug(f"📊 DataFrame shape: {df.shape}")
        
        try:
            spec, error = self._generate_chart_spec(question)

            if error or not spec:
                return error or "I couldn't build that chart.", None

            logger.debug(f"📊 Chart spec: {spec['chart_type']} "
                         f"x={spec['x_key']} series={[x['key'] for x in spec['series']]} "
                         f"rows={len(spec['data'])}")
            return "Here's the chart.", spec

        except Exception as e:
            logger.error(f"❌ Visualization error: {str(e)}")
            logger.exception("Full exception details:")
            return f"Error processing visualization request: {str(e)}", None

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
        logger.debug("🌐 === PROCESSING TRANSLATION REQUEST ===")
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
            
            column_name_response = content_of(self.llm.invoke(extract_prompt))
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
                    translation_response = content_of(self.llm.invoke(translation_prompt))
                    
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
            logger.debug("🔄 Creating new column with translations")
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
        logger.debug("🌐🔄 === PROCESSING BULK TRANSLATION REQUEST ===")
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
                response_content = content_of(analysis_response)
                
                # Remove markdown code block formatting if present
                response_content = re.sub(r'^```(?:json)?\s*', '', response_content, flags=re.IGNORECASE | re.MULTILINE)
                response_content = re.sub(r'```$', '', response_content, flags=re.MULTILINE)
                response_content = response_content.strip()
                
                analysis = json.loads(response_content)
                logger.debug(f"🔍 Bulk translation analysis: {analysis}")
                
                columns_spec = analysis.get('columns_to_translate', 'all')
                target_language = analysis.get('target_language', 'English')
                skip_numeric = analysis.get('skip_numeric_columns', True)
                
            except (json.JSONDecodeError, Exception) as e:
                logger.error(f"❌ Failed to parse LLM response as JSON: {str(e)}")
                # Default fallback
                columns_spec = 'all'
                target_language = 'English'
                skip_numeric = True
            
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
                        translation_response = content_of(self.llm.invoke(translation_prompt))
                        
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
            summary = "✅ Bulk translation completed successfully!\n"
            summary += f"📊 Translated {len(translation_results)} columns to {target_language}\n"
            summary += f"🔄 Total unique values translated: {total_translations}\n"
            summary += "📋 New columns created:\n"
            for result in translation_results:
                summary += f"   • {result}\n"
            summary += "🗂️ Translated columns placed after their original columns"
            
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
        logger.debug("🔍 === SIMPLE DUPLICATE CHECK ===")
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
        logger.debug("🧹 === PROCESSING DUPLICATE REMOVAL REQUEST ===")
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
                response_content = content_of(analysis_response)
                
                # Remove markdown code block formatting if present
                response_content = re.sub(r'^```(?:json)?\s*', '', response_content, flags=re.IGNORECASE | re.MULTILINE)
                response_content = re.sub(r'```$', '', response_content, flags=re.MULTILINE)
                response_content = response_content.strip()
                
                analysis = json.loads(response_content)
                logger.debug(f"🔍 Deduplication analysis: {analysis}")
                
                subset_columns = analysis.get('subset_columns')
                keep_strategy = analysis.get('keep_strategy')
                
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
                logger.error(f"Response content: {content_of(analysis_response)}")
                
                # Extract column information manually and initialize variables
                subset_columns = None
                keep_strategy = 'first'  # Default value to avoid variable scope issues
                
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
                logger.debug("📊 Direct deduplication analysis:")
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
                
                check_result = "\n📊 Comprehensive check (all columns): "
                check_result += f"{total_rows} total rows, {unique_count} unique, {total_dups} flagged as duplicates."
            
            # If duplicates exist, show sample
            if total_dups > 0:
                if subset_columns:
                    sample_dups = df[df.duplicated(subset=subset_columns, keep=False)].head(3)
                else:
                    sample_dups = df[df.duplicated(keep=False)].head(3)
                
                check_result += "\n🔍 Sample duplicates found:"
                for idx, row in sample_dups.iterrows():
                    if subset_columns:
                        sample_data = {col: row[col] for col in subset_columns}
                    else:
                        sample_data = dict(row.head(3))  # Show first 3 columns
                    check_result += f"\n   Row {idx}: {sample_data}"
            
            return check_result
            
        except Exception as e:
            return f"\n❌ Error in comprehensive duplicate check: {str(e)}"

    def _execute_sql_query_directly(self, question: str,
                                    conversation_context: str = "") -> str:
        """
        Generate and execute a SQL query directly based on the user's natural language question.
        Args:
            question: The user's natural language question about the data
        Returns:
            A string response with the query results or error message
        """
        logger.debug("🔍 === EXECUTE SQL QUERY DIRECTLY ===")
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
            #
            # The conversation goes in as background only. The question has
            # already been resolved against it by _standalone_question, and a
            # prompt that presents both without saying which to answer is a
            # prompt that sometimes answers the previous one.
            context_block = ""
            if conversation_context.strip():
                context_block = (
                    f"{conversation_context}"
                    "That is the conversation so far, for background only.\n"
                    "Write SQL for the question below, not for anything above it.\n\n"
                )

            sql_prompt = f"""{context_block}
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
            sql_query = content_of(sql_response)
            # --- Remove markdown code block formatting if present ---
            sql_query = re.sub(r'^```(?:sql)?\s*', '', sql_query, flags=re.IGNORECASE | re.MULTILINE)
            sql_query = re.sub(r'```$', '', sql_query, flags=re.MULTILINE)
            sql_query = sql_query.strip()
            logger.debug(f"🔍 Generated SQL Query (pre-rewrite): {sql_query}")
            # --- Post-process to force table name to 'data' ---
            sql_query = re.sub(r'(FROM|from)\s+\w+', 'FROM data', sql_query)
            sql_query = re.sub(r'(JOIN|join)\s+\w+', 'JOIN data', sql_query)
            logger.debug(f"🔍 Generated SQL Query (post-rewrite): {sql_query}")

            # Held for the caller to append after the last rephrasing pass.
            # Putting it in the prompt is not enough: the answer goes through a
            # second model call that rewrites what the first one wrote, and a
            # line it is free to reword is a line it is free to drop.
            self._last_derived = self._derived_definitions(sql_query)
            
            # Step 2: Execute the SQL query
            # Get the SQL database object
            db = self.data_handler.get_db_sqlalchemy_object()
            
            # Check what type of object we're dealing with
            logger.debug(f"Database object type: {type(db)}")
            
            # Use the appropriate method to run the query based on the object type
            rows = []
            columns = []

            # Run it into a DataFrame wherever we can. db.run() returns rows
            # already stringified into one blob, which is both the thing that
            # used to be pasted into the prompt whole and a shape the row count
            # and column totals cannot be recovered from. The engine is set
            # alongside db_sqlalchemy in data_handler, so in practice this is
            # the path taken; the branches below stay for the case where it is
            # not.
            engine = getattr(self.data_handler, "engine", None)
            if engine is not None:
                with engine.connect() as conn:
                    rows_df = pd.read_sql_query(sa_text(sql_query), conn)
                return self._format_direct_sql_result(rows_df, question, sql_query)

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
            for row in rows[:MAX_PROMPT_ROWS]:
                # Format each value appropriately
                formatted_values = []
                for val in row:
                    if val is None:
                        formatted_values.append("NULL")
                    elif isinstance(val, (int, float)):
                        formatted_values.append(str(val))
                    else:
                        # Escape any pipe characters in strings
                        formatted_values.append(str(val).replace("|", "\\|"))
                
                table_rows.append("| " + " | ".join(formatted_values) + " |")
            
            # Combine into final table
            result_table = "\n".join([table_header, table_separator] + table_rows)
            if len(rows) > MAX_PROMPT_ROWS:
                result_table += (
                    f"\n\n(showing the first {MAX_PROMPT_ROWS:,} of {len(rows):,} rows)"
                )
            
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
            - Limit to 3-4 sentences maximum
            - Do not say "Based on the query results" or similar phrases
            - Do not mention that you ran SQL or queried a database
            - Just give the facts and insights directly
            """
            
            # Get summary from LLM
            summary_response = self.llm.invoke(result_summary_prompt)
            result_summary = content_of(summary_response)
            
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

    @staticmethod
    def _num(value) -> str:
        """A number a person would write, not a float repr."""
        if value is None or pd.isna(value):
            return "n/a"
        if float(value).is_integer():
            return f"{int(value):,}"
        return f"{float(value):,.2f}"

    @staticmethod
    def _derived_definitions(sql_query: str):
        """
        The calculated columns in a SELECT, as (name, expression) pairs.

        Asked to explain its own arithmetic the model mostly does not: the rule
        sits in the prompt among a dozen others and loses. But the definition
        is not a matter of opinion, it is in the SQL, so it is read from there
        instead -- the same reason the sort direction is read from the sentence
        rather than requested from the model.

        This matters more than it sounds. Asked for revenue by region on a
        sheet with a Discount column, the query answered with
        Units * UnitPrice * (1 - Discount) and said nothing about it. Gross and
        net do not merely differ in size, they rank the regions differently --
        East and West swap -- so a user reading "which region earns least" got
        an answer whose meaning depended on a choice nobody showed them.
        """
        head = re.search(r'\bSELECT\b(.*?)\bFROM\b', sql_query or '',
                         flags=re.IGNORECASE | re.DOTALL)
        if not head:
            return []

        # Split the select list on top-level commas only; the interesting
        # expressions are full of function calls with commas inside them.
        items, depth, current = [], 0, ''
        for ch in head.group(1):
            if ch == '(':
                depth += 1
            elif ch == ')':
                depth -= 1
            if ch == ',' and depth == 0:
                items.append(current)
                current = ''
            else:
                current += ch
        items.append(current)

        definitions = []
        for item in items:
            item = item.strip()
            if not item or item == '*':
                continue
            alias_match = re.search(r'\s+AS\s+([`"\[]?)([A-Za-z_][\w ]*)\1\s*$',
                                    item, flags=re.IGNORECASE)
            if not alias_match:
                continue
            expression = item[:alias_match.start()].strip()
            # A bare column, or an aggregate of one, is not a definition worth
            # explaining -- "total_units = SUM(Units)" tells nobody anything.
            # An operator between columns is.
            if not re.search(r'[*/+-]', re.sub(r'\b\w+\s*\(', '(', expression)):
                continue
            definitions.append((alias_match.group(2).strip(), ' '.join(expression.split())))
        return definitions

    def _result_facts(self, rows_df) -> str:
        """
        True figures for the whole result set, for a prompt that shows part of it.

        This is what makes bounding the table safe. A model handed 200 of
        20,117 rows and asked for a total will produce one anyway, and it will
        be the total of what it can see. Everything here comes from pandas over
        the complete result, so the number in the answer is measured rather
        than estimated -- including when the model wrote SELECT * and intended
        to do the counting itself.
        """
        lines = [f"Rows returned by the query: {len(rows_df):,}"]
        for col in rows_df.columns:
            series = rows_df[col]
            if not pd.api.types.is_numeric_dtype(series) or not series.notna().any():
                continue
            lines.append(
                f"- {col}: sum {self._num(series.sum())}, "
                f"min {self._num(series.min())}, "
                f"max {self._num(series.max())}, "
                f"mean {self._num(series.mean())}"
            )
        return "\n".join(lines)

    def _render_result_table(self, rows_df, limit: int = MAX_PROMPT_ROWS) -> str:
        """The first `limit` rows as markdown, with a line saying so if cut."""
        shown = rows_df.head(limit)
        columns = [str(c) for c in shown.columns]
        lines = [
            "| " + " | ".join(columns) + " |",
            "| " + " | ".join("---" for _ in columns) + " |",
        ]
        for row in shown.itertuples(index=False):
            cells = []
            for value in row:
                if value is None or (not isinstance(value, str) and pd.isna(value)):
                    cells.append("NULL")
                else:
                    cells.append(str(value).replace("|", "\\|"))
            lines.append("| " + " | ".join(cells) + " |")

        table = "\n".join(lines)
        if len(rows_df) > limit:
            table += (
                f"\n\n(showing the first {limit:,} of {len(rows_df):,} rows -- "
                f"the figures above cover all {len(rows_df):,})"
            )
        return table

    def _format_direct_sql_result(self, result, question: str, sql_query: str) -> str:
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
            if isinstance(result, pd.DataFrame):
                if result.empty:
                    return f"Nothing in the sheet matches that: '{question}' returned no rows."
                facts = self._result_facts(result)
                shown = self._render_result_table(result)
                logger.debug(
                    "\U0001f50d Formatting %d result rows (%d shown)",
                    len(result), min(len(result), MAX_PROMPT_ROWS),
                )
            else:
                # No engine to run the query ourselves, so the result arrives
                # already stringified and the totals cannot be recovered from
                # it. Bound it anyway -- an unbounded blob here is what used to
                # be dumped into the answer verbatim.
                if not result or str(result).strip().lower() in ["i don't know", 'none', '']:
                    return (
                        f"I couldn't find any data to answer your question: "
                        f"'{question}'. Please make sure your data is properly "
                        f"loaded and try rephrasing your question."
                    )
                text = str(result)
                shown = text[:20000] + ("\n\n(result truncated)" if len(text) > 20000 else "")
                facts = "Not available: this result could not be measured directly."

            # Use the LLM only to phrase the result, never to add to it. The
            # prompt this replaced asserted the data was "product feedback with
            # columns like Product_Name, User_Score" and gave a coffee-maker
            # example, so the model reproduced that framing for whatever had
            # actually been uploaded, and the "Insights" section it demanded
            # invented trends that were not in the rows.
            #
            # The figures are kept separate from the rows on purpose. The rows
            # may be a sample; the figures never are. Saying which is which is
            # what stops a bounded table becoming an invented total.
            format_prompt = f"""
            User asked: "{question}"
            SQL query executed: {sql_query}

            Figures for the whole result set (measured, not estimated):
            {facts}

            Result rows:
            {shown}

            TASK: Convert this into a clear, readable answer.

            RULES:
            - ONLY state facts that appear above. Do NOT invent, assume, or fabricate any data.
            - The result rows may be only the first part of a larger result. NEVER
              count, total or average them yourself. Every total, count, minimum,
              maximum and mean you state must come from the figures block above.
              If a number the question needs is not there, say what is missing
              rather than working it out from the rows shown.
            - If the SQL computed a derived value (revenue, margin, a rate, a
              ratio), state in plain words how it was derived, e.g. "revenue here
              is Units x UnitPrice x (1 - Discount)". The user cannot see the
              query, and the same word can mean different things in one sheet.
            - If the result is a count, state the count. If it's a list, present the list clearly.
            - Use natural language to present the numbers/data from the result.
            - Round numbers to whole numbers where appropriate.
            - Keep the response concise (2-4 sentences for simple results, a short list for multiple rows).
            - Do NOT add "insights", "recommendations", or "what this means for your business".
            - Do NOT reference data that isn't shown above.
            - If the result is empty or zero, say so clearly.
            """
            
            formatted_response = content_of(self.llm.invoke(format_prompt))
            logger.debug(f"✅ Formatted response: {formatted_response}")

            return formatted_response
            
        except Exception as e:
            logger.error(f"❌ Error formatting direct SQL result: {str(e)}")
            # Fallback: the rows themselves, bounded.
            #
            # This used to interpolate the raw result whole. On a query
            # matching 20,117 rows that is 1.69MB of Python tuple repr posted
            # into the chat -- and it is precisely the case that lands here,
            # since what breaks the call above is the size of the thing being
            # formatted. A readable sample beats a wall of tuples.
            if isinstance(result, pd.DataFrame) and not result.empty:
                return (
                    f"I could not summarise that, but the query returned "
                    f"{len(result):,} rows:\n\n{self._render_result_table(result)}"
                )
            return (
                f"Here's what I found for your question '{question}':"
                f"\n\n{str(result)[:20000]}"
            )

    def _with_answer_notes(self, answer: str) -> str:
        """
        Append what the reader needs in order to trust the answer: the question
        that was actually answered, and how any calculated column was reached.

        Deliberately after every model call rather than inside a prompt. Both
        facts are ours, not the model's -- one is the rewrite we performed, the
        other is in the SQL we ran -- and a rule competing with a dozen others
        inside a prompt gets followed sometimes. This gets followed always.
        """
        notes = []

        # A follow-up gets rewritten into a standalone question before it is
        # routed or turned into SQL. When that rewrite changed something, say
        # so: the alternative is answering a question the user did not ask and
        # giving them no way to see it happened.
        resolved = getattr(self, "_last_resolved", None)
        if resolved:
            notes.append(f"*Answered as: {resolved}*")

        definitions = getattr(self, "_last_derived", None)
        if not definitions:
            return f"{answer}\n\n{notes[0]}" if notes else answer
        # Say it once: the rephrasing pass often works the formula into its own
        # prose ("Total Revenue is the sum of Units * UnitPrice * ..."), and
        # repeating it underneath reads like a stutter. Compare on the
        # arithmetic rather than the whole expression, since the prose rarely
        # keeps the SUM(...) wrapper the SQL had.
        flat = " ".join((answer or "").split()).lower()

        def already_said(expression):
            inner = re.sub(r'^\s*\w+\s*\((.*)\)\s*$', r'\1', expression)
            return any(" ".join(form.split()).lower() in flat
                       for form in (expression, inner))

        lines = [f"- {name} = {expression}" for name, expression in definitions
                 if not already_said(expression)]
        if lines:
            notes.append("**How this was calculated:**\n" + "\n".join(lines))
        if not notes:
            return answer
        return f"{answer}\n\n" + "\n\n".join(notes)

    def _format_sql_response(self, raw_response: str, question: str) -> str:
        """
        Format a raw SQL response into a proper, contextual answer with conversational tone and follow-up suggestions.
        
        Args:
            raw_response: The raw response from the SQL agent
            question: The original user question
            
        Returns:
            A properly formatted response with context, explanation, and follow-up questions
        """
        # Same rule as above: rephrase what came back, do not extend it.
        enhanced_prompt = f"""
        The user asked: "{question}"

        The data result is: "{raw_response}"

        TASK: Rewrite the data result as a clear, readable answer.

        RULES:
        - ONLY state facts present in the data result above. Do NOT invent or fabricate any information.
        - Give a direct answer in 1-2 sentences first.
        - If there are multiple data points, list them under "Key Details:" using bullet points.
        - Round numbers to whole numbers where appropriate.
        - Do NOT add sections like "Why This Matters", "Insights", or "Recommendations".
        - Do NOT invent statistics, trends, or context not in the result.
        - If the result is empty, say no matching data was found.
        - Keep it concise and factual.

        Optionally, suggest 1-2 follow-up questions the user could ask about their data under "Explore Further:".
        """
        
        try:
            enhanced_response = content_of(self.llm.invoke(enhanced_prompt))
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
        logger.debug("🧹 === PROCESSING JUNK DETECTION REQUEST ===")
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
                response_content = content_of(analysis_response)
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
                response += """🚫 **Sample Flagged Responses:**
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
            result_text = content_of(response)
            
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
