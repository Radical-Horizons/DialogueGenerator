"""Tests de la passe de comparaison par paires."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any, Dict, List, Optional

import pytest

from api.schemas.benchmark import BenchmarkModelDiagnostic, BenchmarkRunConfig, BenchmarkSuite
from api.schemas.benchmark_judging import (
    CriteriaGrid,
    CriterionDefinition,
    PairwisePassConfig,
)
from models.benchmark_judge_output import (
    BenchmarkPairwiseCriterionVerdict,
    BenchmarkPairwiseJudgeResult,
)
from services.benchmark_criteria_store import BenchmarkCriteriaStore
from services.benchmark_gate_service import BenchmarkGateService
from services.benchmark_judge_pass_service import (
    BenchmarkPairwisePassService,
    JudgePassConflictError,
)
from services.benchmark_judge_service import BenchmarkPairwiseJudgeService
from services.benchmark_run_service import BenchmarkRunService
from services.benchmark_suite_store import BenchmarkSuiteStore

MODEL_A = "gpt-5.6-luna"
MODEL_B = "gpt-5.6-terra"
MODEL_C = "gpt-5.6-sol"
JUDGE_A = "gpt-5.6-sol"
JUDGE_B = "gpt-5.6-terra"
CRITERIA = ("voice_fidelity", "french_correctness")

FRENCH_LINE = (
    "Je n'ai pas confiance en toi, marchand : tu vends des promesses et tu gardes "
    "les pièces. Dis-moi ce que tu veux vraiment."
)


def _unity_document() -> str:
    """Génération Unity valide et française."""
    return json.dumps(
        {
            "schemaVersion": "1.1.0",
            "nodes": [
                {
                    "id": "node-1",
                    "displayName": "Marchandage",
                    "speaker": "Uresaïr",
                    "line": FRENCH_LINE,
                    "choices": [
                        {
                            "choiceId": "choice_node-1_0",
                            "text": "Refuser net et tourner les talons",
                            "targetNode": "END",
                        }
                    ],
                }
            ],
        },
        ensure_ascii=False,
    )


class _Event:
    """Événement de génération."""

    def __init__(self, type: str, data: Dict[str, Any]) -> None:
        self.type = type
        self.data = data


class _FakeConfigService:
    """Configuration LLM minimale."""

    def get_llm_config(self) -> Dict[str, Any]:
        return {}

    def get_available_llm_models(self) -> List[Dict[str, Any]]:
        return [{"api_identifier": MODEL_A, "client_type": "openai"}]

    def get_llm_fallback_chain(self) -> List[str]:
        return []


class _CountingOrchestrator:
    """Orchestrateur qui compte ses appels — prouve l'absence de régénération."""

    calls: List[str] = []

    def __init__(
        self,
        *,
        invalid_for: Optional[str] = None,
        invalid_slots: Optional[set] = None,
    ) -> None:
        self.config_service = _FakeConfigService()
        self._invalid_for = invalid_for
        self._invalid_slots = invalid_slots or set()

    async def generate_with_events(self, request: Any, check_cancelled: Any):
        """Émet une génération valide, ou non française selon le modèle ou le créneau."""
        _CountingOrchestrator.calls.append(request.llm_model_identifier)
        document = _unity_document()
        # Le moteur ajoute la directive de mode de narration à la consigne du cas :
        # le créneau se reconnaît au préfixe, pas à l'égalité stricte.
        matched_slot = any(
            model_id == request.llm_model_identifier
            and request.user_instructions.startswith(instructions)
            for model_id, instructions in self._invalid_slots
        )
        if (
            self._invalid_for and request.llm_model_identifier == self._invalid_for
        ) or matched_slot:
            document = json.dumps(
                {
                    "schemaVersion": "1.1.0",
                    "nodes": [
                        {
                            "id": "node-1",
                            "line": (
                                "I do not trust you, merchant: you sell promises and keep "
                                "the coins. Tell me what you really want right now."
                            ),
                            "choices": [{"choiceId": "c0", "text": "Walk away in silence"}],
                        }
                    ],
                },
                ensure_ascii=False,
            )
        yield _Event("metadata", {"cost_usd": 0.001})
        yield _Event(
            "complete",
            {"result": {"json_content": document, "raw_prompt": "p", "prompt_hash": "h"}},
        )


class _FakePricingService:
    """Tarification fictive."""

    def __init__(self, *, priced: bool = True, unit_cost: float = 0.001) -> None:
        self._priced = priced
        self._unit_cost = unit_cost

    def get_model_pricing(self, model_name: str) -> Optional[Dict[str, float]]:
        return {"input_price_per_1M": 1.0} if self._priced else None

    def calculate_cost(self, model_name: str, prompt_tokens: int, completion_tokens: int) -> float:
        return self._unit_cost


class _PositionBiasedJudge:
    """Juge qui désigne toujours la position ``A``, sans lire le contenu.

    Le double le plus utilisé de ce fichier : il produit donc des égalités par
    construction, puisque le double sens neutralise exactement ce biais. Pour
    exercer le chemin « un modèle gagne », voir `_ContentJudge` dans
    `test_content_discriminating_judge_designates_a_real_winner`.
    """

    def __init__(self, *, cost: float = 0.001, omit: Optional[str] = None) -> None:
        self.last_call_cost = cost
        self.last_usage_prompt_tokens = 100
        self.last_usage_completion_tokens = 30
        self._omit = omit
        self.calls = 0

    async def generate_variants(self, prompt: str, k: int = 1, **kwargs: Any) -> List[Any]:
        """Désigne systématiquement la position A."""
        self.calls += 1
        return [
            BenchmarkPairwiseJudgeResult(
                criteria=[
                    BenchmarkPairwiseCriterionVerdict(
                        criterion_id=cid, winner="A", margin=2, comment="ok"
                    )
                    for cid in CRITERIA
                    if cid != self._omit
                ],
                reasoning="audit",
            )
        ]


def _grid() -> CriteriaGrid:
    """Grille de test."""
    return CriteriaGrid(
        grid_id="test",
        criteria=[
            CriterionDefinition(criterion_id=cid, label=cid, description=f"Consigne {cid}.")
            for cid in CRITERIA
        ],
    )


class _Harness:
    """Moteur de run + passe de comparaison, isolés dans `tmp_path`."""

    def __init__(
        self,
        tmp_path: Path,
        *,
        judge: Optional[Any] = None,
        pricing: Optional[_FakePricingService] = None,
        invalid_for: Optional[str] = None,
        invalid_slots: Optional[set] = None,
    ) -> None:
        _CountingOrchestrator.calls = []
        self.judge = judge or _PositionBiasedJudge()
        self.run_service = BenchmarkRunService(
            suite_store=BenchmarkSuiteStore(suites_dir=tmp_path / "suites"),
            gate_service=BenchmarkGateService(flag_validation_service=None),
            pricing_service=_FakePricingService(),
            config_service=_FakeConfigService(),
            orchestrator_factory=lambda rid: _CountingOrchestrator(
                invalid_for=invalid_for, invalid_slots=invalid_slots
            ),
            runs_dir=tmp_path / "runs",
        )
        self.run_service.diagnose_models = lambda models: [  # type: ignore[method-assign]
            BenchmarkModelDiagnostic(model_id=m, usable=True) for m in models
        ]
        self.criteria_store = BenchmarkCriteriaStore(criteria_dir=tmp_path / "criteria")
        self.criteria_store.save_grid(_grid(), bump_version=False)
        self.pass_service = BenchmarkPairwisePassService(
            run_service=self.run_service,
            criteria_store=self.criteria_store,
            judge_service=BenchmarkPairwiseJudgeService(),
            pricing_service=pricing or _FakePricingService(),
            llm_client_factory=lambda model_id: self.judge,
        )

    async def produce_run(self, *, case_ids: List[str], models: List[str]) -> str:
        """Exécute un run de génération et retourne son identifiant."""
        suite = self.run_service._suite_store.save_suite(
            BenchmarkSuite.model_validate(
                {
                    "suite_id": "smoke",
                    "cases": [
                        {
                            "case_id": cid,
                            "request": {
                                "llm_model_identifier": MODEL_A,
                                # L'instruction porte le cas : c'est la seule voie par
                                # laquelle le double d'orchestrateur peut savoir quel
                                # créneau il sert, la requête ne portant pas le case_id.
                                "user_instructions": f"Cas {cid}",
                                "context_selections": {"characters_full": ["Uresaïr"]},
                            },
                        }
                        for cid in case_ids
                    ],
                }
            )
        )
        run, _ = await self.run_service.start_run(
            BenchmarkRunConfig(
                suite_id=suite.suite_id, models=models, repetitions=1, budget_cap_usd=10.0
            )
        )
        task = self.run_service.background_task
        assert task is not None
        await task
        return run.run_id

    async def drain(self) -> None:
        """Attend la fin de la passe de comparaison."""
        task = self.pass_service.background_task
        assert task is not None
        await task


def _config(**overrides: Any) -> PairwisePassConfig:
    """Config de passe par défaut."""
    payload: Dict[str, Any] = {
        "grid_id": "test",
        "judge_model": JUDGE_A,
        "budget_cap_usd": 10.0,
    }
    payload.update(overrides)
    return PairwisePassConfig(**payload)


@pytest.mark.asyncio
async def test_pass_produces_one_duel_per_pair_without_regenerating(tmp_path: Path) -> None:
    """3 modèles × 2 cas donnent 6 duels, et aucune génération n'est refaite."""
    harness = _Harness(tmp_path)
    run_id = await harness.produce_run(
        case_ids=["cas-0", "cas-1"], models=[MODEL_A, MODEL_B, MODEL_C]
    )
    calls_after_generation = len(_CountingOrchestrator.calls)
    assert calls_after_generation == 6

    await harness.pass_service.start_pass(run_id, _config())
    await harness.drain()

    verdicts = harness.pass_service.list_verdicts(run_id)
    assert len(verdicts) == 6, "C(3,2) paires × 2 cas"
    assert harness.judge.calls == 12, "deux appels par duel"
    assert len(_CountingOrchestrator.calls) == calls_after_generation

    state = harness.pass_service.get_pass_state(run_id, JUDGE_A)
    assert state.status == "completed"
    assert state.duels_completed == 6


@pytest.mark.asyncio
async def test_position_biased_judge_produces_only_ties(tmp_path: Path) -> None:
    """Le double sens neutralise un juge qui préfère toujours la première place."""
    harness = _Harness(tmp_path)
    run_id = await harness.produce_run(case_ids=["cas-0"], models=[MODEL_A, MODEL_B])
    await harness.pass_service.start_pass(run_id, _config())
    await harness.drain()

    verdict = harness.pass_service.list_verdicts(run_id)[0]
    assert verdict.status == "decided"
    assert all(o.winner_model_id is None for o in verdict.outcomes)
    assert all(o.direction_disagreement for o in verdict.outcomes)


@pytest.mark.asyncio
async def test_invalid_generations_are_never_paired(tmp_path: Path) -> None:
    """Une génération écartée par les portes ne peut pas entrer dans un duel."""
    harness = _Harness(tmp_path, invalid_for=MODEL_B)
    run_id = await harness.produce_run(
        case_ids=["cas-0"], models=[MODEL_A, MODEL_B, MODEL_C]
    )
    await harness.pass_service.start_pass(run_id, _config())
    await harness.drain()

    verdicts = harness.pass_service.list_verdicts(run_id)
    assert len(verdicts) == 1, "seuls A et C sont appariables"
    assert MODEL_B not in {verdicts[0].model_a, verdicts[0].model_b}


@pytest.mark.asyncio
async def test_run_with_a_single_pairable_model_is_refused(tmp_path: Path) -> None:
    """Sans deux modèles valides sur un même cas, aucune comparaison n'a de sens."""
    harness = _Harness(tmp_path)
    run_id = await harness.produce_run(case_ids=["cas-0"], models=[MODEL_A])
    with pytest.raises(JudgePassConflictError, match="aucune paire comparable"):
        await harness.pass_service.start_pass(run_id, _config())
    assert harness.judge.calls == 0


@pytest.mark.asyncio
async def test_unpairable_slots_are_counted_in_the_pass_state(tmp_path: Path) -> None:
    """Un cas non appariable est compté, pas passé sous silence.

    Sans ce compte, un run largement invalide livrerait un classement fondé sur un
    seul duel sans que rien ne signale la couverture réelle.
    """
    harness = _Harness(tmp_path, invalid_slots={(MODEL_B, "Cas cas-1")})
    run_id = await harness.produce_run(case_ids=["cas-0", "cas-1"], models=[MODEL_A, MODEL_B])
    await harness.pass_service.start_pass(run_id, _config())
    await harness.drain()

    state = harness.pass_service.get_pass_state(run_id, JUDGE_A)
    assert state.duels_total == 1, "seul cas-0 est appariable"
    assert state.unpairable_slots == 1, "cas-1 doit être compté comme non appariable"
    assert len(harness.pass_service.list_verdicts(run_id)) == 1


@pytest.mark.asyncio
async def test_content_discriminating_judge_designates_a_real_winner(tmp_path: Path) -> None:
    """Bout en bout : un juge qui lit le contenu fait émerger un gagnant.

    Les autres tests de passe emploient un juge biaisé en position, qui produit
    des égalités par construction : sans ce test, le chemin « un modèle gagne »
    ne serait jamais exercé à travers la passe complète.
    """

    class _ContentJudge:
        """Préfère toujours la proposition qui contient le marqueur ``ALPHA``."""

        def __init__(self) -> None:
            self.last_call_cost = 0.001
            self.last_usage_prompt_tokens = 100
            self.last_usage_completion_tokens = 30
            self.calls = 0

        async def generate_variants(self, prompt: str, k: int = 1, **kwargs: Any) -> List[Any]:
            """Désigne la position où figure le marqueur, quel que soit l'ordre."""
            self.calls += 1
            body_a = prompt.split("PROPOSITION A")[1].split("PROPOSITION B")[0]
            winner = "A" if "ALPHA" in body_a else "B"
            return [
                BenchmarkPairwiseJudgeResult(
                    criteria=[
                        BenchmarkPairwiseCriterionVerdict(
                            criterion_id=cid, winner=winner, margin=2, comment=""
                        )
                        for cid in CRITERIA
                    ],
                    reasoning="audit",
                )
            ]

    class _MarkedOrchestrator(_CountingOrchestrator):
        """Marque la génération de MODEL_A pour la rendre reconnaissable."""

        async def generate_with_events(self, request: Any, check_cancelled: Any):
            _CountingOrchestrator.calls.append(request.llm_model_identifier)
            marker = "ALPHA" if request.llm_model_identifier == MODEL_A else "BETA"
            document = json.dumps(
                {
                    "schemaVersion": "1.1.0",
                    "nodes": [
                        {
                            "id": "node-1",
                            "displayName": "Marchandage",
                            "speaker": "Uresaïr",
                            "line": f"{FRENCH_LINE} Marqueur {marker}.",
                            "choices": [
                                {
                                    "choiceId": "choice_node-1_0",
                                    "text": "Refuser net et tourner les talons",
                                    "targetNode": "END",
                                }
                            ],
                        }
                    ],
                },
                ensure_ascii=False,
            )
            yield _Event("metadata", {"cost_usd": 0.001})
            yield _Event(
                "complete",
                {"result": {"json_content": document, "raw_prompt": "p", "prompt_hash": "h"}},
            )

    harness = _Harness(tmp_path, judge=_ContentJudge())
    harness.run_service._orchestrator_factory = lambda rid: _MarkedOrchestrator()
    run_id = await harness.produce_run(case_ids=["cas-0"], models=[MODEL_A, MODEL_B])

    await harness.pass_service.start_pass(run_id, _config())
    await harness.drain()

    verdict = harness.pass_service.list_verdicts(run_id)[0]
    assert verdict.status == "decided"
    assert all(o.winner_model_id == MODEL_A for o in verdict.outcomes), (
        "le modèle marqué doit gagner, quelle que soit sa position"
    )
    assert not any(o.direction_disagreement for o in verdict.outcomes)
    assert all(o.margin == pytest.approx(2.0) for o in verdict.outcomes)


@pytest.mark.asyncio
async def test_two_judges_coexist_without_mixing(tmp_path: Path) -> None:
    """Rejouer la comparaison avec un autre juge n'écrase rien."""
    harness = _Harness(tmp_path)
    run_id = await harness.produce_run(case_ids=["cas-0"], models=[MODEL_A, MODEL_B])
    calls_after_generation = len(_CountingOrchestrator.calls)

    await harness.pass_service.start_pass(run_id, _config(judge_model=JUDGE_A))
    await harness.drain()
    before = next(
        v for v in harness.pass_service.list_verdicts(run_id) if v.judge_model == JUDGE_A
    )

    await harness.pass_service.start_pass(run_id, _config(judge_model=JUDGE_B))
    await harness.drain()

    verdicts = harness.pass_service.list_verdicts(run_id)
    assert len(verdicts) == 2
    assert {v.judge_model for v in verdicts} == {JUDGE_A, JUDGE_B}
    after = next(v for v in verdicts if v.judge_model == JUDGE_A)
    assert after.model_dump() == before.model_dump(), "le premier duel est intact"
    assert len(_CountingOrchestrator.calls) == calls_after_generation


@pytest.mark.asyncio
async def test_relaunch_does_not_rejudge_existing_duels(tmp_path: Path) -> None:
    """Relancer la passe ne refait pas les duels déjà persistés."""
    harness = _Harness(tmp_path)
    run_id = await harness.produce_run(case_ids=["cas-0"], models=[MODEL_A, MODEL_B])
    await harness.pass_service.start_pass(run_id, _config())
    await harness.drain()
    assert harness.judge.calls == 2

    await harness.pass_service.start_pass(run_id, _config())
    await harness.drain()
    assert harness.judge.calls == 2


@pytest.mark.asyncio
async def test_judge_error_marks_the_duel_and_fails_the_pass(tmp_path: Path) -> None:
    """Une passe intégralement non conforme ne se déclare pas réussie."""
    harness = _Harness(tmp_path, judge=_PositionBiasedJudge(omit="french_correctness"))
    run_id = await harness.produce_run(case_ids=["cas-0"], models=[MODEL_A, MODEL_B])
    await harness.pass_service.start_pass(run_id, _config())
    await harness.drain()

    verdicts = harness.pass_service.list_verdicts(run_id)
    assert verdicts[0].status == "judge_error"
    state = harness.pass_service.get_pass_state(run_id, JUDGE_A)
    assert state.status == "failed"
    assert state.judge_errors == 1


@pytest.mark.asyncio
async def test_budget_cap_stops_the_pass(tmp_path: Path) -> None:
    """Le plafond interrompt la passe en conservant les duels produits."""
    harness = _Harness(tmp_path, judge=_PositionBiasedJudge(cost=0.5))
    run_id = await harness.produce_run(
        case_ids=["cas-0", "cas-1", "cas-2"], models=[MODEL_A, MODEL_B]
    )
    await harness.pass_service.start_pass(run_id, _config(budget_cap_usd=1.5))
    await harness.drain()

    state = harness.pass_service.get_pass_state(run_id, JUDGE_A)
    assert state.status == "interrupted_budget"
    assert 0 < len(harness.pass_service.list_verdicts(run_id)) < 3


@pytest.mark.asyncio
async def test_estimate_accounts_for_two_calls_per_duel(tmp_path: Path) -> None:
    """L'estimation doit refléter le double appel, sinon elle sous-évalue de moitié."""
    harness = _Harness(tmp_path, pricing=_FakePricingService(unit_cost=1.0))
    assert harness.pass_service.estimate_max_cost(JUDGE_A, 5) == pytest.approx(10.0)


@pytest.mark.asyncio
async def test_pass_refused_when_cap_below_estimate(tmp_path: Path) -> None:
    """Un plafond sous le coût estimé produirait une passe tronquée et payante."""
    harness = _Harness(tmp_path, pricing=_FakePricingService(unit_cost=1.0))
    run_id = await harness.produce_run(case_ids=["cas-0"], models=[MODEL_A, MODEL_B])
    with pytest.raises(JudgePassConflictError, match="insuffisant"):
        await harness.pass_service.start_pass(run_id, _config(budget_cap_usd=0.5))
    assert harness.judge.calls == 0


@pytest.mark.asyncio
async def test_dummy_judge_is_refused(tmp_path: Path) -> None:
    """Un juge factice produirait des duels crédibles et faux."""
    harness = _Harness(tmp_path)
    run_id = await harness.produce_run(case_ids=["cas-0"], models=[MODEL_A, MODEL_B])
    with pytest.raises(JudgePassConflictError, match="dummy"):
        await harness.pass_service.start_pass(run_id, _config(judge_model="dummy"))
    assert harness.judge.calls == 0


@pytest.mark.asyncio
async def test_pass_refused_while_the_run_is_still_generating(tmp_path: Path) -> None:
    """Comparer un run en cours figerait le total sur un instantané partiel."""
    harness = _Harness(tmp_path)
    run_id = await harness.produce_run(case_ids=["cas-0"], models=[MODEL_A, MODEL_B])
    still_running = harness.run_service.get_run(run_id).model_copy(update={"status": "running"})
    harness.run_service._persist_run(still_running)
    with pytest.raises(JudgePassConflictError, match="génère encore"):
        await harness.pass_service.start_pass(run_id, _config())


@pytest.mark.asyncio
async def test_second_pass_is_refused_while_one_runs(tmp_path: Path) -> None:
    """Deux passes concurrentes dépenseraient chacune leur plafond."""
    harness = _Harness(tmp_path)
    run_id = await harness.produce_run(case_ids=["cas-0"], models=[MODEL_A, MODEL_B])
    await harness.pass_service.start_pass(run_id, _config())
    with pytest.raises(JudgePassConflictError, match="déjà en cours"):
        await harness.pass_service.start_pass(run_id, _config(judge_model=JUDGE_B))
    await harness.drain()


@pytest.mark.asyncio
async def test_cancel_keeps_partial_duels(tmp_path: Path) -> None:
    """L'annulation conserve les duels déjà produits."""

    class _SlowJudge(_PositionBiasedJudge):
        async def generate_variants(self, prompt: str, k: int = 1, **kwargs: Any) -> List[Any]:
            await asyncio.sleep(0.02)
            return await super().generate_variants(prompt, k, **kwargs)

    harness = _Harness(tmp_path, judge=_SlowJudge())
    run_id = await harness.produce_run(
        case_ids=[f"cas-{i}" for i in range(6)], models=[MODEL_A, MODEL_B]
    )
    await harness.pass_service.start_pass(run_id, _config())
    await asyncio.sleep(0.05)
    assert harness.pass_service.request_cancel(run_id) is True
    await harness.drain()

    state = harness.pass_service.get_pass_state(run_id, JUDGE_A)
    assert state.status == "cancelled"
    assert 0 < len(harness.pass_service.list_verdicts(run_id)) < 6


@pytest.mark.asyncio
async def test_control_ignores_a_foreign_run_id(tmp_path: Path) -> None:
    """Annuler depuis un autre run ne touche pas la passe en cours."""
    harness = _Harness(tmp_path)
    run_id = await harness.produce_run(case_ids=["cas-0"], models=[MODEL_A, MODEL_B])
    await harness.pass_service.start_pass(run_id, _config())
    assert harness.pass_service.request_cancel("un-autre-run") is False
    await harness.drain()
    assert harness.pass_service.get_pass_state(run_id, JUDGE_A).status == "completed"


@pytest.mark.asyncio
async def test_pass_refused_when_judge_has_no_pricing(tmp_path: Path) -> None:
    """Sans tarif du juge, le plafond ne pourrait jamais se déclencher."""
    harness = _Harness(tmp_path, pricing=_FakePricingService(priced=False))
    run_id = await harness.produce_run(case_ids=["cas-0"], models=[MODEL_A, MODEL_B])
    with pytest.raises(JudgePassConflictError, match="Tarif inconnu"):
        await harness.pass_service.start_pass(run_id, _config())
    assert harness.judge.calls == 0


@pytest.mark.asyncio
async def test_pass_refused_when_judge_is_unusable(tmp_path: Path) -> None:
    """Un juge sans clé comparerait tout avec un client factice."""
    harness = _Harness(tmp_path)
    run_id = await harness.produce_run(case_ids=["cas-0"], models=[MODEL_A, MODEL_B])
    harness.run_service.diagnose_models = lambda models: [  # type: ignore[method-assign]
        BenchmarkModelDiagnostic(model_id=m, usable=False, reason="Clé API absente")
        for m in models
    ]
    with pytest.raises(JudgePassConflictError, match="Clé API absente"):
        await harness.pass_service.start_pass(run_id, _config())
    assert harness.judge.calls == 0


@pytest.mark.asyncio
async def test_relaunch_replays_judge_error_duels_without_losing_their_cost(
    tmp_path: Path,
) -> None:
    """Corriger la cause d'un `judge_error` et relancer rejoue le duel — et la
    dépense engagée n'est pas oubliée au passage.

    Purger les duels en erreur avant de relever le cumul ferait repartir chaque
    relance d'une ardoise vierge : le plafond deviendrait rejouable à volonté.
    """
    harness = _Harness(tmp_path, judge=_PositionBiasedJudge(omit="french_correctness", cost=0.5))
    run_id = await harness.produce_run(case_ids=["cas-0"], models=[MODEL_A, MODEL_B])
    await harness.pass_service.start_pass(run_id, _config(budget_cap_usd=10.0))
    await harness.drain()

    state = harness.pass_service.get_pass_state(run_id, JUDGE_A)
    assert state.status == "failed"
    assert state.spent_usd == pytest.approx(1.0), "deux appels à 0,5 USD"

    # Le juge est réparé, mais le plafond ne couvre plus le déjà-dépensé.
    harness.judge = _PositionBiasedJudge(cost=0.5)
    harness.pass_service._llm_client_factory = lambda model_id: harness.judge
    # Plafond sous le cumul déjà engagé (1,0 USD) : refus, même si les duels en
    # erreur viennent d'être purgés — c'est tout l'enjeu du relevé avant purge.
    with pytest.raises(JudgePassConflictError, match="déjà dépensés"):
        await harness.pass_service.start_pass(run_id, _config(budget_cap_usd=0.9))

    await harness.pass_service.start_pass(run_id, _config(budget_cap_usd=10.0))
    await harness.drain()
    verdicts = harness.pass_service.list_verdicts(run_id)
    assert len(verdicts) == 1
    assert verdicts[0].status == "decided", "le duel en erreur doit être rejoué"


@pytest.mark.asyncio
async def test_editing_the_grid_forces_a_rejudge(tmp_path: Path) -> None:
    """Un duel rendu sur une autre version de grille ne compte pas comme produit.

    Sans cette vérification, corriger un critère puis relancer donnerait une passe
    `completed` sur la nouvelle version alors que tous les duels sur disque portent
    l'ancienne.
    """
    harness = _Harness(tmp_path)
    run_id = await harness.produce_run(case_ids=["cas-0"], models=[MODEL_A, MODEL_B])
    await harness.pass_service.start_pass(run_id, _config())
    await harness.drain()
    assert harness.judge.calls == 2
    assert harness.pass_service.list_verdicts(run_id)[0].grid_version == 1

    harness.criteria_store.save_grid(_grid())  # version 2
    await harness.pass_service.start_pass(run_id, _config())
    await harness.drain()

    assert harness.judge.calls == 4, "la grille a changé : le duel doit être rejoué"
    assert harness.pass_service.list_verdicts(run_id)[0].grid_version == 2


@pytest.mark.asyncio
async def test_judge_that_is_also_a_candidate_is_flagged(tmp_path: Path) -> None:
    """Un juge qui est aussi candidat est autorisé, mais signalé.

    Le biais d'auto-préférence est cohérent dans les deux sens de lecture : il
    échappe au contrôle de position, donc seul un avertissement explicite protège
    le lecteur du rapport.
    """
    harness = _Harness(tmp_path)
    run_id = await harness.produce_run(case_ids=["cas-0"], models=[MODEL_A, MODEL_B])

    await harness.pass_service.start_pass(run_id, _config(judge_model=MODEL_A))
    await harness.drain()
    assert harness.pass_service.get_pass_state(run_id, MODEL_A).judge_is_candidate is True

    await harness.pass_service.start_pass(run_id, _config(judge_model=JUDGE_A))
    await harness.drain()
    assert harness.pass_service.get_pass_state(run_id, JUDGE_A).judge_is_candidate is False


@pytest.mark.asyncio
async def test_pause_suspends_the_pass_and_unpause_resumes_it(tmp_path: Path) -> None:
    """La pause doit réellement suspendre la boucle, pas seulement l'annoncer."""

    class _SlowJudge(_PositionBiasedJudge):
        async def generate_variants(self, prompt: str, k: int = 1, **kwargs: Any) -> List[Any]:
            await asyncio.sleep(0.02)
            return await super().generate_variants(prompt, k, **kwargs)

    harness = _Harness(tmp_path, judge=_SlowJudge())
    run_id = await harness.produce_run(
        case_ids=[f"cas-{i}" for i in range(6)], models=[MODEL_A, MODEL_B]
    )
    await harness.pass_service.start_pass(run_id, _config())

    await asyncio.sleep(0.06)
    assert harness.pass_service.request_pause(run_id) is True
    assert harness.pass_service.read_progress().paused is True

    await asyncio.sleep(0.06)
    produced = len(harness.pass_service.list_verdicts(run_id))
    await asyncio.sleep(0.10)
    assert len(harness.pass_service.list_verdicts(run_id)) == produced
    assert produced < 6

    assert harness.pass_service.request_unpause(run_id) is True
    await harness.drain()
    assert harness.pass_service.get_pass_state(run_id, JUDGE_A).status == "completed"


@pytest.mark.asyncio
async def test_corrupt_duel_is_rejudged(tmp_path: Path) -> None:
    """Un duel d'un schéma antérieur ne compte pas comme produit."""
    harness = _Harness(tmp_path)
    run_id = await harness.produce_run(case_ids=["cas-0"], models=[MODEL_A, MODEL_B])
    await harness.pass_service.start_pass(run_id, _config())
    await harness.drain()
    assert harness.judge.calls == 2

    directory = harness.pass_service._duels_dir(run_id, JUDGE_A)
    victim = next(p for p in directory.glob("*.json") if p.name != "_pass.json")
    victim.write_text('{"schema": "obsolete"}', encoding="utf-8")

    await harness.pass_service.start_pass(run_id, _config())
    await harness.drain()
    assert harness.judge.calls == 4
