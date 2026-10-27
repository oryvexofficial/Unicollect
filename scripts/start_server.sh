#!/usr/bin/env bash
# Start Unicollect with gunicorn. --preload makes the Gunicorn MASTER import
# app.main (and so load all five models) once, before forking workers; the
# forked workers then share that already-loaded memory via copy-on-write
# instead of each worker re-loading all five models from disk on its own.
# This is both faster to become healthy and lighter on RAM than running
# without --preload.
set -euo pipefail
cd "$(dirname "$0")/.."
export MODELS_ROOT="${MODELS_ROOT:-$PWD/models}"
exec gunicorn app.main:app \
  --workers "${WORKERS:-2}" \
  --worker-class uvicorn.workers.UvicornWorker \
  --preload \
  --bind "0.0.0.0:${PORT:-8000}" \
  --timeout 180 \
  --graceful-timeout 30 \
  --keep-alive 5
