"""Tests de `BenchmarkRunService.diagnose_models`.

Cette méthode décide si un modèle est mesurable. Les autres suites la remplacent
par un double pour se concentrer sur la boucle de run ; ici c'est le code réel
qui s'exécute — sans quoi le repli silencieux sur `DummyLLMClient`, précisément
ce que le diagnostic existe pour attraper, ne serait couvert par rien.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

import pytest

from core.llm.llm_client import DummyLLMClient
from services.benchmark_gate_service import BenchmarkGateService
from services.benchmark_run_service import BenchmarkRunService
from services.benchmark_suite_store import BenchmarkSuiteStore

WHITELISTED_MODEL = "gpt-5.6-luna"
OFF_WHITELIST_MODEL = "labs-mistral-small-creative"


class _RealClient:
    """Client LLM quelconque, distinct de `DummyLLMClient`."""


class _ConfigService:
    """Configuration LLM minimale."""

    def get_llm_config(self) -> Dict[str, Any]:
        return {"api_key_env_var": "OPENAI_API_KEY"}

    def get_available_llm_models(self) -> List[Dict[str, Any]]:
        return [{"api_identifier": WHITELISTED_MODEL, "client_type": "openai"}]


class _BrokenConfigService:
    """Configuration illisible (fichier absent, JSON cassé)."""

    def get_llm_config(self) -> Dict[str, Any]:
        raise OSError("llm_config.json illisible")

    def get_available_llm_models(self) -> List[Dict[str, Any]]:
        return []


def _service(tmp_path: Path, config_service: Any) -> BenchmarkRunService:
    """Moteur isolé, diagnostic réel conservé."""
    return BenchmarkRunService(
        suite_store=BenchmarkSuiteStore(suites_dir=tmp_path / "suites"),
        gate_service=BenchmarkGateService(flag_validation_service=None),
        pricing_service=object(),
        config_service=config_service,
        orchestrator_factory=lambda request_id: object(),
        runs_dir=tmp_path / "runs",
    )


def test_model_outside_unity_whitelist_is_unusable(tmp_path: Path) -> None:
    """Un modèle hors whitelist ne peut pas produire de structured output Unity."""
    service = _service(tmp_path, _ConfigService())
    diagnostics = service.diagnose_models([OFF_WHITELIST_MODEL])
    assert diagnostics[0].usable is False
    assert "whitelist" in (diagnostics[0].reason or "")


def test_silent_dummy_fallback_is_detected(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Clé API absente : la fabrique retombe sur `DummyLLMClient` sans rien dire.

    Sans ce diagnostic, le run noterait des générations factices comme si elles
    venaient du modèle testé.
    """
    from factories.llm_factory import LLMClientFactory

    monkeypatch.setattr(
        LLMClientFactory, "create_client", staticmethod(lambda **kwargs: DummyLLMClient())
    )
    service = _service(tmp_path, _ConfigService())
    diagnostics = service.diagnose_models([WHITELISTED_MODEL])
    assert diagnostics[0].usable is False
    assert "DummyLLMClient" in (diagnostics[0].reason or "")


def test_usable_model_is_reported_usable(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Un modèle whitelisté dont le client se crée réellement est utilisable."""
    from factories.llm_factory import LLMClientFactory

    monkeypatch.setattr(
        LLMClientFactory, "create_client", staticmethod(lambda **kwargs: _RealClient())
    )
    service = _service(tmp_path, _ConfigService())
    diagnostics = service.diagnose_models([WHITELISTED_MODEL])
    assert diagnostics[0].usable is True
    assert diagnostics[0].reason is None


def test_client_creation_failure_is_reported(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Une fabrique qui lève (OpenRouter sans clé) donne un modèle inutilisable."""
    from factories.llm_factory import LLMClientFactory

    def _raise(**kwargs: Any) -> Any:
        raise ValueError("OPENROUTER_API_KEY manquante")

    monkeypatch.setattr(LLMClientFactory, "create_client", staticmethod(_raise))
    service = _service(tmp_path, _ConfigService())
    diagnostics = service.diagnose_models([WHITELISTED_MODEL])
    assert diagnostics[0].usable is False
    assert "OPENROUTER_API_KEY" in (diagnostics[0].reason or "")


def test_unreadable_config_marks_every_model_unusable(tmp_path: Path) -> None:
    """Sans configuration LLM lisible, aucun modèle n'est mesurable — et on le dit."""
    service = _service(tmp_path, _BrokenConfigService())
    diagnostics = service.diagnose_models([WHITELISTED_MODEL, OFF_WHITELIST_MODEL])
    assert [d.usable for d in diagnostics] == [False, False]
    assert all("illisible" in (d.reason or "") for d in diagnostics)


def test_dummy_model_is_explicitly_allowed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Le modèle `dummy` reste utilisable : c'est le mode sans clé assumé du dépôt."""
    from factories.llm_factory import LLMClientFactory

    monkeypatch.setattr(
        LLMClientFactory, "create_client", staticmethod(lambda **kwargs: DummyLLMClient())
    )
    service = _service(tmp_path, _ConfigService())
    diagnostics = service.diagnose_models(["dummy"])
    assert diagnostics[0].usable is True
