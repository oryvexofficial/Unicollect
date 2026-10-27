"""API tests in demo mode (no torch / models needed).

Needs: pip install fastapi httpx   (skipped automatically if missing)
"""
import os

import pytest

os.environ["GUARD_DEMO_MODE"] = "1"
os.environ["GUARD_RATE_LIMIT"] = "0"
pytest.importorskip("fastapi")
pytest.importorskip("httpx")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

client = TestClient(app)


def test_index_lists_endpoints():
    r = client.get("/api/v1")
    assert r.status_code == 200
    paths = {e["path"] for e in r.json()["endpoints"]}
    assert "/api/v1/check" in paths and "/api/v1/check/batch" in paths


def test_health_and_ready():
    assert client.get("/api/v1/health").json()["status"] == "ok"
    assert client.get("/api/v1/ready").status_code == 200
    assert client.get("/health").json()["mode"] == "demo"


def test_models_and_config():
    assert client.get("/api/v1/models").json()["total"] == 5
    assert client.get("/api/v1/models/persian").json()["language"] == "fa"
    r = client.get("/api/v1/models/nope")
    assert r.status_code == 404 and r.json()["error"]["code"] == "unknown_model"
    assert client.get("/api/v1/config").json()["min_votes_for_toxic"] == 2


def test_check_post_and_get():
    r = client.post("/api/v1/check", json={"text": "kir"})
    assert r.status_code == 200
    body = r.json()
    assert body["decision"] == "TOXIC" and body["fingilish_detected"] is True
    assert "raw_scores" in body
    slim = client.post("/api/v1/check", json={"text": "hello", "detailed": False}).json()
    assert "raw_scores" not in slim and slim["decision"] == "SAFE"
    assert client.get("/api/v1/check", params={"text": "hello"}).json()["decision"] == "SAFE"


def test_errors_have_one_shape():
    r = client.post("/api/v1/check", json={"text": "   "})
    assert r.status_code == 400 and r.json()["error"]["code"] == "empty_text"
    r = client.post("/api/v1/check", json={"text": "x" * 25000})
    assert r.status_code == 413
    r = client.post("/api/v1/check", json={})
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_body"
    r = client.get("/api/v1/does-not-exist")
    assert r.status_code == 404 and "error" in r.json()


def test_batch():
    r = client.post("/api/v1/check/batch", json={"texts": ["hello", "kir", ""]}).json()
    assert r["count"] == 3 and r["summary"]["errors"] == 1 and 1 in r["flagged_indexes"]


def test_utilities():
    assert client.post("/api/v1/censor", json={"text": "you are a k1r"}).json()["text"] == "you are a ***"
    assert client.post("/api/v1/profanity", json={"text": "jakesh"}).json()["found"]
    assert client.post("/api/v1/language", json={"text": "سلام"}).json()["script"] == "fa"
    assert client.post("/api/v1/fingilish/detect", json={"text": "salam khoobi"}).json()["fingilish"]
    assert client.post("/api/v1/fingilish/transliterate", json={"text": "salam"}).json()["persian"] == "سلام"
    assert client.post("/api/v1/normalize", json={"text": "k.1.r"}).json()["normalized"] == "kir"


def test_moderations_shape():
    r = client.post("/api/v1/moderations", json={"input": ["kir", "hello"]}).json()
    assert r["id"].startswith("modr-") and len(r["results"]) == 2
    assert r["results"][0]["flagged"] is True


def test_sentences_and_score():
    r = client.post("/api/v1/sentences", json={"text": "Hello. Have a nice day!"}).json()
    assert r["count"] == 2
    r = client.post("/api/v1/score", json={"text": "hello", "models": ["persian", "textdetox_lg"]}).json()
    assert "persian" in r["skipped_models"]


def test_api_keys(monkeypatch):
    monkeypatch.setenv("GUARD_API_KEYS", "secret1")
    assert client.post("/api/v1/verdict", json={"text": "hi"}).status_code == 401
    assert client.post("/api/v1/verdict", json={"text": "hi"}, headers={"X-API-Key": "secret1"}).status_code == 200
    assert client.post("/api/v1/verdict", json={"text": "hi"},
                       headers={"Authorization": "Bearer secret1"}).status_code == 200
    # discovery stays open
    assert client.get("/api/v1/health").status_code == 200


def test_legacy_check_still_200():
    r = client.post("/api/check", json={"text": ""})
    assert r.status_code == 200 and "error" in r.json()


def test_cors_preflight():
    r = client.options("/api/v1/check", headers={
        "Origin": "https://example.github.io", "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type"})
    assert r.status_code == 200


def test_chat_shortcut_redirects_to_site_chat():
    r = client.get("/chat", follow_redirects=False)
    assert r.status_code in (302, 307) and r.headers["location"] == "/site/chat/"
