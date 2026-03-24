"""Tests du scoring de pertinence contexte (Story 3.6)."""
import json
import time

from services.context_relevance_scoring import (
    LOW_SCORE_THRESHOLD_PERCENT,
    compute_context_relevance_result,
)
from services.context_relevance_service import ContextRelevanceService
from services.llm_usage_service import LLMUsageService
from services.llm_pricing_service import LLMPricingService
from services.repositories.llm_usage_repository import FileLLMUsageRepository
from models.llm_usage import LLMUsageRecord
from datetime import datetime, UTC


def test_compute_overlap_high_when_tokens_match() -> None:
    system = (
        "### Personnages\n"
        "ZyphiraUniqueXYZ réside dans la forêt.\n\n"
        "### Lieux\n"
        "TourUniqueABC ancienne pierre.\n"
    )
    prompt = f"{system}\n\n--- Input ---\n" + json.dumps(
        [{"role": "user", "content": "suite"}],
        ensure_ascii=False,
    )
    response_obj = {
        "line": "ZyphiraUniqueXYZ parle de la TourUniqueABC.",
        "speaker": "PNJ",
        "choices": [],
    }
    response = json.dumps(response_obj, ensure_ascii=False)
    result = compute_context_relevance_result(
        prompt, response, request_id="req-a", low_threshold_percent=15.0
    )
    assert result["request_id"] == "req-a"
    assert result["score_percent"] >= 20.0
    assert result["breakdown_by_type"].get("characters", 0) > 0.0
    assert result["computation_ms"] < 1000
    assert result["low_context_warning"] is False


def test_compute_low_score_triggers_warning() -> None:
    system = "### Personnages\nPersonnageSansOverlapQQQ description longue ici.\n"
    prompt = system + "\n\n--- Input ---\n[]"
    response = json.dumps({"line": "réplique générique sans mots du contexte", "choices": []})
    result = compute_context_relevance_result(
        prompt,
        response,
        low_threshold_percent=LOW_SCORE_THRESHOLD_PERCENT,
        request_id="req-b",
    )
    assert result["score_percent"] < LOW_SCORE_THRESHOLD_PERCENT
    assert result["low_context_warning"] is True
    assert len(result["suggestions_hints"]) >= 1


def test_compute_empty_response_zero_score() -> None:
    prompt = "instructions\n\n--- Input ---\n[]"
    result = compute_context_relevance_result(prompt, "")
    assert result["score_percent"] == 0.0


def test_compute_fallback_other_bucket_without_headers() -> None:
    blob = "somecontexttokenZZZ repeated contexttokenZZZ"
    prompt = blob + "\n\n--- Input ---\n[]"
    response = json.dumps({"line": "contexttokenZZZ appears", "choices": []})
    result = compute_context_relevance_result(prompt, response)
    assert "other" in result["breakdown_by_type"]
    assert result["breakdown_by_type"]["other"] > 25.0


def test_context_relevance_service_delegates() -> None:
    svc = ContextRelevanceService()
    r = svc.compute_result("x", "{}", request_id="r1")
    assert r["method"] == "keyword_overlap_v1"


def test_llm_usage_compute_and_persist(tmp_path) -> None:
    repo = FileLLMUsageRepository(storage_dir=str(tmp_path))
    usage = LLMUsageService(repository=repo, pricing_service=LLMPricingService())
    prompt = (
        "### Personnages\n"
        "AlphaTokenForPersist unique.\n\n"
        "--- Input ---\n"
        "[]"
    )
    record = LLMUsageRecord(
        request_id="req-persist",
        timestamp=datetime.now(UTC),
        model_name="test-model",
        prompt_tokens=10,
        completion_tokens=5,
        total_tokens=15,
        estimated_cost=0.0,
        duration_ms=100,
        success=True,
        endpoint="test",
        k_variants=1,
        dialogue_id="dlg.json",
        node_id="NODE_1",
        prompt=prompt,
        response=json.dumps({"line": "AlphaTokenForPersist speaks", "choices": []}),
    )
    repo.save(record)
    usage.compute_and_persist_context_relevance("req-persist")
    updated = repo.get_by_request_id("req-persist")
    assert updated is not None
    assert updated.context_relevance is not None
    assert updated.context_relevance["score_percent"] >= 0.0
    hist = usage.list_context_relevance_history("dlg.json")
    assert len(hist) == 1
    assert hist[0]["request_id"] == "req-persist"


def test_scoring_performance_under_one_second() -> None:
    big = "word " * 5000
    prompt = f"### Lieux\n{big}\n\n--- Input ---\n[]"
    response = json.dumps({"line": "word " * 500, "choices": []})
    t0 = time.perf_counter()
    compute_context_relevance_result(prompt, response)
    assert (time.perf_counter() - t0) < 1.0
