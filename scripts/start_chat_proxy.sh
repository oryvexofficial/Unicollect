#!/usr/bin/env bash
# Starts the Unicollect Chat proxy (app/chat_app.py). This is the process
# that actually gets tunnelled publicly; it talks to llama-server
# (start_chat_server.sh) over localhost only.
set -euo pipefail
cd "$(dirname "$0")/.."
exec uvicorn app.chat_app:app \
  --host 0.0.0.0 \
  --port "${CHAT_PROXY_PORT:-8002}" \
  --workers 1
