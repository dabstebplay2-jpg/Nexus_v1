FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt passlib[bcrypt]

COPY app ./app

ENV PYTHONUNBUFFERED=1
ENV NEXUS_CLOUD_SERVER_URL=http://cloud:8080

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
