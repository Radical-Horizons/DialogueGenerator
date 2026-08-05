"""Tests de la passe de jugement d'un run de benchmark.

L'invariant central — « rejouer le jugement ne régénère aucun texte » — est
vérifié par un compteur d'appels sur l'orchestrateur de génération : c'est la
seule façon de prouver l'absence d'un appel.
"""

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
    JudgePassConfig,
)
from models.benchmark_judge_output import (
    BenchmarkCriterionScore,
    BenchmarkRubricJudgeResult,
)
from services.benchmark_criteria_store import BenchmarkCriteriaStore
from services.benchmark_gate_service import BenchmarkGateService
from services.benchmark_judge_pass_service import (
    BenchmarkJudgePassService,
    JudgePassConflictError,
)
from services.benchmark_judge_service import BenchmarkJudgeService
from services.benchmark_run_service import BenchmarkRunService
from services.benchmark_suite_store import BenchmarkSuiteStore

MODEL_A = "gpt-5.6-luna"
MODEL_B = "gpt-5.6-terra"
JUDGE_A = "gpt-5.6-sol"
JUDGE_B = "gpt-5.6-terra"

CRITERIA = ("voice_fidelity", "french_correctness", "ai_tics")

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
    """Orchestrateur qui compte ses appels — sert à prouver qu'il n'en reçoit aucun."""

    calls: List[str] = []

    def __init__(self, *, invalid: bool = False) -> None:
        self.config_service = _FakeConfigService()
        self._invalid = invalid

    async def generate_with_events(self, request: Any, check_cancelled: Any):
        """Émet une génération valide, ou volontairement non française."""
        _CountingOrchestrator.calls.append(request.llm_model_identifier)
        document = _unity_document()
        if self._invalid:
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


class _FakeJudgeClient:
    """Juge qui note tous les critères de la grille."""

    def __init__(self, *, cost: float = 0.002, omit: Optional[str] = None) -> None:
        self.last_call_cost = cost
        self.last_usage_prompt_tokens = 100
        self.last_usage_completion_tokens = 30
        self._omit = omit
        self.calls = 0

    async def generate_variants(self, prompt: str, k: int = 1, **kwargs: Any) -> List[Any]:
        """Retourne une notation complète, éventuellement amputée d'un critère."""
        self.calls += 1
        return [
            BenchmarkRubricJudgeResult(
                criteria=[
                    BenchmarkCriterionScore(criterion_id=cid, score=7, comment="ok")
                    for cid in CRITERIA
                    if cid != self._omit
                ],
                reasoning="raisonnement d'audit",
            )
        ]


def _grid() -> CriteriaGrid:
    """Grille de test."""
    return CriteriaGrid(
        grid_id="test",
        criteria=[
            CriterionDefinition(
                criterion_id=cid,
                label=cid,
                description=f"Consigne {cid}.",
                direction="lower_is_better" if cid == "ai_tics" else "higher_is_better",
            )
            for cid in CRITERIA
        ],
    )


class _Harness:
    """Moteur de run + passe de jugement, isolés dans `tmp_path`."""

    def __init__(self, tmp_path: Path, *, judge_client: Optional[_FakeJudgeClient] = None,
                 pricing: Optional[_FakePricingService] = None, invalid: bool = False) -> None:
        _CountingOrchestrator.calls = []
        self.judge_client = judge_client or _FakeJudgeClient()
        self.run_service = BenchmarkRunService(
            suite_store=BenchmarkSuiteStore(suites_dir=tmp_path / "suites"),
            gate_service=BenchmarkGateService(flag_validation_service=None),
            pricing_service=_FakePricingService(),
            config_service=_FakeConfigService(),
            orchestrator_factory=lambda rid: _CountingOrchestrator(invalid=invalid),
            runs_dir=tmp_path / "runs",
        )
        self.run_service.diagnose_models = lambda models: [  # type: ignore[method-assign]
            BenchmarkModelDiagnostic(model_id=m, usable=True) for m in models
        ]
        self.criteria_store = BenchmarkCriteriaStore(criteria_dir=tmp_path / "criteria")
        self.criteria_store.save_grid(_grid(), bump_version=False)
        self.pass_service = BenchmarkJudgePassService(
            run_service=self.run_service,
            criteria_store=self.criteria_store,
            judge_service=BenchmarkJudgeService(),
            pricing_service=pricing or _FakePricingService(),
            config_service=_FakeConfigService(),
            llm_client_factory=lambda model_id: self.judge_client,
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
                                "user_instructions": "Le marchand refuse.",
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
                suite_id=suite.suite_id,
                models=models,
                repetitions=1,
                budget_cap_usd=10.0,
            )
        )
        task = self.run_service.background_task
        assert task is not None
        await task
        return run.run_id

    async def drain_judge(self) -> None:
        """Attend la fin de la passe de jugement."""
        task = self.pass_service.background_task
        assert task is not None
        await task


def _config(**overrides: Any) -> JudgePassConfig:
    """Config de passe par défaut."""
    payload: Dict[str, Any] = {
        "grid_id": "test",
        "judge_model": JUDGE_A,
        "budget_cap_usd": 10.0,
    }
    payload.update(overrides)
    return JudgePassConfig(**payload)


@pytest.mark.asyncio
async def test_pass_scores_every_valid_generation_without_regenerating(tmp_path: Path) -> None:
    """La passe note toutes les générations valides et n'en régénère aucune."""
    harness = _Harness(tmp_path)
    run_id = await harness.produce_run(case_ids=["cas-0", "cas-1", "cas-2"], models=[MODEL_A, MODEL_B])
    calls_after_generation = len(_CountingOrchestrator.calls)
    assert calls_after_generation == 6

    await harness.pass_service.start_pass(run_id, _config())
    await harness.drain_judge()

    verdicts = harness.pass_service.list_verdicts(run_id)
    assert len(verdicts) == 6
    assert {v.status for v in verdicts} == {"scored"}
    assert len(_CountingOrchestrator.calls) == calls_after_generation, (
        "le jugement ne doit déclencher aucune génération"
    )
    state = harness.pass_service.get_pass_state(run_id, JUDGE_A)
    assert state.status == "completed"
    assert state.verdicts_completed == 6
    assert state.spent_usd == pytest.approx(0.012)


@pytest.mark.asyncio
async def test_invalid_generations_are_not_scored(tmp_path: Path) -> None:
    """Une génération écartée par les portes n'entre pas dans le jugement."""
    harness = _Harness(tmp_path, invalid=True)
    run_id = await harness.produce_run(case_ids=["cas-0"], models=[MODEL_A])
    assert harness.run_service.list_generations(run_id)[0].status == "invalid"

    with pytest.raises(JudgePassConflictError, match="aucune génération valide"):
        await harness.pass_service.start_pass(run_id, _config())
    assert harness.judge_client.calls == 0, "aucun appel de juge sur un run sans matière"


@pytest.mark.asyncio
async def test_two_judges_coexist_without_mixing(tmp_path: Path) -> None:
    """Rejouer le jugement avec un autre juge ne régénère ni n'écrase rien."""
    harness = _Harness(tmp_path)
    run_id = await harness.produce_run(case_ids=["cas-0"], models=[MODEL_A])
    calls_after_generation = len(_CountingOrchestrator.calls)

    await harness.pass_service.start_pass(run_id, _config(judge_model=JUDGE_A))
    await harness.drain_judge()
    await harness.pass_service.start_pass(run_id, _config(judge_model=JUDGE_B))
    await harness.drain_judge()

    verdicts = harness.pass_service.list_verdicts(run_id)
    assert len(verdicts) == 2
    assert {v.judge_model for v in verdicts} == {JUDGE_A, JUDGE_B}
    assert len(_CountingOrchestrator.calls) == calls_after_generation


@pytest.mark.asyncio
async def test_judge_error_does_not_stop_the_pass(tmp_path: Path) -> None:
    """Un critère omis marque le verdict, la passe continue — mais ne se dit pas réussie.

    Une passe intégralement en erreur a coûté le prix plein sans produire une seule
    mesure : la déclarer `completed` laisserait croire à un résultat exploitable.
    """
    harness = _Harness(tmp_path, judge_client=_FakeJudgeClient(omit="french_correctness"))
    run_id = await harness.produce_run(case_ids=["cas-0", "cas-1"], models=[MODEL_A])

    await harness.pass_service.start_pass(run_id, _config())
    await harness.drain_judge()

    verdicts = harness.pass_service.list_verdicts(run_id)
    assert len(verdicts) == 2, "les deux générations ont bien été traitées"
    assert {v.status for v in verdicts} == {"judge_error"}
    assert all("french_correctness" in (v.error_message or "") for v in verdicts)
    state = harness.pass_service.get_pass_state(run_id, JUDGE_A)
    assert state.status == "failed"
    assert state.judge_errors == 2
    assert "non conformes à la grille" in state.message


@pytest.mark.asyncio
async def test_partial_judge_errors_still_complete(tmp_path: Path) -> None:
    """Tant qu'au moins un verdict est exploitable, la passe reste terminée."""

    class _FlakyJudge(_FakeJudgeClient):
        async def generate_variants(self, prompt: str, k: int = 1, **kwargs: Any) -> List[Any]:
            self.calls += 1
            omitted = CRITERIA[1] if self.calls == 1 else None
            return [
                BenchmarkRubricJudgeResult(
                    criteria=[
                        BenchmarkCriterionScore(criterion_id=cid, score=7, comment="ok")
                        for cid in CRITERIA
                        if cid != omitted
                    ],
                    reasoning="audit",
                )
            ]

    harness = _Harness(tmp_path, judge_client=_FlakyJudge())
    run_id = await harness.produce_run(case_ids=["cas-0", "cas-1"], models=[MODEL_A])
    await harness.pass_service.start_pass(run_id, _config())
    await harness.drain_judge()

    state = harness.pass_service.get_pass_state(run_id, JUDGE_A)
    assert state.status == "completed"
    assert state.judge_errors == 1


@pytest.mark.asyncio
async def test_resume_does_not_rejudge_existing_verdicts(tmp_path: Path) -> None:
    """Relancer une passe ne refait pas les verdicts déjà persistés."""
    harness = _Harness(tmp_path)
    run_id = await harness.produce_run(case_ids=["cas-0", "cas-1"], models=[MODEL_A])

    await harness.pass_service.start_pass(run_id, _config())
    await harness.drain_judge()
    assert harness.judge_client.calls == 2

    await harness.pass_service.start_pass(run_id, _config())
    await harness.drain_judge()
    assert harness.judge_client.calls == 2, "les verdicts existants ne sont pas rejoués"


@pytest.mark.asyncio
async def test_budget_cap_stops_the_pass(tmp_path: Path) -> None:
    """Le plafond interrompt la passe en conservant les verdicts produits."""
    harness = _Harness(tmp_path, judge_client=_FakeJudgeClient(cost=0.5))
    run_id = await harness.produce_run(case_ids=["cas-0", "cas-1", "cas-2"], models=[MODEL_A])

    await harness.pass_service.start_pass(run_id, _config(budget_cap_usd=0.75))
    await harness.drain_judge()

    state = harness.pass_service.get_pass_state(run_id, JUDGE_A)
    assert state.status == "interrupted_budget"
    assert len(harness.pass_service.list_verdicts(run_id)) == 2


@pytest.mark.asyncio
async def test_pass_refused_when_cap_below_estimate(tmp_path: Path) -> None:
    """Un plafond sous le coût estimé produirait une passe tronquée et payante."""
    harness = _Harness(tmp_path, pricing=_FakePricingService(unit_cost=1.0))
    run_id = await harness.produce_run(case_ids=["cas-0", "cas-1"], models=[MODEL_A])
    with pytest.raises(JudgePassConflictError, match="Plafond .* insuffisant"):
        await harness.pass_service.start_pass(run_id, _config(budget_cap_usd=0.5))


@pytest.mark.asyncio
async def test_pass_refused_when_judge_has_no_pricing(tmp_path: Path) -> None:
    """Sans tarif du juge, le plafond ne pourrait jamais se déclencher."""
    harness = _Harness(tmp_path, pricing=_FakePricingService(priced=False))
    run_id = await harness.produce_run(case_ids=["cas-0"], models=[MODEL_A])
    with pytest.raises(JudgePassConflictError, match="Tarif inconnu"):
        await harness.pass_service.start_pass(run_id, _config())


@pytest.mark.asyncio
async def test_pass_refused_when_judge_is_unusable(tmp_path: Path) -> None:
    """Un juge sans clé noterait tout avec un client factice."""
    harness = _Harness(tmp_path)
    run_id = await harness.produce_run(case_ids=["cas-0"], models=[MODEL_A])
    harness.run_service.diagnose_models = lambda models: [  # type: ignore[method-assign]
        BenchmarkModelDiagnostic(model_id=m, usable=False, reason="Clé API absente")
        for m in models
    ]
    with pytest.raises(JudgePassConflictError, match="Clé API absente"):
        await harness.pass_service.start_pass(run_id, _config())
    assert harness.judge_client.calls == 0


@pytest.mark.asyncio
async def test_second_pass_is_refused_while_one_runs(tmp_path: Path) -> None:
    """Deux passes concurrentes dépenseraient chacune leur plafond."""
    harness = _Harness(tmp_path)
    run_id = await harness.produce_run(case_ids=["cas-0"], models=[MODEL_A])
    await harness.pass_service.start_pass(run_id, _config())
    with pytest.raises(JudgePassConflictError, match="déjà en cours"):
        await harness.pass_service.start_pass(run_id, _config(judge_model=JUDGE_B))
    await harness.drain_judge()


@pytest.mark.asyncio
async def test_cancel_keeps_partial_verdicts(tmp_path: Path) -> None:
    """L'annulation conserve les verdicts déjà produits."""

    class _SlowJudge(_FakeJudgeClient):
        async def generate_variants(self, prompt: str, k: int = 1, **kwargs: Any) -> List[Any]:
            await asyncio.sleep(0.02)
            return await super().generate_variants(prompt, k, **kwargs)

    harness = _Harness(tmp_path, judge_client=_SlowJudge())
    run_id = await harness.produce_run(
        case_ids=[f"cas-{i}" for i in range(8)], models=[MODEL_A]
    )
    await harness.pass_service.start_pass(run_id, _config())
    await asyncio.sleep(0.03)
    assert harness.pass_service.request_cancel(run_id) is True
    await harness.drain_judge()

    state = harness.pass_service.get_pass_state(run_id, JUDGE_A)
    assert state.status == "cancelled"
    assert 0 < len(harness.pass_service.list_verdicts(run_id)) < 8


@pytest.mark.asyncio
async def test_control_ignores_a_foreign_run_id(tmp_path: Path) -> None:
    """Annuler depuis un autre run ne touche pas la passe en cours."""
    harness = _Harness(tmp_path)
    run_id = await harness.produce_run(case_ids=["cas-0"], models=[MODEL_A])
    await harness.pass_service.start_pass(run_id, _config())
    assert harness.pass_service.request_cancel("un-autre-run") is False
    await harness.drain_judge()
    assert harness.pass_service.get_pass_state(run_id, JUDGE_A).status == "completed"


@pytest.mark.asyncio
async def test_dummy_judge_is_refused(tmp_path: Path) -> None:
    """`dummy` échappe au diagnostic ordinaire : c'est précisément le juge à écarter."""
    harness = _Harness(tmp_path)
    run_id = await harness.produce_run(case_ids=["cas-0"], models=[MODEL_A])
    with pytest.raises(JudgePassConflictError, match="dummy"):
        await harness.pass_service.start_pass(run_id, _config(judge_model="dummy"))
    assert harness.judge_client.calls == 0


@pytest.mark.asyncio
async def test_pass_refused_while_the_run_is_still_generating(tmp_path: Path) -> None:
    """Juger un run en cours figerait le total sur un instantané partiel."""
    harness = _Harness(tmp_path)
    run_id = await harness.produce_run(case_ids=["cas-0"], models=[MODEL_A])
    still_running = harness.run_service.get_run(run_id).model_copy(
        update={"status": "running"}
    )
    harness.run_service._persist_run(still_running)
    with pytest.raises(JudgePassConflictError, match="génère encore"):
        await harness.pass_service.start_pass(run_id, _config())
    assert harness.judge_client.calls == 0


@pytest.mark.asyncio
async def test_relaunch_replays_judge_error_verdicts(tmp_path: Path) -> None:
    """Corriger la cause d'un `judge_error` puis relancer doit rejouer la cellule."""
    flaky = _FakeJudgeClient(omit="french_correctness")
    harness = _Harness(tmp_path, judge_client=flaky)
    run_id = await harness.produce_run(case_ids=["cas-0"], models=[MODEL_A])

    await harness.pass_service.start_pass(run_id, _config())
    await harness.drain_judge()
    assert harness.pass_service.list_verdicts(run_id)[0].status == "judge_error"

    harness.judge_client = _FakeJudgeClient()
    harness.pass_service._llm_client_factory = lambda model_id: harness.judge_client
    await harness.pass_service.start_pass(run_id, _config())
    await harness.drain_judge()

    verdicts = harness.pass_service.list_verdicts(run_id)
    assert len(verdicts) == 1
    assert verdicts[0].status == "scored", "la cellule en erreur doit être rejouée"


@pytest.mark.asyncio
async def test_resume_after_budget_stop_accounts_for_what_was_already_spent(
    tmp_path: Path,
) -> None:
    """Le plafond couvre la dépense totale du jugement, reprises comprises.

    Un plafond qui ne couvrirait que le restant serait immédiatement épuisé par le
    déjà-dépensé ; la garde de lancement doit donc le refuser au lieu de laisser
    partir une passe que la boucle arrêterait aussitôt.
    """
    harness = _Harness(
        tmp_path,
        judge_client=_FakeJudgeClient(cost=0.5),
        pricing=_FakePricingService(unit_cost=0.3),
    )
    run_id = await harness.produce_run(case_ids=["cas-0", "cas-1", "cas-2"], models=[MODEL_A])

    await harness.pass_service.start_pass(run_id, _config(budget_cap_usd=0.95))
    await harness.drain_judge()
    assert harness.pass_service.get_pass_state(run_id, JUDGE_A).status == "interrupted_budget"
    assert len(harness.pass_service.list_verdicts(run_id)) == 2

    # 1.0 USD déjà dépensé : un plafond de 0.4 est refusé, pas silencieusement stérile.
    with pytest.raises(JudgePassConflictError, match="déjà dépensés"):
        await harness.pass_service.start_pass(run_id, _config(budget_cap_usd=0.4))

    # Plafond relevé au-dessus du total : la reprise termine le dernier verdict.
    await harness.pass_service.start_pass(run_id, _config(budget_cap_usd=2.0))
    await harness.drain_judge()
    assert len(harness.pass_service.list_verdicts(run_id)) == 3


@pytest.mark.asyncio
async def test_corrupt_verdict_is_rejudged(tmp_path: Path) -> None:
    """Un verdict d'un schéma antérieur ne compte pas comme une notation faite."""
    harness = _Harness(tmp_path)
    run_id = await harness.produce_run(case_ids=["cas-0"], models=[MODEL_A])
    await harness.pass_service.start_pass(run_id, _config())
    await harness.drain_judge()
    assert harness.judge_client.calls == 1

    directory = harness.pass_service._verdicts_dir(run_id, JUDGE_A)
    victim = next(p for p in directory.glob("*.json") if p.name != "_pass.json")
    victim.write_text('{"schema": "obsolete"}', encoding="utf-8")

    await harness.pass_service.start_pass(run_id, _config())
    await harness.drain_judge()
    assert harness.judge_client.calls == 2
    assert harness.pass_service.list_verdicts(run_id)[0].status == "scored"


@pytest.mark.asyncio
async def test_slug_colliding_case_ids_keep_separate_verdicts(tmp_path: Path) -> None:
    """Deux cas qui s'assainissent pareil ne doivent pas partager un verdict."""
    harness = _Harness(tmp_path)
    run_id = await harness.produce_run(case_ids=["a/b", "a-b"], models=[MODEL_A])
    await harness.pass_service.start_pass(run_id, _config())
    await harness.drain_judge()

    verdicts = harness.pass_service.list_verdicts(run_id)
    assert len(verdicts) == 2
    assert {v.case_id for v in verdicts} == {"a/b", "a-b"}


@pytest.mark.asyncio
async def test_earlier_judge_verdict_is_untouched_by_a_second_judge(
    tmp_path: Path,
) -> None:
    """Le contenu du verdict du premier juge doit survivre au passage du second."""
    harness = _Harness(tmp_path)
    run_id = await harness.produce_run(case_ids=["cas-0"], models=[MODEL_A])

    await harness.pass_service.start_pass(run_id, _config(judge_model=JUDGE_A))
    await harness.drain_judge()
    before = next(
        v for v in harness.pass_service.list_verdicts(run_id) if v.judge_model == JUDGE_A
    )

    await harness.pass_service.start_pass(run_id, _config(judge_model=JUDGE_B))
    await harness.drain_judge()
    after = next(
        v for v in harness.pass_service.list_verdicts(run_id) if v.judge_model == JUDGE_A
    )
    assert after.model_dump() == before.model_dump()


@pytest.mark.asyncio
async def test_pricing_failure_is_a_clean_refusal(tmp_path: Path) -> None:
    """Une tarification qui lève donne un refus explicite, pas une erreur brute."""

    class _BrokenPricing(_FakePricingService):
        def calculate_cost(self, model_name: str, prompt_tokens: int, completion_tokens: int) -> float:
            raise RuntimeError("table tarifaire corrompue")

    harness = _Harness(tmp_path, pricing=_BrokenPricing())
    run_id = await harness.produce_run(case_ids=["cas-0"], models=[MODEL_A])
    with pytest.raises(JudgePassConflictError, match="Tarif inconnu"):
        await harness.pass_service.start_pass(run_id, _config())
    assert harness.judge_client.calls == 0


@pytest.mark.asyncio
async def test_missing_grid_is_refused_before_any_judge_call(tmp_path: Path) -> None:
    """Une grille absente arrête la passe avant tout appel LLM."""
    from services.benchmark_criteria_store import CriteriaGridNotFoundError

    harness = _Harness(tmp_path)
    run_id = await harness.produce_run(case_ids=["cas-0"], models=[MODEL_A])
    with pytest.raises(CriteriaGridNotFoundError):
        await harness.pass_service.start_pass(run_id, _config(grid_id="inconnue"))
    assert harness.judge_client.calls == 0
