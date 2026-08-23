"""
Query Orchestrator Service for Nested Query Processing

This service provides intelligent orchestration of compound user queries by:
1. Decomposing complex requests into atomic operations
2. Classifying operations by type and determining dependencies
3. Orchestrating sequential execution with context awareness
4. Managing state and results across multi-step operations
"""

import json
import logging
import time
import os
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
from typing import Dict, Any, List
import re

# Import Kimi via Groq using LangChain
try:
    from langchain_groq import ChatGroq
    from langchain_core.messages import HumanMessage
    from dotenv import load_dotenv
    load_dotenv()
    GROQ_API_KEY = os.getenv("NEXT_PUBLIC_GROQ_API_KEY")
    GROQ_AVAILABLE = bool(GROQ_API_KEY)
    if not GROQ_AVAILABLE:
        print("Warning: NEXT_PUBLIC_GROQ_API_KEY not found. LLM decomposition will not work.")
except ImportError:
    print("Warning: langchain-groq not installed. LLM decomposition will not work.")
    GROQ_AVAILABLE = False
    GROQ_API_KEY = None


@dataclass(frozen=True)
class ExecutionStep:
    """Simple execution step for compound queries"""
    step_id: str
    step_type: str  # "spreadsheet", "backend", "agent", "chart"
    command: str    # The actual command to execute
    description: str # Human-readable description
    depends_on: tuple = ()  # IDs of steps this depends on (tuple for hashability)
    
    def __post_init__(self):
        # Convert list to tuple for hashability
        if isinstance(self.depends_on, list):
            object.__setattr__(self, 'depends_on', tuple(self.depends_on))
    
    def get_dependencies_list(self) -> List[str]:
        """Get dependencies as list"""
        return list(self.depends_on)


@dataclass 
class StepResult:
    """Result of executing a single step"""
    step_id: str
    success: bool
    data: Any = None
    error_message: str = None
    user_message: str = None  # Human-readable result description


class WorkspaceContext:
    """Manages state and context across operations"""
    
    def __init__(self, workspace_id: str):
        self.workspace_id = workspace_id
        self.columns = {}  # column_name -> {index, type, sample_data}
        self.operation_history = []
        self.current_selection = None
        self.data_modifications = []
        self.last_updated = None
        
    @classmethod
    async def load_from_workspace(cls, workspace_id: str):
        """Load workspace context from data handler and database"""
        context = cls(workspace_id)
        
        try:
            # Import here to avoid circular imports
            from data_handler import DataHandler
            
            data_handler = DataHandler()
            
            # Try to load existing workspace data
            df = data_handler.get_df()
            if df is not None:
                # Extract column information
                context.columns = {}
                for i, col_name in enumerate(df.columns):
                    context.columns[col_name] = {
                        "index": i,
                        "type": str(df[col_name].dtype),
                        "name": col_name,
                        "sample_data": df[col_name].head(3).tolist() if not df.empty else []
                    }
                    
                # Also add letter-based column references (A, B, C, etc.)
                for i, col_name in enumerate(df.columns):
                    letter = chr(ord('A') + i) if i < 26 else f"A{chr(ord('A') + i - 26)}"
                    context.columns[letter] = context.columns[col_name].copy()
                    context.columns[letter]["letter"] = letter
                    
            context.last_updated = time.time()
            return context
            
        except Exception as e:
            logging.getLogger(__name__).warning(f"Could not load workspace context: {str(e)}")
            return context
    
    def save_to_workspace(self):
        """Save workspace context state (placeholder for future database integration)"""
        # TODO: Implement saving to database or file system
        self.last_updated = time.time()
        pass
        
    def update_columns(self, column_info: Dict[str, Any]):
        """Update column information from operation results"""
        self.columns.update(column_info)
        
    def add_step_result(self, result: StepResult):
        """Store step result and update context"""
        self.operation_history.append(result)
        # For now, we don't need complex context updates since we're using existing flows
    
    def get_context_for_steps(self) -> Dict[str, Any]:
        """Get current workspace context for step execution"""
        return {
            "workspace_id": self.workspace_id,
            "columns": self.columns,
            "current_selection": self.current_selection
        }


class QueryOrchestrator:
    """Main orchestrator for compound query processing"""

    def __init__(self):
        if GROQ_AVAILABLE:
            try:
                self.model = ChatGroq(
                    model="moonshotai/kimi-k2-instruct-0905",
                    temperature=0.4,  # Consistent with settings.py
                    groq_api_key=GROQ_API_KEY,
                    max_tokens=8192,
                )
            except Exception as e:
                print(f"Warning: Failed to initialize Kimi model via Groq: {str(e)}")
                self.model = None
        else:
            self.model = None
        self.logger = logging.getLogger(__name__)
        
    def decompose_query(self, user_query: str, workspace_context: WorkspaceContext) -> List[ExecutionStep]:
        """
        Use LLM to decompose compound query into simple execution steps
        """
        decomposition_prompt = f"""
        You are a query decomposition system for a data analysis platform.
        Break down the user's compound query into simple execution steps that use existing proven single query flows.
        
        AVAILABLE STEP TYPES:
        
        1. **"spreadsheet"** - For UI operations on the spreadsheet:
           - Sorting, basic formatting, cell operations, filters
           - Insert/delete rows/columns, basic highlighting
           - Commands should be natural language that work with existing spreadsheet processor
           - DO NOT use for conditional formatting (use manual_highlight instead)
           
        2. **"backend"** - For data analysis and modifications:
           - Remove duplicates, complex filtering, statistical analysis
           - Data transformation, SQL queries, insights
           - Commands should be natural language questions/requests
           
        3. **"agent"** - For AI-powered operations:
           - Translation, data cleaning, text analysis
           - New column creation with AI processing
           - Commands should specify the AI operation needed
           
        4. **"chart"** - For visualization generation:
           - Create charts, graphs, plots
           - Commands should describe the desired visualization
           
        5. **"manual_highlight"** - For conditional formatting and highlighting:
           - Highlight values greater than, less than, equal to, between values
           - Highlight duplicates, unique values, text contains
           - Format: "highlight [condition] [value] in [column]"
           - Examples: "highlight greater than 5000 in column M", "highlight duplicates in column A"
        
        Current workspace context:
        - Available columns: {list(workspace_context.columns.keys())}
        - Column details: {workspace_context.columns}
        
        User query: "{user_query}"
        
        DECOMPOSITION RULES:
        1. Create simple steps that use existing single query flows
        2. Each step should have a clear command that works with that step type
        3. Add dependencies only when one step must complete before another
        4. Use natural language commands that existing processors understand
        5. Keep steps atomic but practical (not over-fragmented)
        
        EXAMPLE DECOMPOSITION:
        Query: "Sort column A descending and highlight values greater than 5000 in column M"
        →
        [
          {{
            "step_id": "sort_step",
            "step_type": "spreadsheet", 
            "command": "sort column A descending",
            "description": "Sort column A in descending order",
            "depends_on": []
          }},
          {{
            "step_id": "highlight_step",
            "step_type": "manual_highlight",
            "command": "highlight greater than 5000 in column M", 
            "description": "Highlight cells in column M with values greater than 5000",
            "depends_on": ["sort_step"]
          }}
        ]
        
        EXAMPLE HYBRID DECOMPOSITION:
        Query: "Remove duplicates then create a chart of column B"
        →
        [
          {{
            "step_id": "dedupe_step",
            "step_type": "backend",
            "command": "remove duplicates",
            "description": "Remove duplicate rows from the dataset", 
            "depends_on": []
          }},
          {{
            "step_id": "chart_step", 
            "step_type": "chart",
            "command": "create bar chart of column B",
            "description": "Generate a bar chart showing column B values",
            "depends_on": ["dedupe_step"]
          }}
        ]
        
        Now decompose this user query into execution steps:
        """
        
        try:
            if not self.model:
                self.logger.error("No LLM model available for query decomposition")
                return []

            # Use LangChain invoke pattern
            response = self.model.invoke([HumanMessage(content=decomposition_prompt)])
            response_text = response.content.strip()
            
            # Extract JSON from response
            json_match = re.search(r'\[.*\]', response_text, re.DOTALL)
            if not json_match:
                raise ValueError("No JSON array found in LLM response")
                
            steps_data = json.loads(json_match.group())
            
            # Convert to ExecutionStep objects
            execution_steps = []
            for step_data in steps_data:
                depends_on = step_data.get("depends_on", [])
                execution_step = ExecutionStep(
                    step_id=step_data["step_id"],
                    step_type=step_data["step_type"],
                    command=step_data["command"],
                    description=step_data["description"],
                    depends_on=tuple(depends_on) if isinstance(depends_on, list) else depends_on
                )
                execution_steps.append(execution_step)
                
            return execution_steps
            
        except Exception as e:
            self.logger.error(f"Query decomposition failed: {str(e)}")
            return []
    
    def validate_steps(self, steps: List[ExecutionStep]) -> Tuple[bool, str]:
        """
        Validate that execution steps are valid and dependencies are satisfied
        """
        step_ids = {step.step_id for step in steps}
        
        for step in steps:
            # Check dependencies exist
            for dep_id in step.get_dependencies_list():
                if dep_id not in step_ids:
                    return False, f"Step {step.step_id} depends on non-existent step {dep_id}"
                    
            # Validate step type
            valid_types = {"spreadsheet", "backend", "agent", "chart", "report", "export", "manual_highlight"}
            if step.step_type not in valid_types:
                return False, f"Step {step.step_id} has invalid type: {step.step_type}"
                    
            # Check for circular dependencies (basic check)
            visited = set()
            def has_cycle(step_id, path):
                if step_id in path:
                    return True
                if step_id in visited:
                    return False
                visited.add(step_id)
                step = next((s for s in steps if s.step_id == step_id), None)
                if step:
                    for dep in step.get_dependencies_list():
                        if has_cycle(dep, path | {step_id}):
                            return True
                return False
            
            if has_cycle(step.step_id, set()):
                return False, f"Circular dependency detected involving step {step.step_id}"
        
        return True, "Steps valid"
    
    def create_execution_plan(self, steps: List[ExecutionStep]) -> List[List[ExecutionStep]]:
        """
        Create execution plan with steps grouped by dependency level
        Steps in same group can potentially run in parallel
        """
        if not steps:
            return []
            
        # Create dependency graph
        execution_levels = []
        remaining_steps = set(steps)
        
        while remaining_steps:
            # Find steps with no unresolved dependencies
            ready_steps = []
            for step in remaining_steps:
                dependencies_satisfied = all(
                    dep_id not in [r_step.step_id for r_step in remaining_steps] 
                    for dep_id in step.get_dependencies_list()
                )
                if dependencies_satisfied:
                    ready_steps.append(step)
            
            if not ready_steps:
                # This shouldn't happen if validation passed
                self.logger.error("No steps ready to execute - possible circular dependency")
                break
                
            execution_levels.append(ready_steps)
            for step in ready_steps:
                remaining_steps.remove(step)
        
        return execution_levels
    
    async def orchestrate_query(self, user_query: str, workspace_id: str) -> Dict[str, Any]:
        """
        Main orchestration method - decomposes query and returns execution steps
        Frontend will execute these steps using existing single query flows
        """
        try:
            # Load workspace context with actual data
            workspace_context = await WorkspaceContext.load_from_workspace(workspace_id)
            
            # Decompose query into execution steps
            self.logger.info(f"Decomposing query: {user_query}")
            execution_steps = self.decompose_query(user_query, workspace_context)
            
            if not execution_steps:
                return {
                    "success": False,
                    "error": "Could not decompose query into execution steps",
                    "steps": []
                }
            
            # Validate execution steps
            valid, validation_message = self.validate_steps(execution_steps)
            if not valid:
                return {
                    "success": False,
                    "error": f"Invalid execution plan: {validation_message}",
                    "steps": [step.__dict__ for step in execution_steps]
                }
            
            # Create execution plan (grouped by dependency levels)
            execution_plan = self.create_execution_plan(execution_steps)
            
            return {
                "success": True,
                "message": f"Generated execution plan with {len(execution_steps)} steps",
                "steps": [step.__dict__ for step in execution_steps],
                "execution_plan": [[step.__dict__ for step in level] for level in execution_plan],
                "total_steps": len(execution_steps)
            }
            
        except Exception as e:
            self.logger.error(f"Query orchestration failed: {str(e)}")
            return {
                "success": False,
                "error": f"Orchestration failed: {str(e)}"
            }


# Global orchestrator instance
_orchestrator = None

def get_orchestrator() -> QueryOrchestrator:
    """Get singleton orchestrator instance"""
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = QueryOrchestrator()
    return _orchestrator