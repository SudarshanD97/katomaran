FROM python:3.9-slim

WORKDIR /app

# Install system dependencies for OpenCV and C++ compilers for InsightFace
RUN apt-get update && apt-get install -y build-essential cmake python3-dev libgl1-mesa-glx libglib2.0-0 && rm -rf /var/lib/apt/lists/*

# Install specific CPU versions to save RAM/Space if possible, otherwise rely on requirements
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Hugging Face Spaces uses the $PORT env var, or defaults to 7860
ENV PORT=7860
EXPOSE $PORT

CMD ["sh", "-c", "uvicorn backend.server:app --host 0.0.0.0 --port $PORT"]
