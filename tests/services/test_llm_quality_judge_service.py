"""Tests unitaires LLMQualityJudgeService (FR42)."""
import pytest
from unittest.mock import AsyncMock, MagicMock

from models.dialogue_quality_judge import (
    DialogueQualityCriterionJudgeItem,
    DialogueQualityJudgeStructuredResult,
)
from services.configuration_service import ConfigurationService
from services.llm_quality_judge_service import LLMQualityJudgeService


def _four_criteria() -> list:
    return [
        DialogueQualityCriterionJudgeItem(
            criterion_id="narrative_coherence", score=5, comment="n"
        ),
        DialogueQualityCriterionJudgeItem(
            criterion_id="characterization", score=5, comment="c"
        ),
        DialogueQualityCriterionJudgeItem(criterion_id="agency", score=5, comment="a"),
        DialogueQualityCriterionJudgeItem(criterion_id="style", score=5, comment="s"),
    ]


@pytest.mark.asyncio
async def test_evaluate_graph_maps_structured_to_api_response():
    """Mock LLM → réponse API avec labels FR et variance note."""
    structured = DialogueQualityJudgeStructuredResult(
        overall_score=6,
        criteria=_four_criteria(),
        global_comment="OK",
        improvement_suggestions=["Renforcer les enjeux"],
        strengths=[],
    )
    llm = MagicMock()
    llm.generate_variants = AsyncMock(return_value=[structured])
    cfg = MagicMock(spec=ConfigurationService)
    cfg.get_available_llm_models.return_value = [
        {"api_identifier": "gpt-test", "client_type": "openai"}
    ]

    svc = LLMQualityJudgeService()
    out = await svc.evaluate_graph(
        nodes=[
            {
                "id": "N1",
                "type": "dialogueNode",
                "data": {"id": "N1", "speaker": "X", "line": "Hi"},
            }
        ],
        edges=[],
        llm_client=llm,
        config_service=cfg,
        model_id="gpt-test",
    )
    assert out.overall_score == 6
    assert out.provider == "openai"
    assert len(out.criteria) == 4
    assert out.criteria[0].label == "Cohérence narrative"
    assert "±" in out.score_variance_note or "1" in out.score_variance_note
