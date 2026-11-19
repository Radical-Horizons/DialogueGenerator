"""Tests de la provenance nœud → appel LLM (``services/llm_call_provenance.py``)."""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from models.llm_usage import LLMUsageRecord
from services.llm_call_provenance import (
    capture_llm_calls,
    collect_node_provenance,
    link_nodes_to_calls,
    report_llm_call,
)
from services.llm_pricing_service import LLMPricingService
from services.llm_usage_service import LLMUsageService
from services.repositories.llm_usage_repository import FileLLMUsageRepository


def test_report_outside_capture_is_noop() -> None:
    """Un appel signalé hors capture ne lève rien et ne fuit dans aucune capture ultérieure."""
    report_llm_call("orphan")
    with capture_llm_calls() as calls:
        pass
    assert calls == []


def test_capture_collects_calls_in_order_and_restores_previous_sink() -> None:
    """La capture garde l'ordre des appels ; une capture imbriquée n'écrit pas dans l'externe."""
    with capture_llm_calls() as outer:
        report_llm_call("a")
        with capture_llm_calls() as inner:
            report_llm_call("b")
        report_llm_call("c")
    assert outer == ["a", "c"]
    assert inner == ["b"]


def test_link_is_noop_without_provenance_or_calls() -> None:
    """Sans table de provenance ou sans appel capturé, le lien ne fait rien."""
    link_nodes_to_calls(["node-1"], ["call-1"])
    with collect_node_provenance() as provenance:
        link_nodes_to_calls(["node-1"], [])
    assert provenance == {}


def test_link_uses_last_call() -> None:
    """Le nœud est relié au dernier appel capturé (relance réussie après échec)."""
    with collect_node_provenance() as provenance:
        link_nodes_to_calls(["node-1", "node-2"], ["first", "last"])
    assert provenance == {"node-1": "last", "node-2": "last"}


@pytest.mark.asyncio
async def test_parallel_tasks_get_distinct_links() -> None:
    """Deux tâches concurrentes, capture posée dans chacune ⇒ deux liens distincts."""

    async def produce(node_id: str, call_id: str, delay: float) -> None:
        with capture_llm_calls() as calls:
            await asyncio.sleep(delay)
            report_llm_call(call_id)
        link_nodes_to_calls([node_id], calls)

    with collect_node_provenance() as provenance:
        await asyncio.gather(
            produce("node-slow", "call-slow", 0.02),
            produce("node-fast", "call-fast", 0.0),
        )

    assert provenance == {"node-slow": "call-slow", "node-fast": "call-fast"}


@pytest.mark.asyncio
async def test_capture_before_gather_is_shared_by_tasks() -> None:
    """Garde-fou documenté : une capture posée avant ``gather`` est partagée par les tâches."""

    async def report(call_id: str) -> None:
        await asyncio.sleep(0)
        report_llm_call(call_id)

    with capture_llm_calls() as calls:
        await asyncio.gather(report("x"), report("y"))

    assert sorted(calls) == ["x", "y"]


@pytest.mark.asyncio
async def test_track_usage_reports_to_capture_in_concurrent_tasks(tmp_path: Path) -> None:
    """Le vrai ``LLMUsageService`` signale chaque appel réussi à la capture de sa tâche."""
    usage = LLMUsageService(
        repository=FileLLMUsageRepository(storage_dir=str(tmp_path)),
        pricing_service=LLMPricingService(),
    )

    async def generate(node_id: str, prompt: str, delay: float) -> None:
        with capture_llm_calls() as calls:
            await asyncio.sleep(delay)
            usage.track_usage(
                request_id="req-shared",
                model_name="gpt-6.2-sol",
                prompt_tokens=10,
                completion_tokens=5,
                total_tokens=15,
                duration_ms=1,
                success=True,
                endpoint="graph/generate-node",
                prompt=prompt,
                response="{}",
            )
        link_nodes_to_calls([node_id], calls)

    with collect_node_provenance() as provenance:
        await asyncio.gather(
            generate("node-a", "prompt A", 0.02),
            generate("node-b", "prompt B", 0.0),
        )

    record_a = usage.get_record_by_call_id(provenance["node-a"])
    record_b = usage.get_record_by_call_id(provenance["node-b"])
    assert isinstance(record_a, LLMUsageRecord) and isinstance(record_b, LLMUsageRecord)
    assert record_a.prompt == "prompt A"
    assert record_b.prompt == "prompt B"


def test_failed_call_is_not_reported(tmp_path: Path) -> None:
    """Un appel en échec est tracké mais n'est pas proposé comme provenance d'un nœud."""
    usage = LLMUsageService(
        repository=FileLLMUsageRepository(storage_dir=str(tmp_path)),
        pricing_service=LLMPricingService(),
    )
    with capture_llm_calls() as calls:
        call_id = usage.track_usage(
            request_id="req-fail",
            model_name="gpt-6.2-sol",
            prompt_tokens=0,
            completion_tokens=0,
            total_tokens=0,
            duration_ms=1,
            success=False,
            endpoint="graph/generate-node",
            error_message="boom",
        )
    assert call_id is not None
    assert calls == []
