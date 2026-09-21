"""Une sortie non conforme est un échec du modèle, pas de l'environnement.

Régression du run réel `20260808T214145-0b3b2f22` : deux modèles avaient rendu
des fragments d'un seul panneau (schéma : minimum 2) et des réponses vides. Tout
avait été rangé en ``config_error``, donc **sorti du dénominateur du taux de
validité** — un modèle qui manquait 2 cas sur 3 s'affichait « 100 % ».

La distinction tient en une phrase : le modèle a-t-il été mesuré ? S'il a
répondu quelque chose d'inexploitable, oui — c'est ``invalid``. Si la clé
manquait ou l'API était injoignable, non — c'est ``config_error``.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional

import pytest

from api.schemas.benchmark import (
    BenchmarkCase,
    BenchmarkRun,
    BenchmarkRunConfig,
    BenchmarkRunIdentity,
)
from services.benchmark_gate_service import BenchmarkGateService
from services.benchmark_run_service import BenchmarkRunService
from services.benchmark_suite_store import BenchmarkSuiteStore
from services.unity_dialogue_generation_service import UnityStructuredOutputError

from tests.services.benchmark_fixtures import (
    MODEL,
    _Event,
    _EventOrchestrator,
    _FakeConfigService,
    _FakePricingService,
    _RaisingOrchestrator,
    _case,
    _run,
    _service,
)

@pytest.mark.asyncio
async def test_non_conforming_output_counts_against_the_model(tmp_path: Path) -> None:
    """Un fragment hors schéma est `invalid` : le modèle a été mesuré."""
    service = _service(tmp_path, _EventOrchestrator("model_output"))
    record = await service._generate_one(
        run=_run(), case=_case(), model_id=MODEL, repetition=0
    )

    assert record.status == "invalid"
    assert [failure.gate for failure in record.gate_failures] == ["schema"]
    assert "non conforme" in (record.error_message or "")


@pytest.mark.asyncio
async def test_environment_failure_stays_config_error(tmp_path: Path) -> None:
    """Une panne d'environnement ne s'impute pas au modèle."""
    service = _service(tmp_path, _EventOrchestrator("runtime"))
    record = await service._generate_one(
        run=_run(), case=_case(), model_id=MODEL, repetition=0
    )

    assert record.status == "config_error"
    assert record.gate_failures == []


@pytest.mark.asyncio
async def test_structured_output_exception_is_imputed_to_the_model(tmp_path: Path) -> None:
    """L'exception typée suffit, même sans événement d'erreur.

    Le chemin non-streamé lève avant d'émettre quoi que ce soit : sans ce
    rattrapage, la classification retomberait sur `config_error`.
    """
    service = _service(
        tmp_path,
        _RaisingOrchestrator(UnityStructuredOutputError("fragment d'un seul panneau")),
    )
    record = await service._generate_one(
        run=_run(), case=_case(), model_id=MODEL, repetition=0
    )

    assert record.status == "invalid"
    assert [failure.gate for failure in record.gate_failures] == ["schema"]


@pytest.mark.asyncio
async def test_unexpected_exception_is_not_blamed_on_the_model(tmp_path: Path) -> None:
    """Une panne réseau ne doit pas faire chuter un taux de validité."""
    service = _service(tmp_path, _RaisingOrchestrator(ConnectionError("API injoignable")))
    record = await service._generate_one(
        run=_run(), case=_case(), model_id=MODEL, repetition=0
    )

    assert record.status == "config_error"
    assert record.gate_failures == []


class _RateLimitedClient:
    """Client dont le fournisseur a refusé l'appel : rien n'a été facturé."""

    model_name = MODEL
    last_usage_prompt_tokens = 0
    last_usage_completion_tokens = 0
    last_call_cost = 0.0
    last_finish_reason = None

    async def generate_variants(self, **kwargs: Any) -> List[str]:
        """Rend l'erreur du relais, telle que les clients la remontent."""
        return [
            "Erreur API: OpenRouter API unavailable: Error code: 429 - "
            "{'error': {'message': 'Provider returned error'}}"
        ]


class _EmptyAnswerClient(_RateLimitedClient):
    """Client dont le modèle a bien répondu, mais n'importe quoi."""

    last_usage_prompt_tokens = 18_000
    last_usage_completion_tokens = 12

    async def generate_variants(self, **kwargs: Any) -> List[str]:
        """Rend une chaîne libre là où un fragment était attendu."""
        return ["Je ne peux pas produire ce dialogue."]


@pytest.mark.asyncio
async def test_rate_limited_provider_is_not_blamed_on_the_model() -> None:
    """Un 429 n'est pas une faute d'écriture : le modèle n'a pas été mesuré.

    Constaté le 2026-09-21 : `mistral-small-2603` saturé par OpenRouter
    s'affichait `invalid` avec une porte `schema` — son taux de validité
    chutait pour une saturation d'API. Symétrique exact de l'erreur d'août.
    """
    from services.unity_dialogue_generation_service import (
        UnityDialogueGenerationService,
        UnityProviderUnavailableError,
    )

    with pytest.raises(UnityProviderUnavailableError):
        await UnityDialogueGenerationService().generate_dialogue_fragment(
            llm_client=_RateLimitedClient(), prompt="Écris le fragment."
        )


@pytest.mark.asyncio
async def test_an_answered_but_unusable_call_stays_the_model_s_fault() -> None:
    """Le modèle a lu le prompt et mal répondu : il a été mesuré, il compte."""
    from services.unity_dialogue_generation_service import (
        UnityDialogueGenerationService,
    )

    with pytest.raises(UnityStructuredOutputError):
        await UnityDialogueGenerationService().generate_dialogue_fragment(
            llm_client=_EmptyAnswerClient(), prompt="Écris le fragment."
        )
