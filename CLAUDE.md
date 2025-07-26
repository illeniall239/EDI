# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Architecture

EDI.ai is a full-stack AI-powered data analysis platform with a Python FastAPI backend and Next.js frontend. The application enables users to upload datasets, perform intelligent analysis through natural language queries, and generate visualizations and reports.

### Key Components

**Backend Services** (`backend/main.py`):
- FastAPI server handling data processing, AI queries, and file operations
- Integrated with Google Gemini 2.0 Flash model for natural language processing
- AgentServices orchestrating LangChain agents for data analysis
- DataHandler managing SQLite databases and pandas operations
- ReportGenerator creating automated PDF reports
- Speech utilities for voice interaction

**Frontend** (`edi-frontend/`):
- Next.js 15 application with TypeScript
- Supabase integration for authentication and data persistence
- UniverseJS spreadsheet component for data visualization
- React components for file upload, chat interface, and workspace management

**Data Flow**:
1. Files uploaded through frontend → processed by DataHandler → stored in temporary SQLite databases
2. User queries → AgentServices → LangChain SQL agents → generate responses and visualizations
3. Results displayed in frontend with optional chart generation and PDF reporting

## Development Commands

### Backend (Python)
```bash
# Install dependencies
pip install -r requirements.txt

# Start FastAPI server
python backend/main.py
# Or with uvicorn directly:
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload

# Run linting (if configured)
ruff check .
```

### Frontend (Next.js)
```bash
cd edi-frontend

# Install dependencies
npm install

# Development server with Turbopack
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Lint code
npm run lint
```

## Environment Configuration

Required environment variables in `.env` file:
- `GOOGLE_API_KEY`: Google Gemini API key for LLM functionality
- `AZURE_API_KEY`: Azure Speech Services key
- `AZURE_REGION`: Azure service region

The application gracefully degrades when API keys are missing, providing fallback functionality.

## Core Modules

**agent_services.py**: Central orchestrator managing LangChain agents, including:
- SQL query agent for database operations
- Chart generation agent for data visualization
- Data transformation agents for cleaning and processing

**data_handler.py**: Database and file management:
- Supports CSV, Excel, and other tabular data formats
- Creates temporary SQLite databases for each dataset
- Provides data consistency checking and validation

**settings.py**: Configuration management with Google Gemini LLM initialization

## Key Features to Understand

1. **Workspace System**: Each uploaded dataset creates a workspace with persistent state
2. **Agent-Based Processing**: Natural language queries are processed by specialized LangChain agents
3. **Dynamic Visualization**: Charts and graphs generated based on query context
4. **Report Generation**: Automated PDF reports with data insights
5. **Speech Integration**: Voice input/output capabilities via Azure Speech Services

## File Structure Notes

- `backend/static/visualizations/`: Generated chart images
- `backend/generated_reports/`: PDF reports
- `backend/temp_db_*.db`: Temporary SQLite databases for uploaded datasets
- `edi-frontend/src/components/`: Reusable React components
- `edi-frontend/src/app/`: Next.js app router pages

## Testing

No formal test suite is currently implemented. Manual testing through the web interface is the primary validation method.

## Common Issues

- LLM initialization failures require valid `GOOGLE_API_KEY`
- File upload size limits may need adjustment for large datasets
- Temporary database files accumulate and may need periodic cleanup
- Chart generation depends on matplotlib and requires proper font configuration