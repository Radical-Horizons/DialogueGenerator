"""Tests de l'extraction de trace rejouable depuis un record d'usage LLM."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any, Optional

import pytest

from core.llm.openai.client import STRUCTURED_OUTPUT_INSTRUCTION_SUFFIX
from models.llm_usage import LLMUsageRecord
from services.generation_trace import (
    GenerationTraceUnavailableError,
    extract_reasoning_summary,
    parse_generation_trace,
)

NODE_ARGUMENTS = json.dumps(
    {"title": "Titre", "node": {"displayName": "Accueil", "line": "Bienvenue, voyageur."}},
    ensure_ascii=False,
)


def _record(prompt: Optional[str], response: Optional[str], *, success: bool = True) -> LLMUsageRecord:
    """Record minimal d'un appel de génération."""
    return LLMUsageRecord(
        request_id="req-1",
        call_id="call-1",
        timestamp=datetime(2026, 11, 19, 10, 0, tzinfo=UTC),
        model_name="gpt-6.2-sol",
        prompt_tokens=10,
        completion_tokens=5,
        total_tokens=15,
        estimated_cost=0.0,
        duration_ms=1,
        success=success,
        endpoint="graph/generate-node",
        prompt=prompt,
        response=response,
    )


def _openai_prompt(instructions: str, messages: list[dict[str, Any]]) -> str:
    """Prompt tracké par le client OpenAI (instructions + marqueur + messages JSON)."""
    return f"{instructions}\n\n--- Input ---\n{json.dumps(messages, ensure_ascii=False)}"


def test_openai_responses_function_call_with_reasoning_summary() -> None:
    """Format Responses : arguments de l'appel de fonction, résumés joints, suffixe retiré."""
    prompt = _openai_prompt(
        "Tu es scénariste." + STRUCTURED_OUTPUT_INSTRUCTION_SUFFIX,
        [
            {"role": "assistant", "content": "Réplique précédente\nsur deux lignes"},
            {"role": "user", "content": "Écris la suite."},
        ],
    )
    response = json.dumps(
        {
            "id": "resp_1",
            "reasoning": {"effort": None, "summary": "auto"},
            "output": [
                {
                    "type": "reasoning",
                    "encrypted_content": "chiffré",
                    "summary": [
                        {"type": "summary_text", "text": "J'ai choisi un ton chaleureux."},
                        {"type": "summary_text", "text": "Puis une question ouverte."},
                    ],
                },
                {
                    "type": "function_call",
                    "name": "generate_interaction",
                    "arguments": NODE_ARGUMENTS,
                },
            ],
        }
    )

    trace = parse_generation_trace(_record(prompt, response))

    assert trace.instructions == "Tu es scénariste."
    assert trace.input_messages == [
        {"role": "assistant", "content": "Réplique précédente\nsur deux lignes"},
        {"role": "user", "content": "Écris la suite."},
    ]
    assert trace.output_text == NODE_ARGUMENTS
    assert trace.reasoning_summary == "J'ai choisi un ton chaleureux.\n\nPuis une question ouverte."
    assert trace.model_name == "gpt-6.2-sol"
    assert trace.call_id == "call-1"
    assert trace.request_id == "req-1"


def test_openai_responses_text_output_without_summary() -> None:
    """Format Responses sans appel de fonction : texte ``output_text`` ; pas de résumé ⇒ None."""
    response = json.dumps(
        {
            "output": [
                {"type": "reasoning", "summary": []},
                {
                    "type": "message",
                    "role": "assistant",
                    "content": [{"type": "output_text", "text": "Réponse libre."}],
                },
            ]
        }
    )
    trace = parse_generation_trace(_record(_openai_prompt("Instr", []), response))
    assert trace.output_text == "Réponse libre."
    assert trace.reasoning_summary is None


def test_chat_completions_tool_call_extracts_system() -> None:
    """Format Chat Completions : système extrait des messages, arguments de l'outil en sortie."""
    prompt = json.dumps(
        [
            {"role": "system", "content": "Système." + STRUCTURED_OUTPUT_INSTRUCTION_SUFFIX},
            {"role": "user", "content": "Génère."},
        ],
        ensure_ascii=False,
    )
    response = json.dumps(
        {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [
                            {"function": {"name": "generate_interaction", "arguments": NODE_ARGUMENTS}}
                        ],
                    }
                }
            ]
        }
    )
    trace = parse_generation_trace(_record(prompt, response))
    assert trace.instructions == "Système."
    assert trace.input_messages == [{"role": "user", "content": "Génère."}]
    assert trace.output_text == NODE_ARGUMENTS
    assert trace.reasoning_summary is None


def test_chat_completions_dict_arguments_and_content_fallback() -> None:
    """Arguments en dict (Mistral) sérialisés ; sans outil, le contenu du message fait foi."""
    prompt = json.dumps([{"role": "system", "content": "S"}, {"role": "user", "content": "U"}])
    with_dict = json.dumps(
        {"choices": [{"message": {"tool_calls": [{"function": {"arguments": {"a": "é"}}}]}}]}
    )
    assert parse_generation_trace(_record(prompt, with_dict)).output_text == '{"a": "é"}'

    with_content = json.dumps(
        {"choices": [{"message": {"content": [{"type": "text", "text": "Bonjour"}]}}]}
    )
    assert parse_generation_trace(_record(prompt, with_content)).output_text == "Bonjour"


def test_plain_text_prompt_and_response() -> None:
    """Texte brut : prompt rejoué comme message utilisateur, réponse telle quelle."""
    trace = parse_generation_trace(_record("Prompt libre", '{"line": "brut", "choices": []}'))
    assert trace.instructions == ""
    assert trace.input_messages == [{"role": "user", "content": "Prompt libre"}]
    assert trace.output_text == '{"line": "brut", "choices": []}'


@pytest.mark.parametrize(
    ("prompt", "response", "success"),
    [
        ("p", "r", False),
        (None, "r", True),
        ("p", None, True),
        ("p", json.dumps({"output": [{"type": "reasoning", "summary": []}]}), True),
        ("p", "   ", True),
    ],
)
def test_unavailable_trace_raises(prompt: Optional[str], response: Optional[str], success: bool) -> None:
    """Échec, prompt ou réponse absents, sortie vide ⇒ GenerationTraceUnavailableError."""
    with pytest.raises(GenerationTraceUnavailableError):
        parse_generation_trace(_record(prompt, response, success=success))


def test_extract_reasoning_summary() -> None:
    """Résumé d'une réponse brute ; texte brut ou vide ⇒ None."""
    response = json.dumps(
        {"output": [{"type": "reasoning", "summary": [{"type": "summary_text", "text": "Raison."}]}]}
    )
    assert extract_reasoning_summary(response) == "Raison."
    assert extract_reasoning_summary("texte") is None
    assert extract_reasoning_summary(None) is None


@pytest.mark.asyncio
async def test_round_trip_from_openai_client_tracking(tmp_path: Any) -> None:
    """OpenAIClient (réponse SDK réelle, structurée, avec résumé) → record tracké → trace rejouable."""
    from unittest.mock import AsyncMock, patch

    from openai.types.responses import Response, ResponseFunctionToolCall, ResponseReasoningItem
    from openai.types.responses.response_reasoning_item import Summary

    from core.llm.openai.client import OpenAIClient
    from models.dialogue_structure.unity_dialogue_node import UnityDialogueGenerationResponse
    from services.llm_call_provenance import capture_llm_calls
    from services.llm_pricing_service import LLMPricingService
    from services.llm_usage_service import LLMUsageService
    from services.repositories.llm_usage_repository import FileLLMUsageRepository

    usage = LLMUsageService(
        repository=FileLLMUsageRepository(storage_dir=str(tmp_path)),
        pricing_service=LLMPricingService(),
    )
    client = OpenAIClient(
        api_key="sk-test-not-used",
        config={"default_model": "gpt-6.2-sol", "max_tokens": 1000},
        usage_service=usage,
        request_id="req-round-trip",
        endpoint="graph/generate-node",
    )
    response = Response(
        id="resp_1",
        created_at=0.0,
        model="gpt-6.2-sol",
        object="response",
        parallel_tool_calls=True,
        tool_choice="required",
        tools=[],
        output=[
            ResponseReasoningItem(
                id="rs_1",
                type="reasoning",
                summary=[Summary(type="summary_text", text="Le garde doit hésiter.")],
                encrypted_content="chiffré",
            ),
            ResponseFunctionToolCall(
                id="fc_1",
                type="function_call",
                name="generate_interaction",
                call_id="call_fc_1",
                arguments=NODE_ARGUMENTS,
                status="completed",
            ),
        ],
    )
    history = [{"role": "assistant", "content": "Réplique précédente"}]

    with patch.object(client, "_make_api_call_with_protection", AsyncMock(return_value=response)):
        with capture_llm_calls() as calls:
            results = await client.generate_variants(
                "Écris la suite.",
                k=1,
                response_model=UnityDialogueGenerationResponse,
                previous_dialogue_context=history,
                user_system_prompt_override="Tu es scénariste.",
            )

    assert isinstance(results[0], UnityDialogueGenerationResponse)
    record = usage.get_record_by_call_id(calls[0])
    assert record is not None
    trace = parse_generation_trace(record)
    assert trace.instructions == "Tu es scénariste."
    assert trace.input_messages == [*history, {"role": "user", "content": "Écris la suite."}]
    assert trace.output_text == NODE_ARGUMENTS
    assert trace.reasoning_summary == "Le garde doit hésiter."
    assert trace.call_id == calls[0]
