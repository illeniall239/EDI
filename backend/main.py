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
import re
from typing import Optional, Dict, Any, List
import pandas as pd
import numpy as np
import logging
from difflib import SequenceMatcher

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    load_dotenv()
    print("[OK] Environment variables loaded from .env file")
except ImportError:
    print("[WARN] python-dotenv not installed. Install with: pip install python-dotenv")
except Exception as e:
    print(f"[WARN] Error loading .env file: {str(e)}")

# Add the parent directory to sys.path to import our modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import our existing modules
from data_handler import DataHandler
from agent_services import AgentServices
from report_generator import ReportGenerator
from speech_utils import SpeechUtil
from query_orchestrator import get_orchestrator
from workspace_ai_processor import create_ai_processor
from intelligent_analysis import IntelligentAnalyzer
from smart_formatter import SmartFormatter
from predictive_analysis import PredictiveAnalyzer
import settings

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for deployed apps - configure specific domains in production
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

# Configure logging first
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Mount static directory for serving visualizations
app.mount("/static", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "static")), name="static")

# Initialize our services
data_handler = DataHandler()
speech_util = SpeechUtil(api_key=settings.AZURE_SPEECH_KEY, region=settings.AZURE_SERVICE_REGION)

# Check if LLM is properly configured
if settings.LLM is None:
    logger.error("LLM is not properly configured. Please check your NEXT_PUBLIC_GROQ_API_KEY environment variable.")
    agent_services = None
    report_generator = None
else:
    try:
        # Test the LLM connection
        test_response = settings.LLM.invoke("Hello")
        logger.info("LLM connection successful")

        agent_services = AgentServices(llm=settings.LLM, speech_util_instance=speech_util, charts_dir=CHARTS_DIR)
        agent_services.initialize_agents(data_handler)
        report_generator = ReportGenerator(
            data_handler=data_handler,
            agent_services_instance=agent_services
        )
    except Exception as e:
        logger.error(f"Failed to initialize LLM services: {str(e)}")
        logger.error("Please check your NEXT_PUBLIC_GROQ_API_KEY and ensure it's valid")
        agent_services = None
        report_generator = None

# --- Request/Response Models ---
class QueryRequest(BaseModel):
    question: str
    chat_id: Optional[str] = None  # NEW: Chat ID for context management
    is_speech: bool = False
    workspace_id: Optional[str] = None
    workspace_type: Optional[str] = "work"  # NEW: Workspace type for AI context

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

class AnalyzeChartRequest(BaseModel):
    image_path: str
    original_query: str
    workspace_id: Optional[str] = None

class SyntheticDatasetRequest(BaseModel):
    description: str
    rows: Optional[int] = 100
    columns: Optional[int] = None
    column_specs: Optional[Dict[str, str]] = None

class CompoundQueryRequest(BaseModel):
    query: str
    workspace_id: str
    chat_id: Optional[str] = None
    workspace_type: Optional[str] = "work"  # NEW: Workspace type for AI context
    preview_only: bool = False  # If true, return execution plan without executing

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
        raise HTTPException(status_code=500, detail="I had trouble processing your file. Please make sure it's a valid data file (CSV, Excel, etc.) and try again.")

@app.post("/api/query")
async def process_query(query: Dict[str, Any]):
    print("🌐 === API ENDPOINT /api/query CALLED ===")
    print(f"📥 Incoming request data: {query}")
    print(f"🔍 Request type: {type(query)}")
    print(f"🗂️ Request keys: {list(query.keys()) if isinstance(query, dict) else 'Not a dict'}")
    
    try:
        question = query.get("question")
        chat_id = query.get("chat_id")  # NEW: Extract chat_id
        is_speech = query.get("is_speech", False)
        mode = query.get("mode", "simple")  # NEW: Extract mode, default to simple
        workspace_type = query.get("workspace_type", "work")  # NEW: Extract workspace type

        print(f"📝 === EXTRACTED PARAMETERS ===")
        print(f"   - Question: '{question}'")
        print(f"   - Chat ID: {chat_id}")
        print(f"   - Is Speech: {is_speech}")
        print(f"   - Mode: {mode}")
        print(f"   - Workspace Type: {workspace_type}")
        
        if not question:
            print("❌ No question provided in request")
            raise HTTPException(status_code=400, detail="I'm ready to help! What would you like to know or do with your data?")
        
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

        # Check for junk detection patterns for reliable refresh detection  
        junk_keywords = [
            'junk', 'detect junk', 'find junk', 'junk responses', 'junk detection',
            'find spam', 'detect spam', 'spam responses', 'meaningless responses',
            'gibberish', 'bad responses', 'quality analysis'
        ]
        
        is_junk_detection = any(keyword in question.lower() for keyword in junk_keywords)
        print(f"🔍 Junk detection check: {is_junk_detection}")
        if is_junk_detection:
            print("🧹 === JUNK DETECTION DETECTED IN API ENDPOINT ===")
            print(f"💬 Query: {question}")
            print(f"🔍 Matched keywords: {[k for k in junk_keywords if k in question.lower()]}")
            # Capture initial columns for comparison
            initial_df = data_handler.get_df()
            initial_columns = list(initial_df.columns) if initial_df is not None else []
            print(f"📊 Initial columns count: {len(initial_columns)}")
            print(f"📊 Initial columns: {initial_columns}")
            print("🧹 Initial columns captured for junk detection")
        
        print("🔄 === CALLING AGENT SERVICES ===")
        print(f"🤖 Agent services instance: {agent_services}")
        
        # Check if agent_services is properly initialized
        if agent_services is None:
            raise HTTPException(
                status_code=503, 
                detail="I'm having trouble accessing my AI capabilities right now. Please try again in a moment or contact support if the issue persists."
            )
        
        print(f"🗃️ Data handler has data: {data_handler.get_df() is not None}")
        if data_handler.get_df() is not None:
            df = data_handler.get_df()
            print(f"📊 Data shape: {df.shape}")
            print(f"🏷️ Data columns: {df.columns.tolist()}")
        
        # Ensure AgentServices is always linked to an active DataHandler (covers direct page refresh w/ saved data)
        print(f"🔍 DEBUG - agent_services.data_handler is None: {agent_services.data_handler is None}")
        print(f"🔍 DEBUG - data_handler is None: {data_handler is None}")
        if data_handler is not None:
            df = data_handler.get_df()
            print(f"🔍 DEBUG - data_handler.get_df() is None: {df is None}")
            if df is not None:
                print(f"🔍 DEBUG - DataFrame shape: {df.shape}")
            db_obj = data_handler.get_db_sqlalchemy_object()
            print(f"🔍 DEBUG - data_handler.get_db_sqlalchemy_object() is None: {db_obj is None}")
        
        if agent_services.data_handler is None:
            print("🔄 Initializing agents with data handler")
            agent_services.initialize_agents(data_handler)
        else:
            print("✅ AgentServices already has data handler")
        
        # NEW: Switch to the specific chat context if provided
        if chat_id:
            print(f"🔄 Switching to chat context: {chat_id}")
            agent_services.switch_chat_context(chat_id)
        else:
            print("⚠️ No chat_id provided, using default context")
        
        # NEW: Apply workspace-type-aware AI processing
        ai_processor = create_ai_processor(workspace_type)
        context = {
            "workspace_type": workspace_type,
            "chat_id": chat_id,
            "is_speech": is_speech,
            "mode": mode
        }

        # Pre-process query based on workspace type
        processing_result = await ai_processor.process_query(question, context)

        # Handle Learn Mode redirects and teaching responses
        if workspace_type == "learn" and processing_result.get("response_type") in ["socratic_redirect", "prerequisite_redirect"]:
            print(f"📚 === LEARN MODE REDIRECT ===")
            print(f"🔄 Redirect type: {processing_result.get('response_type')}")
            return {
                "response": processing_result.get("response", ""),
                "type": processing_result.get("response_type"),
                "guiding_questions": processing_result.get("guiding_questions", []),
                "suggested_concept": processing_result.get("suggested_concept"),
                "requires_teaching": True,
                "workspace_type": workspace_type
            }

        print("🚀 === CALLING AGENT SERVICES ===")
        print(f"📤 Sending to agent_services.process_query:")
        print(f"   - question: '{question}'")
        print(f"   - is_speech: {is_speech}")
        print(f"   - mode: {mode}")
        print(f"   - workspace_type: {workspace_type}")

        response, visualization = agent_services.process_query(question, is_speech, mode)
        
        print("🎉 === AGENT SERVICES COMPLETED ===")
        print(f"💬 Response: {response}")
        print(f"🎨 Visualization: {visualization}")
        print(f"📄 Response type: {type(response)}")
        print(f"🖼️ Visualization type: {type(visualization)}")
        
        # Check if response is a JSON clarification
        print("🔍 === CHECKING RESPONSE TYPE ===")
        if isinstance(response, str) and response.strip().startswith('{'):
            print("🤔 Response looks like JSON - might be a clarification request")
            try:
                import json
                json_response = json.loads(response)
                if json_response.get('type') == 'clarification':
                    print("✅ CONFIRMED: This is a clarification response!")
                    print(f"🔍 Clarification details: {json_response}")
                else:
                    print("ℹ️ JSON response but not clarification type")
            except json.JSONDecodeError:
                print("⚠️ Failed to parse response as JSON")
        else:
            print("📝 Response is regular text, not JSON")
        
        response_data = {"response": response}
        print(f"📦 Base response data: {response_data}")

        # NOTE: Luckysheet parsing removed - all spreadsheet operations now use Univer frontend
        
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
        elif is_junk_detection:
            print("🧹 === CHECKING JUNK DETECTION RESULTS ===")
            print(f"🔍 Variable scope check: 'initial_columns' in locals() = {'initial_columns' in locals()}")
            updated_df = data_handler.get_df()
            print(f"📊 Updated DataFrame available: {updated_df is not None}")
            
            # Check if initial_columns was captured (variable exists in scope)
            if 'initial_columns' in locals() and updated_df is not None and initial_columns:
                print(f"✅ Initial columns variable exists with {len(initial_columns)} columns")
                updated_columns = list(updated_df.columns)
                new_columns = [col for col in updated_columns if col not in initial_columns]
                print(f"📊 Updated columns count: {len(updated_columns)}")
                print(f"📊 Updated columns: {updated_columns}")
                print(f"🆕 New columns detected: {new_columns}")
                
                # Check if any new column contains 'junk_flag'
                junk_flag_columns = [col for col in new_columns if 'junk_flag' in col.lower()]
                if junk_flag_columns:
                    print(f"✅ Junk flag column detected: {junk_flag_columns}")
                    data_modified = True
                else:
                    print("⚠️ No junk flag column found in new columns")
                    
                    # Fallback: check if response indicates DATA_MODIFIED
                    if response and isinstance(response, str) and "DATA_MODIFIED:" in response:
                        print("📋 Response indicates data was modified, forcing frontend update")
                        data_modified = True
            else:
                if 'initial_columns' not in locals():
                    print("❌ initial_columns variable not found in scope")
                elif updated_df is None:
                    print("❌ Updated DataFrame is None")
                elif not initial_columns:
                    print("❌ initial_columns is empty")
                print("⚠️ No initial columns captured or no updated data available")
                # Fallback: check if response indicates DATA_MODIFIED
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
                "path": viz_path,
                "original_query": visualization.get("original_query", question)
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

@app.post("/api/clarification-choice")
async def process_clarification_choice(request: Dict[str, Any]):
    """
    Process user's clarification choice and execute the selected action.
    """
    try:
        choice_id = request.get("choice_id")
        original_query = request.get("original_query")
        category = request.get("category")
        
        if not all([choice_id, original_query, category]):
            raise HTTPException(status_code=400, detail="Missing required parameters")
        
        print(f"🎯 Processing clarification choice: {choice_id} for query: '{original_query}'")
        
        # Process the clarification choice
        response, visualization = agent_services.process_clarification_choice(
            choice_id, original_query, category
        )
        
        # Prepare response data
        response_data = {
            "response": response,
            "success": True,
            "clarification_resolved": True
        }
        
        # Check for data modifications
        data_modified = any(keyword in original_query.lower() for keyword in [
            'translate', 'clean', 'remove', 'add column', 'delete', 'modify', 'update', 'transform'
        ])
        
        if data_modified:
            updated_df = data_handler.get_df()
            if updated_df is not None:
                updated_df = updated_df.replace({np.nan: None})
                response_data["data_updated"] = True
                response_data["updated_data"] = {
                    "data": updated_df.to_dict(orient="records"),
                    "columns": updated_df.columns.tolist(),
                    "rows": len(updated_df)
                }
        
        if visualization:
            viz_path = f"/static/visualizations/{visualization['filename']}"
            response_data["visualization"] = {
                "type": visualization["type"],
                "path": viz_path,
                "original_query": visualization.get("original_query", original_query)
            }
        
        return response_data
        
    except Exception as e:
        print(f"❌ Error processing clarification choice: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate-report")
async def generate_report(report_request: ReportRequest, background_tasks: BackgroundTasks):
    try:
        if data_handler.get_df() is None:
            raise HTTPException(status_code=400, detail="I need some data to generate a report. Please upload a dataset first, then I can create an analysis report for you.")
        
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
        raise HTTPException(status_code=404, detail="I couldn't find that report. It might still be generating or there was an issue creating it. Please try generating a new report.")
    
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
    """DEPRECATED: This endpoint is no longer used.

    All spreadsheet operations now execute directly through the Univer FacadeAPI
    on the frontend via UniverAdapter. This endpoint previously generated Luckysheet
    API calls but has been disabled.
    """
    logger.info("Deprecated /api/spreadsheet-command endpoint called")
    return {
        "success": False,
        "message": "This endpoint is deprecated. Spreadsheet operations are now handled directly by the Univer frontend.",
        "deprecated": True
    }
    # NOTE: ~865 lines of unreachable Luckysheet generation code removed during Phase 3 cleanup
@app.post("/api/range-filter")
async def process_range_filter(filter_request: Dict[str, Any]):
    """
    Apply or remove range filters on spreadsheet data.
    Supports filtering by column values (exact match or contains).
    """
    try:
        logger.info("🔍 === RANGE FILTER DEBUG START ===")
        logger.info(f"📥 Received request: {filter_request}")
        
        action = filter_request.get("action", "open")  # "open" or "close"
        sheet_context = filter_request.get("sheet_context", {})
        
        if action == "close":
            logger.info("🧹 Processing clear filter request")
            logger.info("🎬 Returning setRangeFilter close command")
            
            # Clear all filters - return simple success response
            # Use setRangeFilter with "close" type to remove filters
            result = {
                "success": True,
                "message": "All filters cleared",
                "action": {
                    "type": "luckysheet_api", 
                    "payload": {
                        "method": "setRangeFilter",
                        "params": ["close", {}]
                    }
                }
            }
            
            logger.info(f"✅ Clear filter result: {result}")
            return result
            
        # For opening/applying filters
        logger.info("🎯 Processing apply filter request")
        logger.info(f"📊 Sheet context available: {bool(sheet_context)}")
        
        if sheet_context:
            logger.info(f"📐 Sheet dimensions: {sheet_context.get('total_rows')}x{sheet_context.get('total_cols')}")
            logger.info(f"📋 Headers: {sheet_context.get('headers', [])}")
        
        if data_handler.get_df() is None:
            raise HTTPException(status_code=400, detail="No data loaded")
            
        column = filter_request.get("column")  # Column index or name
        filter_value = filter_request.get("filter_value", "")
        filter_type = filter_request.get("filter_type", "exact")  # "exact" or "contains"
        range_spec = filter_request.get("range")  # Optional range specification
        
        logger.info(f"🎯 Filter parameters:")
        logger.info(f"   Column: {column}")
        logger.info(f"   Value: {filter_value}")
        logger.info(f"   Type: {filter_type}")
        logger.info(f"   Range: {range_spec}")
        
        if column is None:
            raise HTTPException(status_code=400, detail="Column parameter is required")
            
        df = data_handler.get_df()
        
        # Smart column resolution using sheet context if available
        column_index = None
        column_name = None
        
        if sheet_context and sheet_context.get('headers'):
            headers = sheet_context['headers']
            logger.info(f"🔍 Using sheet context for column resolution")
            logger.info(f"📋 Available headers: {headers}")
            
            # First try exact match with headers
            if isinstance(column, str):
                for i, header_cell in enumerate(headers):
                    # Extract header text from cell object or use as-is
                    header_text = ""
                    if isinstance(header_cell, dict):
                        header_text = str(header_cell.get('m', '') or header_cell.get('v', ''))
                    else:
                        header_text = str(header_cell or '')
                    
                    logger.info(f"   Checking header[{i}]: '{header_text}' vs '{column}'")
                    
                    if header_text.lower() == column.lower():
                        column_index = i
                        column_name = header_text  # Use the clean extracted text
                        logger.info(f"✅ Found exact header match: '{column}' -> column {column_index}")
                        break
                
                # If not found by header name, try as column letter (A, B, C, etc.)
                if column_index is None and len(column) == 1 and column.upper().isalpha():
                    column_index = ord(column.upper()) - ord('A')
                    if column_index < len(headers):
                        # Extract clean text from header cell
                        header_cell = headers[column_index]
                        if isinstance(header_cell, dict):
                            column_name = str(header_cell.get('m', '') or header_cell.get('v', ''))
                        else:
                            column_name = str(header_cell or '')
                        
                        if not column_name:  # Fallback if no text found
                            column_name = f"Column {column.upper()}"
                            
                        logger.info(f"✅ Resolved column letter: '{column}' -> column {column_index}")
                    else:
                        column_index = None
            else:
                column_index = int(column)
                if column_index < len(headers):
                    # Extract clean text from header cell
                    header_cell = headers[column_index]
                    if isinstance(header_cell, dict):
                        column_name = str(header_cell.get('m', '') or header_cell.get('v', ''))
                    else:
                        column_name = str(header_cell or '')
                    
                    if not column_name:  # Fallback if no text found
                        column_name = f"Column {column_index + 1}"
                        
                    logger.info(f"✅ Using column index: {column} -> column {column_index}")
        else:
            # Fallback to DataFrame column resolution
            logger.info(f"⚠️ No sheet context, using DataFrame for column resolution")
            if isinstance(column, str):
                # Try to find column by name (case insensitive)
                column_lower = column.lower()
                for i, col_name in enumerate(df.columns):
                    if col_name.lower() == column_lower:
                        column_index = i
                        column_name = col_name
                        break
                
                # If not found by name, try as column letter (A, B, C, etc.)
                if column_index is None and len(column) == 1 and column.upper().isalpha():
                    column_index = ord(column.upper()) - ord('A')
                    if column_index < len(df.columns):
                        column_name = df.columns[column_index]
                    
                if column_index is None:
                    raise HTTPException(status_code=400, detail=f"Column '{column}' not found")
            else:
                column_index = int(column)
                if column_index < len(df.columns):
                    column_name = df.columns[column_index]
            
        # Validate column index
        if column_index is None or column_index < 0:
            logger.error(f"❌ Could not resolve column: '{column}'")
            raise HTTPException(status_code=400, detail=f"Column '{column}' not found")
            
        if sheet_context and column_index >= sheet_context.get('total_cols', 0):
            logger.error(f"❌ Column index {column_index} out of range (max: {sheet_context.get('total_cols', 0) - 1})")
            raise HTTPException(status_code=400, detail=f"Column index {column_index} out of range")
        elif not sheet_context and column_index >= len(df.columns):
            logger.error(f"❌ Column index {column_index} out of range (max: {len(df.columns) - 1})")
            raise HTTPException(status_code=400, detail=f"Column index {column_index} out of range")
            
        logger.info(f"✅ Column resolution successful:")
        logger.info(f"   Input: '{column}' -> Index: {column_index}, Name: '{column_name}'")
            
        # Intelligent range calculation using sheet context
        logger.info("📏 Calculating filter range...")
        
        if sheet_context:
            # Use sheet context for accurate range calculation
            total_rows = sheet_context.get('total_rows', len(df) + 1)  # +1 for header
            total_cols = sheet_context.get('total_cols', len(df.columns))
            
            # Include header row (row 0) in the range for proper filter placement
            start_row = 0  # Include header row (row 1 in Luckysheet 1-based indexing)
            end_row = total_rows - 1  # Last data row (0-based to 1-based conversion handled below)
            start_col = 0  # Start from first column
            end_col = total_cols - 1  # Last column
            
            logger.info(f"📊 Using sheet context dimensions: {total_rows} rows x {total_cols} cols")
        else:
            # Fallback to DataFrame dimensions
            start_row = 0  # Include header row
            end_row = len(df)  # DataFrame rows (header not included in df)
            start_col = 0
            end_col = len(df.columns) - 1
            
            logger.info(f"📊 Using DataFrame dimensions: {len(df)} data rows + 1 header")
            
        # Build the range string for Luckysheet (1-based indexing)
        start_col_letter = chr(ord('A') + start_col)
        end_col_letter = chr(ord('A') + end_col)
        luckysheet_range = f"{start_col_letter}{start_row + 1}:{end_col_letter}{end_row + 1}"
        
        logger.info(f"📏 Calculated range:")
        logger.info(f"   Start: Row {start_row + 1}, Col {start_col_letter}")
        logger.info(f"   End: Row {end_row + 1}, Col {end_col_letter}")
        logger.info(f"   Final range: {luckysheet_range}")
        
        # Generate user-friendly message
        display_column_name = column_name or df.columns[column_index] if column_index < len(df.columns) else f"Column {column_index + 1}"
        message = f"Applied filter to {display_column_name} column. Use the dropdown in the header to select '{filter_value}' to filter the data."
            
        logger.info(f"💬 Generated message: {message}")
            
        # Return structured response for frontend execution
        # Use setRangeFilter with "open" type and proper range setting
        result = {
            "success": True,
            "message": message,
            "action": {
                "type": "luckysheet_api",
                "payload": {
                    "method": "setRangeFilter", 
                    "params": ["open", {"range": luckysheet_range, "order": 0}]
                }
            },
            # Keep minimal filter data for debugging
            "filter_data": {
                "column": column_index,
                "filter_value": filter_value,
                "filter_type": filter_type,
                "range": luckysheet_range,
                "column_name": display_column_name
            }
        }
        
        logger.info("🎬 === GENERATING LUCKYSHEET COMMAND ===")
        logger.info(f"🔧 Method: setRangeFilter")
        logger.info(f"📋 Params: ['open', {{'range': '{luckysheet_range}', 'order': 0}}]")
        logger.info(f"💬 Message: {message}")
        logger.info(f"📊 Filter data: {result['filter_data']}")
        logger.info("✅ === RANGE FILTER DEBUG END ===")
        
        return result
        
    except Exception as e:
        logger.error(f"Error in range filter processing: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/initialize-data")
async def initialize_backend_with_data(request: Dict[str, Any]):
    """
    Initialize the backend data_handler with data loaded from Supabase.
    This ensures all backend features work when data is restored from a previous session.
    """
    try:
        data = request.get("data", [])
        filename = request.get("filename")
        
        if not data or len(data) == 0:
            raise HTTPException(status_code=400, detail="No data provided for initialization")
        
        print(f"🔄 Initializing backend with {len(data)} rows from Supabase")
        print(f"📄 Filename: {filename}")
        
        # Create DataFrame from the provided data
        import pandas as pd
        df = pd.DataFrame(data)
        
        # Set the DataFrame and filename in data_handler
        data_handler.df = df
        data_handler.filename = filename
        data_handler._display_filename = filename
        
        # Create temporary SQLite database (using the same logic as load_data)
        import re
        from sqlalchemy import create_engine
        from langchain_community.utilities import SQLDatabase
        
        temp_db_name = f"temp_db_{re.sub(r'[^a-zA-Z0-9]', '_', filename)}.db" if filename else "temp_db_restored_data.db"
        data_handler.engine = create_engine(f'sqlite:///{temp_db_name}', connect_args={'check_same_thread': False})
        df.to_sql('data', data_handler.engine, index=False, if_exists='replace')
        data_handler.db_sqlalchemy = SQLDatabase(data_handler.engine)
        
        # Initialize agents with the restored data
        agent_services.initialize_agents(data_handler)
        
        print(f"✅ Backend initialized successfully with {len(data)} rows")
        print(f"📊 Data shape: {df.shape}")
        print(f"🏷️ Columns: {df.columns.tolist()}")
        
        return {
            "success": True,
            "message": f"Backend initialized with {len(data)} rows",
            "rows": len(data),
            "columns": df.columns.tolist(),
            "filename": filename
        }
        
    except Exception as e:
        print(f"❌ Error initializing backend with data: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to initialize backend: {str(e)}")

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

@app.post("/api/analyze-chart")
async def analyze_chart(request: AnalyzeChartRequest):
    """
    Analyze a chart image using Gemini Vision API and return structured insights.
    """
    try:
        print(f"🔍 === CHART ANALYSIS REQUEST ===")
        print(f"🖼️ Image path: {request.image_path}")
        print(f"💬 Original query: {request.original_query}")
        
        # Use the agent services to analyze the chart
        analysis_result = agent_services.analyze_chart_with_gemini(
            request.image_path, 
            request.original_query
        )
        
        print(f"✅ Analysis completed")
        print(f"📊 Source: {analysis_result.get('source', 'unknown')}")
        print(f"🎯 Confidence: {analysis_result.get('confidence', 'unknown')}")
        
        return {
            "success": True,
            "analysis": analysis_result
        }
        
    except Exception as e:
        print(f"❌ Error analyzing chart: {str(e)}")
        import traceback
        print(f"📚 Full traceback: {traceback.format_exc()}")
        
        # Return error response with fallback
        fallback_analysis = agent_services._generate_fallback_analysis(
            request.image_path, 
            request.original_query
        )
        
        return {
            "success": False,
            "error": str(e),
            "analysis": fallback_analysis
        }

@app.get("/api/health")
async def health_check():
    # Check if services are properly initialized
    services_status = {
        "data_handler": "available" if data_handler else "unavailable",
        "agent_services": "available" if agent_services else "unavailable",
        "report_generator": "available" if report_generator else "unavailable",
        "speech_utils": "available" if speech_util else "unavailable"
    }
    
    # Check LLM status
    llm_status = "available" if settings.LLM else "unavailable"
    
    # Determine overall status
    if all(status == "available" for status in services_status.values()) and llm_status == "available":
        overall_status = "healthy"
    else:
        overall_status = "degraded"
    
    return {
        "status": overall_status,
        "data_loaded": data_handler.get_df() is not None if data_handler else False,
        "llm": llm_status,
        "services": services_status,
        "api_keys": {
            "groq_api_key": "configured" if settings.GROQ_API_KEY else "missing",
            "azure_speech_key": "configured" if settings.AZURE_SPEECH_KEY else "missing"
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
        prompt = f"""IMPORTANT: This is a completely new synthetic dataset generation request. Ignore any previous dataset structures, column names, or data patterns from earlier conversations.

Create a brand new synthetic dataset with the following specifications:

Description: {dataset_request.description}
Number of rows: {dataset_request.rows}
"""
        
        if dataset_request.column_specs:
            prompt += f"Column specifications: {dataset_request.column_specs}\n"
        elif dataset_request.columns:
            prompt += f"Number of columns: {dataset_request.columns}\n"
        
        prompt += """
Generate completely fresh, realistic sample data that matches ONLY the description above. 

CRITICAL INSTRUCTIONS:
1. COMPLETELY IGNORE any previous dataset structures or column names
2. CREATE ENTIRELY NEW column names that match the current description
3. You MUST return ONLY valid JSON in the exact format below
4. Do NOT include any explanatory text, markdown formatting, or additional comments
5. Do NOT use ```json``` code blocks
6. Return raw JSON only

Required JSON structure:
{
    "columns": ["Column1", "Column2", ...],
    "data": [
        {"Column1": "value1", "Column2": "value2", ...},
        ...
    ]
}

Data quality guidelines:
- Create column names that specifically match the current dataset description
- If it's sales data, include realistic product names, dates, amounts, customer names, etc.
- If it's employee data, include realistic names, departments, salaries, hire dates, etc.
- If it's student grades, include student names, subjects, grades, etc.
- Use appropriate data types (strings, numbers, dates) for each column
- Ensure data makes logical sense (e.g., dates are in reasonable order, amounts are realistic)
- Make data varied and realistic
- DO NOT reuse column structures from any previous requests

RESPONSE FORMAT: Start your response with { and end with } - nothing else."""

        print(f"🧠 Sending prompt to LLM: {prompt}")
        
        # Create a fresh LLM instance to avoid context contamination
        from settings import initialize_llm
        fresh_llm = initialize_llm()
        
        if not fresh_llm:
            print("❌ Failed to create fresh LLM instance")
            raise HTTPException(status_code=500, detail="LLM initialization failed")
        
        # Use the fresh LLM instance to generate the dataset
        response = fresh_llm.invoke(prompt)
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

@app.post("/api/orchestrate")
async def orchestrate_compound_query(request: CompoundQueryRequest):
    """
    Process compound queries using the query orchestrator
    Handles complex multi-step operations with intelligent decomposition
    """
    print(f"🎭 === COMPOUND QUERY ORCHESTRATION ENDPOINT ===")
    print(f"📥 Query: {request.query}")
    print(f"🔷 Workspace ID: {request.workspace_id}")
    print(f"👁️ Preview Only: {request.preview_only}")
    
    try:
        orchestrator = get_orchestrator()
        
        if request.preview_only:
            # Just decompose and plan, don't execute
            print("👁️ Preview mode - generating execution plan only")
            
            # Create minimal workspace context for planning
            from query_orchestrator import WorkspaceContext
            workspace_context = WorkspaceContext(request.workspace_id)
            
            # TODO: Load actual workspace state from database
            # For now, simulate some column info
            workspace_context.columns = {
                "A": {"index": 0, "type": "text", "name": "Column A"},
                "B": {"index": 1, "type": "number", "name": "Column B"},
                "C": {"index": 2, "type": "text", "name": "Column C"}
            }
            
            # Decompose query
            operations = orchestrator.decompose_query(request.query, workspace_context)
            
            if not operations:
                return {
                    "success": False,
                    "error": "Could not decompose query into operations",
                    "preview": True
                }
            
            # Validate and create execution plan
            valid, validation_message = orchestrator.validate_steps(operations)
            if not valid:
                return {
                    "success": False,
                    "error": f"Invalid operation plan: {validation_message}",
                    "operations": [op.__dict__ for op in operations],
                    "preview": True
                }
            
            execution_plan = orchestrator.create_execution_plan(operations)
            
            return {
                "success": True,
                "message": f"Generated execution plan with {len(operations)} operations",
                "operations": [op.__dict__ for op in operations],
                "execution_plan": [[op.__dict__ for op in level] for level in execution_plan],
                "preview": True,
                "estimated_steps": len(operations)
            }
        
        else:
            # Full orchestration with execution
            print("🎭 Full orchestration mode - executing compound query")
            result = await orchestrator.orchestrate_query(request.query, request.workspace_id)
            
            return result
            
    except Exception as e:
        print(f"❌ Compound query orchestration failed: {str(e)}")
        return {
            "success": False,
            "error": f"Orchestration failed: {str(e)}",
            "query": request.query,
            "workspace_id": request.workspace_id
        }

# ===========================================
# LEARN MODE SPECIFIC ENDPOINTS
# ===========================================

class LearnModeQueryRequest(BaseModel):
    question: str
    workspace_id: str
    chat_id: Optional[str] = None
    user_progress: Optional[List[Dict[str, Any]]] = None
    sheet_context: Optional[Dict[str, Any]] = None
    is_first_message: Optional[bool] = False
    conversation_history: Optional[List[Dict[str, Any]]] = None

@app.post("/api/learn/query")
async def process_learn_query(request: LearnModeQueryRequest):
    """Process queries specifically for Learn Mode with teaching-focused responses"""
    print("📚 === LEARN MODE QUERY ENDPOINT ===")
    print(f"📚 Question: {request.question}")
    print(f"📚 Chat ID: {request.chat_id}")
    print(f"📚 Conversation History: {len(request.conversation_history or [])} messages")

    # Validate conversation history format
    conversation_valid = True
    if request.conversation_history:
        print("📚 Validating conversation history format...")
        for i, msg in enumerate(request.conversation_history):
            if not isinstance(msg, dict):
                print(f"⚠️  Invalid message format at index {i}: not a dict")
                conversation_valid = False
                continue

            role = msg.get('role')
            content = msg.get('content')

            if role not in ['user', 'assistant']:
                print(f"⚠️  Invalid role at index {i}: {role}")
                conversation_valid = False

            if not content or not isinstance(content, str):
                print(f"⚠️  Invalid content at index {i}: {content}")
                conversation_valid = False

            print(f"  {i+1}. {role}: {content[:100]}...")

        if conversation_valid:
            print("✅ Conversation history format is valid")
        else:
            print("❌ Conversation history has format issues - proceeding with caution")
    else:
        print("📚 No conversation history - treating as first message")

    try:
        ai_processor = create_ai_processor("learn")
        context = {
            "workspace_type": "learn",
            "workspace_id": request.workspace_id,
            "chat_id": request.chat_id,
            "learning_progress": request.user_progress or [],
            "sheet_context": request.sheet_context or {}
        }

        processing_result = await ai_processor.process_query(request.question, context)

        # Build enhanced LLM prompt with user progress analysis and personalization
        try:
            from settings import initialize_llm
            llm = initialize_llm()
            if not llm:
                raise RuntimeError("LLM initialization failed")

            system_prompt = ai_processor.get_system_prompt()

            sheet_ctx = context.get("sheet_context", {})
            headers = sheet_ctx.get("headers") or []
            column_map = sheet_ctx.get("columnMap") or {}
            selection = sheet_ctx.get("currentSelection") or None
            data_rows = sheet_ctx.get("data") or []
            sample_rows = data_rows[:10] if isinstance(data_rows, list) else []

            # Build conversation history context with validation
            conversation_context = ""
            if request.conversation_history and conversation_valid:
                print("📚 Building conversation context for LLM...")
                conversation_context = "\nPREVIOUS CONVERSATION:\n"
                for msg in request.conversation_history[-10:]:  # Last 10 messages for context
                    # Additional safety checks
                    if not isinstance(msg, dict):
                        continue
                    role = msg.get('role', 'unknown')
                    content = msg.get('content', '')
                    if not content:
                        continue
                    conversation_context += f"{role.upper()}: {content}\n"
                    print(f"📚   Added to context: {role}: {content[:50]}...")
                conversation_context += "\n"
                print(f"📚 Final conversation context length: {len(conversation_context)} chars")
            elif request.conversation_history and not conversation_valid:
                print("📚 Skipping malformed conversation history - treating as first message")
            else:
                print("📚 No conversation history provided - this appears to be first message")

            # Build comprehensive teaching prompt
            conversation_status = "FIRST TIME USER - NO PREVIOUS CONVERSATION" if not conversation_context.strip() else "RETURNING USER - CONVERSATION HISTORY BELOW"

            prompt = (
                f"{system_prompt}\n\n"
                f"═══════════════════════════════════════════════════════════════\n"
                f"CURRENT SESSION CONTEXT\n"
                f"═══════════════════════════════════════════════════════════════\n\n"
                f"📊 USER'S SPREADSHEET DATA:\n"
                f"Available columns: {', '.join(headers) if headers else 'No data loaded yet'}\n"
                f"Column mapping (A1 notation): {column_map}\n"
                f"Current selection: {selection if selection else 'None'}\n"
                f"Sample data (first 10 rows):\n{sample_rows}\n\n"
                f"💬 CONVERSATION STATUS: {conversation_status}\n"
                f"{conversation_context}"
                f"{'─' * 63}\n\n"
                f"🎯 CURRENT USER MESSAGE:\n\"{request.question}\"\n\n"
                f"{'─' * 63}\n\n"
                f"📋 YOUR RESPONSE INSTRUCTIONS:\n\n"
                f"1. ANALYZE CONVERSATION CONTEXT:\n"
                f"   • Read the conversation history carefully (if it exists)\n"
                f"   • What skill level has the user demonstrated?\n"
                f"   • What were they just talking about?\n"
                f"   • What is their current goal or question?\n\n"
                f"2. INTERPRET CURRENT MESSAGE:\n"
                f"   • If they say \"not familiar\" - what are they responding to?\n"
                f"   • Does their question suggest intermediate/advanced understanding?\n"
                f"   • Are they asking to continue or starting something new?\n\n"
                f"3. FORMULATE APPROPRIATE RESPONSE:\n"
                f"   • Reference previous conversation points naturally\n"
                f"   • Teach at their demonstrated skill level\n"
                f"   • Use their actual data ({', '.join(headers[:3]) if headers else 'their data'}) in examples\n"
                f"   • Guide them toward their goal\n"
                f"   • Be conversational and encouraging\n\n"
                f"4. QUALITY CHECKS:\n"
                f"   ✓ Does this response build on previous messages?\n"
                f"   ✓ Am I teaching at the right level for this user?\n"
                f"   ✓ Am I using their actual spreadsheet data?\n"
                f"   ✓ Am I helping them achieve their stated goal?\n"
                f"   ✗ Am I repeating questions I already asked?\n"
                f"   ✗ Am I resetting to basics unnecessarily?\n\n"
                f"Now provide your teaching response:\n"
            )

            llm_response = llm.invoke(prompt)
            response_text = getattr(llm_response, "content", None) or str(llm_response)

            return {
                "response": response_text.strip(),
                "type": processing_result.get("response_type", "teaching"),
                "guiding_questions": processing_result.get("guiding_questions", []),
                "suggested_concept": processing_result.get("suggested_concept"),
                "step_by_step_breakdown": processing_result.get("step_by_step_breakdown", []),
                "requires_teaching": True,
                "workspace_type": "learn"
            }

        except Exception as gen_err:
            print(f"⚠️ Learn LLM generation failed, using processor fallback: {gen_err}")
            # Fallback to processor-only result
            return {
                "response": processing_result.get("response", "Let's explore this concept together!"),
                "type": processing_result.get("response_type", "teaching"),
                "guiding_questions": processing_result.get("guiding_questions", []),
                "suggested_concept": processing_result.get("suggested_concept"),
                "step_by_step_breakdown": processing_result.get("step_by_step_breakdown", []),
                "requires_teaching": True,
                "workspace_type": "learn"
            }

    except Exception as e:
        print(f"❌ Learn mode query failed: {str(e)}")
        return {
            "response": "I'm here to help you learn! Let's try that again.",
            "type": "error",
            "error": str(e),
            "requires_teaching": True
        }

@app.get("/api/learn/progress/{workspace_id}")
async def get_learning_progress(workspace_id: str):
    """Get learning progress for a specific Learn Mode workspace"""
    # This would integrate with a database in a real implementation
    # For now, return mock data
    return {
        "workspace_id": workspace_id,
        "progress": [
            {
                "concept_id": "basic_functions",
                "skill_level": "mastered",
                "attempts_count": 5,
                "mastery_date": "2024-01-15T10:30:00Z"
            },
            {
                "concept_id": "cell_references",
                "skill_level": "proficient",
                "attempts_count": 3,
                "mastery_date": None
            }
        ]
    }

@app.post("/api/learn/practice-challenge")
async def generate_practice_challenge(
    concept_id: str = Query(..., description="The concept to practice"),
    difficulty: str = Query("beginner", description="Difficulty level")
):
    """Generate practice challenges for Learn Mode (not available in Work Mode)"""

    # Mock practice challenges - would be generated by AI in real implementation
    challenges = {
        "basic_functions": {
            "beginner": {
                "challenge": "Calculate the total sales for all products using the SUM function.",
                "dataset": [
                    {"Product": "A", "Sales": 100},
                    {"Product": "B", "Sales": 150},
                    {"Product": "C", "Sales": 200}
                ],
                "expected_formula": "=SUM(B2:B4)",
                "hints": [
                    "Use the SUM function to add numbers",
                    "Select the range of cells containing sales data",
                    "The formula should start with ="
                ]
            }
        },
        "vlookup": {
            "beginner": {
                "challenge": "Look up the price for Product B using VLOOKUP.",
                "dataset": [
                    {"Product": "A", "Price": 10.99},
                    {"Product": "B", "Price": 15.50},
                    {"Product": "C", "Price": 8.75}
                ],
                "expected_formula": "=VLOOKUP(\"B\",A2:B4,2,FALSE)",
                "hints": [
                    "VLOOKUP searches for a value in the first column",
                    "Use FALSE for exact match",
                    "Column index 2 returns the price"
                ]
            }
        }
    }

    challenge_data = challenges.get(concept_id, {}).get(difficulty)
    if not challenge_data:
        return {
            "error": f"No challenges available for {concept_id} at {difficulty} level"
        }

    return {
        "concept_id": concept_id,
        "difficulty": difficulty,
        "challenge": challenge_data["challenge"],
        "dataset": challenge_data["dataset"],
        "hints": challenge_data["hints"],
        "learning_objective": f"Master {concept_id} through hands-on practice"
    }

@app.get("/api/learn/datasets")
async def get_learning_datasets():
    """Get available curated learning datasets"""
    # This would query the learning_datasets table in a real implementation
    return {
        "datasets": [
            {
                "id": "basic-functions-tutorial",
                "name": "Basic Functions Tutorial",
                "concept_category": "basic_functions",
                "difficulty_level": "beginner",
                "description": "Learn SUM, AVERAGE, COUNT with employee data",
                "prerequisites": []
            },
            {
                "id": "vlookup-fundamentals",
                "name": "VLOOKUP Fundamentals",
                "concept_category": "lookups",
                "difficulty_level": "intermediate",
                "description": "Master lookup functions with product data",
                "prerequisites": ["basic_functions"]
            }
        ]
    }

@app.post("/api/workspace/{workspace_id}/analyze-insights")
async def analyze_workspace_insights(
    workspace_id: str,
    analysis_type: str = Query('comprehensive', regex='^(quick|comprehensive|focused)$'),
    focus_area: Optional[str] = Query(None, regex='^(anomalies|trends|correlations)$')
):
    """
    Intelligent data analysis endpoint for proactive insights.

    Parameters:
    - workspace_id: ID of the workspace to analyze
    - analysis_type:
        * 'quick': Light analysis (outliers, basic stats) - runs on upload
        * 'comprehensive': Deep analysis (seasonality, correlations, causation)
        * 'focused': Targeted analysis on specific aspect
    - focus_area: Optional focus ('anomalies' | 'trends' | 'correlations')
    """
    try:
        print(f"🔍 === INTELLIGENT ANALYSIS REQUEST ===")
        print(f"   - Workspace ID: {workspace_id}")
        print(f"   - Analysis Type: {analysis_type}")
        print(f"   - Focus Area: {focus_area}")

        # Get current DataFrame from data handler
        df = data_handler.get_df()

        if df is None or df.empty:
            raise HTTPException(
                status_code=404,
                detail="No data found in workspace. Please upload data first."
            )

        print(f"📊 Data shape: {df.shape}")
        print(f"🏷️ Columns: {df.columns.tolist()}")

        # Initialize IntelligentAnalyzer
        analyzer = IntelligentAnalyzer(df, settings.LLM)

        # Run analysis based on type
        if analysis_type == 'quick':
            profile = analyzer.analyze_quick_profile()
            anomalies = analyzer.detect_anomalies(method='zscore', threshold=3.5)[:5]  # Top 5
            correlations = []
            seasonality = None
            summary = "Quick data profile complete."
            print("✅ Quick analysis complete")

        elif analysis_type == 'comprehensive':
            profile = analyzer.analyze_quick_profile()
            anomalies = analyzer.detect_anomalies(method='zscore', threshold=3.0)
            correlations = analyzer.identify_correlations(threshold=0.7)

            # Detect seasonality if temporal data exists
            seasonality = None
            if analyzer.temporal_cols and analyzer.numeric_cols:
                try:
                    seasonality = analyzer.detect_seasonality(
                        analyzer.temporal_cols[0],
                        analyzer.numeric_cols[0]
                    )
                    print(f"📈 Seasonality: {seasonality.get('description') if seasonality else 'None detected'}")
                except Exception as e:
                    print(f"⚠️ Seasonality detection failed: {e}")

            # Generate executive summary
            try:
                summary = analyzer.generate_executive_summary(anomalies, correlations, seasonality)
                print(f"📝 Summary: {summary}")
            except Exception as e:
                print(f"⚠️ Summary generation failed: {e}")
                summary = "Data analysis complete. Review detailed findings below."

            print("✅ Comprehensive analysis complete")

        else:  # focused
            profile = analyzer.analyze_quick_profile()
            anomalies = []
            correlations = []
            seasonality = None

            if focus_area == 'anomalies':
                anomalies = analyzer.detect_anomalies(method='zscore', threshold=3.0)
                summary = f"Focused anomaly detection complete. Found {len(anomalies)} outliers."
            elif focus_area == 'trends' and analyzer.temporal_cols:
                if analyzer.numeric_cols:
                    seasonality = analyzer.detect_seasonality(
                        analyzer.temporal_cols[0],
                        analyzer.numeric_cols[0]
                    )
                summary = f"Trend analysis complete."
            elif focus_area == 'correlations':
                correlations = analyzer.identify_correlations(threshold=0.6)
                summary = f"Correlation analysis complete. Found {len(correlations)} significant relationships."
            else:
                summary = f"Focused analysis on {focus_area} complete."

            print("✅ Focused analysis complete")

        # Generate visualization suggestions
        viz_suggestions = analyzer.suggest_visualizations()
        print(f"💡 {len(viz_suggestions)} visualization suggestions generated")

        # Return structured response
        response = {
            "analysis_type": analysis_type,
            "summary": summary,
            "profile": profile,
            "anomalies": anomalies[:10],  # Limit to top 10
            "seasonality": seasonality,
            "correlations": correlations[:10],  # Limit to top 10
            "visualizations": [],  # Future: integrate with chart generation
            "recommendations": [
                "Investigate anomalies flagged as 'high' or 'critical' severity",
                "Explore correlations with p-value < 0.01 for potential causation",
                "Consider time-based analysis if seasonal patterns detected"
            ]
        }

        print("🎉 === INTELLIGENT ANALYSIS COMPLETE ===")
        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Analysis failed for workspace {workspace_id}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Analysis failed: {str(e)}"
        )

@app.post("/api/workspace/{workspace_id}/predict")
async def predict_workspace(
    workspace_id: str,
    target_column: str = Query(..., description="Column to predict"),
    prediction_type: str = Query('auto', regex='^(auto|forecast|regression|classification|trend)$'),
    periods: int = Query(10, ge=1, le=100, description="Number of periods to predict"),
    feature_columns: Optional[str] = Query(None, description="Comma-separated feature columns"),
    confidence_level: float = Query(0.95, ge=0.5, le=0.99)
):
    """
    Intelligent prediction endpoint with automatic model selection.

    Parameters:
    - workspace_id: ID of workspace
    - target_column: Column to predict (required)
    - prediction_type: 'auto' (detect) | 'forecast' | 'regression' | 'classification' | 'trend'
    - periods: Number of future periods to predict (default: 10)
    - feature_columns: Comma-separated list of predictor columns (auto-detect if None)
    - confidence_level: Confidence level for intervals (default: 0.95)

    Returns:
    {
        "prediction_type": str,
        "method": str,
        "predictions": [...],
        "model_performance": {...},
        "visualization": {"type": "matplotlib_figure", "path": "/static/visualizations/..."},
        "summary": str,
        "recommendations": [...]
    }
    """
    try:
        print(f"🔮 === PREDICTION REQUEST ===")
        print(f"   - Workspace ID: {workspace_id}")
        print(f"   - Target Column: {target_column}")
        print(f"   - Prediction Type: {prediction_type}")
        print(f"   - Periods: {periods}")

        # Get DataFrame
        df = data_handler.get_df()
        if df is None or df.empty:
            raise HTTPException(status_code=404, detail="No data found in workspace. Please upload data first.")

        # Validate target column
        if target_column not in df.columns:
            available = ', '.join(df.columns.tolist()[:10])
            raise HTTPException(
                status_code=400,
                detail=f"Column '{target_column}' not found. Available: {available}..."
            )

        # Parse feature columns
        features = None
        if feature_columns:
            features = [col.strip() for col in feature_columns.split(',')]
            invalid = [col for col in features if col not in df.columns]
            if invalid:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid feature columns: {', '.join(invalid)}"
                )

        # Initialize PredictiveAnalyzer
        predictor = PredictiveAnalyzer(df, settings.LLM)

        # Execute prediction based on type
        if prediction_type == 'auto':
            result = predictor.auto_predict(
                target_column=target_column,
                periods=periods,
                feature_cols=features
            )
        elif prediction_type == 'forecast':
            # Need temporal column
            if not predictor.temporal_cols:
                raise HTTPException(
                    status_code=400,
                    detail="No temporal column found for forecasting"
                )
            result = predictor.forecast_timeseries(
                temporal_col=predictor.temporal_cols[0],
                value_col=target_column,
                periods=periods,
                confidence_level=confidence_level
            )
        elif prediction_type == 'regression':
            result = predictor.predict_regression(
                target_col=target_column,
                feature_cols=features
            )
        elif prediction_type == 'classification':
            result = predictor.predict_classification(
                target_col=target_column,
                feature_cols=features
            )
        elif prediction_type == 'trend':
            if not predictor.temporal_cols:
                raise HTTPException(
                    status_code=400,
                    detail="No temporal column found for trend analysis"
                )
            result = predictor.analyze_trend(
                temporal_col=predictor.temporal_cols[0],
                value_col=target_column,
                extrapolate_periods=periods,
                confidence_level=confidence_level
            )

        # Check for errors in result
        if 'error' in result:
            raise HTTPException(status_code=400, detail=result['error'])

        # Generate visualization if visualization_data provided
        visualization = None
        if 'visualization_data' in result:
            viz_path = _generate_prediction_visualization(
                result['visualization_data'],
                result.get('prediction_type', prediction_type),
                target_column
            )
            visualization = {
                "type": "matplotlib_figure",
                "path": viz_path
            }

        # Generate summary using LLM if available
        summary = _generate_prediction_summary(result, settings.LLM)

        # Return response
        response = {
            "prediction_type": result.get('prediction_type', prediction_type),
            "method": result.get('method', 'Unknown'),
            "predictions": result.get('predictions', [])[:100],  # Limit size
            "model_performance": result.get('model_performance', {}),
            "visualization": visualization,
            "summary": summary,
            "recommendations": _generate_recommendations(result)
        }

        print("🎉 === PREDICTION COMPLETE ===")
        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Prediction failed: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")


def _generate_prediction_visualization(viz_data: Dict, pred_type: str, target_col: str) -> str:
    """Generate matplotlib visualization for predictions"""
    import matplotlib.pyplot as plt
    import matplotlib.dates as mdates

    fig, ax = plt.subplots(figsize=(12, 6))

    if pred_type in ['forecast', 'trend']:
        # Time series plot with confidence intervals
        if 'historical_dates' in viz_data:
            dates = pd.to_datetime(viz_data['historical_dates'])
            ax.plot(dates, viz_data['historical_values'],
                   label='Historical', marker='o', linewidth=2, markersize=4)

        if 'forecast_dates' in viz_data:
            forecast_dates = pd.to_datetime(viz_data['forecast_dates'])
            ax.plot(forecast_dates, viz_data['forecast_values'],
                   label='Forecast', marker='s', linewidth=2, linestyle='--', markersize=4)

            # Confidence intervals
            if 'lower_bound' in viz_data and 'upper_bound' in viz_data:
                ax.fill_between(forecast_dates,
                               viz_data['lower_bound'],
                               viz_data['upper_bound'],
                               alpha=0.3, label='95% Confidence Interval')

        # Trend line if available
        if 'trend_line' in viz_data and 'historical_dates' in viz_data:
            ax.plot(dates, viz_data['trend_line'],
                   label='Trend Line', linewidth=2, linestyle=':', alpha=0.7)

        ax.set_xlabel('Date', fontsize=12)
        ax.set_ylabel(target_col, fontsize=12)
        ax.set_title(f'{pred_type.capitalize()}: {target_col}', fontsize=14, fontweight='bold')
        ax.xaxis.set_major_formatter(mdates.DateFormatter('%Y-%m-%d'))
        plt.xticks(rotation=45)

    elif pred_type == 'regression':
        # Actual vs Predicted scatter
        actual = np.array(viz_data['actual'])
        predicted = np.array(viz_data['predicted'])

        ax.scatter(actual, predicted, alpha=0.6, s=50, edgecolors='black', linewidth=0.5)

        # Perfect prediction line
        min_val = min(actual.min(), predicted.min())
        max_val = max(actual.max(), predicted.max())
        ax.plot([min_val, max_val], [min_val, max_val],
               'r--', label='Perfect Prediction', linewidth=2)

        ax.set_xlabel('Actual', fontsize=12)
        ax.set_ylabel('Predicted', fontsize=12)
        ax.set_title(f'Regression: Actual vs Predicted ({target_col})', fontsize=14, fontweight='bold')

    ax.legend(fontsize=10)
    ax.grid(True, alpha=0.3, linestyle='--')
    plt.tight_layout()

    # Save figure
    filename = f"pred_{uuid.uuid4().hex[:8]}.png"
    filepath = os.path.join(CHARTS_DIR, filename)
    fig.savefig(filepath, dpi=300, bbox_inches='tight')
    plt.close(fig)

    return f"/static/visualizations/{filename}"


def _generate_prediction_summary(result: Dict, llm) -> str:
    """Generate natural language summary of predictions"""
    if llm:
        try:
            prompt = f"""
            Summarize these prediction results in 2-3 sentences for a business user:

            Prediction Type: {result.get('prediction_type')}
            Method: {result.get('method')}
            Performance: {result.get('model_performance', {}).get('metrics', {})}

            Focus on accuracy, reliability, and actionable insights.
            Be concise and avoid technical jargon.
            """
            summary = llm.generate_content(prompt).text
            return summary.strip()
        except:
            pass

    # Fallback summary
    method = result.get('method', 'Unknown')
    pred_type = result.get('prediction_type', 'prediction')
    return f"{pred_type.capitalize()} completed using {method}. Review detailed results below."


def _generate_recommendations(result: Dict) -> List[str]:
    """Generate actionable recommendations based on prediction results"""
    recommendations = []

    performance = result.get('model_performance', {})
    metrics = performance.get('metrics', {})

    # Add recommendations based on performance
    if 'r2' in metrics:
        r2 = metrics['r2']
        if r2 > 0.8:
            recommendations.append("Model shows strong predictive power (R² > 0.8)")
        elif r2 < 0.5:
            recommendations.append("Low R² suggests limited predictive power - consider additional features")

    if 'accuracy' in metrics:
        acc = metrics['accuracy']
        if acc > 0.85:
            recommendations.append("High classification accuracy achieved")
        elif acc < 0.7:
            recommendations.append("Classification accuracy below 70% - review feature selection")

    if 'mape' in metrics:
        mape = metrics['mape']
        if mape < 15:
            recommendations.append(f"Model shows strong predictive power (MAPE: {mape:.1f}%)")
        elif mape > 30:
            recommendations.append(f"High forecast error (MAPE: {mape:.1f}%) - consider alternative models")

    # Generic recommendations
    recommendations.extend([
        "Review confidence intervals for uncertainty assessment",
        "Consider retraining model as new data becomes available",
        "Validate predictions against domain knowledge"
    ])

    return recommendations

@app.post("/api/workspace/{workspace_id}/smart-format")
async def smart_format_workspace(
    workspace_id: str,
    template: Optional[str] = Query('professional', regex='^(professional|financial|minimal)$')
):
    """
    Smart auto-formatting endpoint for spreadsheet data.

    Parameters:
        - workspace_id: ID of the workspace to format
        - template: Formatting template to apply
            * 'professional': Blue header, comprehensive formatting (default)
            * 'financial': Dark header, currency-optimized formatting
            * 'minimal': Light header, clean minimal formatting

    Returns:
        Formatting instructions for frontend to apply via UniverAdapter
    """
    try:
        print(f"📐 === SMART FORMATTING REQUEST ===")
        print(f"   - Workspace ID: {workspace_id}")
        print(f"   - Template: {template}")

        # Get current DataFrame from data handler
        df = data_handler.get_df()

        if df is None or df.empty:
            raise HTTPException(
                status_code=404,
                detail="No data found in workspace. Please upload data first."
            )

        print(f"📊 Data shape: {df.shape}")
        print(f"🏷️ Columns: {df.columns.tolist()}")

        # Initialize SmartFormatter
        formatter = SmartFormatter(df, settings.LLM)

        # Generate formatting instructions
        formatting = formatter.generate_formatting_instructions(template)

        print(f"✅ Generated formatting for {len(formatting['column_formats'])} columns")
        print(f"📋 Detected types: {formatting['column_types']}")

        return {
            "success": True,
            "formatting": formatting,
            "message": formatting['summary']
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Smart formatting error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error generating formatting instructions: {str(e)}"
        )

# ============================================================================
# QUICK DATA ENTRY ENDPOINT
# ============================================================================

def match_columns_to_headers(user_data: Dict[str, Any], headers: List[str]) -> Dict[int, Any]:
    """
    Fuzzy match user column names to actual spreadsheet headers.

    Args:
        user_data: Dict of {column_name: value} from user input
        headers: List of actual column headers in spreadsheet

    Returns:
        Dict mapping column indices to values
    """
    result = {}

    for user_col, value in user_data.items():
        user_col_lower = user_col.lower().strip()
        best_match_idx = -1
        best_match_score = 0.0

        for idx, header in enumerate(headers):
            header_lower = str(header).lower().strip()

            # 1. Exact match (case-insensitive)
            if user_col_lower == header_lower:
                best_match_idx = idx
                best_match_score = 1.0
                break

            # 2. Partial match (user column is substring of header)
            if user_col_lower in header_lower or header_lower in user_col_lower:
                score = 0.8
                if score > best_match_score:
                    best_match_idx = idx
                    best_match_score = score

            # 3. Similarity score using SequenceMatcher
            similarity = SequenceMatcher(None, user_col_lower, header_lower).ratio()
            if similarity > best_match_score:
                best_match_idx = idx
                best_match_score = similarity

        # Only accept matches above 60% threshold
        if best_match_score >= 0.6 and best_match_idx >= 0:
            result[best_match_idx] = value

    return result

def process_single_row_entry(df: pd.DataFrame, row_data: Dict[str, Any], position: str) -> Dict[str, Any]:
    """
    Process single row insertion with fuzzy column matching.

    Args:
        df: Current DataFrame
        row_data: Dict of column-value pairs from user
        position: 'top', 'bottom', or numeric row index

    Returns:
        Dict with row_values array and actual_position
    """
    headers = df.columns.tolist()

    # Fuzzy match columns
    matched_columns = match_columns_to_headers(row_data, headers)

    # Create row array with None for unmatched columns
    row_values = [None] * len(headers)
    for col_idx, value in matched_columns.items():
        row_values[col_idx] = value

    # Determine insert position
    # Note: DataFrame doesn't include header in row count
    # Spreadsheet has header at row 0, data starts at row 1
    if position == 'top':
        actual_position = 1  # Insert after header, as first data row
    elif position == 'bottom':
        actual_position = len(df) + 1  # Append after all data, +1 for header offset
    else:
        try:
            actual_position = int(position)
            # Clamp to valid range (1 to len(df)+1)
            actual_position = max(1, min(actual_position, len(df) + 1))
        except:
            actual_position = len(df) + 1  # Default to bottom

    return {
        'row_values': row_values,
        'actual_position': actual_position,
        'matched_count': len(matched_columns),
        'total_columns': len(headers)
    }

def process_multiple_row_generation(df: pd.DataFrame, count: int, entity_type: str, fields_hint: str) -> Dict[str, Any]:
    """
    Generate multiple realistic data rows using LLM.

    Args:
        df: Current DataFrame
        count: Number of rows to generate
        entity_type: Type of entity (e.g., "customers", "products")
        fields_hint: Optional hints about what fields to include

    Returns:
        Dict with generated rows (2D array)
    """
    headers = df.columns.tolist()

    # Build prompt for LLM
    prompt = f"""Generate {count} realistic sample rows of data for a spreadsheet.

Entity type: {entity_type}
Columns: {', '.join(headers)}
{f'Additional requirements: {fields_hint}' if fields_hint else ''}

Return ONLY a JSON array of arrays, where each inner array represents one row with values matching the column order.
Example format: [["value1", "value2", ...], ["value3", "value4", ...]]

Important:
- Generate exactly {count} rows
- Each row must have exactly {len(headers)} values
- Values should be realistic and diverse
- Use appropriate data types (numbers for numeric columns, dates for date columns, etc.)
- Do NOT include column headers in the output
"""

    try:
        # Use Google Gemini LLM
        llm = settings.llm
        response = llm.invoke(prompt)

        # Parse JSON response
        content = response.content if hasattr(response, 'content') else str(response)

        # Extract JSON array
        json_match = re.search(r'\[\s*\[.*?\]\s*\]', content, re.DOTALL)
        if json_match:
            rows_data = json.loads(json_match.group())
        else:
            # Fallback: try parsing entire content
            rows_data = json.loads(content)

        # Validate row count and column count
        if len(rows_data) != count:
            print(f"⚠️ LLM generated {len(rows_data)} rows instead of {count}")

        for row in rows_data:
            if len(row) != len(headers):
                print(f"⚠️ Row has {len(row)} values instead of {len(headers)}")

        return {
            'rows': rows_data,
            'count': len(rows_data)
        }

    except json.JSONDecodeError as e:
        print(f"❌ Failed to parse LLM response as JSON: {str(e)}")
        # Generate placeholder data as fallback
        placeholder_rows = []
        for i in range(count):
            row = [f"Sample {i+1}" if j == 0 else None for j in range(len(headers))]
            placeholder_rows.append(row)
        return {
            'rows': placeholder_rows,
            'count': count,
            'fallback': True
        }

    except Exception as e:
        print(f"❌ Error generating rows: {str(e)}")
        raise

def process_header_creation(headers: List[str]) -> Dict[str, Any]:
    """
    Process header row creation with type detection.

    Args:
        headers: List of column header names

    Returns:
        Dict with headers and detected types
    """
    column_types = {}

    for header in headers:
        header_lower = header.lower()

        # Detect column types from header names
        if any(keyword in header_lower for keyword in ['price', 'cost', 'amount', 'revenue', 'salary', 'fee', 'payment', 'usd', 'dollar', 'total']):
            column_types[header] = 'currency'
        elif any(keyword in header_lower for keyword in ['date', 'time', 'created', 'updated']):
            column_types[header] = 'date'
        elif any(keyword in header_lower for keyword in ['quantity', 'count', 'number', 'qty', 'id']):
            column_types[header] = 'integer'
        elif any(keyword in header_lower for keyword in ['percent', 'rate', '%', 'ratio']):
            column_types[header] = 'percentage'
        else:
            column_types[header] = 'text'

    return {
        'headers': headers,
        'column_types': column_types
    }

class QuickDataEntryRequest(BaseModel):
    action: str  # 'add_single_row', 'generate_multiple_rows', 'create_headers'
    parameters: Dict[str, Any]
    workspace_id: str

@app.post("/api/workspace/{workspace_id}/quick-data-entry")
async def quick_data_entry(
    workspace_id: str,
    request: QuickDataEntryRequest
):
    """
    Quick data entry endpoint for natural language data insertion.

    Supports three operations:
    1. add_single_row: Insert one row with column-value pairs
    2. generate_multiple_rows: Generate N realistic rows using LLM
    3. create_headers: Create column headers (requires empty sheet)
    """
    try:
        print(f"📝 === QUICK DATA ENTRY REQUEST ===")
        print(f"   - Workspace ID: {workspace_id}")
        print(f"   - Action: {request.action}")
        print(f"   - Parameters: {request.parameters}")

        action = request.action
        params = request.parameters

        # Get current DataFrame from data handler
        df = data_handler.get_df()

        if df is None or df.empty:
            if action != 'create_headers':
                raise HTTPException(
                    status_code=400,
                    detail="Sheet is empty. Create headers first before adding data rows."
                )

        # Process based on action
        if action == 'add_single_row':
            row_data_str = params.get('row_data_string', '')
            position = params.get('position', 'bottom')

            # Parse column-value pairs (this would be done on frontend, but included for completeness)
            # For now, expect parameters to include parsed data
            row_data = params.get('row_data', {})

            result = process_single_row_entry(df, row_data, position)

            return {
                "success": True,
                "action": "add_single_row",
                "data": result,
                "message": f"Ready to insert 1 row at position {result['actual_position']} with {result['matched_count']} filled cells"
            }

        elif action == 'generate_multiple_rows':
            count = params.get('count', 5)
            entity_type = params.get('entity_type', 'rows')
            fields_hint = params.get('fields_hint', '')

            result = process_multiple_row_generation(df, count, entity_type, fields_hint)

            return {
                "success": True,
                "action": "generate_multiple_rows",
                "data": result,
                "message": f"Generated {result['count']} sample {entity_type} rows"
            }

        elif action == 'create_headers':
            if df is not None and not df.empty:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot create headers on non-empty sheet"
                )

            headers = params.get('headers', [])
            if not headers:
                raise HTTPException(status_code=400, detail="No headers provided")

            result = process_header_creation(headers)

            return {
                "success": True,
                "action": "create_headers",
                "data": result,
                "message": f"Created {len(headers)} column headers"
            }

        else:
            raise HTTPException(status_code=400, detail=f"Unknown action: {action}")

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Quick data entry error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error processing data entry: {str(e)}"
        )

# ============================================================================
# KNOWLEDGE BASE ENDPOINTS
# ============================================================================

@app.post("/api/kb/create")
async def create_knowledge_base(request: Dict[str, Any]):
    """
    Create a new knowledge base.

    Body: {
        "user_id": str,
        "name": str,
        "description": str (optional)
    }
    """
    try:
        from document_processor import get_supabase_client

        # Use service key to bypass RLS for knowledge base creation
        supabase = get_supabase_client(use_service_key=True)
        user_id = request.get('user_id')
        name = request.get('name')
        description = request.get('description', '')

        if not user_id or not name:
            raise HTTPException(status_code=400, detail="user_id and name are required")

        # Insert into knowledge_bases table
        result = supabase.table('knowledge_bases').insert({
            'user_id': user_id,
            'name': name,
            'description': description
        }).execute()

        if result.data and len(result.data) > 0:
            kb_id = result.data[0]['id']
            logger.info(f"✅ Created knowledge base: {kb_id} - {name}")
            return {"success": True, "kb_id": kb_id, "kb": result.data[0]}
        else:
            raise HTTPException(status_code=500, detail="Failed to create knowledge base")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error creating knowledge base: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/kb/{kb_id}/upload")
async def upload_to_kb(kb_id: str, file: UploadFile = File(...)):
    """
    Upload and process file to knowledge base.

    Supports: PDF, DOCX, TXT, CSV, Excel

    Flow:
    1. Detect file type
    2. Save temporarily
    3. Process based on type:
       - PDF/DOCX/TXT -> DocumentProcessor -> embeddings -> pgvector
       - CSV/Excel -> DataHandler -> temp SQLite DB
    4. Update database with metadata
    5. Delete temp file
    """
    import os
    import shutil
    from document_processor import DocumentProcessor, TableExtractor, get_supabase_client
    from data_handler import DataHandler

    logger.info(f"📁 Uploading file to KB {kb_id}: {file.filename}")

    try:
        # Get file extension
        file_ext = file.filename.split('.')[-1].lower() if '.' in file.filename else ''

        # Save temporary file
        temp_filename = f"temp_{kb_id}_{file.filename}"
        temp_path = temp_filename  # We're already in the backend directory

        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        file_size = os.path.getsize(temp_path)
        logger.info(f"Saved temp file: {temp_path} ({file_size} bytes)")

        # Use service key to bypass RLS for file upload operations
        supabase = get_supabase_client(use_service_key=True)

        # Route to appropriate processor
        if file_ext == 'pdf':
            await process_pdf_for_kb(kb_id, temp_path, file.filename, supabase)
        elif file_ext == 'docx':
            await process_docx_for_kb(kb_id, temp_path, file.filename, supabase)
        elif file_ext == 'txt':
            await process_txt_for_kb(kb_id, temp_path, file.filename, supabase)
        elif file_ext in ['csv', 'xlsx']:
            await process_structured_for_kb(kb_id, temp_path, file.filename, supabase)
        else:
            os.remove(temp_path)
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {file_ext}")

        # Delete temp file
        if os.path.exists(temp_path):
            os.remove(temp_path)
            logger.info(f"Deleted temp file: {temp_path}")

        return {
            "success": True,
            "message": f"File {file.filename} uploaded and processed successfully",
            "file_type": file_ext
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error uploading file: {e}")
        # Clean up temp file on error
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise HTTPException(status_code=500, detail=str(e))


async def process_pdf_for_kb(kb_id: str, file_path: str, filename: str, supabase):
    """Process PDF: extract text, tables, generate embeddings."""
    from document_processor import DocumentProcessor, TableExtractor

    logger.info(f"📄 Processing PDF for KB: {filename}")

    try:
        # Create document record
        doc_result = supabase.table('kb_documents').insert({
            'kb_id': kb_id,
            'filename': filename,
            'file_type': 'pdf',
            'file_size_bytes': os.path.getsize(file_path),
            'processing_status': 'processing'
        }).execute()

        if not doc_result.data or len(doc_result.data) == 0:
            raise Exception("Failed to create document record")

        doc_id = doc_result.data[0]['id']
        logger.info(f"Created document record: {doc_id}")

        # Process PDF
        processor = DocumentProcessor()
        result = processor.process_pdf(file_path, kb_id, doc_id)

        # Generate embeddings
        if result['text_chunks']:
            embeddings = processor.generate_embeddings(result['text_chunks'])

            # Create metadata for chunks
            metadata = [{'page': i // 10 + 1} for i in range(len(result['text_chunks']))]

            # Save to vector database
            processor.save_to_vector_db(kb_id, doc_id, result['text_chunks'],
                                       embeddings, metadata, supabase)

        # Process extracted tables
        if result['tables']:
            table_extractor = TableExtractor()

            for table_data in result['tables']:
                try:
                    df = pd.DataFrame(table_data['data'])

                    # Create temp SQLite DB for this table
                    temp_db_path = table_extractor.create_temp_db_for_table(
                        df, kb_id, f"{doc_id}_table_{table_data['table_index']}"
                    )

                    # Save to kb_extracted_tables
                    supabase.table('kb_extracted_tables').insert({
                        'document_id': doc_id,
                        'kb_id': kb_id,
                        'page_number': table_data['page'],
                        'table_index': table_data['table_index'],
                        'table_data': table_data['data'],
                        'column_names': table_data['columns'],
                        'row_count': table_data['row_count'],
                        'temp_db_path': temp_db_path
                    }).execute()

                    logger.info(f"Saved table {table_data['table_index']} from page {table_data['page']}")

                except Exception as e:
                    logger.warning(f"Failed to process table {table_data['table_index']}: {e}")

        # Update document status to completed
        supabase.table('kb_documents').update({
            'processing_status': 'completed',
            'page_count': result['page_count'],
            'total_chunks': len(result['text_chunks']),
            'has_tables': result['has_tables']
        }).eq('id', doc_id).execute()

        logger.info(f"✅ PDF processing complete: {filename}")

    except Exception as e:
        logger.error(f"❌ Error processing PDF: {e}")
        # Mark as failed
        try:
            supabase.table('kb_documents').update({
                'processing_status': 'failed',
                'error_message': str(e)
            }).eq('id', doc_id).execute()
        except:
            pass
        raise


async def process_docx_for_kb(kb_id: str, file_path: str, filename: str, supabase):
    """Process DOCX: extract text, tables, generate embeddings."""
    from document_processor import DocumentProcessor, TableExtractor

    logger.info(f"📝 Processing DOCX for KB: {filename}")

    try:
        # Create document record
        doc_result = supabase.table('kb_documents').insert({
            'kb_id': kb_id,
            'filename': filename,
            'file_type': 'docx',
            'file_size_bytes': os.path.getsize(file_path),
            'processing_status': 'processing'
        }).execute()

        if not doc_result.data or len(doc_result.data) == 0:
            raise Exception("Failed to create document record")

        doc_id = doc_result.data[0]['id']
        logger.info(f"Created document record: {doc_id}")

        # Process DOCX
        processor = DocumentProcessor()
        result = processor.process_docx(file_path, kb_id, doc_id)

        # Generate embeddings
        if result['text_chunks']:
            embeddings = processor.generate_embeddings(result['text_chunks'])

            # Create metadata for chunks (DOCX doesn't have pages, use section/paragraph index)
            metadata = [{'section': i // 10 + 1} for i in range(len(result['text_chunks']))]

            # Save to vector database
            processor.save_to_vector_db(kb_id, doc_id, result['text_chunks'],
                                       embeddings, metadata, supabase)

        # Process extracted tables if any
        if result.get('tables'):
            table_extractor = TableExtractor()

            for table_data in result['tables']:
                try:
                    df = pd.DataFrame(table_data['data'])

                    # Create temp SQLite DB for this table
                    temp_db_path = table_extractor.create_temp_db_for_table(
                        df, kb_id, f"{doc_id}_table_{table_data['table_index']}"
                    )

                    # Save to kb_extracted_tables
                    supabase.table('kb_extracted_tables').insert({
                        'document_id': doc_id,
                        'kb_id': kb_id,
                        'page_number': 1,  # DOCX doesn't have page numbers
                        'table_index': table_data['table_index'],
                        'table_data': table_data['data'],
                        'column_names': table_data['columns'],
                        'row_count': table_data['row_count'],
                        'temp_db_path': temp_db_path
                    }).execute()

                    logger.info(f"Saved table {table_data['table_index']} from DOCX")

                except Exception as e:
                    logger.warning(f"Failed to process table {table_data['table_index']}: {e}")

        # Update document status to completed
        supabase.table('kb_documents').update({
            'processing_status': 'completed',
            'page_count': 1,  # DOCX doesn't have distinct pages
            'total_chunks': len(result['text_chunks']),
            'has_tables': result.get('has_tables', False)
        }).eq('id', doc_id).execute()

        logger.info(f"✅ DOCX processing complete: {filename}")

    except Exception as e:
        logger.error(f"❌ Error processing DOCX: {e}")
        # Mark as failed
        try:
            supabase.table('kb_documents').update({
                'processing_status': 'failed',
                'error_message': str(e)
            }).eq('id', doc_id).execute()
        except:
            pass
        raise


async def process_txt_for_kb(kb_id: str, file_path: str, filename: str, supabase):
    """Process TXT: extract text, generate embeddings."""
    from document_processor import DocumentProcessor

    logger.info(f"📃 Processing TXT for KB: {filename}")

    try:
        # Create document record
        doc_result = supabase.table('kb_documents').insert({
            'kb_id': kb_id,
            'filename': filename,
            'file_type': 'txt',
            'file_size_bytes': os.path.getsize(file_path),
            'processing_status': 'processing'
        }).execute()

        if not doc_result.data or len(doc_result.data) == 0:
            raise Exception("Failed to create document record")

        doc_id = doc_result.data[0]['id']
        logger.info(f"Created document record: {doc_id}")

        # Process TXT
        processor = DocumentProcessor()
        result = processor.process_txt(file_path, kb_id, doc_id)

        # Generate embeddings
        if result['text_chunks']:
            embeddings = processor.generate_embeddings(result['text_chunks'])

            # Create metadata for chunks
            metadata = [{'chunk_index': i} for i in range(len(result['text_chunks']))]

            # Save to vector database
            processor.save_to_vector_db(kb_id, doc_id, result['text_chunks'],
                                       embeddings, metadata, supabase)

        # Update document status to completed
        supabase.table('kb_documents').update({
            'processing_status': 'completed',
            'page_count': 1,
            'total_chunks': len(result['text_chunks']),
            'has_tables': False
        }).eq('id', doc_id).execute()

        logger.info(f"✅ TXT processing complete: {filename}")

    except Exception as e:
        logger.error(f"❌ Error processing TXT: {e}")
        # Mark as failed
        try:
            supabase.table('kb_documents').update({
                'processing_status': 'failed',
                'error_message': str(e)
            }).eq('id', doc_id).execute()
        except:
            pass
        raise


async def process_structured_for_kb(kb_id: str, file_path: str, filename: str, supabase):
    """Process CSV/Excel: load into temp SQLite DB."""
    from data_handler import DataHandler

    logger.info(f"📊 Processing structured data for KB: {filename}")

    try:
        doc_id = None
        # Create document record so it appears in listings
        doc_result = supabase.table('kb_documents').insert({
            'kb_id': kb_id,
            'filename': filename,
            'file_type': filename.split('.')[-1].lower(),
            'file_size_bytes': os.path.getsize(file_path),
            'processing_status': 'processing'
        }).execute()

        if not doc_result.data or len(doc_result.data) == 0:
            raise Exception("Failed to create document record for structured file")

        doc_id = doc_result.data[0]['id']
        logger.info(f"Created document record for structured file: {doc_id}")

        # Define a simple progress callback for logging
        def progress_callback(progress: float, message: str):
            logger.debug(f"[{progress*100:.0f}%] {message}")

        # Use existing DataHandler
        handler = DataHandler()
        response_msg, df = handler.load_data(file_path, progress_callback)

        if df is None:
            raise Exception(f"Failed to load file: {response_msg}")

        # Create temp SQLite DB
        db_name = f"temp_db_kb_{kb_id}_{filename.replace('.', '_')}.db"
        temp_db_path = db_name  # We're already in the backend directory

        from sqlalchemy import create_engine
        engine = create_engine(f'sqlite:///{temp_db_path}')
        df.to_sql('data_table', engine, if_exists='replace', index=False)

        # Convert DataFrame preview to JSON-safe format
        preview_df = df.head(5).copy()
        # Use pandas to_json to handle datetimes and other types correctly
        import json
        data_preview = json.loads(preview_df.to_json(orient='records', date_format='iso'))

        # Save metadata to kb_structured_data
        supabase.table('kb_structured_data').insert({
            'kb_id': kb_id,
            'filename': filename,
            'file_type': filename.split('.')[-1].lower(),
            'row_count': len(df),
            'column_count': len(df.columns),
            'column_names': df.columns.tolist(),
            'data_preview': data_preview,
            'temp_db_path': temp_db_path
        }).execute()

        # Update document status to completed and include basic metadata
        supabase.table('kb_documents').update({
            'processing_status': 'completed',
            'page_count': 1,
            'total_chunks': len(df),
            'has_tables': False
        }).eq('id', doc_id).execute()

        logger.info(f"✅ Structured data processing complete: {filename}")

    except Exception as e:
        logger.error(f"❌ Error processing structured data: {e}")
        try:
            if doc_id:
                supabase.table('kb_documents').update({
                    'processing_status': 'failed',
                    'error_message': str(e)
                }).eq('id', doc_id).execute()
        except Exception:
            pass
        raise


@app.post("/api/kb/{kb_id}/query")
async def query_knowledge_base(kb_id: str, request: Dict[str, Any]):
    """
    Query knowledge base with RAG + SQL + Predictions.

    Body: {
        "question": str,
        "chat_id": str
    }
    """
    try:
        from kb_rag_engine import get_kb_rag_engine
        from document_processor import get_supabase_client
        from kb_chart_helper import generate_chart_from_sql_results

        question = request.get('question')
        chat_id = request.get('chat_id')

        if not question:
            raise HTTPException(status_code=400, detail="question is required")

        logger.info(f"🔍 KB Query - KB: {kb_id}, Chat: {chat_id}")
        logger.info(f"Question: {question}")

        # Initialize RAG engine
        # For read operations, we can use default client which prefers service key
        supabase = get_supabase_client()
        rag_engine = get_kb_rag_engine(settings.LLM, supabase)

        # Load conversation history from database
        conversation_history = []
        if chat_id:
            try:
                chat_result = supabase.table('chats').select('messages').eq('id', chat_id).single().execute()
                if chat_result.data:
                    # Get last 10 messages (5 exchanges)
                    all_messages = chat_result.data.get('messages', [])
                    conversation_history = all_messages[-10:] if len(all_messages) > 10 else all_messages
                    logger.info(f"📜 Loaded {len(conversation_history)} messages from conversation history")
            except Exception as e:
                logger.warning(f"Failed to load conversation history: {e}")

        # Query KB with conversation history
        result = rag_engine.query_kb(kb_id, question, top_k=5, conversation_history=conversation_history)

        # Generate visualization if needed
        if result.get('visualization_needed', {}).get('should_visualize'):
            viz_info = result['visualization_needed']
            logger.info(f"📊 Generating visualization for KB query: {question}")
            logger.info(f"   Type: {viz_info.get('visualization_type')}, Chart: {viz_info.get('suggested_chart')}")

            try:
                visualization = generate_chart_from_sql_results(
                    query=viz_info['query'],
                    sql_results=viz_info['sql_data'],
                    kb_id=kb_id,
                    llm=settings.LLM,
                    suggested_chart=viz_info.get('suggested_chart', 'auto')
                )

                if visualization:
                    logger.info(f"✅ Generated {visualization['type']}: {visualization['filename']}")
                    # Add visualization to result with frontend-compatible path
                    result['visualization'] = {
                        "type": visualization["type"],
                        "path": f"/static/visualizations/{visualization['filename']}"
                    }
                else:
                    logger.warning("⚠️  Visualization generation returned None")

            except Exception as viz_error:
                logger.error(f"❌ Visualization generation failed: {viz_error}")
                logger.exception("Full visualization error traceback:")
                # Don't fail the whole request if visualization fails

            # Remove visualization_needed from result (internal metadata)
            result.pop('visualization_needed', None)

        # Save to chat history if chat_id provided
        if chat_id and 'response' in result:
            try:
                # Get current messages
                chat_result = supabase.table('chats').select('messages').eq('id', chat_id).single().execute()
                messages = chat_result.data.get('messages', []) if chat_result.data else []

                # Add user message and AI response
                messages.append({
                    'role': 'user',
                    'content': question,
                    'timestamp': pd.Timestamp.now().isoformat()
                })

                assistant_message = {
                    'role': 'assistant',
                    'content': result['response'],
                    'timestamp': pd.Timestamp.now().isoformat(),
                    'sources': result.get('sources', [])
                }

                # Include visualization if generated
                if 'visualization' in result:
                    assistant_message['visualization'] = result['visualization']

                messages.append(assistant_message)

                # Update chat
                supabase.table('chats').update({
                    'messages': messages,
                    'updated_at': pd.Timestamp.now().isoformat()
                }).eq('id', chat_id).execute()

            except Exception as e:
                logger.warning(f"Failed to save to chat history: {e}")

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error querying KB: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/generate-title")
async def generate_chat_title(request: Request):
    """
    Generate a concise, meaningful title (3-5 words) from user's first message.
    """
    try:
        data = await request.json()
        user_message = data.get('message', '')

        if not user_message:
            return JSONResponse({'title': 'New Chat'}, status_code=200)

        # Use LLM to generate concise title
        from settings import llm

        prompt = f"""Generate a very concise, meaningful title (3-5 words maximum) for this chat conversation based on the user's first message.

User's message: "{user_message}"

Requirements:
- 3-5 words only
- Capitalize first letter of each word
- Be descriptive and specific
- No quotes or special formatting
- Just return the title, nothing else

Title:"""

        response = llm.invoke(prompt)
        title = response.content.strip()

        # Ensure title is reasonable length
        if len(title) > 60:
            title = title[:57] + '...'

        # Fallback if LLM fails
        if not title or title.lower() == 'new chat':
            title = user_message[:40].strip() + ('...' if len(user_message) > 40 else '')

        logger.info(f"✅ Generated chat title: {title}")
        return JSONResponse({'title': title}, status_code=200)

    except Exception as e:
        logger.error(f"❌ Error generating chat title: {str(e)}")
        # Return fallback title on error
        return JSONResponse({'title': 'New Chat'}, status_code=200)


@app.post("/api/kb/{kb_id}/predict")
async def predict_kb_data(kb_id: str, request: Dict[str, Any]):
    """
    Run predictive analytics on KB data (structured or extracted tables).

    Body: {
        "target_column": str,
        "data_source_id": str,
        "data_source_type": "structured" | "extracted_table",
        "prediction_type": str (optional),
        "periods": int (optional)
    }
    """
    try:
        from document_processor import get_supabase_client
        from predictive_analysis import PredictiveAnalyzer
        from sqlalchemy import create_engine

        target_column = request.get('target_column')
        data_source_id = request.get('data_source_id')
        data_source_type = request.get('data_source_type')
        prediction_type = request.get('prediction_type', 'auto')
        periods = request.get('periods', 10)

        if not all([target_column, data_source_id, data_source_type]):
            raise HTTPException(status_code=400, detail="Missing required parameters")

        logger.info(f"📈 KB Prediction - KB: {kb_id}, Source: {data_source_type}")

        # For read operations, use default client which prefers service key
        supabase = get_supabase_client()

        # Load data based on source type
        if data_source_type == 'structured':
            result = supabase.table('kb_structured_data').select('id, temp_db_path').eq('id', data_source_id).single().execute()
            if not result.data:
                raise HTTPException(status_code=404, detail="Structured data not found")

            temp_db_path = result.data['temp_db_path']

        elif data_source_type == 'extracted_table':
            result = supabase.table('kb_extracted_tables').select('id, temp_db_path').eq('id', data_source_id).single().execute()
            if not result.data:
                raise HTTPException(status_code=404, detail="Extracted table not found")

            temp_db_path = result.data['temp_db_path']
        else:
            raise HTTPException(status_code=400, detail="Invalid data_source_type")

        # Load data from SQLite
        engine = create_engine(f'sqlite:///{temp_db_path}')
        df = pd.read_sql_table('data_table', engine)

        # Run prediction
        analyzer = PredictiveAnalyzer(df, llm_client=settings.LLM)
        prediction_result = analyzer.auto_predict(target_column, prediction_type, periods)

        return prediction_result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error in KB prediction: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# END KNOWLEDGE BASE ENDPOINTS
# ============================================================================

if __name__ == "__main__":
    # Suppress watchfiles DEBUG logging to avoid console spam from log file changes
    logging.getLogger("watchfiles").setLevel(logging.WARNING)

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        reload_excludes=["*.log"]
    ) 