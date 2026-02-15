FROM python:3.11-slim

# Install system dependencies for matplotlib, reportlab, etc.
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements-prod.txt .
RUN pip install --no-cache-dir -r requirements-prod.txt

# Copy root-level Python modules (imported by backend)
COPY agent_services.py .
COPY data_handler.py .
COPY query_orchestrator.py .
COPY report_generator.py .
COPY settings.py .
COPY speech_utils.py .

# Copy backend package
COPY backend/ ./backend/

# Create directories for runtime artifacts
RUN mkdir -p backend/static/visualizations backend/generated_reports data_exports

# Cloud Run sets PORT env var
ENV PORT=8080

EXPOSE 8080

# Start from the backend directory so relative imports work
WORKDIR /app/backend

CMD uvicorn main:app --host 0.0.0.0 --port $PORT
