"""
KB Chart Generation Helper

This module provides chart generation capabilities for Knowledge Base queries,
bridging between SQL results and the existing chart generation infrastructure.

Author: EDI.ai Team
Date: 2025-12-31
"""

import os
import re
import uuid
import logging
import pandas as pd
import io
from typing import Dict, Any, Optional, Tuple
import matplotlib.pyplot as plt
import numpy as np

# Optional Plotly support
try:
    import plotly.express as px
    import plotly.graph_objects as go
    PLOTLY_AVAILABLE = True
except ImportError:
    PLOTLY_AVAILABLE = False

# Setup logging
logger = logging.getLogger(__name__)

# Chart directory
CHARTS_DIR = os.path.join(os.path.dirname(__file__), "static", "visualizations")


class KBChartGenerator:
    """Generate visualizations from Knowledge Base SQL query results."""

    def __init__(self, llm=None):
        """
        Initialize chart generator.

        Args:
            llm: Language model instance for code generation (from settings)
        """
        self.llm = llm
        self.charts_dir = CHARTS_DIR

        # Ensure charts directory exists
        os.makedirs(self.charts_dir, exist_ok=True)
        logger.info(f"KB Chart Generator initialized. Charts dir: {self.charts_dir}")

    def generate_chart_from_sql_results(
        self,
        query: str,
        sql_results: str,
        kb_id: str,
        suggested_chart: str = 'auto'
    ) -> Optional[Dict[str, Any]]:
        """
        Generate visualization from SQL query results.

        Args:
            query: User's natural language query
            sql_results: SQL query results as formatted string
            kb_id: Knowledge base ID
            suggested_chart: Suggested chart type ('auto', 'bar', 'line', 'pie')

        Returns:
            {
                'type': 'matplotlib_figure' | 'plotly_html',
                'path': '/path/to/viz_xxxxx.png',
                'filename': 'viz_xxxxx.png'
            }
        """
        try:
            logger.info(f"Generating chart for KB {kb_id}, query: {query}")

            # Parse SQL results to DataFrame
            df = self._parse_sql_results_to_dataframe(sql_results)

            if df.empty:
                logger.warning("Empty DataFrame, skipping visualization")
                return None

            logger.info(f"Parsed DataFrame: {df.shape[0]} rows, {df.shape[1]} columns")
            logger.debug(f"Columns: {df.columns.tolist()}")

            # Create chart generation prompt
            prompt = self._create_chart_prompt(query, df, suggested_chart)

            # Generate chart code via LLM
            code = self._generate_chart_code(prompt, df)

            if not code:
                logger.error("Failed to generate chart code")
                return None

            logger.debug(f"Generated code length: {len(code)}")

            # Execute code and save figure
            visualization = self._execute_chart_code(code, df)

            if visualization:
                logger.info(f"Successfully generated {visualization['type']}: {visualization['filename']}")

            return visualization

        except Exception as e:
            logger.error(f"Chart generation failed: {e}")
            logger.exception("Full traceback:")
            return None

    def _parse_sql_results_to_dataframe(self, sql_results: str) -> pd.DataFrame:
        """
        Convert SQL result string to pandas DataFrame.

        Handles multiple formats:
        - Markdown table format
        - CSV-like format
        - JSON format
        - Already formatted table strings

        Args:
            sql_results: SQL results as string

        Returns:
            pandas DataFrame
        """
        try:
            # Try JSON format first
            if sql_results.strip().startswith('[') or sql_results.strip().startswith('{'):
                import json
                data = json.loads(sql_results)
                return pd.DataFrame(data)

            # Try CSV format
            if ',' in sql_results or '\t' in sql_results:
                try:
                    df = pd.read_csv(io.StringIO(sql_results))
                    if not df.empty:
                        return df
                except:
                    pass

            # Try markdown table format (most common from kb_rag_engine.py)
            # Format: "| col1 | col2 |\n|------|------|\n| val1 | val2 |"
            if '|' in sql_results:
                lines = [line.strip() for line in sql_results.split('\n') if line.strip()]

                # Find header line
                header_line = None
                data_lines = []

                for i, line in enumerate(lines):
                    if line.startswith('|') and line.endswith('|'):
                        parts = [p.strip() for p in line.split('|')[1:-1]]

                        # Skip separator lines (like |-----|-----|)
                        if all('-' in p or not p for p in parts):
                            continue

                        if header_line is None:
                            header_line = parts
                        else:
                            data_lines.append(parts)

                if header_line and data_lines:
                    df = pd.DataFrame(data_lines, columns=header_line)

                    # Try to convert numeric columns
                    for col in df.columns:
                        try:
                            df[col] = pd.to_numeric(df[col])
                        except:
                            pass

                    return df

            # Fallback: try to parse as space-separated or structured text
            logger.warning(f"Could not parse SQL results with known formats. Attempting generic parsing.")
            return pd.DataFrame()

        except Exception as e:
            logger.error(f"Error parsing SQL results to DataFrame: {e}")
            return pd.DataFrame()

    def _create_chart_prompt(
        self,
        query: str,
        df: pd.DataFrame,
        suggested_chart: str = 'auto'
    ) -> str:
        """
        Generate LLM prompt for chart creation.

        Args:
            query: User's natural language query
            df: DataFrame to visualize
            suggested_chart: Suggested chart type

        Returns:
            Prompt string for LLM
        """
        plotly_instruction = ""
        if PLOTLY_AVAILABLE:
            plotly_instruction = """
    - For 3D or interactive visualizations, use `plotly.express as px`.
      - Create the figure: `fig = px.scatter_3d(df, x='col1', y='col2', z='col3')`
      - Save to HTML: `chart_filename = f"viz_{uuid.uuid4().hex[:8]}.html"`
      - Write file: `fig.write_html(chart_filename)`
      - Assign filename to `result`: `result = chart_filename`
    - For 2D plots, use `matplotlib.pyplot as plt` (preferred for simplicity).
"""
        else:
            plotly_instruction = """
    - Use `matplotlib.pyplot as plt` for all visualizations.
    - Create plot and assign figure: `result = plt.gcf()`
"""

        chart_hint = ""
        if suggested_chart and suggested_chart != 'auto':
            chart_hint = f"\nSuggested chart type: {suggested_chart} chart"

        prompt = f"""You are an expert data visualization specialist. Generate Python code to create a chart answering this query.

Query: "{query}"{chart_hint}

DataFrame 'df' info:
Shape: {df.shape[0]} rows, {df.shape[1]} columns
Columns: {', '.join(df.columns.tolist())}
Column types: {dict(df.dtypes.astype(str))}

First 5 rows:
{df.head().to_string()}

Instructions:
1. Generate executable Python code to create an appropriate visualization.
2. DO NOT use 'return' statements. Set results to variable 'result'.
3. For visualizations:{plotly_instruction}
4. Libraries available: pandas (pd), numpy (np), matplotlib.pyplot (plt), uuid
5. The code will execute with 'df' already loaded.
6. Use try-except to handle errors gracefully.
7. Choose chart type based on data:
   - Bar chart: comparing categories, counts
   - Line chart: trends over time, continuous data
   - Pie chart: proportions, percentages (only if <10 categories)
   - Scatter: relationships between variables
8. Add clear labels, title, and legend.
9. For matplotlib, create figure with `plt.figure(figsize=(12, 8))`

Code template:
```python
result = None
try:
    import matplotlib.pyplot as plt
    import pandas as pd
    import numpy as np

    # Create appropriate visualization
    plt.figure(figsize=(12, 8))

    # Your chart code here
    # Example: df['column'].plot(kind='bar')

    plt.title("Your Title Here")
    plt.xlabel("X Label")
    plt.ylabel("Y Label")
    plt.tight_layout()

    result = plt.gcf()  # Get current figure

except Exception as e:
    print(f"Error: {{str(e)}}")
    result = f"Error: {{str(e)}}"
```

Generate ONLY the Python code, no explanations."""

        return prompt

    def _generate_chart_code(self, prompt: str, df: pd.DataFrame) -> Optional[str]:
        """
        Generate Python chart code using LLM.

        Args:
            prompt: LLM prompt
            df: DataFrame context

        Returns:
            Python code string or None
        """
        try:
            if not self.llm:
                logger.error("No LLM instance available for code generation")
                return None

            logger.debug("Sending chart generation prompt to LLM")
            response = self.llm.invoke(prompt).content.strip()

            # Extract code from markdown blocks
            code_match = re.search(r"```(?:python)?\s*(.*?)```", response, re.DOTALL) or \
                        re.search(r"'''(?:python)?\s*(.*?)'''", response, re.DOTALL)

            if code_match:
                code = code_match.group(1).strip()

                # Filter out unnecessary imports (these are already in execution scope)
                code_lines = code.split('\n')
                filtered_lines = []
                for line in code_lines:
                    if line.strip().startswith(('import pandas', 'import numpy', 'import matplotlib')):
                        continue
                    filtered_lines.append(line)

                code = '\n'.join(filtered_lines)
                return code
            else:
                # Try to extract code without markdown blocks
                lines = response.split('\n')
                potential_code = []
                for line in lines:
                    if any(keyword in line for keyword in ['result =', 'df.', 'plt.', 'px.', 'fig']):
                        potential_code.append(line)

                if potential_code:
                    return '\n'.join(potential_code)

            logger.error("Could not extract code from LLM response")
            return None

        except Exception as e:
            logger.error(f"Error generating chart code: {e}")
            return None

    def _execute_chart_code(self, code: str, df: pd.DataFrame) -> Optional[Dict[str, Any]]:
        """
        Execute chart generation code in safe environment.

        Args:
            code: Python code to execute
            df: DataFrame to visualize

        Returns:
            Visualization object with type, path, filename
        """
        try:
            # Ensure fresh figure
            plt.close('all')

            # Validate code safety
            dangerous_patterns = [
                r'subprocess\.',
                r'eval\(',
                r'exec\(',
                r'__import__\('
            ]

            for pattern in dangerous_patterns:
                if re.search(pattern, code):
                    logger.error(f"Code contains unsafe pattern: {pattern}")
                    return None

            # Set up safe execution environment
            safe_globals = {
                'pd': pd,
                'np': np,
                'plt': plt,
                'df': df.copy(),
                'uuid': uuid,
                'print': print,
                '__builtins__': {
                    'print': print, 'len': len, 'range': range, 'dict': dict,
                    'list': list, 'set': set, 'str': str, 'int': int,
                    'float': float, 'bool': bool, 'tuple': tuple, 'zip': zip,
                    'round': round, 'sum': sum, 'min': min, 'max': max,
                    'abs': abs, 'all': all, 'any': any, 'enumerate': enumerate,
                    'Exception': Exception, 'TypeError': TypeError, 'ValueError': ValueError
                }
            }

            if PLOTLY_AVAILABLE:
                safe_globals['px'] = px
                safe_globals['go'] = go

            safe_locals = {'result': None}

            # Execute code
            logger.debug("Executing chart code")
            exec(code, safe_globals, safe_locals)

            execution_result = safe_locals.get('result')
            logger.debug(f"Execution result type: {type(execution_result)}")

            # Handle visualization results
            if isinstance(execution_result, plt.Figure):
                return self._save_matplotlib_figure(execution_result)
            elif plt.get_fignums():  # Open figures exist
                return self._save_matplotlib_figure(plt.gcf())
            elif isinstance(execution_result, str) and execution_result.endswith(".html"):
                return self._save_plotly_figure(execution_result)
            else:
                logger.warning(f"Unexpected result type: {type(execution_result)}")
                return None

        except Exception as e:
            logger.error(f"Error executing chart code: {e}")
            logger.exception("Full traceback:")
            return None

    def _save_matplotlib_figure(self, fig) -> Optional[Dict[str, Any]]:
        """
        Save matplotlib figure to file.

        Args:
            fig: Matplotlib figure object

        Returns:
            Visualization dict or None
        """
        try:
            # Configure figure
            fig.set_size_inches(12, 8)
            plt.xticks(rotation=45, ha='right')
            plt.tight_layout(pad=2.0)

            # Generate filename
            filename = f"viz_{uuid.uuid4().hex[:8]}.png"
            filepath = os.path.join(self.charts_dir, filename)

            logger.info(f"Saving matplotlib figure to: {filepath}")

            # Save figure
            fig.savefig(
                filepath,
                bbox_inches='tight',
                dpi=300,
                format='png'
            )

            plt.close(fig)

            logger.info(f"Successfully saved matplotlib figure: {filename}")

            return {
                "type": "matplotlib_figure",
                "path": filepath,
                "filename": filename
            }

        except Exception as e:
            logger.error(f"Error saving matplotlib figure: {e}")
            if fig:
                plt.close(fig)
            return None

    def _save_plotly_figure(self, html_path: str) -> Optional[Dict[str, Any]]:
        """
        Handle plotly figure (already saved as HTML by generated code).

        Args:
            html_path: Path to HTML file

        Returns:
            Visualization dict or None
        """
        try:
            # If it's just a filename, construct full path
            if not os.path.isabs(html_path):
                html_path = os.path.join(self.charts_dir, html_path)

            if not os.path.exists(html_path):
                logger.error(f"Plotly HTML file not found: {html_path}")
                return None

            filename = os.path.basename(html_path)

            logger.info(f"Plotly figure saved: {filename}")

            return {
                "type": "plotly_html",
                "path": html_path,
                "filename": filename
            }

        except Exception as e:
            logger.error(f"Error handling plotly figure: {e}")
            return None


# Convenience function for easy import
def generate_chart_from_sql_results(
    query: str,
    sql_results: str,
    kb_id: str,
    llm=None,
    suggested_chart: str = 'auto'
) -> Optional[Dict[str, Any]]:
    """
    Generate chart from SQL results (convenience function).

    Args:
        query: User's query
        sql_results: SQL query results
        kb_id: Knowledge base ID
        llm: Language model instance
        suggested_chart: Suggested chart type

    Returns:
        Visualization dict or None
    """
    generator = KBChartGenerator(llm=llm)
    return generator.generate_chart_from_sql_results(
        query, sql_results, kb_id, suggested_chart
    )
