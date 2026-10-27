#!/usr/bin/env bash
# Starts `ollama serve`, bound to 127.0.0.1 only. It is never tunnelled
# directly — app/chat_app.py proxies to it on a public port so the system
# prompt can't be overridden by a client.
#
# Ollama bundles its own llama.cpp-based runtime and pulls/caches GGUF
# weights itself, so this replaces the old "download a GGUF + download a
# pinned llama.cpp release binary" pipeline, which broke whenever
# ggml-org/llama.cpp changed its release-asset naming (or stopped shipping
# binary assets on "latest" entirely).
set -euo pipefail
cd "$(dirname "$0")/.."

export OLLAMA_HOST="127.0.0.1:${LLAMA_PORT:-8001}"
# Keep the model resident between requests instead of unloading it after
# Ollama's 5-minute default idle timeout (would add a slow reload mid-chat).
export OLLAMA_KEEP_ALIVE="${OLLAMA_KEEP_ALIVE:-30m}"

exec ollama serve
