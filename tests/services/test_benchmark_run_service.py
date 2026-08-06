"""Tests du moteur de run du mode benchmark.

Couvre les lignes « run nominal », « plafond budget », « reprise », « modèle mal
configuré » et « annulation » de la matrice I/O de la spécification. Aucun appel
LLM réel : l'orchestrateur est un double qui compte ses invocations, ce qui rend
vérifiable l'exigence « la reprise ne refait aucune génération ».
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional

import pytest

from api.schemas.benchmark import (
    BenchmarkRunConfig,
    BenchmarkSuite,
)
from services.benchmark_gate_service import BenchmarkGateService
from services.benchmark_run_service import (
    BenchmarkRunConflictError,
    BenchmarkRunNotFoundError,
    BenchmarkRunService,
    _NoFallbackConfigService,
)
from services.benchmark_suite_store import BenchmarkSuiteStore

MODEL_A = "gpt-5.6-luna"
MODEL_B = "gpt-5.6-terra"

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
                        },
                        {
                            "choiceId": "choice_node-1_1",
                            "text": "Proposer un troc à la place",
                            "targetNode": "END",
                        },
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


class _FakeOrchestrator:
    """Double d'orchestrateur : émet metadata puis complete, et compte ses appels."""

    def __init__(self, recorder: List[str], *, cost: float, json_content: Optional[str]) -> None:
        self.config_service = _FakeConfigService()
        self._recorder = recorder
        self._cost = cost
        self._json_content = json_content

    async def generate_with_events(
        self, request: Any, check_cancelled: Any
    ) -> AsyncGenerator[_Event, None]:
        """Émet la séquence d'événements d'une génération réussie."""
        self._recorder.append(request.llm_model_identifier)
        yield _Event("metadata", {"cost_usd": self._cost, "usage_prompt_tokens": 120,
                                  "usage_completion_tokens": 40})
        yield _Event(
            "complete",
            {
                "result": {
                    "json_content": self._json_content,
                    "title": "Marchandage",
                    "raw_prompt": "prompt figé",
                    "prompt_hash": "hash-1",
                }
            },
        )


class _FailingOrchestrator:
    """Double qui échoue comme un fournisseur refusant un paramètre."""

    def __init__(self, recorder: List[str]) -> None:
        self.config_service = _FakeConfigService()
        self._recorder = recorder

    async def generate_with_events(
        self, request: Any, check_cancelled: Any
    ) -> AsyncGenerator[_Event, None]:
        """Émet une erreur de protocole."""
        self._recorder.append(request.llm_model_identifier)
        yield _Event("error", {"message": "400 unsupported parameter: reasoning.effort"})


class _FakeConfigService:
    """Configuration LLM minimale, sans clé ni réseau."""

    def get_llm_config(self) -> Dict[str, Any]:
        return {"api_key_env_var": "OPENAI_API_KEY"}

    def get_available_llm_models(self) -> List[Dict[str, Any]]:
        return [
            {"api_identifier": MODEL_A, "client_type": "openai"},
            {"api_identifier": MODEL_B, "client_type": "openai"},
        ]

    def get_llm_fallback_chain(self) -> List[str]:
        return [MODEL_A, MODEL_B]


class _FakePricingService:
    """Tarification fictive, déterministe."""

    def get_model_pricing(self, model_name: str) -> Optional[Dict[str, float]]:
        return {"input_price_per_1M": 1.0, "output_price_per_1M": 2.0}

    def calculate_cost(self, model_name: str, prompt_tokens: int, completion_tokens: int) -> float:
        return prompt_tokens / 1_000_000 + completion_tokens * 2 / 1_000_000


def _suite(store: BenchmarkSuiteStore, case_count: int = 2) -> BenchmarkSuite:
    """Persiste une suite de `case_count` cas et la retourne."""
    cases = [
        {
            "case_id": f"cas-{index}",
            "title": f"Cas {index}",
            "categories": {"ton": "grave"},
            "request": {
                "llm_model_identifier": MODEL_A,
                "user_instructions": "Le marchand refuse de baisser son prix.",
                "context_selections": {"characters_full": ["Uresaïr"]},
            },
        }
        for index in range(case_count)
    ]
    suite = BenchmarkSuite.model_validate(
        {"suite_id": "smoke", "name": "Fumée", "cases": cases}
    )
    return store.save_suite(suite)


def _service(
    tmp_path: Path,
    *,
    orchestrator_factory: Any,
    usable_models: Optional[List[str]] = None,
) -> BenchmarkRunService:
    """Construit un moteur isolé, avec diagnostic de modèles forcé.

    Le diagnostic réel touche la fabrique de clients LLM (donc l'environnement) :
    on le remplace pour que le test porte sur la boucle de run, pas sur la présence
    d'une clé API.
    """
    store = BenchmarkSuiteStore(suites_dir=tmp_path / "suites")
    service = BenchmarkRunService(
        suite_store=store,
        gate_service=BenchmarkGateService(flag_validation_service=None),
        pricing_service=_FakePricingService(),
        config_service=_FakeConfigService(),
        orchestrator_factory=orchestrator_factory,
        runs_dir=tmp_path / "runs",
    )
    allowed = usable_models if usable_models is not None else [MODEL_A, MODEL_B]

    def _diagnose(models: List[str]) -> List[Any]:
        from api.schemas.benchmark import BenchmarkModelDiagnostic

        return [
            BenchmarkModelDiagnostic(
                model_id=model_id,
                usable=model_id in allowed,
                reason=None if model_id in allowed else "Clé API absente ou factice",
            )
            for model_id in models
        ]

    service.diagnose_models = _diagnose  # type: ignore[method-assign]
    return service


async def _drain(service: BenchmarkRunService) -> None:
    """Attend la fin de la tâche de fond du run."""
    task = service.background_task
    assert task is not None
    await task


@pytest.mark.asyncio
async def test_nominal_run_persists_every_generation(tmp_path: Path) -> None:
    """2 cas × 2 modèles × K=1 produit 4 générations valides et un run complet."""
    calls: List[str] = []
    service = _service(
        tmp_path,
        orchestrator_factory=lambda request_id: _FakeOrchestrator(
            calls, cost=0.001, json_content=_unity_document()
        ),
    )
    suite = _suite(service._suite_store, case_count=2)

    run, estimate = await service.start_run(
        BenchmarkRunConfig(
            suite_id=suite.suite_id,
            suite_version=suite.version,
            models=[MODEL_A, MODEL_B],
            repetitions=1,
            budget_cap_usd=1.0,
        )
    )
    await _drain(service)

    assert estimate.generations == 4
    records = service.list_generations(run.run_id)
    assert len(records) == 4
    assert {record.status for record in records} == {"valid"}
    final = service.get_run(run.run_id)
    assert final.status == "completed"
    assert final.cases_covered == 2
    assert final.spent_usd == pytest.approx(0.004)
    assert len(calls) == 4


@pytest.mark.asyncio
async def test_every_model_and_repetition_receives_the_same_prompt_seed(tmp_path: Path) -> None:
    """Un cas fixe la graine de contexte : tous les modèles voient le même prompt."""
    seeds: List[Optional[int]] = []

    class _SeedRecordingOrchestrator(_FakeOrchestrator):
        async def generate_with_events(self, request: Any, check_cancelled: Any):
            seeds.append(request.context_seed)
            async for event in super().generate_with_events(request, check_cancelled):
                yield event

    service = _service(
        tmp_path,
        orchestrator_factory=lambda request_id: _SeedRecordingOrchestrator(
            [], cost=0.0, json_content=_unity_document()
        ),
    )
    suite = _suite(service._suite_store, case_count=1)

    await service.start_run(
        BenchmarkRunConfig(
            suite_id=suite.suite_id,
            models=[MODEL_A, MODEL_B],
            repetitions=2,
            budget_cap_usd=1.0,
        )
    )
    await _drain(service)

    assert len(seeds) == 4
    assert len(set(seeds)) == 1
    assert seeds[0] is not None


@pytest.mark.asyncio
async def test_budget_cap_stops_run_and_keeps_partial_results(tmp_path: Path) -> None:
    """Le plafond interrompt proprement le run sans perdre ce qui est produit."""
    calls: List[str] = []
    service = _service(
        tmp_path,
        orchestrator_factory=lambda request_id: _FakeOrchestrator(
            calls, cost=0.5, json_content=_unity_document()
        ),
    )
    suite = _suite(service._suite_store, case_count=3)

    run, _ = await service.start_run(
        BenchmarkRunConfig(
            suite_id=suite.suite_id,
            models=[MODEL_A],
            repetitions=1,
            budget_cap_usd=0.75,
        )
    )
    await _drain(service)

    final = service.get_run(run.run_id)
    assert final.status == "interrupted_budget"
    records = service.list_generations(run.run_id)
    assert len(records) == 2, "deux générations avant que le cumul atteigne le plafond"
    assert final.cases_covered == 2
    assert "Plafond budgétaire atteint" in final.message


@pytest.mark.asyncio
async def test_resume_does_not_regenerate_existing_results(tmp_path: Path) -> None:
    """Reprendre un run interrompu ne rejoue aucune génération déjà produite."""
    calls: List[str] = []
    service = _service(
        tmp_path,
        orchestrator_factory=lambda request_id: _FakeOrchestrator(
            calls, cost=0.5, json_content=_unity_document()
        ),
    )
    suite = _suite(service._suite_store, case_count=3)

    run, _ = await service.start_run(
        BenchmarkRunConfig(
            suite_id=suite.suite_id,
            models=[MODEL_A],
            repetitions=1,
            budget_cap_usd=0.75,
        )
    )
    await _drain(service)
    calls_before_resume = len(calls)
    assert calls_before_resume == 2

    # Plafond relevé : la reprise doit ne produire que le cas manquant.
    resumed = service.get_run(run.run_id)
    raised_config = resumed.config.model_copy(update={"budget_cap_usd": 10.0})
    service._persist_run(resumed.model_copy(update={"config": raised_config}))

    await service.resume_run(run.run_id)
    await _drain(service)

    assert len(calls) == calls_before_resume + 1, "un seul cas restait à produire"
    final = service.get_run(run.run_id)
    assert final.status == "completed"
    assert len(service.list_generations(run.run_id)) == 3


@pytest.mark.asyncio
async def test_resume_refuses_when_suite_changed(tmp_path: Path) -> None:
    """Une suite modifiée depuis le run rend la reprise incomparable : refus."""
    service = _service(
        tmp_path,
        orchestrator_factory=lambda request_id: _FakeOrchestrator(
            [], cost=0.5, json_content=_unity_document()
        ),
    )
    suite = _suite(service._suite_store, case_count=3)
    run, _ = await service.start_run(
        BenchmarkRunConfig(
            suite_id=suite.suite_id,
            models=[MODEL_A],
            repetitions=1,
            budget_cap_usd=0.75,
        )
    )
    await _drain(service)

    stored = service._suite_store.get_suite(suite.suite_id)
    tampered = stored.model_copy(update={"cases": stored.cases[:2]})
    service._suite_store.save_suite(tampered, bump_version=False)

    with pytest.raises(BenchmarkRunConflictError, match="a changé depuis le run"):
        await service.resume_run(run.run_id)


@pytest.mark.asyncio
async def test_unusable_model_yields_config_error_without_blocking_others(
    tmp_path: Path,
) -> None:
    """Un modèle sans clé est signalé `config_error` et n'affecte pas les autres."""
    calls: List[str] = []
    service = _service(
        tmp_path,
        orchestrator_factory=lambda request_id: _FakeOrchestrator(
            calls, cost=0.001, json_content=_unity_document()
        ),
        usable_models=[MODEL_A],
    )
    suite = _suite(service._suite_store, case_count=1)

    run, _ = await service.start_run(
        BenchmarkRunConfig(
            suite_id=suite.suite_id,
            models=[MODEL_A, MODEL_B],
            repetitions=1,
            budget_cap_usd=1.0,
        )
    )
    await _drain(service)

    records = {record.model_id: record for record in service.list_generations(run.run_id)}
    assert records[MODEL_A].status == "valid"
    assert records[MODEL_B].status == "config_error"
    assert "Clé API absente" in (records[MODEL_B].error_message or "")
    assert calls == [MODEL_A], "aucun appel LLM pour le modèle inutilisable"


@pytest.mark.asyncio
async def test_provider_error_is_config_error_not_a_zero_score(tmp_path: Path) -> None:
    """Un refus de protocole n'est jamais noté : il est classé `config_error`."""
    calls: List[str] = []
    service = _service(
        tmp_path,
        orchestrator_factory=lambda request_id: _FailingOrchestrator(calls),
    )
    suite = _suite(service._suite_store, case_count=1)

    run, _ = await service.start_run(
        BenchmarkRunConfig(
            suite_id=suite.suite_id,
            models=[MODEL_A],
            repetitions=1,
            budget_cap_usd=1.0,
        )
    )
    await _drain(service)

    record = service.list_generations(run.run_id)[0]
    assert record.status == "config_error"
    assert "unsupported parameter" in (record.error_message or "")
    assert record.gate_failures == []


@pytest.mark.asyncio
async def test_english_generation_is_invalid_not_scored(tmp_path: Path) -> None:
    """Une sortie anglaise est `invalid` avec sa raison, pas un score plancher."""
    english = json.dumps(
        {
            "schemaVersion": "1.1.0",
            "nodes": [
                {
                    "id": "node-1",
                    "displayName": "Haggling",
                    "speaker": "Uresaïr",
                    "line": (
                        "I do not trust you, merchant: you sell promises and you keep the "
                        "coins. Tell me what you really want and do not waste my time."
                    ),
                    "choices": [
                        {
                            "choiceId": "choice_node-1_0",
                            "text": "Walk away without another word",
                            "targetNode": "END",
                        }
                    ],
                }
            ],
        },
        ensure_ascii=False,
    )
    service = _service(
        tmp_path,
        orchestrator_factory=lambda request_id: _FakeOrchestrator(
            [], cost=0.0, json_content=english
        ),
    )
    suite = _suite(service._suite_store, case_count=1)

    run, _ = await service.start_run(
        BenchmarkRunConfig(
            suite_id=suite.suite_id,
            models=[MODEL_A],
            repetitions=1,
            budget_cap_usd=1.0,
        )
    )
    await _drain(service)

    record = service.list_generations(run.run_id)[0]
    assert record.status == "invalid"
    assert "language" in {failure.gate for failure in record.gate_failures}


@pytest.mark.asyncio
async def test_cancel_keeps_partial_results(tmp_path: Path) -> None:
    """L'annulation arrête le run en conservant les résultats déjà produits."""
    calls: List[str] = []

    class _SlowOrchestrator(_FakeOrchestrator):
        async def generate_with_events(self, request: Any, check_cancelled: Any):
            await asyncio.sleep(0.01)
            async for event in super().generate_with_events(request, check_cancelled):
                yield event

    service = _service(
        tmp_path,
        orchestrator_factory=lambda request_id: _SlowOrchestrator(
            calls, cost=0.0, json_content=_unity_document()
        ),
    )
    suite = _suite(service._suite_store, case_count=8)

    run, _ = await service.start_run(
        BenchmarkRunConfig(
            suite_id=suite.suite_id,
            models=[MODEL_A],
            repetitions=1,
            budget_cap_usd=10.0,
        )
    )
    await asyncio.sleep(0.03)
    assert service.request_cancel() is True
    await _drain(service)

    final = service.get_run(run.run_id)
    assert final.status == "cancelled"
    assert 0 < len(service.list_generations(run.run_id)) < 8
    assert final.generations_completed == len(service.list_generations(run.run_id))


@pytest.mark.asyncio
async def test_progress_is_readable_and_reset_after_run(tmp_path: Path) -> None:
    """La progression reflète l'état final et redevient inactive."""
    service = _service(
        tmp_path,
        orchestrator_factory=lambda request_id: _FakeOrchestrator(
            [], cost=0.002, json_content=_unity_document()
        ),
    )
    suite = _suite(service._suite_store, case_count=1)
    run, _ = await service.start_run(
        BenchmarkRunConfig(
            suite_id=suite.suite_id,
            models=[MODEL_A],
            repetitions=2,
            budget_cap_usd=1.0,
        )
    )
    await _drain(service)

    progress = service.read_progress()
    assert progress.active is False
    assert progress.run_id == run.run_id
    assert progress.generations_completed == 2
    assert progress.spent_usd == pytest.approx(0.004)


@pytest.mark.asyncio
async def test_missing_run_raises_not_found(tmp_path: Path) -> None:
    """Un run inexistant échoue explicitement plutôt que de renvoyer un état vide."""
    service = _service(
        tmp_path,
        orchestrator_factory=lambda request_id: _FakeOrchestrator(
            [], cost=0.0, json_content=_unity_document()
        ),
    )
    with pytest.raises(BenchmarkRunNotFoundError):
        service.get_run("inexistant")


def test_no_fallback_proxy_neutralises_chain_and_delegates_rest() -> None:
    """Le proxy coupe la chaîne de repli sans masquer le reste de la config."""
    proxy = _NoFallbackConfigService(_FakeConfigService())
    assert proxy.get_llm_fallback_chain() == []
    assert proxy.get_llm_config() == {"api_key_env_var": "OPENAI_API_KEY"}


def test_cost_estimate_reports_unpriced_models(tmp_path: Path) -> None:
    """Un modèle sans tarif est listé, jamais compté à zéro."""

    class _NoPricing(_FakePricingService):
        def get_model_pricing(self, model_name: str) -> Optional[Dict[str, float]]:
            return None if model_name == MODEL_B else {"input_price_per_1M": 1.0}

    service = _service(
        tmp_path,
        orchestrator_factory=lambda request_id: _FakeOrchestrator(
            [], cost=0.0, json_content=_unity_document()
        ),
    )
    service._pricing_service = _NoPricing()
    suite = _suite(service._suite_store, case_count=2)

    estimate = service.estimate_cost(
        suite,
        BenchmarkRunConfig(
            suite_id=suite.suite_id,
            models=[MODEL_A, MODEL_B],
            repetitions=3,
            budget_cap_usd=1.0,
        ),
    )
    assert estimate.generations == 12
    assert estimate.unpriced_models == [MODEL_B]
    assert estimate.estimated_min_usd < estimate.estimated_max_usd


def test_narration_mode_reaches_the_case_instructions(tmp_path: Path) -> None:
    """Le mode du run s'ajoute à la consigne, sans effacer celle du cas.

    Le mode déplace la cible commune à tous les modèles ; il n'avantage personne
    tant qu'il s'applique identiquement, mais il doit effectivement arriver au
    modèle, sinon les deux runs mesurent la même chose.
    """
    service = _service(tmp_path, orchestrator_factory=lambda request_id: None)
    case = _suite(service._suite_store, case_count=1).cases[0]

    sans = service._build_request(case, MODEL_A, "sans")
    avec = service._build_request(case, MODEL_A, "avec")

    assert case.request.user_instructions in sans.user_instructions
    assert case.request.user_instructions in avec.user_instructions
    assert "SANS didascalies" in sans.user_instructions
    assert "AVEC didascalies" in avec.user_instructions
    assert sans.user_instructions != avec.user_instructions


def test_narration_mode_does_not_vary_between_models(tmp_path: Path) -> None:
    """Deux modèles d'un même run reçoivent exactement la même consigne."""
    service = _service(tmp_path, orchestrator_factory=lambda request_id: None)
    case = _suite(service._suite_store, case_count=1).cases[0]

    first = service._build_request(case, MODEL_A, "avec")
    second = service._build_request(case, MODEL_B, "avec")

    assert first.user_instructions == second.user_instructions
    assert first.context_seed == second.context_seed


@pytest.mark.asyncio
async def test_narration_mode_enters_the_run_identity(tmp_path: Path) -> None:
    """L'identité du run porte le mode : deux modes ne s'agrègent pas.

    Sans cette trace, un rapport moyennerait des générations qui ne répondaient
    pas à la même demande.
    """
    service = _service(
        tmp_path,
        orchestrator_factory=lambda request_id: _FakeOrchestrator(
            [], cost=0.001, json_content=_unity_document()
        ),
    )
    suite = _suite(service._suite_store, case_count=1)

    run, _ = await service.start_run(
        BenchmarkRunConfig(
            suite_id=suite.suite_id,
            models=[MODEL_A],
            repetitions=1,
            budget_cap_usd=1.0,
            narration_mode="avec",
        )
    )
    await _drain(service)

    assert run.identity.narration_mode == "avec"
    assert service.get_run(run.run_id).identity.narration_mode == "avec"


def test_default_narration_mode_is_without_didascalies() -> None:
    """Le défaut suit le cas privilégié du produit : dialogue sans didascalies."""
    config = BenchmarkRunConfig(suite_id="s", models=[MODEL_A], budget_cap_usd=1.0)
    assert config.narration_mode == "sans"
