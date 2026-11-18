"""Tests POST /api/v1/unity-dialogues/graph/evaluate-dialogue-quality (FR42)."""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock

from api.main import app
from api.dependencies import get_llm_quality_judge_service
from services.llm_quality_judge_service import LLMQualityJudgeService
from api.schemas.dialogue_quality import EvaluateDialogueQualityResponse


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _minimal_graph() -> dict:
    return {
        "nodes": [
            {
                "id": "START",
                "type": "startNode",
                "data": {"id": "START", "label": "Start"},
            },
            {
                "id": "A",
                "type": "dialogueNode",
                "data": {
                    "id": "A",
                    "speaker": "PNJ",
                    "line": "Bonjour.",
                    "choices": [{"text": "Salut", "choiceId": "c1"}],
                },
            },
        ],
        "edges": [{"id": "e0", "source": "START", "target": "A"}],
    }


def test_evaluate_dialogue_quality_dummy_llm_returns_structured_scores(client: TestClient):
    """DummyLLM renvoie un JSON juge valide → score global et 4 critères."""
    body = _minimal_graph()
    r = client.post("/api/v1/unity-dialogues/graph/evaluate-dialogue-quality", json=body)
    assert r.status_code == 200, r.text
    data = r.json()
    parsed = EvaluateDialogueQualityResponse.model_validate(data)
    assert 0 <= parsed.overall_score <= 10
    assert len(parsed.criteria) == 4
    ids = {c["criterion_id"] for c in data["criteria"]}
    assert ids == {"narrative_coherence", "characterization", "agency", "style"}
    assert parsed.score_variance_margin == 1
    assert "±" in parsed.score_variance_note or "1" in parsed.score_variance_note


def test_evaluate_dialogue_quality_llm_failure_returns_error(client: TestClient):
    """Échec LLM → HTTP 500 et message (pas de score vide 200)."""
    mock_service = MagicMock(spec=LLMQualityJudgeService)
    mock_service.evaluate_graph = AsyncMock(side_effect=RuntimeError("timeout simulate"))

    app.dependency_overrides[get_llm_quality_judge_service] = lambda: mock_service
    try:
        r = client.post(
            "/api/v1/unity-dialogues/graph/evaluate-dialogue-quality",
            json=_minimal_graph(),
        )
        assert r.status_code == 500
        msg = r.json().get("error", {}).get("message", "")
        assert "timeout" in msg.lower()
    finally:
        app.dependency_overrides.pop(get_llm_quality_judge_service, None)


def test_successful_evaluation_is_not_tracked_by_the_route(client: TestClient) -> None:
    """Le client LLM enregistre l'usage : la route ne le refait pas (budget compté une fois)."""
    from api.dependencies import get_llm_usage_service

    usage_service = MagicMock()
    mock_service = MagicMock(spec=LLMQualityJudgeService)
    mock_service.evaluate_graph = AsyncMock(
        return_value=EvaluateDialogueQualityResponse(
            overall_score=7, score_variance_note="±1", model_id="dummy", provider="dummy"
        )
    )
    app.dependency_overrides[get_llm_quality_judge_service] = lambda: mock_service
    app.dependency_overrides[get_llm_usage_service] = lambda: usage_service
    try:
        r = client.post(
            "/api/v1/unity-dialogues/graph/evaluate-dialogue-quality",
            json=_minimal_graph(),
        )
        assert r.status_code == 200, r.text
        usage_service.track_usage.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_llm_quality_judge_service, None)
        app.dependency_overrides.pop(get_llm_usage_service, None)
