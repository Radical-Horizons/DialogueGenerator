"""Tests du service de notation absolue.

Les garde-fous sont la valeur du livrable : sans eux le jugement produit une
impression, pas une mesure. Chaque test ci-dessous protège un garde-fou précis
qui, s'il disparaissait, laisserait passer un score faux sans rien casser.
"""

from __future__ import annotations

import json
from typing import Any, List, Optional

import pytest

from api.schemas.benchmark import BenchmarkGenerationRecord
from api.schemas.benchmark_judging import CriteriaGrid, CriterionDefinition
from models.benchmark_judge_output import (
    BenchmarkCriterionScore,
    BenchmarkRubricJudgeResult,
)
from services.benchmark_judge_service import (
    BenchmarkJudgeService,
    measure_text_length,
    validate_against_grid,
)

JUDGE_MODEL = "gpt-5.6-terra"

FRENCH_LINE = (
    "Je n'ai pas confiance en toi, marchand : tu vends des promesses et tu gardes "
    "les pièces."
)


def _grid(*criterion_ids: str) -> CriteriaGrid:
    """Grille de test portant les identifiants demandés."""
    ids = criterion_ids or ("voice_fidelity", "french_correctness", "ai_tics")
    return CriteriaGrid(
        grid_id="test",
        version=3,
        criteria=[
            CriterionDefinition(
                criterion_id=cid,
                label=cid.replace("_", " "),
                description=f"Consigne pour {cid}.",
                direction="lower_is_better" if cid == "ai_tics" else "higher_is_better",
                weight=2.0 if cid == "french_correctness" else 1.0,
            )
            for cid in ids
        ],
    )


def _record(**overrides: Any) -> BenchmarkGenerationRecord:
    """Génération valide minimale."""
    payload: dict[str, Any] = {
        "run_id": "run-1",
        "case_id": "cas-0",
        "model_id": "gpt-5.6-luna",
        "repetition": 0,
        "status": "valid",
        "json_content": json.dumps(
            {
                "schemaVersion": "1.1.0",
                "nodes": [
                    {
                        "id": "node-1",
                        "line": FRENCH_LINE,
                        "choices": [{"choiceId": "c0", "text": "Partir sans un mot"}],
                    }
                ],
            },
            ensure_ascii=False,
        ),
    }
    payload.update(overrides)
    return BenchmarkGenerationRecord.model_validate(payload)


class _FakeJudgeClient:
    """Client LLM juge dont on contrôle la réponse."""

    def __init__(self, result: Any, *, cost: float = 0.002) -> None:
        self._result = result
        self.last_call_cost = cost
        self.last_usage_prompt_tokens = 900
        self.last_usage_completion_tokens = 120
        self.prompts: List[str] = []
        self.system_prompts: List[Optional[str]] = []

    async def generate_variants(
        self,
        prompt: str,
        k: int = 1,
        response_model: Any = None,
        previous_dialogue_context: Any = None,
        user_system_prompt_override: Optional[str] = None,
    ) -> List[Any]:
        """Enregistre le prompt et retourne la réponse préparée."""
        self.prompts.append(prompt)
        self.system_prompts.append(user_system_prompt_override)
        if isinstance(self._result, Exception):
            raise self._result
        return [] if self._result is None else [self._result]


def _result(*pairs: tuple[str, int], reasoning: str = "") -> BenchmarkRubricJudgeResult:
    """Réponse de juge portant les notes demandées."""
    return BenchmarkRubricJudgeResult(
        criteria=[
            BenchmarkCriterionScore(criterion_id=cid, score=score, comment=f"note {score}")
            for cid, score in pairs
        ],
        reasoning=reasoning,
    )


@pytest.mark.asyncio
async def test_scores_are_read_from_structured_fields_only() -> None:
    """Un raisonnement qui annonce d'autres notes ne fait jamais foi.

    C'est le défaut réel d'EQ-Bench : le texte libre du juge était scanné pour en
    extraire un verdict. Ici il est conservé pour audit et rien d'autre.
    """
    grid = _grid()
    client = _FakeJudgeClient(
        _result(
            ("voice_fidelity", 8),
            ("french_correctness", 9),
            ("ai_tics", 1),
            reasoning=(
                "En réalité je mets 2 en voice_fidelity et 0 en french_correctness, "
                "le score final est 2/10."
            ),
        )
    )
    verdict = await BenchmarkJudgeService().judge_rubric(
        record=_record(), grid=grid, llm_client=client, judge_model=JUDGE_MODEL
    )
    assert verdict.status == "scored"
    assert verdict.scores == {"voice_fidelity": 8, "french_correctness": 9, "ai_tics": 1}
    assert "je mets 2" in verdict.reasoning, "le raisonnement reste conservé pour audit"


@pytest.mark.asyncio
async def test_missing_criterion_yields_named_judge_error() -> None:
    """Un critère omis est une erreur nommée, pas un critère ignoré en silence."""
    client = _FakeJudgeClient(_result(("voice_fidelity", 7), ("ai_tics", 2)))
    verdict = await BenchmarkJudgeService().judge_rubric(
        record=_record(), grid=_grid(), llm_client=client, judge_model=JUDGE_MODEL
    )
    assert verdict.status == "judge_error"
    assert "french_correctness" in (verdict.error_message or "")
    assert verdict.scores == {}, "un verdict partiel serait pire qu'un verdict absent"


@pytest.mark.asyncio
async def test_unknown_criterion_yields_judge_error() -> None:
    """Un identifiant inventé n'entre nulle part."""
    client = _FakeJudgeClient(
        _result(
            ("voice_fidelity", 7),
            ("french_correctness", 8),
            ("ai_tics", 2),
            ("creativite_globale", 9),
        )
    )
    verdict = await BenchmarkJudgeService().judge_rubric(
        record=_record(), grid=_grid(), llm_client=client, judge_model=JUDGE_MODEL
    )
    assert verdict.status == "judge_error"
    assert "creativite_globale" in (verdict.error_message or "")
    # Un verdict partiel entrerait dans les moyennes par la petite porte : rien ne
    # doit survivre, pas même les critères correctement notés.
    assert verdict.scores == {}
    assert verdict.comments == {}


@pytest.mark.asyncio
async def test_duplicate_criterion_yields_judge_error() -> None:
    """Un critère noté deux fois rend le verdict ambigu."""
    client = _FakeJudgeClient(
        _result(
            ("voice_fidelity", 7),
            ("voice_fidelity", 2),
            ("french_correctness", 8),
            ("ai_tics", 2),
        )
    )
    verdict = await BenchmarkJudgeService().judge_rubric(
        record=_record(), grid=_grid(), llm_client=client, judge_model=JUDGE_MODEL
    )
    assert verdict.status == "judge_error"
    assert "deux fois" in (verdict.error_message or "")


@pytest.mark.asyncio
async def test_judge_model_and_grid_version_are_recorded() -> None:
    """Changer de juge change les résultats : le juge voyage avec la note."""
    client = _FakeJudgeClient(
        _result(("voice_fidelity", 7), ("french_correctness", 8), ("ai_tics", 2))
    )
    verdict = await BenchmarkJudgeService().judge_rubric(
        record=_record(), grid=_grid(), llm_client=client, judge_model=JUDGE_MODEL
    )
    assert verdict.judge_model == JUDGE_MODEL
    assert (verdict.grid_id, verdict.grid_version) == ("test", 3)
    assert verdict.cost_usd == pytest.approx(0.002)


@pytest.mark.asyncio
async def test_text_length_is_recorded_beside_scores() -> None:
    """La longueur est une mesure objective, tenue hors des notes du juge."""
    record = _record()
    client = _FakeJudgeClient(
        _result(("voice_fidelity", 7), ("french_correctness", 8), ("ai_tics", 2))
    )
    verdict = await BenchmarkJudgeService().judge_rubric(
        record=record, grid=_grid(), llm_client=client, judge_model=JUDGE_MODEL
    )
    assert verdict.text_length_chars == measure_text_length(record.json_content)
    assert verdict.text_length_chars > 0
    assert "length" not in verdict.scores


@pytest.mark.asyncio
async def test_unreachable_judge_does_not_raise() -> None:
    """Un juge injoignable donne un verdict d'erreur, il n'interrompt pas la passe."""
    client = _FakeJudgeClient(RuntimeError("502 Bad Gateway"))
    verdict = await BenchmarkJudgeService().judge_rubric(
        record=_record(), grid=_grid(), llm_client=client, judge_model=JUDGE_MODEL
    )
    assert verdict.status == "judge_error"
    assert "502" in (verdict.error_message or "")


@pytest.mark.asyncio
async def test_empty_judge_response_yields_judge_error() -> None:
    """Aucune variante retournée n'est pas un score de zéro."""
    client = _FakeJudgeClient(None)
    verdict = await BenchmarkJudgeService().judge_rubric(
        record=_record(), grid=_grid(), llm_client=client, judge_model=JUDGE_MODEL
    )
    assert verdict.status == "judge_error"
    assert verdict.scores == {}


@pytest.mark.asyncio
async def test_prompt_is_built_from_the_grid_including_direction() -> None:
    """Le prompt suit la grille : identifiants, consignes et sens inversé."""
    client = _FakeJudgeClient(
        _result(("voice_fidelity", 7), ("french_correctness", 8), ("ai_tics", 2))
    )
    await BenchmarkJudgeService().judge_rubric(
        record=_record(), grid=_grid(), llm_client=client, judge_model=JUDGE_MODEL
    )
    prompt = client.prompts[0]
    assert "voice_fidelity" in prompt and "french_correctness" in prompt
    assert "SENS INVERSÉ" in prompt, "un critère négatif doit être annoncé comme tel"
    assert "Consigne pour ai_tics." in prompt
    assert client.system_prompts[0], "le prompt système du juge doit être fourni"


@pytest.mark.asyncio
async def test_added_criterion_needs_no_code_change() -> None:
    """Ajouter un critère à la grille suffit à le faire noter."""
    grid = _grid("voice_fidelity", "french_correctness", "ai_tics", "concision")
    client = _FakeJudgeClient(
        _result(
            ("voice_fidelity", 7),
            ("french_correctness", 8),
            ("ai_tics", 2),
            ("concision", 6),
        )
    )
    verdict = await BenchmarkJudgeService().judge_rubric(
        record=_record(), grid=grid, llm_client=client, judge_model=JUDGE_MODEL
    )
    assert verdict.status == "scored"
    assert verdict.scores["concision"] == 6
    assert "concision" in client.prompts[0]


@pytest.mark.asyncio
async def test_cost_falls_back_to_pricing_when_client_reports_nothing() -> None:
    """Un client sans suivi d'usage rendrait le plafond budgétaire inopérant.

    `last_call_cost` vaut 0.0 quand le client n'a pas de service d'usage ou quand
    le suivi a échoué : sans repli tarifaire, `spent` resterait à zéro toute la
    passe et le plafond ne se déclencherait jamais.
    """

    class _PricingService:
        def calculate_cost(self, model: str, prompt_tokens: int, completion_tokens: int) -> float:
            return 0.0042

    client = _FakeJudgeClient(
        _result(("voice_fidelity", 7), ("french_correctness", 8), ("ai_tics", 2)), cost=0.0
    )
    verdict = await BenchmarkJudgeService(pricing_service=_PricingService()).judge_rubric(
        record=_record(), grid=_grid(), llm_client=client, judge_model=JUDGE_MODEL
    )
    assert verdict.cost_usd == pytest.approx(0.0042)


@pytest.mark.asyncio
async def test_reported_cost_wins_over_the_fallback() -> None:
    """Quand le client chiffre son appel, c'est sa valeur qui fait foi."""

    class _PricingService:
        def calculate_cost(self, model: str, prompt_tokens: int, completion_tokens: int) -> float:
            return 99.0

    client = _FakeJudgeClient(
        _result(("voice_fidelity", 7), ("french_correctness", 8), ("ai_tics", 2)), cost=0.003
    )
    verdict = await BenchmarkJudgeService(pricing_service=_PricingService()).judge_rubric(
        record=_record(), grid=_grid(), llm_client=client, judge_model=JUDGE_MODEL
    )
    assert verdict.cost_usd == pytest.approx(0.003)


@pytest.mark.asyncio
async def test_failed_call_is_still_charged() -> None:
    """Un appel qui lève après consommation a été facturé : il doit être imputé."""

    class _PricingService:
        def calculate_cost(self, model: str, prompt_tokens: int, completion_tokens: int) -> float:
            return 0.0021

    client = _FakeJudgeClient(RuntimeError("timeout après génération"), cost=0.0)
    verdict = await BenchmarkJudgeService(pricing_service=_PricingService()).judge_rubric(
        record=_record(), grid=_grid(), llm_client=client, judge_model=JUDGE_MODEL
    )
    assert verdict.status == "judge_error"
    assert verdict.cost_usd == pytest.approx(0.0021), "la dépense ne doit pas échapper au plafond"


@pytest.mark.asyncio
async def test_criteria_snapshot_freezes_direction_and_weight() -> None:
    """Le sens et le poids voyagent avec la note.

    Sans cela, inverser la direction d'un critère dans la grille réinterpréterait
    tous les verdicts antérieurs : un défaut serait agrégé comme une qualité.
    """
    client = _FakeJudgeClient(
        _result(("voice_fidelity", 7), ("french_correctness", 8), ("ai_tics", 2))
    )
    verdict = await BenchmarkJudgeService().judge_rubric(
        record=_record(), grid=_grid(), llm_client=client, judge_model=JUDGE_MODEL
    )
    snapshot = {c.criterion_id: c for c in verdict.criteria_snapshot}
    assert set(snapshot) == {"voice_fidelity", "french_correctness", "ai_tics"}
    assert snapshot["ai_tics"].direction == "lower_is_better"
    assert snapshot["french_correctness"].weight == pytest.approx(2.0)


@pytest.mark.asyncio
async def test_valid_record_without_content_is_not_scored() -> None:
    """Une génération déclarée valide mais vide ne se note pas."""
    client = _FakeJudgeClient(
        _result(("voice_fidelity", 7), ("french_correctness", 8), ("ai_tics", 2))
    )
    verdict = await BenchmarkJudgeService().judge_rubric(
        record=_record(json_content=None),
        grid=_grid(),
        llm_client=client,
        judge_model=JUDGE_MODEL,
    )
    assert verdict.status == "judge_error"
    assert "sans contenu" in (verdict.error_message or "")
    assert client.prompts == [], "aucun appel de juge sur une génération vide"


def test_validate_against_grid_accepts_exact_coverage() -> None:
    """Couverture exacte : scores et commentaires appariés par identifiant."""
    scores, comments, problem = validate_against_grid(
        _result(("voice_fidelity", 7), ("french_correctness", 8), ("ai_tics", 2)), _grid()
    )
    assert problem is None
    assert scores == {"voice_fidelity": 7, "french_correctness": 8, "ai_tics": 2}
    assert set(comments) == set(scores)


def test_measure_text_length_ignores_unparsable_content() -> None:
    """La mesure de longueur ne lève pas sur une génération illisible."""
    assert measure_text_length("{ pas du JSON") == 0
    assert measure_text_length(None) == 0
