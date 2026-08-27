from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import os
import json
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

# Import our existing modules
from data_handler import DataHandler
from agent_services import AgentServices
from query_orchestrator import get_orchestrator
import workspace_store
from intelligent_analysis import IntelligentAnalyzer
from smart_formatter import SmartFormatter
import capacity
import llm_providers
import model_catalog
import model_prefs
import settings
from llm_text import content_of

app = FastAPI()



# CORS is off unless you ask for it.
#
# The normal arrangement puts the browser and this API on one origin: a
# reverse proxy, or a platform that routes /api/* here, or `next dev` proxying
# through BACKEND_ORIGIN. Same-origin requests are not subject to CORS at all,
# so nothing needs configuring and nothing is exposed.
#
# Hosting the two halves on separate domains is a supported arrangement, but
# it has to be stated: list the origins the browser will be on.
#
#     EDI_CORS_ORIGINS=https://edi.example.com,https://staging.example.com
#
# This used to be allow_origins=["*"] with allow_credentials=True, which reads
# as "convenient default" and behaves as "any page on the internet may make
# credentialed requests to this API". A wildcard is refused here for that
# reason: an allowlist or nothing.
_cors_origins = [o.strip() for o in os.environ.get("EDI_CORS_ORIGINS", "").split(",") if o.strip()]

if "*" in _cors_origins:
    raise RuntimeError(
        "EDI_CORS_ORIGINS=* is not accepted. Name the origins the browser will "
        "be on, or leave it unset and serve both halves from one origin."
    )

if _cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Scratch directories for generated artefacts.
#
# INFO by default: DEBUG logs the whole request payload on every call, which is
# useful when developing and noise (and a privacy question) in a deployment.
# Set EDI_LOG_LEVEL=DEBUG to get it back.
logging.basicConfig(
    level=os.environ.get("EDI_LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)-8s %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)

# Initialize our services
data_handler = DataHandler()


def hydrate(workspace_id):
    """
    Point the module-level data_handler at a workspace's stored dataset.

    Serverless instances share no state between requests -- whichever instance
    handled the upload is rarely the one that handles the next query -- so the
    dataset is rebuilt from the `workspaces` row on each request that needs it.
    workspace_store caches the parsed handler per instance, so a warm instance
    only pays the rebuild cost when the data has actually changed.

    Falls back to the existing handler only when no workspace_id is supplied,
    which keeps `uvicorn main:app` working the way it always did locally.

    When a workspace_id IS supplied it is authoritative: if that workspace has
    no data, the handler is emptied rather than left pointing at whatever was
    loaded before. Otherwise a warm instance answers a new visitor's question
    from the previous visitor's dataset -- the global outlives the request, and
    two visitors are not two processes.

    Note: this rebinds a module global, so it assumes an instance serves one
    request at a time. That holds while requests are serialised per instance;
    it would need the handler threaded through the call chain to be safe under
    real in-process concurrency.
    """
    global data_handler
    if not workspace_id:
        return data_handler
    try:
        handler = workspace_store.get_handler(workspace_id)
    except workspace_store.WorkspaceStoreError as exc:
        logger.warning("Could not hydrate workspace %s: %s", workspace_id, exc)
        handler = None
    if handler is None:
        # Empty workspace: serve nothing, never the last visitor's data.
        # This has to go through initialize_agents rather than just swapping
        # data_handler: the SQL agent holds its own handle on the previous
        # workspace's SQLite database, and conversation memory holds the
        # previous questions and answers. Both outlive the request otherwise,
        # and which of them a question reaches depends on how it is phrased.
        data_handler = DataHandler()
        if agent_services is not None:
            agent_services.initialize_agents(data_handler)
        return None
    data_handler = handler
    if agent_services is not None:
        agent_services.initialize_agents(handler)
    return handler


def persist(workspace_id):
    """Write the current DataFrame back to the workspace row after a mutation."""
    if not workspace_id:
        return
    try:
        workspace_store.save_handler(workspace_id, data_handler)
    except workspace_store.WorkspaceStoreError as exc:
        logger.error("Could not persist workspace %s: %s", workspace_id, exc)

# Check if LLM is properly configured
if settings.LLM is None:
    logger.error("LLM is not configured. See /api/health for what is missing.")
    agent_services = None
else:
    try:
        agent_services = AgentServices(llm=settings.LLM)
        agent_services.initialize_agents(data_handler)
    except Exception as e:
        logger.error(f"Failed to initialize LLM services: {str(e)}")
        logger.error("See /api/health for the resolved provider and model")
        agent_services = None

def use_model(config):
    """
    Point the whole app at a different model.

    Two things have to move together. settings.apply() rebuilds the model and
    raises if it cannot, and then the agents have to be rebuilt on top of it:
    AgentServices hands `llm` to a SQL toolkit and a cleaning agent at
    initialize_agents() time, so leaving those alone would switch the model
    for direct .invoke() calls and silently keep the old one everywhere else.

    Also covers the case where there was no model at startup at all, which is
    the normal state of a fresh clone with nothing configured and no Ollama
    running yet -- agent_services is None then, and picking a model in the UI
    is what brings the app to life without a restart.
    """
    global agent_services

    settings.apply(config)

    if agent_services is None:
        agent_services = AgentServices(llm=settings.LLM)
    else:
        agent_services.llm = settings.LLM
    agent_services.initialize_agents(data_handler)
    return settings.llm_status()


# --- Request/Response Models ---
class QueryRequest(BaseModel):
    question: str
    chat_id: Optional[str] = None
    mode: str = "simple"
    workspace_id: Optional[str] = None

class CompoundQueryRequest(BaseModel):
    query: str
    workspace_id: str
    chat_id: Optional[str] = None
    preview_only: bool = False  # If true, return execution plan without executing

@app.post("/api/upload")
async def upload_file(
    file: UploadFile = File(...),
    workspace_id: str = None,
    rehydrate: bool = False,
):
    """
    Parse an uploaded file into the in-memory database.

    `rehydrate=true` marks the calls that re-send a sheet the workspace
    already holds, to rebuild that database after a restart. Those skip the
    row cap: it exists to stop somebody opening a sheet the grid cannot draw,
    and refusing to reload one that is already open would strand them rather
    than protect them.
    """
    try:
        # Read straight from the request. Writing a temp file would fail on a
        # read-only filesystem, and buys nothing when the bytes are in memory.
        content = await file.read()

        response, df = data_handler.load_bytes(
            content, file.filename, lambda x, y: print(f"Progress: {x}, {y}")
        )

        if df is None:
            raise HTTPException(status_code=400, detail=response)

        # Counted after parsing rather than guessed from the byte count, which
        # is the only way to know: rows per megabyte depends entirely on how
        # wide the sheet is.
        if not rehydrate:
            capacity.enforce_row_count(len(df))


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
    except HTTPException:
        # Size limits and parse failures already carry a message that explains
        # what to do about them; the catch-all below would replace it with a
        # generic one and hide the reason.
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="I had trouble processing your file. Please make sure it's a valid data file (CSV, Excel, etc.) and try again.")

@app.post("/api/query")
async def process_query(query: QueryRequest):
    hydrate(query.workspace_id)

    try:
        question = query.question
        chat_id = query.chat_id
        mode = query.mode

        # Load this chat's history before answering. Nothing did this before,
        # so every question arrived with an empty memory however long the
        # conversation on screen was -- and on a stateless backend there is no
        # other moment where it could come back.
        if agent_services is not None and chat_id:
            agent_services.switch_chat_context(chat_id)

        logger.debug("📝 === EXTRACTED PARAMETERS ===")
        logger.debug(f"   - Question: '{question}'")
        logger.debug(f"   - Chat ID: {chat_id}")
        logger.debug(f"   - Mode: {mode}")
        
        if not question:
            logger.debug("❌ No question provided in request")
            raise HTTPException(status_code=400, detail="I'm ready to help! What would you like to know or do with your data?")
        
        # Check for duplicate removal patterns first for more reliable detection
        duplicate_keywords = [
            'remove duplicate', 'drop duplicate', 'deduplicate', 'deduplication',
            'delete duplicate', 'get rid of duplicate', 'eliminate duplicate', 
            'unique rows', 'remove duplicates', 'drop duplicates'
        ]
        
        is_duplicate_removal = any(keyword in question.lower() for keyword in duplicate_keywords)
        if is_duplicate_removal:
            logger.debug("🧹 === DUPLICATE REMOVAL DETECTED IN API ENDPOINT ===")
            logger.debug(f"💬 Query: {question}")
            logger.debug(f"🔍 Matched keywords: {[k for k in duplicate_keywords if k in question.lower()]}")
            # Capture initial data shape for comparison
            initial_df = data_handler.get_df()
            initial_shape = initial_df.shape if initial_df is not None else None
            logger.debug(f"📊 Initial data shape: {initial_shape}")

        # Check for junk detection patterns for reliable refresh detection  
        junk_keywords = [
            'junk', 'detect junk', 'find junk', 'junk responses', 'junk detection',
            'find spam', 'detect spam', 'spam responses', 'meaningless responses',
            'gibberish', 'bad responses', 'quality analysis'
        ]
        
        is_junk_detection = any(keyword in question.lower() for keyword in junk_keywords)
        logger.debug(f"🔍 Junk detection check: {is_junk_detection}")
        if is_junk_detection:
            logger.debug("🧹 === JUNK DETECTION DETECTED IN API ENDPOINT ===")
            logger.debug(f"💬 Query: {question}")
            logger.debug(f"🔍 Matched keywords: {[k for k in junk_keywords if k in question.lower()]}")
            # Capture initial columns for comparison
            initial_df = data_handler.get_df()
            initial_columns = list(initial_df.columns) if initial_df is not None else []
            logger.debug(f"📊 Initial columns count: {len(initial_columns)}")
            logger.debug(f"📊 Initial columns: {initial_columns}")
            logger.debug("🧹 Initial columns captured for junk detection")
        
        logger.debug("🔄 === CALLING AGENT SERVICES ===")
        logger.debug(f"🤖 Agent services instance: {agent_services}")
        
        # Check if agent_services is properly initialized
        if agent_services is None:
            raise HTTPException(
                status_code=503, 
                detail="I'm having trouble accessing my AI capabilities right now. Please try again in a moment or contact support if the issue persists."
            )
        
        logger.debug(f"🗃️ Data handler has data: {data_handler.get_df() is not None}")
        if data_handler.get_df() is not None:
            df = data_handler.get_df()
            logger.debug(f"📊 Data shape: {df.shape}")
            logger.debug(f"🏷️ Data columns: {df.columns.tolist()}")
        
        # Ensure AgentServices is always linked to an active DataHandler (covers direct page refresh w/ saved data)
        logger.debug(f"🔍 DEBUG - agent_services.data_handler is None: {agent_services.data_handler is None}")
        logger.debug(f"🔍 DEBUG - data_handler is None: {data_handler is None}")
        if data_handler is not None:
            df = data_handler.get_df()
            logger.debug(f"🔍 DEBUG - data_handler.get_df() is None: {df is None}")
            if df is not None:
                logger.debug(f"🔍 DEBUG - DataFrame shape: {df.shape}")
            db_obj = data_handler.get_db_sqlalchemy_object()
            logger.debug(f"🔍 DEBUG - data_handler.get_db_sqlalchemy_object() is None: {db_obj is None}")
        
        if agent_services.data_handler is None:
            logger.debug("🔄 Initializing agents with data handler")
            agent_services.initialize_agents(data_handler)
        else:
            logger.debug("✅ AgentServices already has data handler")
        
        # NEW: Switch to the specific chat context if provided
        if chat_id:
            logger.debug(f"🔄 Switching to chat context: {chat_id}")
            agent_services.switch_chat_context(chat_id)
        else:
            logger.debug("⚠️ No chat_id provided, using default context")
        

        logger.debug("🚀 === CALLING AGENT SERVICES ===")
        logger.debug("📤 Sending to agent_services.process_query:")
        logger.debug(f"   - question: '{question}'")
        logger.debug(f"   - mode: {mode}")

        response, visualization = agent_services.process_query(question, mode)
        
        logger.debug("🎉 === AGENT SERVICES COMPLETED ===")
        logger.debug(f"💬 Response: {response}")
        logger.debug(f"🎨 Visualization: {visualization}")
        logger.debug(f"📄 Response type: {type(response)}")
        logger.debug(f"🖼️ Visualization type: {type(visualization)}")
        
        # Check if response is a JSON clarification
        logger.debug("🔍 === CHECKING RESPONSE TYPE ===")
        if isinstance(response, str) and response.strip().startswith('{'):
            logger.debug("🤔 Response looks like JSON - might be a clarification request")
            try:
                import json
                json_response = json.loads(response)
                if json_response.get('type') == 'clarification':
                    logger.debug("✅ CONFIRMED: This is a clarification response!")
                    logger.debug(f"🔍 Clarification details: {json_response}")
                else:
                    logger.debug("ℹ️ JSON response but not clarification type")
            except json.JSONDecodeError:
                logger.error("⚠️ Failed to parse response as JSON")
        else:
            logger.debug("📝 Response is regular text, not JSON")
        
        response_data = {"response": response}
        logger.debug(f"📦 Base response data: {response_data}")

        # NOTE: Luckysheet parsing removed - all spreadsheet operations now use Univer frontend
        
        # Check for data modifications, especially duplicate removal
        data_modified = False
        
        # For duplicate removal, explicitly compare shapes before and after processing
        if is_duplicate_removal:
            logger.debug("🧹 === CHECKING DUPLICATE REMOVAL RESULTS ===")
            updated_df = data_handler.get_df()
            updated_shape = updated_df.shape if updated_df is not None else None
            logger.debug(f"📊 Updated data shape: {updated_shape}")
            
            if initial_shape and updated_shape and initial_shape[0] > updated_shape[0]:
                logger.debug(f"✅ Duplicate removal confirmed! Rows before: {initial_shape[0]}, rows after: {updated_shape[0]}")
                logger.debug(f"🧹 Removed {initial_shape[0] - updated_shape[0]} rows")
                data_modified = True
            else:
                logger.error("⚠️ No rows were removed or shape comparison failed")
                
                # Even if no rows were removed, check if the response indicates DATA_MODIFIED
                if response and isinstance(response, str) and "DATA_MODIFIED:" in response:
                    logger.debug("📋 Response indicates data was modified, forcing frontend update")
                    data_modified = True
        elif is_junk_detection:
            logger.debug("🧹 === CHECKING JUNK DETECTION RESULTS ===")
            logger.debug(f"🔍 Variable scope check: 'initial_columns' in locals() = {'initial_columns' in locals()}")
            updated_df = data_handler.get_df()
            logger.debug(f"📊 Updated DataFrame available: {updated_df is not None}")
            
            # Check if initial_columns was captured (variable exists in scope)
            if 'initial_columns' in locals() and updated_df is not None and initial_columns:
                logger.debug(f"✅ Initial columns variable exists with {len(initial_columns)} columns")
                updated_columns = list(updated_df.columns)
                new_columns = [col for col in updated_columns if col not in initial_columns]
                logger.debug(f"📊 Updated columns count: {len(updated_columns)}")
                logger.debug(f"📊 Updated columns: {updated_columns}")
                logger.debug(f"🆕 New columns detected: {new_columns}")
                
                # Check if any new column contains 'junk_flag'
                junk_flag_columns = [col for col in new_columns if 'junk_flag' in col.lower()]
                if junk_flag_columns:
                    logger.debug(f"✅ Junk flag column detected: {junk_flag_columns}")
                    data_modified = True
                else:
                    logger.debug("⚠️ No junk flag column found in new columns")
                    
                    # Fallback: check if response indicates DATA_MODIFIED
                    if response and isinstance(response, str) and "DATA_MODIFIED:" in response:
                        logger.debug("📋 Response indicates data was modified, forcing frontend update")
                        data_modified = True
            else:
                if 'initial_columns' not in locals():
                    logger.debug("❌ initial_columns variable not found in scope")
                elif updated_df is None:
                    logger.debug("❌ Updated DataFrame is None")
                elif not initial_columns:
                    logger.debug("❌ initial_columns is empty")
                logger.debug("⚠️ No initial columns captured or no updated data available")
                # Fallback: check if response indicates DATA_MODIFIED
                if response and isinstance(response, str) and "DATA_MODIFIED:" in response:
                    logger.debug("📋 Response indicates data was modified, forcing frontend update")
                    data_modified = True
        else:
            # General data modification check for other operations
            data_modified = any(keyword in question.lower() for keyword in [
                'translate', 'translation', 'filter', 'clean', 'remove', 'add column', 
                'delete', 'modify', 'update', 'transform', 'sort'
            ])
            
            # Also check if the response indicates DATA_MODIFIED
            if response and isinstance(response, str) and "DATA_MODIFIED:" in response:
                logger.debug("📋 Response indicates data was modified, forcing frontend update")
                data_modified = True
        
        logger.debug(f"🔄 Data modification detected: {data_modified}")
        
        if data_modified:
            logger.debug("🔄 === DATA MODIFICATION DETECTED ===")
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
                persist(query.workspace_id)
                logger.debug(f"📊 Updated data included in response: {len(updated_df)} rows, {len(updated_df.columns)} columns")
            else:
                logger.debug("⚠️ Data handler returned None after modification")
        
        if visualization:
            logger.debug("🎨 === PROCESSING VISUALIZATION ===")
            logger.debug(f"🔍 Visualization type: {visualization.get('type')}")
            response_data["visualization"] = visualization
            logger.debug(f"✅ Visualization added to response: {response_data['visualization'].get('type')}")
        else:
            logger.debug("ℹ️ No visualization to add to response")
        
        logger.debug("📤 === SENDING RESPONSE ===")
        logger.debug(f"🎁 Final response data: {response_data}")
        logger.debug(f"📊 Response data keys: {list(response_data.keys())}")
        logger.debug(f"📏 Response size: {len(str(response_data))} characters")
        
        return response_data
        
    except HTTPException as he:
        logger.debug("⚠️ === HTTP EXCEPTION ===")
        logger.debug(f"🔢 Status code: {he.status_code}")
        logger.debug(f"📝 Detail: {he.detail}")
        raise he
    except Exception as e:
        logger.error("❌ === UNEXPECTED ERROR ===")
        logger.error(f"💥 Error type: {type(e)}")
        logger.error(f"📋 Error message: {str(e)}")
        logger.error(f"🗂️ Error details: {repr(e)}")
        import traceback
        logger.debug(f"📚 Full traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))

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

@app.post("/api/initialize-data")
async def initialize_backend_with_data(request: Dict[str, Any]):
    """
    Initialize the backend data_handler with data loaded from the store.
    This ensures all backend features work when data is restored from a previous session.
    """
    try:
        data = request.get("data", [])
        filename = request.get("filename")
        
        if not data or len(data) == 0:
            raise HTTPException(status_code=400, detail="No data provided for initialization")

        # No row cap here. This path exists to put rows the store already
        # holds back into the in-memory database, so it is a rehydrate by
        # definition; see the note on /api/upload.

        logger.debug(f"🔄 Initializing backend with {len(data)} rows from the store")
        logger.debug(f"📄 Filename: {filename}")
        
        # Create DataFrame from the provided data
        import pandas as pd
        df = pd.DataFrame(data)
        
        # Builds the in-memory SQLite database and LangChain SQLDatabase.
        data_handler.load_dataframe(df, filename)
        
        # Initialize agents with the restored data
        agent_services.initialize_agents(data_handler)
        
        logger.debug(f"✅ Backend initialized successfully with {len(data)} rows")
        logger.debug(f"📊 Data shape: {df.shape}")
        logger.debug(f"🏷️ Columns: {df.columns.tolist()}")
        
        return {
            "success": True,
            "message": f"Backend initialized with {len(data)} rows",
            "rows": len(data),
            "columns": df.columns.tolist(),
            "filename": filename
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error initializing backend with data: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to initialize backend: {str(e)}")

@app.post("/api/workspace")
async def create_workspace_endpoint(request: Optional[Dict[str, Any]] = None):
    """
    Create an empty workspace and hand back its id.

    The app has no sign-in: the browser keeps this id in localStorage and sends
    it with every request. There is deliberately no endpoint that lists them
    all, because without a sign-in that would hand every visitor everyone
    else's sheets.
    """
    name = (request or {}).get("name") or "Untitled"
    try:
        workspace_id = workspace_store.create_workspace(name)
    except workspace_store.WorkspaceStoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    return {"id": workspace_id, "name": name}


# A bound on the ids one request may ask about, so the list endpoint cannot
# be turned into an arbitrary-length query. Well above what anyone keeps.
_MAX_WORKSPACES = 200


@app.post("/api/workspaces")
async def list_workspaces_endpoint(request: Dict[str, Any]):
    """
    Summarise the workspaces the caller names.

    A POST for what is a read, because the ids go in the body: there is no
    sign-in, so the browser is the only thing that knows which workspaces are
    yours, and it sends the list. Listing the table instead would hand every
    visitor everyone else's sheets.

    Unknown ids are dropped rather than erroring, so a workspace deleted on
    another device does not wedge the picker.
    """
    ids = request.get("ids")
    if not isinstance(ids, list):
        raise HTTPException(status_code=422, detail="Expected a list of workspace ids.")
    if len(ids) > _MAX_WORKSPACES:
        raise HTTPException(
            status_code=422,
            detail=f"Too many workspace ids; the limit is {_MAX_WORKSPACES}.",
        )

    try:
        return {"workspaces": workspace_store.list_workspaces([str(i) for i in ids])}
    except workspace_store.WorkspaceStoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@app.get("/api/workspace/{workspace_id}")
async def get_workspace_endpoint(workspace_id: str):
    """Return the stored sheet, filename and chat history for a workspace."""
    try:
        row = workspace_store.fetch_workspace(workspace_id)
    except workspace_store.WorkspaceStoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    if row is None:
        raise HTTPException(status_code=404, detail="Workspace not found")

    return {
        "id": row.get("id"),
        "name": row.get("name"),
        "data": row.get("data") or [],
        "filename": row.get("filename"),
        "column_order": row.get("column_order") or [],
        "sheet_state": row.get("sheet_state"),
        "chat_messages": row.get("chat_messages") or [],
    }


@app.put("/api/workspace/{workspace_id}")
async def save_workspace_endpoint(workspace_id: str, request: Dict[str, Any]):
    """
    Save whatever the client sends. Fields that are absent are left alone, so a
    chat-only save does not wipe the dataset.
    """
    try:
        workspace_store.save_workspace(
            workspace_id,
            data=request.get("data"),
            filename=request.get("filename"),
            sheet_state=request.get("sheet_state"),
            column_order=request.get("column_order"),
            chat_messages=request.get("chat_messages"),
            name=request.get("name"),
        )
    except workspace_store.WorkspaceStoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    return {"success": True}


@app.delete("/api/workspace/{workspace_id}")
async def delete_workspace_endpoint(workspace_id: str):
    """
    Delete a workspace and its chats.

    The chats go by cascade rather than by a second statement here, so a
    half-deleted workspace is not reachable.
    """
    try:
        deleted = workspace_store.delete_workspace(workspace_id)
    except workspace_store.WorkspaceStoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    if not deleted:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return {"success": True}


@app.get("/api/workspace/{workspace_id}/chats")
async def list_chats_endpoint(workspace_id: str):
    """List the chat threads belonging to a workspace."""
    try:
        return {"chats": workspace_store.list_chats(workspace_id)}
    except workspace_store.WorkspaceStoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@app.post("/api/workspace/{workspace_id}/chats")
async def create_chat_endpoint(workspace_id: str, request: Optional[Dict[str, Any]] = None):
    """Start a new chat thread in a workspace."""
    title = (request or {}).get("title") or "New Chat"
    try:
        return workspace_store.create_chat(workspace_id, title)
    except workspace_store.WorkspaceStoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@app.get("/api/chats/{chat_id}")
async def get_chat_endpoint(chat_id: str):
    """Return one chat thread's messages."""
    try:
        chat = workspace_store.fetch_chat(chat_id)
    except workspace_store.WorkspaceStoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    return chat


@app.put("/api/chats/{chat_id}")
async def save_chat_endpoint(chat_id: str, request: Dict[str, Any]):
    """Save a chat thread's messages and/or title."""
    try:
        workspace_store.save_chat(
            chat_id,
            messages=request.get("messages"),
            title=request.get("title"),
        )
    except workspace_store.WorkspaceStoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    return {"success": True}


@app.get("/api/health")
async def health_check():
    # Check if services are properly initialized
    services_status = {
        "data_handler": "available" if data_handler else "unavailable",
        "agent_services": "available" if agent_services else "unavailable",
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
        # Which model this instance is actually talking to. Reported because
        # the alternative is discovering a misconfiguration through answers
        # that look merely bad rather than absent.
        "llm_config": settings.llm_status(),
        # Where this instance keeps workspaces, and the directory it writes to.
        "store": workspace_store.status(),
    }


class FormulaRequest(BaseModel):
    description: str
    workspace_id: Optional[str] = None
    # What the caller means to do with it, when it already knows. "column" is
    # a per-row expression to fill down; "cell" is one aggregate. Left unset,
    # the model decides from the wording, which is right more often than a
    # keyword test would be.
    scope: Optional[str] = None
    header: Optional[str] = None


def _column_letter(index):
    """0 -> A, 25 -> Z, 26 -> AA. Spreadsheet columns, not array indices."""
    letters = ""
    index += 1
    while index:
        index, remainder = divmod(index - 1, 26)
        letters = chr(65 + remainder) + letters
    return letters


_FORMULA_PROMPT = """You write spreadsheet formulas. Return JSON and nothing else.

The sheet has {rows} rows of data. Row 1 holds the headers, so data occupies
rows 2 to {last_row}. The columns are:

{columns}

Write a formula for this request:
{description}

Return exactly this shape, with no markdown fences:
{{"formula": "=...", "explanation": "one sentence, plain English",
  "scope": "cell" or "column", "header": "short column name or null"}}

Rules:
- Start the formula with =.
- "scope": "column" when the request describes a value for every row -- a per
  row calculation like revenue divided by units. Write the formula for the
  FIRST data row (row 2) using relative references; it will be filled down.
  Give "header" a short column name.
- "scope": "cell" when the request is one number over the whole sheet -- a
  sum, an average, a count, a lookup. Reference whole columns where that is
  natural, and set "header" to null.
- Use the column letters above, never the header text, inside the formula.
- Prefer functions every spreadsheet has: SUM, SUMIF, SUMIFS, AVERAGE,
  AVERAGEIF, COUNT, COUNTIF, IF, ROUND, VLOOKUP, INDEX, MATCH.
- Quote text criteria exactly as they appear in the data.
"""


@app.post("/api/formula")
async def generate_formula(request: FormulaRequest):
    """
    Turn a description into a formula, without touching the sheet.

    Deliberately returns the formula rather than applying it. The client shows
    it with an Apply button, so a wrong formula is something you read and
    discard rather than something you undo -- which matters more here than
    elsewhere in the app, because a formula lands in cells the user picked
    rather than in a chat bubble.
    """
    if settings.LLM is None:
        raise HTTPException(
            status_code=503,
            detail="No model is configured. See /api/health.",
        )

    description = request.description
    handler = hydrate(request.workspace_id)
    df = handler.get_df() if handler else None
    if df is None or df.empty:
        raise HTTPException(status_code=400, detail="No data loaded.")

    columns = "\n".join(
        f"  {_column_letter(i)}: {name}  ({df[name].dtype})"
        for i, name in enumerate(df.columns)
    )
    prompt = _FORMULA_PROMPT.format(
        rows=len(df),
        last_row=len(df) + 1,
        columns=columns,
        description=description,
    )

    try:
        raw = content_of(settings.LLM.invoke(prompt))
    except Exception as exc:
        logger.error("Formula generation failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"The model failed: {exc}") from exc

    # Same de-fencing the rest of the app does: asked for bare JSON, models
    # still wrap it about half the time.
    text = re.sub(r"^\s*```(?:json)?|```\s*$", "", (raw or "").strip()).strip()
    try:
        payload = json.loads(text)
    except (ValueError, TypeError):
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            raise HTTPException(
                status_code=502,
                detail="The model did not return a formula.",
            )
        try:
            payload = json.loads(match.group(0))
        except (ValueError, TypeError) as exc:
            raise HTTPException(
                status_code=502, detail="The model did not return a formula.",
            ) from exc

    formula = (payload.get("formula") or "").strip()
    if not formula.startswith("="):
        raise HTTPException(
            status_code=502,
            detail=f"That is not a formula: {formula[:80] or '(empty)'}",
        )

    scope = request.scope or payload.get("scope") or "cell"
    if scope not in ("cell", "column"):
        scope = "cell"

    return {
        "formula": formula,
        "explanation": (payload.get("explanation") or "").strip() or None,
        "scope": scope,
        "header": request.header or (payload.get("header") or None),
        # So the client can fill down without asking the grid how big it is,
        # and so the two halves cannot disagree about it.
        "rows": len(df),
    }


class ModelSelection(BaseModel):
    provider: str
    model: Optional[str] = None
    base_url: Optional[str] = None


class ProviderKey(BaseModel):
    provider: str
    api_key: str


def _require_model_control():
    """
    Refuse to let a visitor reconfigure somebody else's server.

    On a laptop the person using the app and the person running it are the
    same, and letting the browser pick a model is just a settings screen. On a
    public URL they are strangers: a key pasted into the dropdown would be
    written to the operator's disk, and a base URL pointed anywhere would turn
    the deployment into a proxy for it. So this is off there, and the message
    says which switch turns it back on.
    """
    if not model_prefs.control_allowed():
        raise HTTPException(
            status_code=403,
            detail=(
                "Choosing the model from the app is disabled on this "
                "deployment. Set it with EDI_LLM_PROVIDER and EDI_LLM_MODEL, "
                "or allow it with EDI_ALLOW_MODEL_SWITCHING=1."
            ),
        )


@app.get("/api/models")
async def list_models(refresh: bool = False):
    """
    Every provider, what it can offer, and which model is in use.

    Never returns an API key, only whether one exists and where it came from.
    That is the whole contract the picker is written against: a key typed in
    here goes to a file on this machine and is never read back out over HTTP,
    not even by the page that set it.
    """
    return {
        "active": settings.llm_status(),
        "can_change": model_prefs.control_allowed(),
        "providers": model_catalog.catalog(refresh=refresh),
    }


@app.post("/api/models/select")
async def select_model(selection: ModelSelection):
    """Switch to a model, and remember the choice for next start."""
    _require_model_control()
    try:
        config = llm_providers.build_config(
            selection.provider,
            (selection.model or "").strip(),
            (selection.base_url or "").strip() or None,
            source="saved",
        )
        status = use_model(config)
    except llm_providers.ProviderError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Could not switch to %s: %s", selection.provider, exc)
        raise HTTPException(
            status_code=400,
            detail=f"Could not use that model: {exc}",
        ) from exc

    # Written only after the model has actually been built, so a failed
    # attempt cannot leave the next start pointing at something broken.
    model_prefs.save_choice(config.provider, config.model, config.base_url)
    model_catalog.invalidate()
    return {"active": status}


@app.post("/api/models/key")
async def save_provider_key(entry: ProviderKey):
    """
    Store an API key for a provider, on this machine.

    It goes in the same directory as the workspaces and is never sent back.
    The response says what the key unlocked -- the provider's model list --
    which is also the check that it works.
    """
    _require_model_control()
    if entry.provider not in llm_providers.PROVIDERS:
        raise HTTPException(status_code=400, detail=f"No such provider: {entry.provider}")
    if not entry.api_key.strip():
        raise HTTPException(status_code=400, detail="That key is empty.")

    model_prefs.save_key(entry.provider, entry.api_key)
    model_catalog.invalidate()

    updated = next(
        (e for e in model_catalog.catalog(refresh=True) if e["id"] == entry.provider),
        None,
    )
    if updated and not updated["reachable"]:
        # Kept rather than discarded: a provider can be unreachable because
        # the key is wrong or because the network is, and this cannot tell
        # those apart. The detail line says what happened; throwing the key
        # away on a flaky connection would be worse.
        logger.info("Key stored for %s but the provider did not answer.", entry.provider)
    return {"provider": entry.provider, "stored_at": model_prefs.location(), "state": updated}


@app.delete("/api/models/key/{provider}")
async def forget_provider_key(provider: str):
    """Remove a stored key. Does not touch anything set in the environment."""
    _require_model_control()
    removed = model_prefs.forget_key(provider)
    model_catalog.invalidate()
    return {"provider": provider, "removed": removed}


@app.post("/api/models/reset")
async def reset_model_choice():
    """Forget the picked model and go back to what the environment says."""
    _require_model_control()
    model_prefs.clear_choice()
    model_catalog.invalidate()
    try:
        status = use_model(llm_providers.resolve())
    except llm_providers.ProviderError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"active": status}

# The intents and target types the classifier is allowed to return. Kept in
# step with CommandClassification in
# edi-frontend/src/services/llmCommandClassifier.ts.
_CLASSIFIER_INTENTS = {
    "conditional_format", "data_modification", "find_replace", "filter", "sort",
    "column_operation", "row_operation", "cell_operation", "range_operation",
    "freeze_operation", "table_operation", "hyperlink_operation",
    "data_validation", "comment_operation", "image_operation",
    "named_range_operation", "intelligent_analysis", "smart_format",
    "data_entry", "formula", "general_query", "compound_operation", "unknown",
}
_CLASSIFIER_TARGETS = {
    "cell", "column", "row", "range", "all_data", "specific_value", "table",
    "compound",
}


class ClassifyCommandRequest(BaseModel):
    prompt: str


@app.post("/api/classify-command")
async def classify_command(request: ClassifyCommandRequest):
    """
    Classify a spreadsheet command with the configured model.

    This used to happen in the browser, calling Groq directly with a key read
    from NEXT_PUBLIC_GROQ_API_KEY. NEXT_PUBLIC_ variables are inlined into the
    bundle at build time, so that key was readable by every visitor and
    spendable by any of them, which is the whole problem with putting a
    provider key in the browser.

    The prompt is still built client-side, because it is long and encodes the
    intent taxonomy the client acts on; duplicating it here would guarantee the
    two drift apart. What stops this being a general-purpose completion proxy
    is the return value: the model's reply is parsed and coerced into the
    classification shape, and nothing else escapes. Ask it to write you a poem
    and you get {"intent": "unknown"}.
    """
    prompt = request.prompt
    if not prompt.strip():
        raise HTTPException(status_code=400, detail="Nothing to classify.")

    if settings.LLM is None:
        # The client falls back to its regex classifier on any failure, so this
        # degrades to "slightly worse classification" rather than a dead UI.
        raise HTTPException(
            status_code=503,
            detail="Command classification needs a chat model to be configured.",
        )

    try:
        reply = settings.LLM.invoke([
            ("system", "You are a spreadsheet command classifier. Return ONLY JSON matching the schema."),
            ("human", prompt),
        ])
        text = (content_of(reply) or "").strip()
    except Exception as exc:
        logger.error("Command classification failed: %s", exc)
        raise HTTPException(status_code=502, detail="Could not reach the model.")

    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.MULTILINE).strip()

    payload = None
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        # Smaller models tend to wrap the object in a sentence rather than
        # obeying "JSON only". Take the first object if there is one.
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            try:
                payload = json.loads(match.group(0))
            except json.JSONDecodeError:
                payload = None

    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=502,
            detail="The model did not return a usable classification.",
        )

    target = payload.get("target")
    if not isinstance(target, dict):
        target = {}

    intent = str(payload.get("intent") or "unknown")
    target_type = str(target.get("type") or "all_data")

    try:
        confidence = float(payload.get("confidence", 0.5))
    except (TypeError, ValueError):
        confidence = 0.5

    parameters = payload.get("parameters")

    return {
        "success": True,
        "classification": {
            "intent": intent if intent in _CLASSIFIER_INTENTS else "unknown",
            "action": str(payload.get("action") or "unknown"),
            "target": {
                "type": target_type if target_type in _CLASSIFIER_TARGETS else "all_data",
                "identifier": str(target.get("identifier") or "*"),
            },
            "parameters": parameters if isinstance(parameters, dict) else {},
            "confidence": min(max(confidence, 0.0), 1.0),
            "reasoning": str(payload.get("reasoning") or "Model classification"),
        },
    }


@app.post("/api/orchestrate")
async def orchestrate_compound_query(request: CompoundQueryRequest):
    """
    Process compound queries using the query orchestrator
    Handles complex multi-step operations with intelligent decomposition
    """
    logger.debug("🎭 === COMPOUND QUERY ORCHESTRATION ENDPOINT ===")
    logger.debug(f"📥 Query: {request.query}")
    logger.debug(f"🔷 Workspace ID: {request.workspace_id}")
    logger.debug(f"👁️ Preview Only: {request.preview_only}")


    try:
        orchestrator = get_orchestrator()
        
        if request.preview_only:
            # Just decompose and plan, don't execute
            logger.debug("👁️ Preview mode - generating execution plan only")
            
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
            logger.debug("🎭 Full orchestration mode - executing compound query")
            result = await orchestrator.orchestrate_query(request.query, request.workspace_id)
            
            return result
            
    except Exception as e:
        logger.error(f"❌ Compound query orchestration failed: {str(e)}")
        return {
            "success": False,
            "error": f"Orchestration failed: {str(e)}",
            "query": request.query,
            "workspace_id": request.workspace_id
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
        logger.debug("🔍 === INTELLIGENT ANALYSIS REQUEST ===")
        logger.debug(f"   - Workspace ID: {workspace_id}")
        logger.debug(f"   - Analysis Type: {analysis_type}")
        logger.debug(f"   - Focus Area: {focus_area}")

        # Rebuild this workspace's dataset before reading it (see hydrate()).
        hydrate(workspace_id)

        # Get current DataFrame from data handler
        df = data_handler.get_df()

        if df is None or df.empty:
            raise HTTPException(
                status_code=404,
                detail="No data found in workspace. Please upload data first."
            )

        logger.debug(f"📊 Data shape: {df.shape}")
        logger.debug(f"🏷️ Columns: {df.columns.tolist()}")

        # Initialize IntelligentAnalyzer
        analyzer = IntelligentAnalyzer(df, settings.LLM)

        # Run analysis based on type
        if analysis_type == 'quick':
            profile = analyzer.analyze_quick_profile()
            anomalies = analyzer.detect_anomalies(method='zscore', threshold=3.5)[:5]  # Top 5
            correlations = []
            seasonality = None
            summary = "Quick data profile complete."
            logger.debug("✅ Quick analysis complete")

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
                    logger.debug(f"📈 Seasonality: {seasonality.get('description') if seasonality else 'None detected'}")
                except Exception as e:
                    logger.error(f"⚠️ Seasonality detection failed: {e}")

            # Generate executive summary
            try:
                summary = analyzer.generate_executive_summary(anomalies, correlations, seasonality)
                logger.debug(f"📝 Summary: {summary}")
            except Exception as e:
                logger.error(f"⚠️ Summary generation failed: {e}")
                summary = "Data analysis complete. Review detailed findings below."

            logger.debug("✅ Comprehensive analysis complete")

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
                summary = "Trend analysis complete."
            elif focus_area == 'correlations':
                correlations = analyzer.identify_correlations(threshold=0.6)
                summary = f"Correlation analysis complete. Found {len(correlations)} significant relationships."
            else:
                summary = f"Focused analysis on {focus_area} complete."

            logger.debug("✅ Focused analysis complete")

        # Generate visualization suggestions
        viz_suggestions = analyzer.suggest_visualizations()
        logger.debug(f"💡 {len(viz_suggestions)} visualization suggestions generated")

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

        logger.debug("🎉 === INTELLIGENT ANALYSIS COMPLETE ===")
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
        logger.debug("📐 === SMART FORMATTING REQUEST ===")
        logger.debug(f"   - Workspace ID: {workspace_id}")
        logger.debug(f"   - Template: {template}")

        # Rebuild this workspace's dataset before reading it (see hydrate()).
        hydrate(workspace_id)

        # Get current DataFrame from data handler
        df = data_handler.get_df()

        if df is None or df.empty:
            raise HTTPException(
                status_code=404,
                detail="No data found in workspace. Please upload data first."
            )

        logger.debug(f"📊 Data shape: {df.shape}")
        logger.debug(f"🏷️ Columns: {df.columns.tolist()}")

        # Initialize SmartFormatter
        formatter = SmartFormatter(df)

        # Generate formatting instructions
        formatting = formatter.generate_formatting_instructions(template)

        logger.debug(f"✅ Generated formatting for {len(formatting['column_formats'])} columns")
        logger.debug(f"📋 Detected types: {formatting['column_types']}")

        return {
            "success": True,
            "formatting": formatting,
            "message": formatting['summary']
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Smart formatting error: {str(e)}")
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
        except Exception:
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
        llm = settings.LLM
        if llm is None:
            raise HTTPException(
                status_code=503,
                detail="Generating rows needs a chat model to be configured.",
            )
        response = llm.invoke(prompt)

        # Parse JSON response
        content = content_of(response) if hasattr(response, 'content') else str(response)

        # Extract JSON array
        json_match = re.search(r'\[\s*\[.*?\]\s*\]', content, re.DOTALL)
        if json_match:
            rows_data = json.loads(json_match.group())
        else:
            # Fallback: try parsing entire content
            rows_data = json.loads(content)

        # Validate row count and column count
        if len(rows_data) != count:
            logger.debug(f"⚠️ LLM generated {len(rows_data)} rows instead of {count}")

        for row in rows_data:
            if len(row) != len(headers):
                logger.debug(f"⚠️ Row has {len(row)} values instead of {len(headers)}")

        return {
            'rows': rows_data,
            'count': len(rows_data)
        }

    except json.JSONDecodeError as e:
        logger.error(f"❌ Failed to parse LLM response as JSON: {str(e)}")
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
        logger.error(f"❌ Error generating rows: {str(e)}")
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
        logger.debug("📝 === QUICK DATA ENTRY REQUEST ===")
        logger.debug(f"   - Workspace ID: {workspace_id}")
        logger.debug(f"   - Action: {request.action}")
        logger.debug(f"   - Parameters: {request.parameters}")

        action = request.action
        params = request.parameters

        # Rebuild this workspace's dataset before reading it (see hydrate()).
        hydrate(workspace_id)

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
        logger.error(f"❌ Quick data entry error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error processing data entry: {str(e)}"
        )

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True) 