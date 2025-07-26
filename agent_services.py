import uuid
import os
import subprocess
import matplotlib.pyplot as plt
import json
import pandas as pd
import re
import logging
import settings
from langchain_community.agent_toolkits.sql.base import create_sql_agent
from langchain.agents.agent_types import AgentType
from langchain_community.agent_toolkits.sql.toolkit import SQLDatabaseToolkit
from langchain_community.tools.sql_database.tool import QuerySQLDataBaseTool
from langchain.memory import ConversationBufferMemory
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
        self.memory = ConversationBufferMemory(return_messages=True)
        self.inferred_context = None
        self.data_summary = None
        self.analysis_results = []
        self.visualizations = []
        self.data_handler = None

    def initialize_agents(self, data_handler_instance):
        self.data_handler = data_handler_instance
        db_sqlalchemy = self.data_handler.get_db_sqlalchemy_object()

        if db_sqlalchemy and self.llm:
            toolkit = CustomSQLDatabaseToolkit(db=db_sqlalchemy, llm=self.llm)
            
            # Create a custom system message for better responses
            system_message = """You are a helpful data analysis assistant. When answering questions about data:

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

Remember: Your goal is to help users understand their data, not just return raw values. Always provide the full context needed to understand the answer."""
            
            self.agent_executor = create_sql_agent(
                llm=self.llm,
                toolkit=toolkit,
                handle_parsing_errors=True,
                verbose=True,
                agent_type=AgentType.ZERO_SHOT_REACT_DESCRIPTION,
                memory=self.memory,
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
        self.memory.clear()

    def reset_state(self):
        self.memory.clear()
        self.inferred_context = None
        self.data_summary = None
        self.analysis_results = []
        self.visualizations = []
        self.operation_cancelled_flag = False # Critical: reset cancellation flag

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

    def generate_comprehensive_data_summary(self):
        if self.operation_cancelled_flag: return "Operation was canceled by user."
        if self.agent_executor is None or self.data_handler is None or self.data_handler.get_db_sqlalchemy_object() is None:
            return "Data or agent not loaded yet for summary generation."

        column_mapping = self.data_handler.get_column_mapping()
        if column_mapping is None:
            return "Column mapping not available for summary generation."

        try:
            summary_prompt = f"""
            Provide a comprehensive summary of the 'data' table in plain text format (NO markdown formatting). Follow these guidelines:

            1. Use clear section headers with emojis (e.g., "📊 Dataset Overview", "📋 Column Details")
            2. Use bullet points (- ) for lists
            3. Use plain text emphasis for important terms and numbers (no ** or __)
            4. Add line breaks between sections for readability
            5. Include emojis at the start of main sections for visual appeal
            6. Write in a clear, professional tone without any markdown syntax

            Cover these sections:

            📊 Dataset Overview
            - Data type and domain
            - Row/column count
            - Time range covered
            
            📋 Column Details
            - List key columns with their types
            - For important columns:
              - Number of unique values
              - Missing data percentage
              - Basic statistics
            
            🔍 Key Insights
            - 3 main patterns or relationships
            - Potential business questions
            
            ⚡ Data Quality
            - Completeness assessment
            - Major limitations
            - Duplications check
            
            📈 Recommended Analyses
            - 2-3 suggested next steps
            - Potential visualizations

            Use original column names and include specific metrics where relevant.
            Make the response visually appealing and easy to read in plain text format.

            Column name mapping:
            {json.dumps(column_mapping, indent=2)}
            """
            if self.operation_cancelled_flag: return "Operation was canceled by user."
            comprehensive_summary = self.agent_executor.invoke({"input": summary_prompt})["output"]
            if self.operation_cancelled_flag: return "Operation was canceled by user."

            # Strip markdown formatting if present
            comprehensive_summary = self._strip_markdown(comprehensive_summary)

            self.inferred_context = comprehensive_summary
            self.data_summary = comprehensive_summary

            return comprehensive_summary
        except Exception as e:
            return f"Error generating comprehensive summary: {str(e)}"

    def _strip_markdown(self, text):
        """Strip markdown formatting from text while preserving structure and readability."""
        if not text:
            return text
        
        # Remove markdown headers (##, ###, etc.)
        text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
        
        # Remove bold formatting (**text** or __text__)
        text = re.sub(r'\*\*(.*?)\*\*', r'\1', text)
        text = re.sub(r'__(.*?)__', r'\1', text)
        
        # Remove italic formatting (*text* or _text_)
        text = re.sub(r'\*(.*?)\*', r'\1', text)
        text = re.sub(r'_(.*?)_', r'\1', text)
        
        # Remove code formatting (`text`)
        text = re.sub(r'`(.*?)`', r'\1', text)
        
        # Remove table formatting (| Header | Header |)
        text = re.sub(r'^\|.*\|$', '', text, flags=re.MULTILINE)
        text = re.sub(r'^\|[-:\s|]+\|$', '', text, flags=re.MULTILINE)
        
        # Remove link formatting [text](url)
        text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
        
        # Clean up extra whitespace
        text = re.sub(r'\n\s*\n\s*\n', '\n\n', text)
        text = text.strip()
        
        return text

    def generate_pandas_code(self, question, query_category):
        """Generate pandas code using LLM based on query and category."""
        logger.debug(f"Entering generate_pandas_code with question: {question}, category: {query_category}")
        
        if self.operation_cancelled_flag:
            logger.info("Operation cancelled flag detected in generate_pandas_code")
            return None, "Operation was canceled by user."
        
        if self.data_handler.get_df() is None:
            logger.error("No DataFrame available in data_handler")
            return None, "No data loaded to process."

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
                    return None, "Operation was canceled by user."
                response = self.llm.invoke(prompt).content.strip()
                if self.operation_cancelled_flag: 
                    return None, "Operation was canceled by user."

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
            return None, "Operation was canceled by user."
        
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
                return None, "Operation was canceled by user."
            
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

    def categorize_query(self, question: str) -> str:
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

        # --- LLM-based categorization first ---
        valid_categories = [
            'SPECIFIC_DATA', 'GENERAL', 'TRANSFORMATION', 'VISUALIZATION', 
            'TRANSLATION', 'ANALYSIS', 'MISSING_VALUES'
        ]
        
        try:
            llm_prompt = f"""
You are an expert data assistant. Categorize the following user query as one of: {', '.join(valid_categories)}.

Query: "{question}"

Guidelines for categorization:
- SPECIFIC_DATA: Queries asking about specific data points, counts, rankings, or data context/summary (e.g., "what is this data about", "data summary", "how many", "which has the most", "data context")
- GENERAL: General questions about data science concepts, not about the current dataset
- VISUALIZATION: Requests for charts, graphs, plots, or visual representations
- TRANSFORMATION: Requests to modify, clean, filter, or transform the data
- TRANSLATION: Requests to translate data content
- ANALYSIS: Requests for statistical analysis, correlations, patterns
- MISSING_VALUES: Queries about null/empty values

Only output the category name, nothing else.
"""
            llm_response = self.llm.invoke(llm_prompt)
            category = llm_response.content.strip().upper()
            if category in valid_categories:
                logger.info(f"LLM categorized query as: {category}")
                return category
            else:
                logger.info(f"LLM categorization uncertain or invalid ('{category}'), falling back to pattern-based categorization.")
        except Exception as e:
            logger.error(f"LLM categorization failed: {str(e)}. Falling back to pattern-based categorization.")

        # --- Pattern-based fallback ---
        # First check for spreadsheet formatting commands
        if any(keyword in question_lower for keyword in [
            'bold', 'italic', 'underline', 'cell format', 'make cell', 'set cell',
            'font color', 'background color', 'cell color', 'highlight'
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
                return "TRANSFORMATION"
                
        # Check for question pattern matches
        for pattern in duplicate_patterns:
            if re.search(pattern, question_lower):
                logger.debug(f"🔍 Detected duplicate removal pattern: '{pattern}' in query: '{question_lower}'")
                return "TRANSFORMATION"
        
        # Check for other data transformation requests
        if any(keyword in question_lower for keyword in [
            'filter', 'sort', 'group', 'aggregate', 'pivot', 'transform',
            'clean', 'merge', 'join', 'split', 'convert', 'format data',
            'normalize', 'fill missing'
        ]):
            return "TRANSFORMATION"
            
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

    def process_spreadsheet_command(self, question: str) -> str:
        """Process spreadsheet formatting commands and return Luckysheet API calls or formulas"""
        if not self.llm:
            return "LLM not available for processing spreadsheet commands."

        # --- Formula Detection and Prompt ---
        formula_keywords = [
            "formula", "sum", "average", "vlookup", "if(", "count", "min", "max", "lookup", "match", "index", "concatenate", "concat", "split", "left(", "right(", "mid(", "total", "add up", "subtract", "divide", "multiply"
        ]
        if any(word in question.lower() for word in formula_keywords):
            # Enhanced prompt with data-aware analysis
            prompt = f'''
You are an expert spreadsheet assistant. Given a user's natural language request, generate the correct spreadsheet formula for the specified cell.

CRITICAL: When dealing with text extraction (like extracting first word, splitting text, etc.), you MUST analyze the actual data structure to determine the correct delimiter. DO NOT assume spaces are the separator.

- Use Excel/Google Sheets formula syntax (e.g., =SUM(B1:B5)).
- Do NOT include any explanation, just output the formula.
- If the user specifies a cell, generate the formula for that cell.
- If the user says "sum all values above", assume the cell is e.g. B6 and sum B1:B5.
- If the user says "vlookup the name in A2 from the table in D:F", generate the correct VLOOKUP formula.
- If the user says "average of column C", generate =AVERAGE(C:C).
- If the user says "if value in B2 is greater than 10, show 'High', else 'Low'", generate =IF(B2>10, "High", "Low").
- If the user says "count all non-empty cells in column A", generate =COUNTA(A:A).
- If the user says "sum values in C2 to C10", generate =SUM(C2:C10).
- If the user says "find the maximum in range D1:D20", generate =MAX(D1:D20).

FOR TEXT EXTRACTION (extracting first word, splitting text, etc.):
- First analyze the data to determine the actual delimiter (could be space, colon, comma, semicolon, pipe, etc.)
- For "extract first word" from data like "windows:mac:linux", use =LEFT(G2,FIND(":",G2)-1) NOT =LEFT(G2,FIND(" ",G2)-1)
- For "extract first word" from data like "apple,orange,banana", use =LEFT(G2,FIND(",",G2)-1)
- For "extract first word" from data like "hello world test", use =LEFT(G2,FIND(" ",G2)-1)
- Handle cases where delimiter might not exist with IFERROR: =IFERROR(LEFT(G2,FIND(":",G2)-1),G2)

USER REQUEST: {question}

ONLY output the formula, nothing else.
'''
            try:
                response = self.llm.invoke(prompt)
                formula = response.content.strip()
                logger.info(f"Generated formula: {formula}")
                return formula
            except Exception as e:
                logger.error(f"Error generating formula: {str(e)}")
                return f"Error processing formula request: {str(e)}"

        # --- Existing formatting/width logic below ---
        # Check for autofit command first
        if any(phrase in question.lower() for phrase in ["autofit", "auto fit", "fit columns", "fit all columns"]):
            return "luckysheet.autoFitColumns()"
        
        # Check for column width adjustment commands
        column_width_match = re.search(r'(?:make|set|adjust)\s+column\s+([A-Za-z]+)\s+(wider|narrower|wide|narrow)', question.lower())
        if column_width_match:
            column_letter = column_width_match.group(1).upper()
            width_action = column_width_match.group(2)
            
            # Convert column letter to index (0-based)
            column_index = ord(column_letter) - 65  # A=0, B=1, etc.
            
            # Determine width based on action
            width = 200 if width_action in ["wider", "wide"] else 100
            
            # Use double quotes for JSON compatibility
            json_obj = {str(column_index): width}
            return f'luckysheet.setColumnWidth({json.dumps(json_obj)})'
            
        prompt = f"""
        You are a spreadsheet expert who translates natural language commands into Luckysheet API calls.
        
        USER COMMAND: {question}
        
        Analyze the command and determine:
        1. Which cell(s) to modify (e.g., A1, B5:C7)
        2. What formatting or action to apply (e.g., bold, italic, color, width)
        
        Then provide ONLY the exact Luckysheet API call needed to execute this command.
        
        IMPORTANT: Use DOUBLE QUOTES for all strings and JSON properties, not single quotes, to ensure JSON compatibility.
        
        Available Luckysheet API methods:
        - For bold: luckysheet.setCellFormat(row, column, "bl", 1)
        - For italic: luckysheet.setCellFormat(row, column, "it", 1)
        - For underline: luckysheet.setCellFormat(row, column, "ul", 1)
        - For background color: luckysheet.setCellFormat(row, column, "bg", "colorValue")
        - For font color: luckysheet.setCellFormat(row, column, "fc", "colorValue")
        - For column width: luckysheet.setColumnWidth({{"columnIndex": width}})
        - For auto-fitting columns: luckysheet.autoFitColumns()
        
        Color values should be standard CSS color names (e.g., "blue", "red", "green") or hex codes.
        Column indices are 0-based (A=0, B=1, etc.)
        
        Example commands and responses:
        Q: Make cell A1 bold
        A: luckysheet.setCellFormat(0, 0, "bl", 1)
        
        Q: Set background color of B2 to blue
        A: luckysheet.setCellFormat(1, 1, "bg", "blue")
        
        Q: Change font color of C3 to red
        A: luckysheet.setCellFormat(2, 2, "fc", "red")
        
        Q: Make cell D4 underlined
        A: luckysheet.setCellFormat(3, 3, "ul", 1)
        
        Q: Make column B wider
        A: luckysheet.setColumnWidth({{"1": 200}})
        
        Q: Make column C narrow
        A: luckysheet.setColumnWidth({{"2": 100}})
        
        Q: Auto-fit all columns
        A: luckysheet.autoFitColumns()
        
        Respond with ONLY the API call, no additional text or explanation.
        """
        
        try:
            response = self.llm.invoke(prompt)
            api_call = response.content.strip()
            
            # Ensure column width commands use proper JSON format
            if "setColumnWidth" in api_call:
                # Look for patterns like {1: 200} and convert to {"1": 200}
                api_call = re.sub(r'\{(\d+):\s*(\d+)\}', r'{"\1": \2}', api_call)
            
            # Replace any remaining single quotes with double quotes for JSON compatibility
            api_call = api_call.replace("'", '"')
            
            logger.info(f"Generated Luckysheet API call: {api_call}")
            return api_call
            
        except Exception as e:
            logger.error(f"Error generating Luckysheet API call: {str(e)}")
            return f"Error processing spreadsheet command: {str(e)}"

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
            return f"I encountered an error while processing missing values: {str(e)}"

    def process_non_visualization_query(self, question: str, query_category: str, is_speech: bool = False) -> str:
        """Process non-visualization queries with improved error handling."""
        logger.debug(f"🔧 === PROCESS NON-VISUALIZATION QUERY ===")
        logger.debug(f"💬 Question: {question}")
        logger.debug(f"📂 Category: {query_category}")
        
        if self.operation_cancelled_flag:
            return "Operation was canceled by user."

        # Add user message to memory
        self.memory.chat_memory.add_user_message(question)

        # Handle speech confirmation if needed
        if is_speech and self.speech_util:
            confirmation = self.generate_confirmation_message(question)
            self.speech_util.text_to_speech(confirmation)
            print(confirmation)
            if self.operation_cancelled_flag:
                return "Operation was canceled by user."

        # Get current dataframe
        current_df = self.data_handler.get_df() if self.data_handler else None

        try:
            # Missing values are now handled in main process_query - no duplicate handling needed here

            # Process based on query category
            if query_category == 'SPECIFIC_DATA':
                if self.data_handler is None or self.data_handler.get_db_sqlalchemy_object() is None:
                    return "Database not available. Please load data first."
                
                if self.operation_cancelled_flag:
                    return "Operation was canceled by user."

                if any(phrase in question.lower() for phrase in ["data context", "data about", "data summary", "summary of data"]):
                    comprehensive_summary = self.generate_comprehensive_data_summary()
                    if self.operation_cancelled_flag:
                        return "Operation was canceled by user."
                    
                    self.memory.chat_memory.add_ai_message(comprehensive_summary)
                    self.analysis_results.append({"question": question, "answer": comprehensive_summary})
                    return comprehensive_summary

                # Use direct SQL execution to avoid parsing errors
                try:
                    logger.debug("🔧 Using direct SQL execution for SPECIFIC_DATA query...")
                    response = self._execute_sql_query_directly(question)
                    logger.debug(f"✅ Direct SQL execution completed: {response}")
                    
                    # Add the response to memory
                    self.memory.chat_memory.add_ai_message(response)
                    return response
                    
                except Exception as sql_error:
                    logger.error(f"❌ Direct SQL execution error: {str(sql_error)}")
                    return "I encountered an issue processing your data query. Please try rephrasing your question in a simpler way."

            elif query_category == 'GENERAL_DATA_SCIENCE':
                if self.operation_cancelled_flag:
                    return "Operation was canceled by user."

                data_science_prompt = f"As an expert in data science, answer the following question concisely, focusing on key concepts and practical advice. If the question is too broad, provide a high-level overview and suggest ways to narrow it down. Do not exceed 4-5 sentences. Question: {question}"
                response_content = self.llm.invoke(data_science_prompt)
                response = response_content.content.strip()

                if self.operation_cancelled_flag:
                    return "Operation was canceled by user."

                return response

            elif query_category == "TRANSFORMATION":
                # Handle duplicate removal specifically
                if any(phrase in question.lower() for phrase in [
                    'remove duplicate', 'drop duplicate', 'deduplicate', 'deduplication',
                    'delete duplicate', 'get rid of duplicate', 'eliminate duplicate', 
                    'unique rows', 'remove duplicates', 'drop duplicates'
                ]):
                    logger.info("Processing as duplicate removal request within process_non_visualization_query")
                    print("🧹 === PROCESSING DUPLICATE REMOVAL REQUEST (in non-viz) ===")
                    print(f"💬 Query: {question}")
                    
                    if current_df is not None:
                        print(f"📊 Initial DataFrame shape: {current_df.shape}")
                        response = self._process_duplicate_removal(question, current_df)
                        updated_df = self.data_handler.get_df()
                        if updated_df is not None:
                            print(f"📊 Updated DataFrame shape: {updated_df.shape}")
                            print(f"🧹 Rows removed: {len(current_df) - len(updated_df)}")
                        return response
                    else:
                        return "No data loaded for duplicate removal."
                else:
                    # Other transformation requests handled with generated code
                    if self.operation_cancelled_flag:
                        return "Operation was canceled by user."

                    if current_df is None:
                        return "No data loaded for processing."

                    code, error = self.generate_pandas_code(question, query_category)
                    if self.operation_cancelled_flag:
                        return "Operation was canceled by user."

                    if error:
                        return error

                    modified_df, exec_message = self.safe_execute_pandas_code(code, query_category)
                    if self.operation_cancelled_flag:
                        return "Operation was canceled by user."

                    if isinstance(modified_df, pd.DataFrame):
                        self.data_handler.update_df_and_db(modified_df)
                        return f"Data transformation successful. The dataset now contains {len(modified_df)} rows."
                    else:
                        return exec_message or "Failed to transform data after attempts."

            elif query_category in ['DATA_CLEANING', 'FILTER_DATA']:
                if self.operation_cancelled_flag:
                    return "Operation was canceled by user."

                if current_df is None:
                    return "No data loaded for processing."

                code, error = self.generate_pandas_code(question, query_category)
                if self.operation_cancelled_flag:
                    return "Operation was canceled by user."

                if error:
                    return error

                modified_df, exec_message = self.safe_execute_pandas_code(code, query_category)
                if self.operation_cancelled_flag:
                    return "Operation was canceled by user."

                if isinstance(modified_df, pd.DataFrame):
                    self.data_handler.update_df_and_db(modified_df)
                    return f"Data {query_category.lower().replace('_data', '')} successful. The dataset now contains {len(modified_df)} rows."
                else:
                    return exec_message or f"Failed to {query_category.lower().replace('_data', '')} data after attempts."

            elif query_category == 'DATA_EXPORT':
                if self.operation_cancelled_flag:
                    return "Operation was canceled by user."

                if current_df is None:
                    return "No data loaded for export."

                file_format_match = re.search(r'(csv|excel|json|parquet|pickle)', question.lower())
                file_format = file_format_match.group(1) if file_format_match else "csv"
                return self.data_handler.export_data(file_format)

            elif query_category == 'TRANSLATION':
                if self.operation_cancelled_flag:
                    return "Operation was canceled by user."

                if current_df is None:
                    return "No data loaded for translation."

                # Process translation request
                try:
                    logger.debug("🌐 Processing translation request...")
                    translation_result = self._process_translation_request(question, current_df)
                    logger.debug(f"✅ Translation completed: {translation_result}")
                    return translation_result
                    
                except Exception as translation_error:
                    logger.error(f"❌ Translation error: {str(translation_error)}")
                    return f"I encountered an issue processing your translation request: {str(translation_error)}"

            else:  # NON_DATA
                if self.operation_cancelled_flag:
                    return "Operation was canceled by user."

                steering_prompt = f"User asked: \"{question}\"\nThis is unrelated to data analysis. Gently remind them this is a data assistant, suggest relevant questions. Concise, friendly, 2-3 sentences."
                response_content = self.llm.invoke(steering_prompt)
                return response_content.content.strip()

        except Exception as e:
            logger.error(f"❌ Error processing query: {str(e)}")
            logger.exception("💥 Full exception details:")
            return f"I apologize, but I encountered an issue processing your query. Please try rephrasing your question or ask something more specific about your data."

    def process_query(self, question: str, is_speech: bool = False) -> Tuple[str, Optional[Dict[str, str]]]:
        """Process the user's query and return a response."""
        try:
            if self.operation_cancelled_flag:
                return "Operation was cancelled.", None
                
            if not question:
                return "Please provide a question or command.", None
                
            # Log the question for debugging
            logger.info(f"Processing query: {question}")
            
            # Get query category
            query_category = self.categorize_query(question)
            logger.info(f"Query categorized as: {query_category}")
            
            # Handle missing values queries first
            if query_category == "MISSING_VALUES":
                logger.info("Processing as missing values request")
                df = self.data_handler.get_df()
                if df is not None:
                    response = self._process_missing_values(question, df)
                    return response, None
                else:
                    return "No data loaded for missing values analysis.", None
            
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
                    return "No data loaded for duplicate removal.", None
                
            # For other queries, use the category-based approach
            query_category = self.categorize_query(question)
            logger.info(f"Query categorized as: {query_category}")
            
            # Process based on category
            if query_category == "VISUALIZATION":
                # Handle visualization requests
                logger.info("Processing as visualization request")
                response, visualization_data = self._process_visualization_request(question)
                
                # Debug logging for visualization response
                logger.debug(f"Visualization response: {response}")
                logger.debug(f"Visualization data: {visualization_data}")
                
                return response, visualization_data
            elif query_category == "TRANSLATION":
                # Handle translation requests
                logger.info("Processing as translation request")
                df = self.data_handler.get_df()
                if df is not None:
                    response = self._process_translation_request(question, df)
                    
                    # Return without any metadata to avoid frontend visualization processing
                    return response, None
                else:
                    return "No data loaded for translation.", None
            elif query_category == "TRANSFORMATION":
                # Check again for duplicate patterns inside the TRANSFORMATION category
                if is_duplicate_removal or "duplicate" in question_lower:
                    # Handle duplicate removal requests
                    logger.info("Processing as duplicate removal request within TRANSFORMATION category")
                    df = self.data_handler.get_df()
                    if df is not None:
                        response = self._process_duplicate_removal(question, df)
                        
                        # Check if the response indicates data modification
                        data_modified = False
                        if response.startswith("DATA_MODIFIED:"):
                            data_modified = True
                            response = response.replace("DATA_MODIFIED:", "", 1).strip()
                            
                        # Return without any metadata to avoid frontend visualization processing
                        return response, None
                    else:
                        return "No data loaded for duplicate removal.", None
                else:
                    # Handle other transformation requests
                    response = self.process_non_visualization_query(question, query_category, is_speech)
                    
                    # Return without any metadata to avoid frontend visualization processing
                    return response, None
            else:
                # Double-check for duplicate-related queries that might have been miscategorized
                if "duplicate" in question_lower:
                    logger.info("Potential duplicate removal query detected in GENERAL category, recategorizing")
                    df = self.data_handler.get_df()
                    if df is not None:
                        response = self._process_duplicate_removal(question, df)
                        
                        # Check if the response indicates data modification
                        data_modified = False
                        if response.startswith("DATA_MODIFIED:"):
                            data_modified = True
                            response = response.replace("DATA_MODIFIED:", "", 1).strip()
                            
                        # Return without any metadata to avoid frontend visualization processing
                        return response, None
                    else:
                        return "No data loaded for duplicate removal.", None
                
                # Handle other types of queries
                logger.info(f"Processing as {query_category} request")
                response = self.process_non_visualization_query(question, query_category, is_speech)
                return response, None
        except Exception as e:
            logger.error(f"Error processing query: {str(e)}")
            logger.exception("Full exception details:")
            return f"I encountered an error while processing your request: {str(e)}", None

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
            return "Operation was canceled by user.", None
            
        if not self.data_handler or self.data_handler.get_df() is None:
            return "No data loaded for visualization.", None
            
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
        import re
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
                import json, re
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
            import re
            sql_query = re.sub(r'^```(?:sql)?\s*', '', sql_query, flags=re.IGNORECASE | re.MULTILINE)
            sql_query = re.sub(r'```$', '', sql_query, flags=re.MULTILINE)
            sql_query = sql_query.strip()
            logger.debug(f"🔍 Generated SQL Query (pre-rewrite): {sql_query}")
            # --- Post-process to force table name to 'data' ---
            import re
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
                
                # Since we can't get structured data this way, let's use the agent executor
                try:
                    enhanced_question = f"""
                    Answer this question about the data: "{question}"
                    
                    IMPORTANT: When querying the data, include relevant context columns such as:
                    - For games: name, developer, publisher, release_date, positive_ratings, negative_ratings
                    - For ratings: both positive and negative ratings for comparison
                    - For sales/owners: include price and other relevant metrics
                    
                    Provide a complete answer that includes all relevant context from the data.
                    """
                    agent_response = self.agent_executor.invoke({"input": enhanced_question})["output"]
                    # Format the response to ensure it's contextual and helpful
                    return self._format_sql_response(agent_response, question)
                except Exception as agent_error:
                    logger.error(f"Error using agent executor: {str(agent_error)}")
                    return f"I encountered an error trying to query the data using the agent: {str(agent_error)}"
                
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
                    # Fall back to using the agent executor
                    enhanced_question = f"""
                    Answer this question about the data: "{question}"
                    
                    IMPORTANT: When querying the data, include relevant context columns such as:
                    - For games: name, developer, publisher, release_date, positive_ratings, negative_ratings
                    - For ratings: both positive and negative ratings for comparison
                    - For sales/owners: include price and other relevant metrics
                    
                    Provide a complete answer that includes all relevant context from the data.
                    """
                    agent_response = self.agent_executor.invoke({"input": enhanced_question})["output"]
                    # Format the response to ensure it's contextual and helpful
                    return self._format_sql_response(agent_response, question)
            
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
            
            # Fall back to using the agent executor directly
            try:
                logger.debug("Falling back to using the agent executor directly")
                enhanced_question = f"""
                Answer this question about the data: "{question}"
                
                IMPORTANT: When querying the data, include relevant context columns such as:
                - For games: name, developer, publisher, release_date, positive_ratings, negative_ratings
                - For ratings: both positive and negative ratings for comparison
                - For sales/owners: include price and other relevant metrics
                
                Provide a complete answer that includes all relevant context from the data.
                """
                agent_response = self.agent_executor.invoke({"input": enhanced_question})["output"]
                # Format the response to ensure it's contextual and helpful
                return self._format_sql_response(agent_response, question)
            except Exception as agent_error:
                logger.error(f"Error using agent executor fallback: {str(agent_error)}")
                return f"I encountered an error trying to query the data. Please try rephrasing your question."

    def _format_sql_response(self, raw_response: str, question: str) -> str:
        """
        Format a raw SQL response into a proper, contextual answer.
        
        Args:
            raw_response: The raw response from the SQL agent
            question: The original user question
            
        Returns:
            A properly formatted response with context and explanation
        """
        # If the response is already good (more than just a single word/value), return it
        if len(raw_response.strip()) > 50 and not raw_response.strip().isupper():
            return raw_response
        
        # If it's just a single value or very short response, enhance it
        enhanced_prompt = f"""
        The user asked: "{question}"
        
        The raw data result is: "{raw_response}"
        
        Please provide a complete, contextual answer that:
        1. Directly answers the user's question
        2. Explains what the result means
        3. Provides relevant context and insights from the data
        4. Uses proper sentences and formatting
        5. Makes the response informative and helpful
        6. If the data includes additional context (like developer, publisher, ratings, etc.), incorporate that information
        7. Provide insights about what the data suggests or implies
        
        Do not mention that you're processing raw data or SQL results.
        Just provide a natural, helpful answer that gives the user a complete understanding of the data.
        """
        
        try:
            enhanced_response = self.llm.invoke(enhanced_prompt).content.strip()
            return enhanced_response
        except Exception as e:
            logger.error(f"Error enhancing SQL response: {str(e)}")
            # Fallback to a basic enhancement
            return f"Based on the data, {raw_response}. This represents the result for your query: '{question}'."

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