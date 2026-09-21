"""Briques communes aux tests du moteur de run de benchmark.

Extraites de `test_benchmark_failure_classification.py`, où plusieurs autres
fichiers allaient les chercher : un renommage là-bas cassait ici, sans qu'aucun
des deux fichiers ne mentionne l'autre.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pathlib import Path

from api.schemas.benchmark import (
    BenchmarkCase,
    BenchmarkRun,
    BenchmarkRunConfig,
    BenchmarkRunIdentity,
)
from services.benchmark_gate_service import BenchmarkGateService
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


class _EventOrchestrator:
    """Orchestrateur émettant un événement d'erreur étiqueté."""

    def __init__(self, error_kind: str) -> None:
        self.config_service = _FakeConfigService()
        self._error_kind = error_kind

    async def generate_with_events(
        self, request: Any, check_cancelled: Any
    ) -> AsyncGenerator[_Event, None]:
        """Émet une erreur portant sa nature."""
        yield _Event(
            "error",
            {
                "message": "Le modèle a produit un fragment non conforme au schéma.",
                "error_kind": self._error_kind,
            },
        )


class _RaisingOrchestrator:
    """Orchestrateur qui lève, sans passer par un événement."""

    def __init__(self, exception: Exception) -> None:
        self.config_service = _FakeConfigService()
        self._exception = exception

    async def generate_with_events(
        self, request: Any, check_cancelled: Any
    ) -> AsyncGenerator[_Event, None]:
        """Lève avant tout événement."""
        raise self._exception
        yield  # pragma: no cover — rend la fonction génératrice


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


def _service(tmp_path: Path, orchestrator: Any) -> BenchmarkRunService:
    """Moteur de run câblé sur un orchestrateur donné."""
    return BenchmarkRunService(
        suite_store=BenchmarkSuiteStore(suites_dir=tmp_path / "suites"),
        gate_service=BenchmarkGateService(flag_validation_service=None),
        pricing_service=_FakePricingService(),
        config_service=_FakeConfigService(),
        orchestrator_factory=lambda request_id: orchestrator,
        runs_dir=tmp_path / "runs",
    )
