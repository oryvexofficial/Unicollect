"""Download the five Hugging Face models into ./models (or $MODELS_ROOT)."""
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from huggingface_hub import snapshot_download

# Verified to exist on the Hub (checked Oct 2026). If any of these repos are
# ever renamed or removed, override with the matching env var below rather
# than editing this file.
MODELS = {
    "persian":           os.environ.get("PERSIAN_MODEL_ID",      "HamidRezaei/Persian-Offensive-Language-Detection"),
    "textdetox_large":   os.environ.get("TEXTDETOX_LARGE_ID",    "textdetox/twitter-xlmr-toxicity-classifier"),
    "textdetox_base":    os.environ.get("TEXTDETOX_BASE_ID",     "textdetox/xlmr-base-toxicity-classifier"),
    "multilingual":      os.environ.get("MULTILINGUAL_MODEL_ID", "unitary/multilingual-toxic-xlm-roberta"),
    "twitter_offensive": os.environ.get("TWITTER_OFFENSIVE_ID",  "cardiffnlp/twitter-roberta-base-offensive"),
}

IGNORE = ["*.h5", "*.msgpack", "*.onnx", "*.tflite", "*.ot", "*.mlmodelc"]


def main() -> None:
    root = Path(os.environ.get("MODELS_ROOT", Path(__file__).resolve().parent.parent / "models"))
    def download_one(item):
        sub, repo_id = item
        target = root / sub
        target.mkdir(parents=True, exist_ok=True)
        print(f"Downloading {repo_id} -> {target}", flush=True)
        snapshot_download(repo_id=repo_id, local_dir=str(target), ignore_patterns=IGNORE)
        print(f"Done {repo_id}", flush=True)

    workers = max(1, min(int(os.environ.get("MODEL_DOWNLOAD_WORKERS", "3")),
                         len(MODELS)))
    print(f"Downloading all {len(MODELS)} models with {workers} concurrent downloads...",
          flush=True)
    with ThreadPoolExecutor(max_workers=workers,
                            thread_name_prefix="model-downloader") as pool:
        futures = [pool.submit(download_one, item) for item in MODELS.items()]
        for future in as_completed(futures):
            future.result()


if __name__ == "__main__":
    main()
