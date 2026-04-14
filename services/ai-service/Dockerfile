FROM python:3.9-slim

RUN apt-get update && apt-get install -y \
    build-essential \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY services/ai-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY services/ai-service .
COPY .env ../../.env

RUN mkdir -p /models

ENV MODEL_DIR=/models

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
