from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Query, Request, Path
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn
import os
import sys
import json
import uuid
import time
from typing import Optional, Dict, Any, List
import pandas as pd
import numpy as np
import logging

# Add the parent directory to sys.path to import our modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import our existing modules
from data_handler import DataHandler
from agent_services import AgentServices
from report_generator import ReportGenerator
from speech_utils import SpeechUtil
import settings

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],  # Next.js development server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]  # Allow exposure of custom headers
)

# Ensure visualization directories exist
CHARTS_DIR = os.path.join(os.path.dirname(__file__), "static", "visualizations")
REPORTS_DIR = os.path.join(os.path.dirname(__file__), "generated_reports")
os.makedirs(CHARTS_DIR, exist_ok=True)
os.makedirs(REPORTS_DIR, exist_ok=True)

# Mount static directory for serving visualizations
app.mount("/static", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "static")), name="static")

# Initialize our services
data_handler = DataHandler()
speech_util = SpeechUtil(api_key=settings.AZURE_SPEECH_KEY, region=settings.AZURE_SERVICE_REGION)
agent_services = AgentServices(llm=settings.LLM, speech_util_instance=speech_util, charts_dir=CHARTS_DIR)
agent_services.initialize_agents(data_handler)
report_generator = ReportGenerator(
    data_handler=data_handler,
    agent_services_instance=agent_services
)

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# --- Request/Response Models ---
class QueryRequest(BaseModel):
    question: str
    is_speech: bool = False
    workspace_id: Optional[str] = None

class ReportRequest(BaseModel):
    format: str = "pdf"
    workspace_id: Optional[str] = None

class CancelRequest(BaseModel):
    operation_id: Optional[str] = None

class ResetRequest(BaseModel):
    workspace_id: Optional[str] = None

class ExtractColumnsRequest(BaseModel):
    selected_columns: List[str]
    sheet_name: Optional[str] = None
    workspace_id: Optional[str] = None

class SyntheticDatasetRequest(BaseModel):
    description: str
    rows: Optional[int] = 100
    columns: Optional[int] = None
    column_specs: Optional[Dict[str, str]] = None
    workspace_id: Optional[str] = None

def create_fallback_dataset(description: str, rows: int) -> Dict:
    """Create a simple fallback dataset when LLM parsing fails"""
    import random
    from datetime import datetime, timedelta
    
    # Analyze description to determine dataset type
    desc_lower = description.lower()
    
    if 'sales' in desc_lower or 'revenue' in desc_lower:
        # Sales dataset
        products = ['Laptop', 'Mouse', 'Keyboard', 'Monitor', 'Headphones', 'Tablet', 'Phone', 'Speaker', 'Camera', 'Printer']
        customers = ['John Smith', 'Sarah Johnson', 'Mike Brown', 'Lisa Davis', 'Tom Wilson', 'Amy Chen', 'David Lee', 'Emma Taylor']
        
        data = []
        for i in range(rows):
            data.append({
                'Product': random.choice(products),
                'Customer': random.choice(customers),
                'Quantity': random.randint(1, 10),
                'Price': round(random.uniform(10, 1000), 2),
                'Date': (datetime.now() - timedelta(days=random.randint(0, 365))).strftime('%Y-%m-%d')
            })
        columns = ['Product', 'Customer', 'Quantity', 'Price', 'Date']
        
    elif 'employee' in desc_lower or 'staff' in desc_lower:
        # Employee dataset
        names = ['Alice Johnson', 'Bob Smith', 'Carol Davis', 'David Wilson', 'Eva Brown', 'Frank Lee', 'Grace Chen', 'Henry Taylor']
        departments = ['Engineering', 'Marketing', 'Sales', 'HR', 'Finance', 'Operations']
        
        data = []
        for i in range(rows):
            data.append({
                'Name': random.choice(names),
                'Department': random.choice(departments),
                'Salary': random.randint(40000, 120000),
                'Experience': random.randint(1, 15),
                'Hire_Date': (datetime.now() - timedelta(days=random.randint(30, 3650))).strftime('%Y-%m-%d')
            })
        columns = ['Name', 'Department', 'Salary', 'Experience', 'Hire_Date']
        
    elif 'student' in desc_lower or 'grade' in desc_lower or 'school' in desc_lower:
        # Student grades dataset (what the user was trying to generate)
        names = ['Alice Smith', 'Bob Johnson', 'Charlie Brown', 'David Lee', 'Emily Davis', 'Frank Wilson', 'Grace Rodriguez', 'Henry Garcia', 'Ivy Martinez', 'Jack Anderson']
        subjects = ['Math', 'Science', 'English', 'History', 'Art', 'PE', 'Chemistry', 'Biology', 'Physics']
        semesters = ['Fall 2023', 'Spring 2024', 'Fall 2024', 'Spring 2023']
        
        data = []
        for i in range(rows):
            data.append({
                'Name': random.choice(names),
                'Subject': random.choice(subjects),
                'Grade': random.randint(65, 100),
                'Semester': random.choice(semesters)
            })
        columns = ['Name', 'Subject', 'Grade', 'Semester']
        
    else:
        # Generic dataset
        data = []
        for i in range(rows):
            data.append({
                'ID': i + 1,
                'Name': f'Item {i + 1}',
                'Category': random.choice(['A', 'B', 'C', 'D']),
                'Value': round(random.uniform(1, 100), 2),
                'Status': random.choice(['Active', 'Inactive', 'Pending'])
            })
        columns = ['ID', 'Name', 'Category', 'Value', 'Status']
    
    # Update the data handler with the new dataset
    df = pd.DataFrame(data)
    data_handler.update_df_and_db(df)
    agent_services.initialize_agents(data_handler)
    
    return {
        "success": True,
        "message": f"Generated fallback dataset with {len(data)} rows and {len(columns)} columns",
        "data": data,
        "columns": columns,
        "rows": len(data),
        "dataset_name": f"Fallback {description}"
    }

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...), workspace_id: str = None):
    try:
        # Save the uploaded file temporarily
        temp_path = f"temp_{file.filename}"
        with open(temp_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Load the data using our existing DataHandler
        response, df = data_handler.load_data(temp_path, lambda x, y: print(f"Progress: {x}, {y}"))
        
        # Clean up the temporary file
        os.remove(temp_path)
        
        if df is None:
            raise HTTPException(status_code=400, detail=response)
        
        # Initialize agents with the new data
        agent_services.initialize_agents(data_handler)
        
        return {
            "message": response,
            "preview": df.head(100).to_dict(orient="records"),
            "columns": df.columns.tolist(),
            "filename": file.filename,
            "data": df.to_dict(orient="records"),
            "rows": len(df),
            "success": True
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/query")
async def process_query(query: Dict[str, Any]):
    print("🌐 === API ENDPOINT /api/query CALLED ===")
    print(f"📥 Incoming request data: {query}")
    print(f"🔍 Request type: {type(query)}")
    print(f"🗂️ Request keys: {list(query.keys()) if isinstance(query, dict) else 'Not a dict'}")
    
    try:
        question = query.get("question")
        is_speech = query.get("is_speech", False)
        
        print(f"💬 Extracted question: {question}")
        print(f"🎤 Is speech: {is_speech}")
        print(f"❓ Question type: {type(question)}")
        print(f"📏 Question length: {len(question) if question else 0}")
        
        if not question:
            print("❌ No question provided in request")
            raise HTTPException(status_code=400, detail="No question provided")
        
        # Check for duplicate removal patterns first for more reliable detection
        duplicate_keywords = [
            'remove duplicate', 'drop duplicate', 'deduplicate', 'deduplication',
            'delete duplicate', 'get rid of duplicate', 'eliminate duplicate', 
            'unique rows', 'remove duplicates', 'drop duplicates'
        ]
        
        is_duplicate_removal = any(keyword in question.lower() for keyword in duplicate_keywords)
        if is_duplicate_removal:
            print("🧹 === DUPLICATE REMOVAL DETECTED IN API ENDPOINT ===")
            print(f"💬 Query: {question}")
            print(f"🔍 Matched keywords: {[k for k in duplicate_keywords if k in question.lower()]}")
            # Capture initial data shape for comparison
            initial_df = data_handler.get_df()
            initial_shape = initial_df.shape if initial_df is not None else None
            print(f"📊 Initial data shape: {initial_shape}")
        
        print("🔄 === CALLING AGENT SERVICES ===")
        print(f"🤖 Agent services instance: {agent_services}")
        print(f"🗃️ Data handler has data: {data_handler.get_df() is not None}")
        if data_handler.get_df() is not None:
            df = data_handler.get_df()
            print(f"📊 Data shape: {df.shape}")
            print(f"🏷️ Data columns: {df.columns.tolist()}")
        
        # Ensure AgentServices is always linked to an active DataHandler (covers direct page refresh w/ saved data)
        if agent_services.data_handler is None:
            agent_services.initialize_agents(data_handler)
        
        response, visualization = agent_services.process_query(question, is_speech)
        
        print("🎉 === AGENT SERVICES COMPLETED ===")
        print(f"💬 Response: {response}")
        print(f"🎨 Visualization: {visualization}")
        print(f"📄 Response type: {type(response)}")
        print(f"🖼️ Visualization type: {type(visualization)}")
        
        response_data = {"response": response}
        print(f"📦 Base response data: {response_data}")
        
        # Check for data modifications, especially duplicate removal
        data_modified = False
        
        # For duplicate removal, explicitly compare shapes before and after processing
        if is_duplicate_removal:
            print("🧹 === CHECKING DUPLICATE REMOVAL RESULTS ===")
            updated_df = data_handler.get_df()
            updated_shape = updated_df.shape if updated_df is not None else None
            print(f"📊 Updated data shape: {updated_shape}")
            
            if initial_shape and updated_shape and initial_shape[0] > updated_shape[0]:
                print(f"✅ Duplicate removal confirmed! Rows before: {initial_shape[0]}, rows after: {updated_shape[0]}")
                print(f"🧹 Removed {initial_shape[0] - updated_shape[0]} rows")
                data_modified = True
            else:
                print("⚠️ No rows were removed or shape comparison failed")
                
                # Even if no rows were removed, check if the response indicates DATA_MODIFIED
                if response and isinstance(response, str) and "DATA_MODIFIED:" in response:
                    print("📋 Response indicates data was modified, forcing frontend update")
                    data_modified = True
        else:
            # General data modification check for other operations
            data_modified = any(keyword in question.lower() for keyword in [
                'translate', 'translation', 'filter', 'clean', 'remove', 'add column', 
                'delete', 'modify', 'update', 'transform', 'sort'
            ])
            
            # Also check if the response indicates DATA_MODIFIED
            if response and isinstance(response, str) and "DATA_MODIFIED:" in response:
                print("📋 Response indicates data was modified, forcing frontend update")
                data_modified = True
        
        print(f"🔄 Data modification detected: {data_modified}")
        
        if data_modified:
            print("🔄 === DATA MODIFICATION DETECTED ===")
            # Get the updated data
            updated_df = data_handler.get_df()
            if updated_df is not None:
                # Convert NaN values to None (null in JSON) before serialization
                updated_df = updated_df.replace({np.nan: None})
                response_data["data_updated"] = True
                response_data["updated_data"] = {
                    "data": updated_df.to_dict(orient="records"),
                    "columns": updated_df.columns.tolist(),
                    "rows": len(updated_df)
                }
                print(f"📊 Updated data included in response: {len(updated_df)} rows, {len(updated_df.columns)} columns")
            else:
                print("⚠️ Data handler returned None after modification")
        
        if visualization:
            print("🎨 === PROCESSING VISUALIZATION ===")
            print(f"🔍 Visualization details: {visualization}")
            
            # Ensure the path is correctly formatted for static file serving
            viz_path = f"/static/visualizations/{visualization['filename']}"
            print(f"🔗 Formatted visualization path: {viz_path}")
            
            response_data["visualization"] = {
                "type": visualization["type"],
                "path": viz_path
            }
            print(f"✅ Visualization added to response: {response_data['visualization']}")
        else:
            print("ℹ️ No visualization to add to response")
        
        print("📤 === SENDING RESPONSE ===")
        print(f"🎁 Final response data: {response_data}")
        print(f"📊 Response data keys: {list(response_data.keys())}")
        print(f"📏 Response size: {len(str(response_data))} characters")
        
        return response_data
        
    except HTTPException as he:
        print(f"⚠️ === HTTP EXCEPTION ===")
        print(f"🔢 Status code: {he.status_code}")
        print(f"📝 Detail: {he.detail}")
        raise he
    except Exception as e:
        print(f"❌ === UNEXPECTED ERROR ===")
        print(f"💥 Error type: {type(e)}")
        print(f"📋 Error message: {str(e)}")
        print(f"🗂️ Error details: {repr(e)}")
        import traceback
        print(f"📚 Full traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate-report")
async def generate_report(report_request: ReportRequest, background_tasks: BackgroundTasks):
    try:
        if data_handler.get_df() is None:
            raise HTTPException(status_code=400, detail="No data loaded. Please upload a file first.")
        
        agent_services.clear_cancel_flag()
        
        # Generate a unique report ID
        report_id = str(uuid.uuid4())
        report_filename = os.path.join(REPORTS_DIR, f"report_{report_id}.pdf")
        
        # Custom progress callback for API
        def progress_callback(progress, description=None):
            # This would be used for WebSockets in a more advanced implementation
            print(f"Report generation progress: {progress:.2f} - {description}")
        
        # Generate report in background
        background_tasks.add_task(
            report_generator.generate_report,
            report_filename,
            progress_callback
        )
        
        # Return the report ID that can be used to check status or download
        return {"report_id": report_id, "status": "generating"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/download-report/{report_id}")
async def download_report(report_id: str, check: bool = False, request: Request = None):
    report_filename = os.path.join(REPORTS_DIR, f"report_{report_id}.pdf")
    
    # Check if this is just a status check (either from query param or header)
    is_status_check = check or (request and request.headers.get("X-Check-Only") == "true")
    
    if not os.path.exists(report_filename):
        raise HTTPException(status_code=404, detail="Report not found or still generating")
    
    # If this is just a status check, return a simple confirmation response instead of the file
    if is_status_check:
        return {"status": "ready", "report_id": report_id}
    
    # Otherwise return the actual file
    return FileResponse(
        path=report_filename,
        filename=f"EDI_Report_{time.strftime('%Y%m%d_%H%M%S')}.pdf",
        media_type="application/pdf"
    )

@app.post("/api/cancel-operation")
async def cancel_operation():
    try:
        agent_services.cancel_operation()
        settings.conversation_active = False
        settings.conversation_paused = False
        return {"message": "Operation cancelled successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/reset-state")
async def reset_state():
    try:
        agent_services.reset_state()
        data_handler.reset()
        settings.conversation_active = False
        settings.conversation_paused = False
        return {"message": "State reset successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/spreadsheet-command")
async def process_spreadsheet_command(query: Dict[str, Any]):
    try:
        command = query.get("command")
        if not command:
            raise HTTPException(status_code=400, detail="No command provided")
        
        if data_handler.get_df() is None:
            raise HTTPException(status_code=400, detail="No data loaded")
        
        result = agent_services.process_spreadsheet_command(command)
        
        # Get the updated data
        updated_df = data_handler.get_df()
        return {
            "response": result,
            "updated_data": {
                "data": updated_df.to_dict(orient="records"),
                "columns": updated_df.columns.tolist(),
                "rows": len(updated_df)
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/data")
async def get_current_data():
    try:
        if data_handler.get_df() is None:
            raise HTTPException(status_code=400, detail="No data loaded")
        
        df = data_handler.get_df()
        return {
            "data": df.to_dict(orient="records"),
            "columns": df.columns.tolist(),
            "rows": len(df),
            "filename": data_handler.get_filename() or "Dataset"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "data_loaded": data_handler.get_df() is not None,
        "services": {
            "data_handler": "available",
            "agent_services": "available",
            "report_generator": "available",
            "speech_utils": "available"
        }
    }

@app.get("/api/reports/{report_id}/status")
async def report_status(report_id: str = Path(...)):
    report_filename = os.path.join(REPORTS_DIR, f"report_{report_id}.pdf")
    if os.path.exists(report_filename):
        return {"status": "ready", "report_id": report_id}
    else:
        return {"status": "generating", "report_id": report_id}

@app.post("/analyze-formula")
async def analyze_formula_error(request: Request):
    try:
        # Parse the request body
        data = await request.json()
        
        formula = data.get("formula", "").strip()
        error_type = data.get("errorType", "").strip()
        cell_ref = data.get("cellRef", "").strip()
        
        logger.debug(f"Analyzing formula error: formula={formula}, error_type={error_type}, cell_ref={cell_ref}")
        
        if not all([formula, error_type, cell_ref]):
            logger.error("Missing required fields")
            raise HTTPException(status_code=400, detail="Missing required fields")

        # Map error types to descriptions
        error_descriptions = {
            "NAME": "The formula contains an unrecognized function name or reference",
            "VALUE": "The formula is using the wrong type of argument or operand",
            "REF": "The formula refers to a non-valid cell reference",
            "DIV0": "The formula is trying to divide by zero",
            "NUM": "The formula has invalid numeric values",
            "NULL": "The formula uses an intersection of two areas that do not intersect",
            "SPILL": "The formula result cannot be displayed in the available empty cells",
            "CALC": "There is a general calculation error in the formula"
        }

        # Enhanced prompt for formula error analysis with delimiter intelligence
        base_prompt = f"""Analyze this spreadsheet formula error and provide a solution:
        Formula: {formula}
        Error Type: #{error_type}? ({error_descriptions.get(error_type, "Unknown error type")})
        Cell Reference: {cell_ref}

        """

        # Special handling for VALUE errors with text extraction functions
        if error_type == "VALUE" and any(func in formula.upper() for func in ["LEFT", "FIND", "RIGHT", "MID"]):
            base_prompt += """
SPECIAL FOCUS - This appears to be a text extraction formula with a VALUE error, likely due to incorrect delimiter detection.

Common causes and solutions:
1. FIND function looking for wrong delimiter (e.g., looking for space " " when data uses colon ":")
2. Data doesn't contain the expected delimiter
3. Need to use IFERROR to handle cases where delimiter isn't found

For formulas like =LEFT(cell,FIND(" ",cell)-1):
- If data is "windows:mac:linux", use =LEFT(cell,FIND(":",cell)-1)
- If data is "apple,orange,banana", use =LEFT(cell,FIND(",",cell)-1) 
- Always wrap in IFERROR: =IFERROR(LEFT(cell,FIND(":",cell)-1),cell)

ANALYZE THE FORMULA CAREFULLY to identify what delimiter it's looking for versus what the actual data likely contains.
"""
        
        prompt = base_prompt + """
        Provide a clear and concise response with:
        1. The exact cause of the error
        2. How to fix it
        3. A corrected example if applicable

        Keep the response focused and practical."""

        logger.debug(f"Sending prompt to LLM: {prompt}")

        # Use our existing LLM service
        response = agent_services.llm.invoke(prompt)
        response_text = response.content.strip()
        logger.debug(f"Received LLM response: {response_text}")
        
        # Parse the response into structured format
        parts = response_text.split('\n\n')
        
        analysis = {
            "problem": parts[0].replace('1.', '').strip() if len(parts) > 0 else "Error analysis unavailable",
            "solution": parts[1].replace('2.', '').strip() if len(parts) > 1 else "Solution unavailable",
            "examples": [parts[2].replace('3.', '').strip()] if len(parts) > 2 else []
        }
        
        logger.debug(f"Returning analysis: {analysis}")
        return analysis

    except HTTPException as he:
        logger.error(f"HTTP error in formula analysis: {str(he)}")
        raise he
    except Exception as e:
        logger.error(f"Error analyzing formula: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to analyze formula error: {str(e)}"
        )

@app.get("/api/columns")
async def get_columns_for_extraction():
    """
    Get available columns with metadata for the extraction dialog.
    """
    print("📋 === API ENDPOINT /api/columns CALLED ===")
    
    try:
        columns_info = agent_services.get_available_columns_for_extraction()
        print(f"✅ Retrieved columns info: {columns_info}")
        return columns_info
    except Exception as e:
        print(f"❌ Error getting columns: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/extract-columns")
async def extract_columns(extract_request: ExtractColumnsRequest):
    """
    Extract selected columns and create new Luckysheet data.
    """
    print("🔧 === API ENDPOINT /api/extract-columns CALLED ===")
    print(f"📥 Extract request: {extract_request}")
    
    try:
        if not extract_request.selected_columns:
            raise HTTPException(status_code=400, detail="No columns selected for extraction")
        
        # Call the extraction method
        extraction_result = agent_services.extract_selected_columns(
            selected_columns=extract_request.selected_columns,
            new_sheet_name=extract_request.sheet_name
        )
        
        print(f"✅ Extraction result: {extraction_result}")
        return extraction_result
        
    except Exception as e:
        print(f"❌ Error extracting columns: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate-synthetic-dataset")
async def generate_synthetic_dataset(dataset_request: SyntheticDatasetRequest):
    """
    Generate a synthetic dataset based on user specifications using LLM.
    """
    print("🧬 === API ENDPOINT /api/generate-synthetic-dataset CALLED ===")
    print(f"📥 Dataset request: {dataset_request}")
    
    try:
        if not dataset_request.description.strip():
            raise HTTPException(status_code=400, detail="Dataset description is required")
        
        # Create the prompt for dataset generation
        prompt = f"""Create a synthetic dataset with the following specifications:

Description: {dataset_request.description}
Number of rows: {dataset_request.rows}
"""
        
        if dataset_request.column_specs:
            prompt += f"Column specifications: {dataset_request.column_specs}\n"
        elif dataset_request.columns:
            prompt += f"Number of columns: {dataset_request.columns}\n"
        
        prompt += """
Generate realistic sample data that matches the description. 

CRITICAL INSTRUCTIONS:
1. You MUST return ONLY valid JSON in the exact format below
2. Do NOT include any explanatory text, markdown formatting, or additional comments
3. Do NOT use ```json``` code blocks
4. Return raw JSON only

Required JSON structure:
{
    "columns": ["Column1", "Column2", ...],
    "data": [
        {"Column1": "value1", "Column2": "value2", ...},
        ...
    ]
}

Data quality guidelines:
- If it's sales data, include realistic product names, dates, amounts, customer names, etc.
- If it's employee data, include realistic names, departments, salaries, hire dates, etc.
- Use appropriate data types (strings, numbers, dates) for each column
- Ensure data makes logical sense (e.g., dates are in reasonable order, amounts are realistic)
- Make data varied and realistic

RESPONSE FORMAT: Start your response with { and end with } - nothing else."""

        print(f"🧠 Sending prompt to LLM: {prompt}")
        
        # Use the LLM to generate the dataset
        response = agent_services.llm.invoke(prompt)
        response_text = response.content.strip()
        
        print(f"📄 LLM response: {response_text}")
        
        # Try to extract JSON from the response
        try:
            # Remove any markdown code blocks if present
            if "```json" in response_text:
                start = response_text.find("```json") + 7
                end = response_text.find("```", start)
                response_text = response_text[start:end].strip()
            elif "```" in response_text:
                start = response_text.find("```") + 3
                end = response_text.rfind("```")
                response_text = response_text[start:end].strip()
            
            # Try to find JSON object boundaries
            start_brace = response_text.find('{')
            end_brace = response_text.rfind('}')
            
            if start_brace != -1 and end_brace != -1 and end_brace > start_brace:
                response_text = response_text[start_brace:end_brace + 1]
                
                # Validate that JSON has proper structure (basic check)
                if not (response_text.count('{') >= 1 and response_text.count('}') >= 1 and 
                        '"columns"' in response_text and '"data"' in response_text):
                    print("⚠️ JSON structure appears incomplete, using fallback")
                    raise json.JSONDecodeError("Incomplete JSON structure", response_text, 0)
            
            print(f"🔍 Cleaned response text length: {len(response_text)} characters")
            print(f"🔍 First 200 chars: {response_text[:200]}...")
            print(f"🔍 Last 200 chars: ...{response_text[-200:]}")
            
            # Parse the JSON with error recovery
            try:
                dataset_json = json.loads(response_text)
            except json.JSONDecodeError as inner_e:
                print(f"⚠️ Initial JSON parse failed: {inner_e}")
                
                # Try to repair common JSON issues
                if "Expecting ',' delimiter" in str(inner_e):
                    print("🔧 Attempting JSON repair for missing delimiter...")
                    # Find the position of the error and try to fix it
                    error_pos = getattr(inner_e, 'pos', 0)
                    if error_pos > 0 and error_pos < len(response_text):
                        # Look for incomplete entries at the end
                        last_complete_brace = response_text.rfind('}', 0, error_pos)
                        if last_complete_brace > 0:
                            # Find the end of the data array
                            data_end = response_text.rfind(']', 0, last_complete_brace + 100)
                            if data_end > last_complete_brace:
                                # Try to reconstruct valid JSON
                                repaired_json = response_text[:data_end + 1] + '\n}'
                                print(f"🔧 Repaired JSON length: {len(repaired_json)}")
                                try:
                                    dataset_json = json.loads(repaired_json)
                                    print("✅ JSON repair successful!")
                                except:
                                    print("❌ JSON repair failed, using fallback")
                                    raise inner_e
                            else:
                                raise inner_e
                        else:
                            raise inner_e
                    else:
                        raise inner_e
                else:
                    raise inner_e
            
            if "columns" not in dataset_json or "data" not in dataset_json:
                raise ValueError("Invalid JSON structure")
            
            # Validate the data structure
            columns = dataset_json["columns"]
            data_rows = dataset_json["data"]
            
            print(f"📊 Generated dataset: {len(data_rows)} rows, {len(columns)} columns")
            print(f"📋 Columns: {columns}")
            
            # Convert to DataFrame for validation and processing
            df = pd.DataFrame(data_rows)
            
            # Update the data handler with the new dataset
            data_handler.update_df_and_db(df)
            
            # Initialize agents with the new data
            agent_services.initialize_agents(data_handler)
            
            return {
                "success": True,
                "message": f"Successfully generated synthetic dataset with {len(data_rows)} rows and {len(columns)} columns",
                "data": df.to_dict(orient="records"),
                "columns": df.columns.tolist(),
                "rows": len(df),
                "dataset_name": f"Synthetic {dataset_request.description}"
            }
            
        except json.JSONDecodeError as e:
            print(f"❌ JSON parsing error: {e}")
            print(f"📄 Raw response: {response_text}")
            
            # Try to create a fallback dataset based on the description
            print("🔄 Attempting to create fallback dataset...")
            try:
                fallback_data = create_fallback_dataset(dataset_request.description, dataset_request.rows)
                if fallback_data:
                    print("✅ Fallback dataset created successfully")
                    return fallback_data
            except Exception as fallback_error:
                print(f"❌ Fallback creation failed: {fallback_error}")
            
            raise HTTPException(
                status_code=500, 
                detail=f"Failed to parse LLM response as JSON. The AI returned: '{response_text[:100]}...'. Please try again with a clearer description."
            )
        except ValueError as e:
            print(f"❌ Data validation error: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Invalid dataset structure generated. Please try again."
            )
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error generating synthetic dataset: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate dataset: {str(e)}")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True) 