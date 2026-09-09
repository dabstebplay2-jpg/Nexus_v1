#!/usr/bin/env bash
set -euo pipefail
PORT="${PORT:-8080}"
exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
