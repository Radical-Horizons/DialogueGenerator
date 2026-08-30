"""Un échec doit être imputable : coupé par nous, ou raté par le modèle ?

Le banc du 2026-08-08 a produit cinq échecs à « 0 token, 0 $ », dont deux
fragments d'un seul panneau **dont les choix pointaient vers des panneaux jamais
écrits** — la signature d'une génération interrompue. Rien dans le harnais ne
permettait de le prouver : la raison d'arrêt n'était lue nulle part, et une
conclusion sur le modèle restait une opinion.

La raison d'arrêt voyage donc de l'API jusqu'au rapport, et surtout sur le
chemin d'échec, seul endroit où elle change une conclusion.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional

import pytest

from api.schemas.benchmark import (
    BenchmarkCase,
    BenchmarkGenerationRecord,
    BenchmarkRun,
    BenchmarkRunConfig,
    BenchmarkRunIdentity,
)
from services.benchmark_gate_service import BenchmarkGateService
from services.benchmark_report_service import BenchmarkReportService
from services.benchmark_run_service import BenchmarkRunService
from services.benchmark_suite_store import BenchmarkSuiteStore

MODEL = "mistralai/mistral-medium-3-5"


class _FakeConfigService:
    """Configuration LLM minimale."""

    def get_llm_config(self) -> Dict[str, Any]:
        return {}

    def get_available_llm_models(self) -> List[Dict[str, Any]]:
        return [{"api_identifier": MODEL, "client_type": "openrouter"}]

    def get_llm_fallback_chain(self) -> List[str]:
        return []


class _FakePricingService:
    """Tarification fictive."""

    def get_model_pricing(self, model_name: str) -> Optional[Dict[str, float]]:
        return {"input_price_per_1M": 1.5, "output_price_per_1M": 7.5}

    def calculate_cost(self, model_name: str, prompt_tokens: int, completion_tokens: int) -> float:
        return 0.0001


class _Event:
    """Événement de génération, calqué sur ``GenerationEvent``."""

    def __init__(self, type: str, data: Dict[str, Any]) -> None:
        self.type = type
        self.data = data


class _TruncatedOrchestrator:
    """Orchestrateur dont l'appel a été coupé par le plafond de complétion."""

    def __init__(self) -> None:
        self.config_service = _FakeConfigService()

    async def generate_with_events(
        self, request: Any, check_cancelled: Any
    ) -> AsyncGenerator[_Event, None]:
        """Émet l'échec tel que l'orchestrateur le rapporte réellement."""
        yield _Event(
            "error",
            {
                "message": "Le modèle n'a pas retourné de structured output exploitable.",
                "error_kind": "model_output",
                "cost_usd": 0.0042,
                "usage_prompt_tokens": 9000,
                "usage_completion_tokens": 6000,
                "finish_reason": "length",
            },
        )


def _case() -> BenchmarkCase:
    """Cas de benchmark minimal."""
    return BenchmarkCase.model_validate(
        {
            "case_id": "voknir-premiere-rencontre",
            "title": "Première rencontre",
            "request": {
                "llm_model_identifier": MODEL,
                "user_instructions": "Écris le fragment d'ouverture.",
                "context_selections": {"characters_full": ["Uresaïr"]},
            },
        }
    )


def _run() -> BenchmarkRun:
    """Run persistable minimal."""
    config = BenchmarkRunConfig(
        suite_id="alteir-smoke", models=[MODEL], repetitions=1, budget_cap_usd=1.0
    )
    return BenchmarkRun(
        run_id="run-test",
        config=config,
        identity=BenchmarkRunIdentity(
            suite_id="alteir-smoke",
            suite_version=1,
            suite_fingerprint="abc",
            models=[MODEL],
            repetitions=1,
            narration_mode="sans",
        ),
        status="running",
    )


def _service(tmp_path: Path) -> BenchmarkRunService:
    """Moteur de run câblé sur un orchestrateur tronqué."""
    return BenchmarkRunService(
        suite_store=BenchmarkSuiteStore(suites_dir=tmp_path / "suites"),
        gate_service=BenchmarkGateService(flag_validation_service=None),
        pricing_service=_FakePricingService(),
        config_service=_FakeConfigService(),
        orchestrator_factory=lambda request_id: _TruncatedOrchestrator(),
        runs_dir=tmp_path / "runs",
    )


@pytest.mark.asyncio
async def test_truncation_is_recorded_on_the_failed_generation(tmp_path: Path) -> None:
    """Sans cette valeur, l'échec reste indiscernable d'une mauvaise écriture."""
    record = await _service(tmp_path)._generate_one(
        run=_run(), case=_case(), model_id=MODEL, repetition=0
    )

    assert record.finish_reason == "length"
    assert record.status == "invalid"


@pytest.mark.asyncio
async def test_a_failed_call_still_reports_what_it_spent(tmp_path: Path) -> None:
    """« 0 token, 0 $ » sur une génération payée fausse le plafond budgétaire."""
    record = await _service(tmp_path)._generate_one(
        run=_run(), case=_case(), model_id=MODEL, repetition=0
    )

    assert record.cost_usd == pytest.approx(0.0042)
    assert record.prompt_tokens == 9000
    assert record.completion_tokens == 6000


def _record(**overrides: Any) -> BenchmarkGenerationRecord:
    """Enregistrement de génération minimal."""
    payload: Dict[str, Any] = {
        "run_id": "run-test",
        "case_id": "voknir-premiere-rencontre",
        "model_id": MODEL,
        "repetition": 0,
        "status": "invalid",
    }
    payload.update(overrides)
    return BenchmarkGenerationRecord.model_validate(payload)


def test_report_counts_truncations_per_model() -> None:
    """Un compte non nul invalide la comparaison plutôt qu'il ne condamne le modèle."""
    validity = BenchmarkReportService._model_validity(
        [MODEL],
        [
            _record(finish_reason="length"),
            _record(repetition=1, finish_reason="length"),
            _record(repetition=2, status="valid", finish_reason="stop"),
        ],
    )

    assert validity[0].truncated == 2
    assert validity[0].generations == 3


def test_missing_reason_is_never_counted_as_truncation() -> None:
    """`None` veut dire « on ne sait pas » : l'inventer serait le bug d'origine."""
    validity = BenchmarkReportService._model_validity([MODEL], [_record(finish_reason=None)])

    assert validity[0].truncated == 0
