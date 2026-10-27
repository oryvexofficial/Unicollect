"""Download the GGUF chat model into ./models/chat (or $MODELS_ROOT/chat).

Default pick: Qwen2.5-3B-Instruct, Q4_K_M quantization. On a GitHub-hosted
runner (4 cores, 16 GB RAM, no GPU) this is the best balance of quality,
speed and memory of the Qwen2.5 family for CPU-only inference — noticeably
better quality than 1.5B at a speed that still responds in a few seconds
per message, while 7B+ gets too slow for an interactive chat on 4 CPU
cores. Override with CHAT_MODEL_REPO / CHAT_MODEL_FILE if you want a
different GGUF.
"""
import os
from pathlib import Path

from huggingface_hub import hf_hub_download

CHAT_MODEL_REPO = os.environ.get("CHAT_MODEL_REPO", "Qwen/Qwen2.5-3B-Instruct-GGUF")
CHAT_MODEL_FILE = os.environ.get("CHAT_MODEL_FILE", "qwen2.5-3b-instruct-q4_k_m.gguf")


def main() -> None:
    root = Path(os.environ.get("MODELS_ROOT") or (Path(__file__).resolve().parent.parent / "models"))
    target_dir = root / "chat"
    target_dir.mkdir(parents=True, exist_ok=True)

    print(f"Downloading {CHAT_MODEL_REPO}/{CHAT_MODEL_FILE} -> {target_dir}", flush=True)
    path = hf_hub_download(
        repo_id=CHAT_MODEL_REPO,
        filename=CHAT_MODEL_FILE,
        local_dir=str(target_dir),
    )
    print(f"Done: {path}", flush=True)

    # Written for the workflow to pick up without re-deriving the filename.
    (target_dir / "MODEL_PATH").write_text(path, encoding="utf-8")


if __name__ == "__main__":
    main()
