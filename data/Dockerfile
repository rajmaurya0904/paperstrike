FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# .env (your broker keys) and paper.db (your account) live on a volume, not in the image
ENV DATA_DIR=/app/state
RUN mkdir -p /app/state && useradd --create-home app && chown app /app/state
USER app

EXPOSE 8000
# 0.0.0.0 inside the container only; docker-compose publishes it on 127.0.0.1
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
