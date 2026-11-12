FROM python:3.11-slim

WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy backend application
COPY backend/ /app/backend/

# Copy ML prediction code
COPY predict.py /app/predict.py
COPY features.py /app/features.py

# Copy trained models and manifest
COPY artifacts/ /app/artifacts/

WORKDIR /app/backend

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
