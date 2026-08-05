"""Tests de durcissement du moteur de benchmark, issus de la revue adversariale.

Chaque test correspond à un défaut identifié qui corrompait silencieusement une
mesure ou la dépense : refus de lancement non mesurable, budget rejoué après un
crash, statut menteur, contrôle appliqué au mauvais run, record tronqué compté
comme fait, repli LLM non neutralisé.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional

import pytest

from api.schemas.benchmark import (
    BenchmarkCaseExpectations,
    BenchmarkModelDiagnostic,
    BenchmarkRunConfig,
    BenchmarkSuite,
)
from services.benchmark_gate_service import BenchmarkGateService
from services.benchmark_run_service import (
    BenchmarkRunConflictError,
    BenchmarkRunNotFoundError,
    BenchmarkRunService,
)
from services.benchmark_suite_store import BenchmarkSuiteStore

MODEL_A = "gpt-5.6-luna"
MODEL_B = "gpt-5.6-terra"

FRENCH_LINE = (
    "Je n'ai pas confiance en toi, marchand : tu vends des promesses et tu gardes "
    "les pièces. Dis-moi ce que tu veux vraiment."
)


def _unity_document(choice_count: int = 2) -> str:
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
                            "choiceId": f"choice_node-1_{index}",
                            "text": f"Réponse tranchante numéro {index}",
                            "targetNode": "END",
                        }
                        for index in range(choice_count)
                    ],
                }
            ],
        },
        ensure_ascii=False,
    )


class _Event:
    """Événement de génération, calqué sur ``GenerationEvent``."""

    def __init__(self, type: str, data: Dict[str, Any]) -> None:
        self.type = type
        self.data = data


class _FakeConfigService:
    """Configuration LLM minimale, avec chaîne de repli non vide."""

    def get_llm_config(self) -> Dict[str, Any]:
        return {"api_key_env_var": "OPENAI_API_KEY"}

    def get_available_llm_models(self) -> List[Dict[str, Any]]:
        return [
            {"api_identifier": MODEL_A, "client_type": "openai"},
            {"api_identifier": MODEL_B, "client_type": "openai"},
        ]

    def get_llm_fallback_chain(self) -> List[str]:
        return [MODEL_A, MODEL_B]


class _FakeOrchestrator:
    """Double d'orchestrateur émettant une génération valide."""

    def __init__(self, *, cost: float = 0.001, document: Optional[str] = None) -> None:
        self.config_service = _FakeConfigService()
        self._cost = cost
        self._document = document if document is not None else _unity_document()

    async def generate_with_events(
        self, request: Any, check_cancelled: Any
    ) -> AsyncGenerator[_Event, None]:
        """Émet metadata puis complete."""
        yield _Event(
            "metadata",
            {"cost_usd": self._cost, "usage_prompt_tokens": 10, "usage_completion_tokens": 5},
        )
        yield _Event(
            "complete",
            {
                "result": {
                    "json_content": self._document,
                    "title": "Marchandage",
                    "raw_prompt": "prompt",
                    "prompt_hash": "hash",
                }
            },
        )


class _FakePricingService:
    """Tarification fictive, déterministe."""

    def __init__(self, *, priced: bool = True, unit_cost: float = 0.001) -> None:
        self._priced = priced
        self._unit_cost = unit_cost

    def get_model_pricing(self, model_name: str) -> Optional[Dict[str, float]]:
        return {"input_price_per_1M": 1.0} if self._priced else None

    def calculate_cost(self, model_name: str, prompt_tokens: int, completion_tokens: int) -> float:
        return self._unit_cost


def _service(
    tmp_path: Path,
    *,
    orchestrator_factory: Any = None,
    usable_models: Optional[List[str]] = None,
    pricing: Optional[_FakePricingService] = None,
) -> BenchmarkRunService:
    """Construit un moteur isolé, diagnostic de modèles forcé."""
    store = BenchmarkSuiteStore(suites_dir=tmp_path / "suites")
    service = BenchmarkRunService(
        suite_store=store,
        gate_service=BenchmarkGateService(flag_validation_service=None),
        pricing_service=pricing or _FakePricingService(),
        config_service=_FakeConfigService(),
        orchestrator_factory=orchestrator_factory or (lambda request_id: _FakeOrchestrator()),
        runs_dir=tmp_path / "runs",
    )
    allowed = usable_models if usable_models is not None else [MODEL_A, MODEL_B]
    service.diagnose_models = lambda models: [  # type: ignore[method-assign]
        BenchmarkModelDiagnostic(
            model_id=model_id,
            usable=model_id in allowed,
            reason=None if model_id in allowed else "Clé API absente ou factice",
        )
        for model_id in models
    ]
    return service


def _suite(
    store: BenchmarkSuiteStore,
    *,
    case_ids: Optional[List[str]] = None,
    expectations: Optional[BenchmarkCaseExpectations] = None,
) -> BenchmarkSuite:
    """Persiste une suite et la retourne."""
    ids = case_ids or ["cas-0", "cas-1"]
    cases = [
        {
            "case_id": case_id,
            "title": case_id,
            "request": {
                "llm_model_identifier": MODEL_A,
                "user_instructions": "Le marchand refuse de baisser son prix.",
                "context_selections": {"characters_full": ["Uresaïr"]},
            },
            **({"expectations": expectations.model_dump()} if expectations else {}),
        }
        for case_id in ids
    ]
    return store.save_suite(
        BenchmarkSuite.model_validate({"suite_id": "smoke", "cases": cases})
    )


def _config(suite: BenchmarkSuite, **overrides: Any) -> BenchmarkRunConfig:
    """Config de run par défaut, surchargeable."""
    payload: Dict[str, Any] = {
        "suite_id": suite.suite_id,
        "models": [MODEL_A],
        "repetitions": 1,
        "budget_cap_usd": 1.0,
    }
    payload.update(overrides)
    return BenchmarkRunConfig(**payload)


async def _drain(service: BenchmarkRunService) -> None:
    """Attend la fin de la tâche de fond."""
    task = service.background_task
    assert task is not None
    await task


# ----------------------------------------------------------------------
# Refus de lancement : un run qui ne peut rien mesurer ne doit pas partir
# ----------------------------------------------------------------------


@pytest.mark.asyncio
async def test_run_refused_when_no_model_is_usable(tmp_path: Path) -> None:
    """Sans aucun modèle utilisable, le run se terminerait `completed` sans mesure."""
    service = _service(tmp_path, usable_models=[])
    suite = _suite(service._suite_store)
    with pytest.raises(BenchmarkRunConflictError, match="Aucun modèle utilisable"):
        await service.start_run(_config(suite))


@pytest.mark.asyncio
async def test_run_refused_when_a_model_has_no_pricing(tmp_path: Path) -> None:
    """Sans tarif, `calculate_cost` renvoie 0 : le plafond ne pourrait jamais agir."""
    service = _service(tmp_path, pricing=_FakePricingService(priced=False))
    suite = _suite(service._suite_store)
    with pytest.raises(BenchmarkRunConflictError, match="Tarif inconnu"):
        await service.start_run(_config(suite))


@pytest.mark.asyncio
async def test_run_refused_when_cap_below_low_estimate(tmp_path: Path) -> None:
    """Un plafond sous l'estimation basse produirait un run vide et payant."""
    service = _service(tmp_path, pricing=_FakePricingService(unit_cost=1.0))
    suite = _suite(service._suite_store)
    with pytest.raises(BenchmarkRunConflictError, match="inférieur à l'estimation basse"):
        await service.start_run(_config(suite, budget_cap_usd=0.01))


@pytest.mark.asyncio
async def test_second_run_is_refused_before_the_first_takes_the_lock(tmp_path: Path) -> None:
    """Deux lancements concurrents dépenseraient chacun leur plafond.

    Le verrou n'étant pris que dans la tâche de fond, la garde doit reposer sur
    l'identifiant de run actif, posé synchroniquement.
    """
    service = _service(tmp_path)
    suite = _suite(service._suite_store)
    await service.start_run(_config(suite))
    with pytest.raises(BenchmarkRunConflictError, match="déjà en cours"):
        await service.start_run(_config(suite))
    await _drain(service)


# ----------------------------------------------------------------------
# Budget et statut : ce qui est écrit sur disque doit être vrai
# ----------------------------------------------------------------------


@pytest.mark.asyncio
async def test_resume_recomputes_spend_from_records(tmp_path: Path) -> None:
    """Un run tué n'a pas écrit son cumul : la reprise doit le recalculer.

    Sinon le plafond repart de zéro à chaque crash et devient rejouable à l'infini.
    """
    service = _service(tmp_path, orchestrator_factory=lambda rid: _FakeOrchestrator(cost=0.4))
    suite = _suite(service._suite_store, case_ids=["cas-0", "cas-1", "cas-2"])
    run, _ = await service.start_run(_config(suite, budget_cap_usd=0.7))
    await _drain(service)
    assert service.get_run(run.run_id).status == "interrupted_budget"

    # Simule un arrêt brutal : le cumul persisté est perdu, les records restent.
    corrupted = service.get_run(run.run_id).model_copy(
        update={"spent_usd": 0.0, "status": "failed"}
    )
    service._persist_run(corrupted)

    await service.resume_run(run.run_id)
    await _drain(service)

    final = service.get_run(run.run_id)
    assert final.status == "interrupted_budget", "le plafond doit se redéclencher"
    assert len(service.list_generations(run.run_id)) == 2, "aucune génération supplémentaire"


@pytest.mark.asyncio
async def test_scheduler_cancellation_is_not_reported_as_completed(tmp_path: Path) -> None:
    """Un run tué par l'ordonnanceur ne doit pas se déclarer terminé.

    `asyncio.CancelledError` hérite de `BaseException` : sans branche dédiée, le
    `finally` persistait le statut initial et un run tronqué passait pour complet.
    """

    class _SlowOrchestrator(_FakeOrchestrator):
        async def generate_with_events(self, request: Any, check_cancelled: Any):
            await asyncio.sleep(0.05)
            async for event in super().generate_with_events(request, check_cancelled):
                yield event

    service = _service(tmp_path, orchestrator_factory=lambda rid: _SlowOrchestrator())
    suite = _suite(service._suite_store, case_ids=[f"cas-{i}" for i in range(6)])
    run, _ = await service.start_run(_config(suite))

    await asyncio.sleep(0.02)
    assert service.background_task is not None
    service.background_task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await service.background_task

    final = service.get_run(run.run_id)
    assert final.status == "cancelled"
    assert "arrêt du processus" in final.message


@pytest.mark.asyncio
async def test_pause_is_persisted_and_suspends_the_run(tmp_path: Path) -> None:
    """Une pause doit suspendre la boucle et être visible depuis `run.json`."""

    class _SlowOrchestrator(_FakeOrchestrator):
        async def generate_with_events(self, request: Any, check_cancelled: Any):
            await asyncio.sleep(0.02)
            async for event in super().generate_with_events(request, check_cancelled):
                yield event

    service = _service(tmp_path, orchestrator_factory=lambda rid: _SlowOrchestrator())
    suite = _suite(service._suite_store, case_ids=[f"cas-{i}" for i in range(8)])
    run, _ = await service.start_run(_config(suite))

    await asyncio.sleep(0.05)
    assert service.request_pause(run.run_id) is True
    assert service.get_run(run.run_id).status == "paused"
    assert service.read_progress().paused is True

    # La pause est coopérative : la génération déjà en vol se termine, puis la
    # boucle s'arrête au point de contrôle suivant.
    await asyncio.sleep(0.05)
    produced = len(service.list_generations(run.run_id))
    await asyncio.sleep(0.10)
    assert len(service.list_generations(run.run_id)) == produced, "la boucle doit être suspendue"
    assert produced < 8, "la pause doit intervenir avant la fin du run"

    assert service.request_unpause(run.run_id) is True
    assert service.get_run(run.run_id).status == "running"
    await _drain(service)
    assert service.get_run(run.run_id).status == "completed"


@pytest.mark.asyncio
async def test_control_commands_ignore_a_foreign_run_id(tmp_path: Path) -> None:
    """Annuler depuis l'onglet d'un autre run ne doit pas tuer le run en cours."""

    class _SlowOrchestrator(_FakeOrchestrator):
        async def generate_with_events(self, request: Any, check_cancelled: Any):
            await asyncio.sleep(0.02)
            async for event in super().generate_with_events(request, check_cancelled):
                yield event

    service = _service(tmp_path, orchestrator_factory=lambda rid: _SlowOrchestrator())
    suite = _suite(service._suite_store, case_ids=["cas-0", "cas-1"])
    run, _ = await service.start_run(_config(suite))

    assert service.request_cancel("un-autre-run") is False
    assert service.request_pause("un-autre-run") is False

    await _drain(service)
    assert service.get_run(run.run_id).status == "completed"


@pytest.mark.asyncio
async def test_progress_is_readable_while_the_run_is_active(tmp_path: Path) -> None:
    """La progression doit refléter le travail en cours, pas seulement l'état final."""
    observed: List[Any] = []

    class _ObservingOrchestrator(_FakeOrchestrator):
        def __init__(self, service_ref: BenchmarkRunService) -> None:
            super().__init__()
            self._service = service_ref

        async def generate_with_events(self, request: Any, check_cancelled: Any):
            observed.append(self._service.read_progress())
            async for event in super().generate_with_events(request, check_cancelled):
                yield event

    holder: Dict[str, BenchmarkRunService] = {}
    service = _service(
        tmp_path, orchestrator_factory=lambda rid: _ObservingOrchestrator(holder["service"])
    )
    holder["service"] = service
    suite = _suite(service._suite_store, case_ids=["cas-0", "cas-1"])
    run, _ = await service.start_run(_config(suite))
    await _drain(service)

    assert observed, "la progression doit être lisible pendant le run"
    assert observed[0].active is True
    assert observed[0].run_id == run.run_id
    assert observed[-1].current_case == "cas-0"
    assert observed[-1].generations_completed == 1


@pytest.mark.asyncio
async def test_start_run_returns_before_the_run_finishes(tmp_path: Path) -> None:
    """`start_run` doit rendre la main immédiatement, sans attendre le run."""

    class _BlockingOrchestrator(_FakeOrchestrator):
        async def generate_with_events(self, request: Any, check_cancelled: Any):
            await gate.wait()
            async for event in super().generate_with_events(request, check_cancelled):
                yield event

    gate = asyncio.Event()
    service = _service(tmp_path, orchestrator_factory=lambda rid: _BlockingOrchestrator())
    suite = _suite(service._suite_store)

    run, _ = await service.start_run(_config(suite))
    assert run.status == "running"
    assert service.background_task is not None and not service.background_task.done()

    gate.set()
    await _drain(service)
    assert service.get_run(run.run_id).status == "completed"


# ----------------------------------------------------------------------
# Intégrité des records
# ----------------------------------------------------------------------


@pytest.mark.asyncio
async def test_corrupt_record_is_regenerated_not_counted_as_done(tmp_path: Path) -> None:
    """Un record tronqué laisserait un trou permanent dans la matrice."""
    calls: List[str] = []

    class _CountingOrchestrator(_FakeOrchestrator):
        async def generate_with_events(self, request: Any, check_cancelled: Any):
            calls.append(request.llm_model_identifier)
            async for event in super().generate_with_events(request, check_cancelled):
                yield event

    service = _service(tmp_path, orchestrator_factory=lambda rid: _CountingOrchestrator())
    suite = _suite(service._suite_store, case_ids=["cas-0", "cas-1"])
    run, _ = await service.start_run(_config(suite))
    await _drain(service)
    assert len(calls) == 2

    victim = sorted((service.run_dir(run.run_id) / "generations").glob("*.json"))[0]
    victim.write_text('{"run_id": "tronq', encoding="utf-8")

    service._persist_run(service.get_run(run.run_id).model_copy(update={"status": "failed"}))
    await service.resume_run(run.run_id)
    await _drain(service)

    assert len(calls) == 3, "la cellule corrompue doit être rejouée"
    assert len(service.list_generations(run.run_id)) == 2


@pytest.mark.asyncio
async def test_resume_replays_config_error_records(tmp_path: Path) -> None:
    """Corriger une clé API puis reprendre doit rejouer les cellules en erreur."""
    calls: List[str] = []

    class _CountingOrchestrator(_FakeOrchestrator):
        async def generate_with_events(self, request: Any, check_cancelled: Any):
            calls.append(request.llm_model_identifier)
            async for event in super().generate_with_events(request, check_cancelled):
                yield event

    service = _service(
        tmp_path,
        orchestrator_factory=lambda rid: _CountingOrchestrator(),
        usable_models=[MODEL_A],
    )
    suite = _suite(service._suite_store, case_ids=["cas-0"])
    run, _ = await service.start_run(_config(suite, models=[MODEL_A, MODEL_B]))
    await _drain(service)

    records = {record.model_id: record for record in service.list_generations(run.run_id)}
    assert records[MODEL_B].status == "config_error"
    assert calls == [MODEL_A]

    # La clé du second modèle est corrigée.
    service.diagnose_models = lambda models: [  # type: ignore[method-assign]
        BenchmarkModelDiagnostic(model_id=model_id, usable=True) for model_id in models
    ]
    service._persist_run(service.get_run(run.run_id).model_copy(update={"status": "failed"}))
    await service.resume_run(run.run_id)
    await _drain(service)

    records = {record.model_id: record for record in service.list_generations(run.run_id)}
    assert records[MODEL_B].status == "valid", "le modèle réparé doit être mesuré"
    assert calls == [MODEL_A, MODEL_B]


@pytest.mark.asyncio
async def test_slug_colliding_identifiers_keep_separate_records(tmp_path: Path) -> None:
    """Deux identifiants qui s'assainissent pareil ne doivent pas s'écraser."""
    service = _service(tmp_path)
    suite = _suite(service._suite_store, case_ids=["a/b", "a-b"])
    run, _ = await service.start_run(_config(suite))
    await _drain(service)

    records = service.list_generations(run.run_id)
    assert len(records) == 2
    assert {record.case_id for record in records} == {"a/b", "a-b"}


@pytest.mark.asyncio
async def test_invalid_run_id_is_rejected(tmp_path: Path) -> None:
    """Un `run_id` de traversée ne doit pas atteindre le système de fichiers."""
    service = _service(tmp_path)
    with pytest.raises(BenchmarkRunNotFoundError):
        service.get_run("..")


# ----------------------------------------------------------------------
# Fidélité de la mesure
# ----------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fallback_chain_is_neutralised_for_the_orchestrator(tmp_path: Path) -> None:
    """Le run doit mesurer le modèle demandé, jamais son remplaçant.

    `_FakeConfigService` déclare une chaîne de repli menée par MODEL_A : sans la
    substitution, l'orchestrateur créerait un client à repli.
    """
    seen: List[List[str]] = []

    class _ChainReadingOrchestrator(_FakeOrchestrator):
        async def generate_with_events(self, request: Any, check_cancelled: Any):
            seen.append(self.config_service.get_llm_fallback_chain())
            async for event in super().generate_with_events(request, check_cancelled):
                yield event

    service = _service(tmp_path, orchestrator_factory=lambda rid: _ChainReadingOrchestrator())
    suite = _suite(service._suite_store, case_ids=["cas-0"])
    await service.start_run(_config(suite, models=[MODEL_A]))
    await _drain(service)

    assert seen == [[]], "l'orchestrateur ne doit voir aucune chaîne de repli"


@pytest.mark.asyncio
async def test_incompatible_sampling_parameters_are_stripped(tmp_path: Path) -> None:
    """`top_p` figé dans un cas ferait répondre 400 aux tiers GPT-5.6."""
    seen: List[Optional[float]] = []

    class _ParamReadingOrchestrator(_FakeOrchestrator):
        async def generate_with_events(self, request: Any, check_cancelled: Any):
            seen.append(request.top_p)
            async for event in super().generate_with_events(request, check_cancelled):
                yield event

    service = _service(tmp_path, orchestrator_factory=lambda rid: _ParamReadingOrchestrator())
    store = service._suite_store
    suite = store.save_suite(
        BenchmarkSuite.model_validate(
            {
                "suite_id": "smoke",
                "cases": [
                    {
                        "case_id": "cas-0",
                        "request": {
                            "llm_model_identifier": MODEL_A,
                            "user_instructions": "Le marchand refuse.",
                            "context_selections": {"characters_full": ["Uresaïr"]},
                            "top_p": 0.9,
                        },
                    }
                ],
            }
        )
    )
    await service.start_run(_config(suite, models=[MODEL_A]))
    await _drain(service)

    assert seen == [None], "le paramètre non supporté doit être retiré"


@pytest.mark.asyncio
async def test_language_detector_is_recorded(tmp_path: Path) -> None:
    """Le détecteur voyage avec la note : deux machines ne le partagent pas forcément."""
    service = _service(tmp_path)
    suite = _suite(service._suite_store, case_ids=["cas-0"])
    run, _ = await service.start_run(_config(suite))
    await _drain(service)

    record = service.list_generations(run.run_id)[0]
    assert record.language_detector in {"langdetect", "lexical", "too_short"}


@pytest.mark.asyncio
async def test_case_expectations_are_enforced(tmp_path: Path) -> None:
    """Une attente déclarée doit contraindre la mesure, pas rester décorative."""
    service = _service(
        tmp_path,
        orchestrator_factory=lambda rid: _FakeOrchestrator(document=_unity_document(1)),
    )
    suite = _suite(
        service._suite_store,
        case_ids=["cas-0"],
        expectations=BenchmarkCaseExpectations(min_choices=3),
    )
    run, _ = await service.start_run(_config(suite))
    await _drain(service)

    record = service.list_generations(run.run_id)[0]
    assert record.status == "invalid"
    assert any("3 attendus au minimum" in failure.message for failure in record.gate_failures)


@pytest.mark.asyncio
async def test_cases_covered_excludes_fully_failed_cases(tmp_path: Path) -> None:
    """Un cas dont tout est `config_error` n'est pas couvert."""
    service = _service(tmp_path, usable_models=[MODEL_A])
    suite = _suite(service._suite_store, case_ids=["cas-0"])
    run, _ = await service.start_run(_config(suite, models=[MODEL_A, MODEL_B]))
    await _drain(service)

    final = service.get_run(run.run_id)
    assert final.cases_covered == 1
    assert final.generations_completed == 2
