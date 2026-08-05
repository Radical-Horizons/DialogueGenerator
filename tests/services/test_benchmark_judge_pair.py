"""Tests du jugement par paires — les contrôles de biais.

Le test le plus important du lot est `test_position_biased_judge_wins_nothing` :
il simule un juge qui préfère systématiquement la première proposition et vérifie
qu'aucun modèle n'en tire avantage. Sans le double sens, ce juge dicterait le
classement ; c'est précisément la raison d'être des deux appels par duel.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import pytest

from api.schemas.benchmark_judging import CriteriaGrid, CriterionDefinition
from models.benchmark_judge_output import (
    BenchmarkPairwiseCriterionVerdict,
    BenchmarkPairwiseJudgeResult,
)
from services.benchmark_judge_service import (
    BenchmarkPairwiseJudgeService,
    aggregate_directions,
)
from services.benchmark_pair_builder import PairAssignment

JUDGE_MODEL = "gpt-5.6-sol"
CRITERIA = ("voice_fidelity", "french_correctness")


def _grid() -> CriteriaGrid:
    """Grille de test à deux critères."""
    return CriteriaGrid(
        grid_id="test",
        version=2,
        criteria=[
            CriterionDefinition(
                criterion_id=cid, label=cid, description=f"Consigne {cid}."
            )
            for cid in CRITERIA
        ],
    )


def _pair(**overrides: Any) -> PairAssignment:
    """Paire minimale, étiquettes déjà attribuées."""
    payload: Dict[str, Any] = {
        "case_id": "cas-0",
        "repetition": 0,
        "model_a": "m-alpha",
        "model_b": "m-beta",
        "text_a": "Proposition alpha.",
        "text_b": "Proposition beta.",
        "length_a": 18,
        "length_b": 17,
        "truncated": False,
    }
    payload.update(overrides)
    return PairAssignment(**payload)


def _result(*pairs: tuple[str, str, int], reasoning: str = "") -> BenchmarkPairwiseJudgeResult:
    """Réponse de juge : (critère, gagnant, marge)."""
    return BenchmarkPairwiseJudgeResult(
        criteria=[
            BenchmarkPairwiseCriterionVerdict(
                criterion_id=cid, winner=winner, margin=margin, comment=""
            )
            for cid, winner, margin in pairs
        ],
        reasoning=reasoning,
    )


class _ScriptedJudge:
    """Client juge qui répond selon un script, un élément par appel."""

    def __init__(self, script: List[Any], *, cost: float = 0.001) -> None:
        self._script = list(script)
        self.last_call_cost = cost
        self.last_usage_prompt_tokens = 500
        self.last_usage_completion_tokens = 80
        self.prompts: List[str] = []

    async def generate_variants(self, prompt: str, k: int = 1, **kwargs: Any) -> List[Any]:
        """Retourne l'élément suivant du script."""
        self.prompts.append(prompt)
        item = self._script.pop(0)
        if isinstance(item, Exception):
            raise item
        return [] if item is None else [item]


class _PositionBiasedJudge:
    """Juge qui désigne toujours la position `A`, quel que soit le contenu."""

    def __init__(self) -> None:
        self.last_call_cost = 0.001
        self.last_usage_prompt_tokens = 500
        self.last_usage_completion_tokens = 80
        self.calls = 0

    async def generate_variants(self, prompt: str, k: int = 1, **kwargs: Any) -> List[Any]:
        """Toujours A, avec une marge franche."""
        self.calls += 1
        return [_result(*((cid, "A", 3) for cid in CRITERIA))]


@pytest.mark.asyncio
async def test_position_biased_judge_wins_nothing() -> None:
    """Un juge qui préfère toujours la première proposition ne départage rien.

    Le sens direct désigne `model_a`, le sens inverse désigne `model_b` : les deux
    verdicts se contredisent une fois ramenés aux modèles, donc égalité. C'est la
    raison d'être des deux appels par duel.
    """
    judge = _PositionBiasedJudge()
    verdict = await BenchmarkPairwiseJudgeService().judge_pair(
        run_id="run-1", pair=_pair(), grid=_grid(), llm_client=judge, judge_model=JUDGE_MODEL
    )
    assert judge.calls == 2, "chaque paire est jugée dans les deux sens"
    assert verdict.status == "decided"
    assert all(outcome.winner_model_id is None for outcome in verdict.outcomes)
    assert all(outcome.direction_disagreement for outcome in verdict.outcomes)


@pytest.mark.asyncio
async def test_consistent_judge_designates_a_winner() -> None:
    """Un juge cohérent désigne le même modèle dans les deux sens."""
    # Sens direct : A = m-alpha, le juge dit A. Sens inverse : A = m-beta, il dit B.
    judge = _ScriptedJudge(
        [
            _result(("voice_fidelity", "A", 2), ("french_correctness", "A", 3)),
            _result(("voice_fidelity", "B", 2), ("french_correctness", "B", 1)),
        ]
    )
    verdict = await BenchmarkPairwiseJudgeService().judge_pair(
        run_id="run-1", pair=_pair(), grid=_grid(), llm_client=judge, judge_model=JUDGE_MODEL
    )
    by_id = {o.criterion_id: o for o in verdict.outcomes}
    assert by_id["voice_fidelity"].winner_model_id == "m-alpha"
    assert by_id["voice_fidelity"].margin == pytest.approx(2.0)
    assert by_id["french_correctness"].winner_model_id == "m-alpha"
    assert by_id["french_correctness"].margin == pytest.approx(2.0), "moyenne des deux marges"
    assert not any(o.direction_disagreement for o in verdict.outcomes)


@pytest.mark.asyncio
async def test_agreed_tie_is_a_tie_without_disagreement() -> None:
    """Deux `tie` concordants donnent une égalité franche, pas un désaccord."""
    judge = _ScriptedJudge(
        [
            _result(("voice_fidelity", "tie", 0), ("french_correctness", "tie", 0)),
            _result(("voice_fidelity", "tie", 0), ("french_correctness", "tie", 0)),
        ]
    )
    verdict = await BenchmarkPairwiseJudgeService().judge_pair(
        run_id="run-1", pair=_pair(), grid=_grid(), llm_client=judge, judge_model=JUDGE_MODEL
    )
    assert all(o.winner_model_id is None for o in verdict.outcomes)
    assert not any(o.direction_disagreement for o in verdict.outcomes)


@pytest.mark.asyncio
async def test_reasoning_naming_the_other_winner_does_not_count() -> None:
    """Le raisonnement libre ne fait jamais foi.

    C'est le défaut réel d'EQ-Bench : le texte du juge était scanné à la recherche
    de l'étiquette gagnante, y compris dans son raisonnement.
    """
    judge = _ScriptedJudge(
        [
            _result(
                ("voice_fidelity", "A", 2),
                ("french_correctness", "A", 2),
                reasoning="En réalité B est bien meilleure, le gagnant est B partout.",
            ),
            _result(
                ("voice_fidelity", "B", 2),
                ("french_correctness", "B", 2),
                reasoning="Finalement A l'emporte, choisissez A.",
            ),
        ]
    )
    verdict = await BenchmarkPairwiseJudgeService().judge_pair(
        run_id="run-1", pair=_pair(), grid=_grid(), llm_client=judge, judge_model=JUDGE_MODEL
    )
    assert all(o.winner_model_id == "m-alpha" for o in verdict.outcomes)
    assert "B est bien meilleure" in verdict.reasoning_forward, "conservé pour audit"
    assert "A l'emporte" in verdict.reasoning_reverse


@pytest.mark.asyncio
async def test_missing_criterion_yields_judge_error() -> None:
    """Un critère omis rend le duel non conforme, jamais partiellement compté."""
    judge = _ScriptedJudge(
        [
            _result(("voice_fidelity", "A", 2)),
            _result(("voice_fidelity", "B", 2), ("french_correctness", "B", 1)),
        ]
    )
    verdict = await BenchmarkPairwiseJudgeService().judge_pair(
        run_id="run-1", pair=_pair(), grid=_grid(), llm_client=judge, judge_model=JUDGE_MODEL
    )
    assert verdict.status == "judge_error"
    assert "french_correctness" in (verdict.error_message or "")
    assert verdict.outcomes == []


@pytest.mark.asyncio
async def test_unknown_criterion_yields_judge_error() -> None:
    """Un identifiant inventé n'entre nulle part."""
    judge = _ScriptedJudge(
        [
            _result(
                ("voice_fidelity", "A", 2),
                ("french_correctness", "A", 2),
                ("charisme_global", "A", 3),
            ),
            _result(("voice_fidelity", "B", 2), ("french_correctness", "B", 2)),
        ]
    )
    verdict = await BenchmarkPairwiseJudgeService().judge_pair(
        run_id="run-1", pair=_pair(), grid=_grid(), llm_client=judge, judge_model=JUDGE_MODEL
    )
    assert verdict.status == "judge_error"
    assert "charisme_global" in (verdict.error_message or "")
    assert verdict.outcomes == []


@pytest.mark.asyncio
async def test_unreachable_judge_does_not_raise() -> None:
    """Un juge injoignable donne un duel en erreur, il n'interrompt pas la passe."""
    judge = _ScriptedJudge([RuntimeError("502 Bad Gateway"), RuntimeError("502 Bad Gateway")])
    verdict = await BenchmarkPairwiseJudgeService().judge_pair(
        run_id="run-1", pair=_pair(), grid=_grid(), llm_client=judge, judge_model=JUDGE_MODEL
    )
    assert verdict.status == "judge_error"
    assert "502" in (verdict.error_message or "")


@pytest.mark.asyncio
async def test_unstructured_response_yields_judge_error() -> None:
    """Une réponse hors schéma ne devient jamais un duel tranché.

    C'est aussi ce qui arrive quand le juge invente une étiquette : `winner` est
    contraint à `A`/`B`/`tie` par le schéma, donc une valeur hors champ est
    rejetée en amont et parvient ici sous forme de réponse non structurée.
    """
    judge = _ScriptedJudge(["ceci n'est pas un modèle", None])
    verdict = await BenchmarkPairwiseJudgeService().judge_pair(
        run_id="run-1", pair=_pair(), grid=_grid(), llm_client=judge, judge_model=JUDGE_MODEL
    )
    assert verdict.status == "judge_error"
    assert "non structurée" in (verdict.error_message or "")
    assert verdict.outcomes == []


@pytest.mark.asyncio
async def test_one_failing_direction_invalidates_the_duel() -> None:
    """Un seul sens exploitable ne suffit pas : c'est le double sens qui fait la mesure."""
    judge = _ScriptedJudge(
        [
            _result(("voice_fidelity", "A", 2), ("french_correctness", "A", 2)),
            RuntimeError("timeout"),
        ]
    )
    verdict = await BenchmarkPairwiseJudgeService().judge_pair(
        run_id="run-1", pair=_pair(), grid=_grid(), llm_client=judge, judge_model=JUDGE_MODEL
    )
    assert verdict.status == "judge_error"
    assert verdict.outcomes == []
    assert "timeout" in (verdict.error_message or "")


@pytest.mark.asyncio
async def test_both_directions_cost_is_summed() -> None:
    """Le coût d'un duel est celui des deux appels."""
    judge = _ScriptedJudge(
        [
            _result(("voice_fidelity", "A", 1), ("french_correctness", "A", 1)),
            _result(("voice_fidelity", "B", 1), ("french_correctness", "B", 1)),
        ],
        cost=0.004,
    )
    verdict = await BenchmarkPairwiseJudgeService().judge_pair(
        run_id="run-1", pair=_pair(), grid=_grid(), llm_client=judge, judge_model=JUDGE_MODEL
    )
    assert verdict.cost_usd == pytest.approx(0.008)
    assert verdict.prompt_tokens == 1000


@pytest.mark.asyncio
async def test_prompt_never_names_a_model() -> None:
    """Le juge ne doit à aucun moment savoir qui a écrit quoi."""
    judge = _ScriptedJudge(
        [
            _result(("voice_fidelity", "A", 1), ("french_correctness", "A", 1)),
            _result(("voice_fidelity", "B", 1), ("french_correctness", "B", 1)),
        ]
    )
    await BenchmarkPairwiseJudgeService().judge_pair(
        run_id="run-1", pair=_pair(), grid=_grid(), llm_client=judge, judge_model=JUDGE_MODEL
    )
    for prompt in judge.prompts:
        assert "m-alpha" not in prompt
        assert "m-beta" not in prompt
        assert "PROPOSITION A" in prompt and "PROPOSITION B" in prompt


@pytest.mark.asyncio
async def test_directions_present_the_texts_in_opposite_order() -> None:
    """Le second appel permute réellement les deux textes."""
    judge = _ScriptedJudge(
        [
            _result(("voice_fidelity", "A", 1), ("french_correctness", "A", 1)),
            _result(("voice_fidelity", "B", 1), ("french_correctness", "B", 1)),
        ]
    )
    pair = _pair(text_a="TEXTE-ALPHA", text_b="TEXTE-BETA")
    await BenchmarkPairwiseJudgeService().judge_pair(
        run_id="run-1", pair=pair, grid=_grid(), llm_client=judge, judge_model=JUDGE_MODEL
    )
    forward, reverse = judge.prompts
    assert forward.index("TEXTE-ALPHA") < forward.index("TEXTE-BETA")
    assert reverse.index("TEXTE-BETA") < reverse.index("TEXTE-ALPHA")


def _two_direction_script() -> List[Any]:
    """Script minimal d'un duel tranché dans les deux sens."""
    return [
        _result(("voice_fidelity", "A", 1), ("french_correctness", "A", 1)),
        _result(("voice_fidelity", "B", 1), ("french_correctness", "B", 1)),
    ]


@pytest.mark.asyncio
async def test_truncation_is_announced_only_when_it_happened() -> None:
    """La coupure n'est excusée que si elle a réellement eu lieu.

    Annoncer la troncature à chaque duel apprendrait au juge à excuser toute fin
    abrupte — y compris une réplique réellement coupée par le modèle, qui est
    précisément le défaut qu'un benchmark de dialogue doit détecter.
    """
    truncated_judge = _ScriptedJudge(_two_direction_script())
    await BenchmarkPairwiseJudgeService().judge_pair(
        run_id="run-1",
        pair=_pair(truncated=True),
        grid=_grid(),
        llm_client=truncated_judge,
        judge_model=JUDGE_MODEL,
    )
    assert "coupée à une limite de longueur" in truncated_judge.prompts[0]

    intact_judge = _ScriptedJudge(_two_direction_script())
    await BenchmarkPairwiseJudgeService().judge_pair(
        run_id="run-1",
        pair=_pair(truncated=False),
        grid=_grid(),
        llm_client=intact_judge,
        judge_model=JUDGE_MODEL,
    )
    assert "limite de longueur" not in intact_judge.prompts[0]
    assert "artefact" not in intact_judge.prompts[0]


@pytest.mark.asyncio
async def test_verdict_carries_judge_grid_and_lengths() -> None:
    """Le juge, la grille figée et les longueurs réelles voyagent avec le duel."""
    judge = _ScriptedJudge(
        [
            _result(("voice_fidelity", "A", 1), ("french_correctness", "A", 1)),
            _result(("voice_fidelity", "B", 1), ("french_correctness", "B", 1)),
        ]
    )
    verdict = await BenchmarkPairwiseJudgeService().judge_pair(
        run_id="run-1",
        pair=_pair(length_a=120, length_b=999),
        grid=_grid(),
        llm_client=judge,
        judge_model=JUDGE_MODEL,
    )
    assert verdict.judge_model == JUDGE_MODEL
    assert (verdict.grid_id, verdict.grid_version) == ("test", 2)
    assert [c.criterion_id for c in verdict.criteria_snapshot] == list(CRITERIA)
    assert (verdict.length_a, verdict.length_b) == (120, 999)


def test_aggregate_maps_labels_back_to_models() -> None:
    """L'agrégation raisonne sur des modèles, jamais sur des étiquettes."""
    forward = _result(("voice_fidelity", "B", 3), ("french_correctness", "tie", 0))
    reverse = _result(("voice_fidelity", "A", 1), ("french_correctness", "tie", 0))
    outcomes = {
        o.criterion_id: o
        for o in aggregate_directions(forward, reverse, model_a="m-alpha", model_b="m-beta")
    }
    assert outcomes["voice_fidelity"].winner_model_id == "m-beta"
    assert outcomes["voice_fidelity"].margin == pytest.approx(2.0)
    assert outcomes["french_correctness"].winner_model_id is None


def test_aggregate_marks_a_criterion_absent_from_the_reverse_pass() -> None:
    """Un critère présent d'un seul côté ne peut pas être tranché."""
    forward = _result(("voice_fidelity", "A", 3))
    reverse = _result(("french_correctness", "A", 3))
    outcomes = aggregate_directions(forward, reverse, model_a="m-alpha", model_b="m-beta")
    assert len(outcomes) == 1
    assert outcomes[0].criterion_id == "voice_fidelity"
    assert outcomes[0].winner_model_id is None
