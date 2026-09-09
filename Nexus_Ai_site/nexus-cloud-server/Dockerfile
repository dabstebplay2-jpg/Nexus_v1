FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt python-dotenv

COPY main.py .
COPY app ./app

ENV PYTHONUNBUFFERED=1
ENV NEXUS_CLOUD_DATABASE_URL=sqlite:////data/nexus_cloud_v2.db

RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
