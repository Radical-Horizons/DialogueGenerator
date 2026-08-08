"""Tests de l'agrégation et de l'aperçu du mode Benchmark.

Le risque propre à cet étage est silencieux : une agrégation fausse produit un
tableau parfaitement lisible qui ne mesure pas ce qu'il annonce. Chaque test
ci-dessous fige une règle du protocole (`.claude/rules/benchmark.md`) plutôt
qu'un détail d'implémentation.
"""

from __future__ import annotations

from typing import Dict, List, Optional

import pytest

from api.schemas.benchmark import (
    BenchmarkCostEstimate,
    BenchmarkGateFailure,
    BenchmarkGenerationRecord,
    BenchmarkModelDiagnostic,
    BenchmarkRun,
    BenchmarkRunConfig,
    BenchmarkRunIdentity,
    BenchmarkSuite,
)
from api.schemas.benchmark_judging import (
    CriterionDefinition,
    PairwiseCriterionOutcome,
    PairwiseVerdict,
    RubricVerdict,
)
from api.schemas.benchmark_report import BenchmarkRunPreviewRequest
from services.benchmark_report_service import BenchmarkReportService
from services.benchmark_run_service import BenchmarkRunConflictError

RUN_ID = "20260807T120000-abcd1234"
MODEL_A = "gpt-5.6-luna"
MODEL_B = "gpt-5.6-terra"
JUDGE_A = "gpt-5.6-sol"
JUDGE_B = "gpt-5.6-terra"

VOICE = CriterionDefinition(
    criterion_id="voice",
    label="Justesse de la voix",
    description="…",
    direction="higher_is_better",
    weight=3.0,
)
CLICHE = CriterionDefinition(
    criterion_id="cliche",
    label="Clichés",
    description="…",
    direction="lower_is_better",
    weight=1.0,
)


def _run(models: Optional[List[str]] = None, spent: float = 0.5) -> BenchmarkRun:
    """Run persisté minimal."""
    models = models or [MODEL_A, MODEL_B]
    config = BenchmarkRunConfig(
        suite_id="alteir-smoke", models=models, repetitions=1, budget_cap_usd=1.0
    )
    return BenchmarkRun(
        run_id=RUN_ID,
        config=config,
        identity=BenchmarkRunIdentity(
            suite_id="alteir-smoke",
            suite_version=1,
            suite_fingerprint="abc",
            models=models,
            repetitions=1,
            narration_mode="sans",
        ),
        status="completed",
        spent_usd=spent,
    )


def _generation(
    model_id: str, status: str, *, cost: float = 0.1, gate: Optional[str] = None
) -> BenchmarkGenerationRecord:
    """Génération persistée minimale."""
    return BenchmarkGenerationRecord(
        run_id=RUN_ID,
        case_id="voknir-premiere-rencontre",
        model_id=model_id,
        repetition=0,
        status=status,
        cost_usd=cost,
        gate_failures=[BenchmarkGateFailure(gate=gate, message="…")] if gate else [],
    )


def _verdict(
    model_id: str,
    scores: Dict[str, int],
    *,
    judge: str = JUDGE_A,
    status: str = "scored",
    snapshot: Optional[List[CriterionDefinition]] = None,
) -> RubricVerdict:
    """Verdict rubrique minimal."""
    return RubricVerdict(
        run_id=RUN_ID,
        case_id="voknir-premiere-rencontre",
        model_id=model_id,
        repetition=0,
        judge_model=judge,
        grid_id="grille-dialogue-fr",
        grid_version=1,
        status=status,
        scores=scores,
        criteria_snapshot=snapshot if snapshot is not None else [VOICE, CLICHE],
    )


def _duel(
    outcomes: List[PairwiseCriterionOutcome],
    *,
    judge: str = JUDGE_A,
    status: str = "decided",
) -> PairwiseVerdict:
    """Duel minimal entre MODEL_A et MODEL_B."""
    return PairwiseVerdict(
        run_id=RUN_ID,
        case_id="voknir-premiere-rencontre",
        repetition=0,
        model_a=MODEL_A,
        model_b=MODEL_B,
        judge_model=judge,
        grid_id="grille-dialogue-fr",
        grid_version=1,
        status=status,
        outcomes=outcomes,
    )


class _FakeRunService:
    """Moteur de run réduit à ce que le rapport consomme."""

    def __init__(
        self,
        run: BenchmarkRun,
        generations: List[BenchmarkGenerationRecord],
        *,
        estimate: Optional[BenchmarkCostEstimate] = None,
        diagnostics: Optional[List[BenchmarkModelDiagnostic]] = None,
        refusal: Optional[str] = None,
    ) -> None:
        self._run = run
        self._generations = generations
        self._estimate = estimate or BenchmarkCostEstimate(
            generations=6, estimated_min_usd=0.1, estimated_max_usd=0.4
        )
        self._diagnostics = diagnostics or []
        self._refusal = refusal
        self.started = 0

    def get_run(self, run_id: str) -> BenchmarkRun:
        return self._run

    def list_generations(self, run_id: str) -> List[BenchmarkGenerationRecord]:
        return self._generations

    def estimate_cost(self, suite, config) -> BenchmarkCostEstimate:
        return self._estimate

    def diagnose_models(self, models) -> List[BenchmarkModelDiagnostic]:
        return self._diagnostics or [
            BenchmarkModelDiagnostic(model_id=model_id, usable=True) for model_id in models
        ]

    def assert_measurable(self, estimate, diagnostics, config) -> None:
        if self._refusal:
            raise BenchmarkRunConflictError(self._refusal)

    async def start_run(self, config):  # pragma: no cover — ne doit jamais être appelé
        self.started += 1
        raise AssertionError("L'aperçu ne doit lancer aucun run")


class _FakePass:
    """Passe de jugement réduite à la lecture des verdicts."""

    def __init__(self, verdicts: Optional[List] = None, error: Optional[Exception] = None) -> None:
        self._verdicts = verdicts or []
        self._error = error

    def list_verdicts(self, run_id: str) -> List:
        if self._error:
            raise self._error
        return self._verdicts


class _FakeSuiteStore:
    """Magasin de suites réduit à la résolution d'une suite."""

    def __init__(self, suite: BenchmarkSuite) -> None:
        self._suite = suite

    def get_suite(self, suite_id: str, version: Optional[int] = None) -> BenchmarkSuite:
        return self._suite


def _service(
    *,
    run: Optional[BenchmarkRun] = None,
    generations: Optional[List[BenchmarkGenerationRecord]] = None,
    rubric: Optional[List[RubricVerdict]] = None,
    pairwise: Optional[List[PairwiseVerdict]] = None,
    rubric_error: Optional[Exception] = None,
    estimate: Optional[BenchmarkCostEstimate] = None,
    diagnostics: Optional[List[BenchmarkModelDiagnostic]] = None,
    refusal: Optional[str] = None,
) -> BenchmarkReportService:
    """Assemble le service sur des collaborateurs factices."""
    run_service = _FakeRunService(
        run or _run(),
        generations or [],
        estimate=estimate,
        diagnostics=diagnostics,
        refusal=refusal,
    )
    suite = BenchmarkSuite.model_validate(
        {
            "suite_id": "alteir-smoke",
            "version": 1,
            "cases": [
                {
                    "case_id": "voknir-premiere-rencontre",
                    "title": "Première rencontre",
                    "request": {
                        "llm_model_identifier": MODEL_A,
                        "user_instructions": "Écris le fragment d'ouverture.",
                        "context_selections": {"characters_full": ["Uresaïr"]},
                    },
                }
            ],
        }
    )
    return BenchmarkReportService(
        run_service=run_service,  # type: ignore[arg-type]
        judge_pass_service=_FakePass(rubric, rubric_error),  # type: ignore[arg-type]
        pairwise_pass_service=_FakePass(pairwise),  # type: ignore[arg-type]
        suite_store=_FakeSuiteStore(suite),  # type: ignore[arg-type]
    )


# ----------------------------------------------------------------------
# Validité
# ----------------------------------------------------------------------


def test_invalid_generations_feed_the_validity_rate_not_a_zero_score() -> None:
    """Une génération recalée compte dans la validité et nulle part ailleurs."""
    service = _service(
        generations=[
            _generation(MODEL_A, "valid"),
            _generation(MODEL_A, "invalid", gate="connectivity"),
            _generation(MODEL_B, "valid"),
            _generation(MODEL_B, "valid"),
        ]
    )
    report = service.build_report(RUN_ID)
    by_model = {entry.model_id: entry for entry in report.models}

    assert by_model[MODEL_A].validity_rate == 0.5
    assert by_model[MODEL_A].invalid == 1
    assert by_model[MODEL_A].gate_failures == {"connectivity": 1}
    assert by_model[MODEL_B].validity_rate == 1.0
    assert report.judges == []


def test_model_without_any_generation_still_appears() -> None:
    """Un modèle qui n'a rien produit est un résultat, pas une ligne à masquer."""
    service = _service(generations=[_generation(MODEL_A, "valid")])
    report = service.build_report(RUN_ID)
    assert {entry.model_id for entry in report.models} == {MODEL_A, MODEL_B}
    absent = next(entry for entry in report.models if entry.model_id == MODEL_B)
    assert absent.generations == 0
    assert absent.validity_rate == 0.0


def test_every_generation_rejected_yields_no_score_at_all() -> None:
    """Tout recalé : validité nulle, et surtout aucune moyenne inventée."""
    service = _service(
        generations=[
            _generation(MODEL_A, "invalid", gate="length"),
            _generation(MODEL_B, "invalid", gate="language"),
        ],
        rubric=[],
    )
    report = service.build_report(RUN_ID)
    assert all(entry.validity_rate == 0.0 for entry in report.models)
    assert report.judges == []


def test_run_never_judged_reports_validity_without_failing() -> None:
    """Un run jamais jugé n'a pas de fichier de verdicts : ce n'est pas une erreur."""
    service = _service(
        generations=[_generation(MODEL_A, "valid")],
        rubric_error=FileNotFoundError("verdicts absents"),
    )
    report = service.build_report(RUN_ID)
    assert report.judges == []
    assert report.models


# ----------------------------------------------------------------------
# Notes
# ----------------------------------------------------------------------


def test_two_judges_are_never_merged() -> None:
    """Changer de juge change les résultats : deux blocs, jamais une moyenne."""
    service = _service(
        generations=[_generation(MODEL_A, "valid")],
        rubric=[
            _verdict(MODEL_A, {"voice": 8, "cliche": 2}, judge=JUDGE_A),
            _verdict(MODEL_A, {"voice": 4, "cliche": 6}, judge=JUDGE_B),
        ],
    )
    report = service.build_report(RUN_ID)

    assert [block.judge_model for block in report.judges] == sorted([JUDGE_A, JUDGE_B])
    means = {
        block.judge_model: block.models[0].weighted_mean for block in report.judges
    }
    assert means[JUDGE_A] != means[JUDGE_B]


def test_lower_is_better_criterion_is_normalised_before_weighting() -> None:
    """Sans normalisation, la moyenne additionnerait deux sens opposés.

    `voice` 8/10 (poids 3) et `cliche` 2/10 (poids 1, sens inversé) valent
    respectivement 8 et 8 une fois orientés : la moyenne pondérée vaut 8.
    """
    service = _service(rubric=[_verdict(MODEL_A, {"voice": 8, "cliche": 2})])
    summary = service.build_report(RUN_ID).judges[0].models[0]

    assert summary.weighted_mean == 8.0
    detail = {item.criterion_id: item for item in summary.criteria}
    # La moyenne par critère reste dans le sens d'origine : c'est ce qu'on lit.
    assert detail["cliche"].mean_score == 2.0
    assert detail["cliche"].direction == "lower_is_better"


def test_weights_and_labels_come_from_the_frozen_snapshot() -> None:
    """La grille a pu changer depuis : rétro-appliquer ses poids réécrirait le passé."""
    older = CriterionDefinition(
        criterion_id="voice",
        label="Ancien libellé",
        description="…",
        direction="higher_is_better",
        weight=5.0,
    )
    service = _service(rubric=[_verdict(MODEL_A, {"voice": 6}, snapshot=[older])])
    criterion = service.build_report(RUN_ID).judges[0].models[0].criteria[0]

    assert criterion.label == "Ancien libellé"
    assert criterion.weight == 5.0


def test_score_outside_the_snapshot_is_ignored_not_guessed() -> None:
    """Un critère non apparié par identifiant stable ne peut pas entrer dans la moyenne."""
    service = _service(
        rubric=[_verdict(MODEL_A, {"voice": 6, "inconnu": 10}, snapshot=[VOICE])]
    )
    summary = service.build_report(RUN_ID).judges[0].models[0]
    assert [item.criterion_id for item in summary.criteria] == ["voice"]
    assert summary.weighted_mean == 6.0


def test_judge_error_verdict_is_counted_but_never_scored() -> None:
    """Un verdict perdu se compte ; il ne vaut pas zéro."""
    service = _service(
        rubric=[
            _verdict(MODEL_A, {}, status="judge_error"),
            _verdict(MODEL_A, {"voice": 7}),
        ]
    )
    summary = service.build_report(RUN_ID).judges[0].models[0]
    assert summary.judge_errors == 1
    assert summary.scored_count == 1
    assert summary.weighted_mean == 7.0


def test_model_with_only_judge_errors_has_no_mean() -> None:
    """L'absence de note n'est pas une note de zéro."""
    service = _service(rubric=[_verdict(MODEL_A, {}, status="judge_error")])
    summary = service.build_report(RUN_ID).judges[0].models[0]
    assert summary.weighted_mean is None


# ----------------------------------------------------------------------
# Duels
# ----------------------------------------------------------------------


def test_pairwise_wins_losses_and_ties_are_counted_per_model() -> None:
    """Chaque critère tranché donne une victoire d'un côté et une défaite de l'autre."""
    service = _service(
        pairwise=[
            _duel(
                [
                    PairwiseCriterionOutcome(criterion_id="voice", winner_model_id=MODEL_A),
                    PairwiseCriterionOutcome(criterion_id="cliche", winner_model_id=MODEL_B),
                    PairwiseCriterionOutcome(criterion_id="pace", winner_model_id=None),
                ]
            )
        ]
    )
    block = service.build_report(RUN_ID).judges[0]
    bilan = {entry.model_id: entry for entry in block.pairwise}

    assert (bilan[MODEL_A].wins, bilan[MODEL_A].losses, bilan[MODEL_A].ties) == (1, 1, 1)
    assert (bilan[MODEL_B].wins, bilan[MODEL_B].losses, bilan[MODEL_B].ties) == (1, 1, 1)
    assert bilan[MODEL_A].win_rate == pytest.approx(1 / 3, abs=1e-4)
    assert block.pairwise_decided == 1


def test_position_disagreement_is_a_tie_and_stays_visible() -> None:
    """Un juge sensible à la position est une information, pas un bruit à moyenner."""
    service = _service(
        pairwise=[
            _duel(
                [
                    PairwiseCriterionOutcome(
                        criterion_id="voice",
                        winner_model_id=MODEL_A,
                        direction_disagreement=True,
                    ),
                    PairwiseCriterionOutcome(criterion_id="cliche", winner_model_id=MODEL_A),
                ]
            )
        ]
    )
    block = service.build_report(RUN_ID).judges[0]
    bilan = {entry.model_id: entry for entry in block.pairwise}

    assert bilan[MODEL_A].wins == 1
    assert bilan[MODEL_A].ties == 1
    assert block.position_disagreement_rate == 0.5


def test_failed_duel_is_counted_apart_from_decided_ones() -> None:
    """Un duel perdu par le juge ne compte ni victoire ni défaite."""
    service = _service(pairwise=[_duel([], status="judge_error")])
    block = service.build_report(RUN_ID).judges[0]
    assert block.pairwise_decided == 0
    assert block.pairwise_judge_errors == 1
    assert block.pairwise == []


def test_narration_mode_travels_with_the_report() -> None:
    """Deux runs de modes différents ne se comparent pas : le mode doit être lisible."""
    report = _service().build_report(RUN_ID)
    assert report.narration_mode == "sans"


# ----------------------------------------------------------------------
# Aperçu
# ----------------------------------------------------------------------


def test_preview_estimates_without_starting_anything() -> None:
    """L'aperçu chiffre ; il ne crée aucun run et ne dépense rien."""
    service = _service()
    preview = service.preview(
        BenchmarkRunPreviewRequest(suite_id="alteir-smoke", models=[MODEL_A, MODEL_B])
    )
    assert preview.launchable is True
    assert preview.blocking_reasons == []
    assert preview.estimate.estimated_max_usd == 0.4
    assert service._run_service.started == 0  # type: ignore[attr-defined]


def test_preview_reports_the_launch_refusal_instead_of_raising() -> None:
    """Le motif de refus doit s'afficher avant le clic, pas surgir après."""
    service = _service(refusal="Tarif inconnu pour gpt-5.6-luna")
    preview = service.preview(
        BenchmarkRunPreviewRequest(suite_id="alteir-smoke", models=[MODEL_A])
    )
    assert preview.launchable is False
    assert "Tarif inconnu" in preview.blocking_reasons[0]


def test_preview_surfaces_unusable_models() -> None:
    """Un modèle inutilisable se voit avant le lancement, pas dans un rapport vide."""
    service = _service(
        diagnostics=[
            BenchmarkModelDiagnostic(
                model_id=MODEL_A, usable=False, reason="Clé API absente"
            )
        ]
    )
    preview = service.preview(
        BenchmarkRunPreviewRequest(suite_id="alteir-smoke", models=[MODEL_A])
    )
    assert preview.model_diagnostics[0].usable is False
    assert preview.model_diagnostics[0].reason == "Clé API absente"


def test_preview_request_rejects_a_duplicated_model() -> None:
    """Le même garde-fou qu'au lancement : un doublon fausserait le compte."""
    with pytest.raises(ValueError):
        BenchmarkRunPreviewRequest(suite_id="alteir-smoke", models=[MODEL_A, MODEL_A])
