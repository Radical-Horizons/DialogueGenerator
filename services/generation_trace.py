"""Trace rejouable d'une génération LLM, lue sur son record d'usage.

Le suivi d'usage garde, pour chaque appel, le prompt complet et la réponse brute du
fournisseur. Ce module en extrait ce qu'une conversation a besoin de rejouer en texte :
les instructions système, les messages d'entrée, la sortie exacte et le résumé lisible du
raisonnement quand le fournisseur l'a renvoyé. Trois formats sont reconnus :

- **OpenAI Responses** : prompt ``"{instructions}\\n\\n--- Input ---\\n{messages JSON}"`` ;
  réponse JSON ``output[]`` (``function_call.arguments``, sinon texte ``output_text``,
  résumés ``reasoning.summary[].text``).
- **Chat Completions** (Mistral, OpenRouter) : prompt = messages JSON, système compris ;
  réponse JSON ``choices[0].message`` (``tool_calls[0].function.arguments``, sinon ``content``).
- **Texte brut** : tout autre prompt ou réponse (streaming Mistral, records de test).
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from core.llm.tracking_format import (
    STRUCTURED_OUTPUT_INSTRUCTION_SUFFIX,
    TRACKED_PROMPT_INPUT_MARKER,
)
from models.llm_usage import LLMUsageRecord

logger = logging.getLogger(__name__)

class GenerationTraceUnavailableError(LookupError):
    """Aucune génération rejouable : record absent, en échec, incomplet ou sortie vide."""


@dataclass(frozen=True)
class GenerationTrace:
    """Ce qu'un appel LLM a reçu et produit, prêt à être rejoué en texte."""

    instructions: str
    input_messages: List[Dict[str, str]]
    output_text: str
    reasoning_summary: Optional[str]
    model_name: str
    generated_at: datetime
    request_id: str
    call_id: Optional[str] = field(default=None)


def _text_of(content: Any) -> str:
    """Aplatit un contenu de message (chaîne ou liste de parties) en texte."""
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: List[str] = []
        for part in content:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, dict):
                text = part.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return "".join(parts)
    return json.dumps(content, ensure_ascii=False)


def _normalize_messages(raw_messages: List[Any]) -> List[Dict[str, str]]:
    """Ramène des messages de prompt à ``{"role", "content"}`` texte."""
    messages: List[Dict[str, str]] = []
    for message in raw_messages:
        if not isinstance(message, dict):
            continue
        role = str(message.get("role") or "user")
        messages.append({"role": role, "content": _text_of(message.get("content"))})
    return messages


def _strip_structured_suffix(instructions: str) -> str:
    """Retire la consigne d'appel de fonction ajoutée par le client LLM."""
    return instructions.removesuffix(STRUCTURED_OUTPUT_INSTRUCTION_SUFFIX)


def _parse_prompt(prompt: str) -> Tuple[str, List[Dict[str, str]]]:
    """Sépare instructions et messages d'entrée selon le format du prompt tracké."""
    if TRACKED_PROMPT_INPUT_MARKER in prompt:
        # Le JSON des messages échappe ses sauts de ligne : le dernier marqueur est le bon.
        instructions, _, raw_input = prompt.rpartition(TRACKED_PROMPT_INPUT_MARKER)
        try:
            parsed = json.loads(raw_input)
        except json.JSONDecodeError:
            parsed = None
        if isinstance(parsed, list):
            return _strip_structured_suffix(instructions), _normalize_messages(parsed)
        return _strip_structured_suffix(instructions), [{"role": "user", "content": raw_input}]

    try:
        parsed = json.loads(prompt)
    except json.JSONDecodeError:
        parsed = None
    if isinstance(parsed, list) and all(isinstance(m, dict) and "role" in m for m in parsed):
        messages = _normalize_messages(parsed)
        system_parts: List[str] = []
        while messages and messages[0]["role"] == "system":
            system_parts.append(messages.pop(0)["content"])
        instructions = "\n\n".join(system_parts)
        return _strip_structured_suffix(instructions), messages

    return "", [{"role": "user", "content": prompt}]


def _parse_responses_api(payload: Dict[str, Any]) -> Tuple[str, Optional[str]]:
    """Sortie et résumé de raisonnement d'une réponse OpenAI Responses."""
    function_arguments: Optional[str] = None
    text_parts: List[str] = []
    summary_parts: List[str] = []
    for item in payload.get("output") or []:
        if not isinstance(item, dict):
            continue
        item_type = item.get("type")
        if item_type == "function_call" and function_arguments is None:
            arguments = item.get("arguments")
            if isinstance(arguments, str):
                function_arguments = arguments
            elif arguments is not None:
                function_arguments = json.dumps(arguments, ensure_ascii=False)
        elif item_type == "message":
            for part in item.get("content") or []:
                if isinstance(part, dict) and part.get("type") == "output_text":
                    text = part.get("text")
                    if isinstance(text, str):
                        text_parts.append(text)
        elif item_type == "reasoning":
            for part in item.get("summary") or []:
                text = part.get("text") if isinstance(part, dict) else part
                if isinstance(text, str) and text.strip():
                    summary_parts.append(text.strip())

    if function_arguments is not None:
        output = function_arguments
    elif text_parts:
        output = "".join(text_parts)
    else:
        top_level = payload.get("output_text")
        output = top_level if isinstance(top_level, str) else ""
    summary = "\n\n".join(summary_parts) or None
    return output, summary


def _parse_chat_completions(payload: Dict[str, Any]) -> Tuple[str, Optional[str]]:
    """Sortie (et raisonnement exposé, s'il y en a un) d'une réponse Chat Completions."""
    choices = payload.get("choices") or []
    message = choices[0].get("message") if choices and isinstance(choices[0], dict) else None
    if not isinstance(message, dict):
        return "", None

    output = ""
    tool_calls = message.get("tool_calls") or []
    if tool_calls and isinstance(tool_calls[0], dict):
        function = tool_calls[0].get("function") or {}
        arguments = function.get("arguments") if isinstance(function, dict) else None
        if isinstance(arguments, str):
            output = arguments
        elif arguments is not None:
            output = json.dumps(arguments, ensure_ascii=False)
    if not output:
        output = _text_of(message.get("content"))

    reasoning = message.get("reasoning")
    summary = reasoning.strip() if isinstance(reasoning, str) and reasoning.strip() else None
    return output, summary


def _parse_response(response: str) -> Tuple[str, Optional[str]]:
    """Sortie exacte et résumé de raisonnement selon le format de la réponse trackée."""
    try:
        payload = json.loads(response)
    except json.JSONDecodeError:
        payload = None
    if isinstance(payload, dict):
        output = payload.get("output")
        if isinstance(output, list) and all(
            isinstance(item, dict) and "type" in item for item in output
        ):
            return _parse_responses_api(payload)
        choices = payload.get("choices")
        # Un nœud Unity a aussi des « choices » : seule une complétion porte un « message ».
        if isinstance(choices, list) and choices and all(
            isinstance(choice, dict) and "message" in choice for choice in choices
        ):
            return _parse_chat_completions(payload)
    return response, None


def extract_reasoning_summary(response: Optional[str]) -> Optional[str]:
    """Résumé lisible du raisonnement contenu dans une réponse brute, ou None.

    Args:
        response: Réponse brute trackée (JSON du fournisseur ou texte).

    Returns:
        Le résumé joint, ou None si le fournisseur n'en a pas renvoyé.
    """
    if not response:
        return None
    return _parse_response(response)[1]


def parse_generation_trace(record: LLMUsageRecord) -> GenerationTrace:
    """Extrait la trace rejouable d'un record d'usage LLM.

    Args:
        record: Record d'un appel de génération.

    Returns:
        La trace : instructions sans la consigne d'appel de fonction, messages d'entrée,
        sortie exacte (arguments de l'appel de fonction ou texte), résumé de raisonnement.

    Raises:
        GenerationTraceUnavailableError: Appel en échec, prompt ou réponse absents, sortie vide.
    """
    if not record.success:
        raise GenerationTraceUnavailableError("La génération de ce nœud a échoué.")
    if not record.prompt or not record.response:
        raise GenerationTraceUnavailableError(
            "Le prompt ou la réponse de cette génération n'ont pas été conservés."
        )

    instructions, input_messages = _parse_prompt(record.prompt)
    output_text, reasoning_summary = _parse_response(record.response)
    if not output_text.strip():
        raise GenerationTraceUnavailableError("La génération n'a produit aucune sortie lisible.")

    return GenerationTrace(
        instructions=instructions,
        input_messages=input_messages,
        output_text=output_text,
        reasoning_summary=reasoning_summary,
        model_name=record.model_name,
        generated_at=record.timestamp,
        request_id=record.request_id,
        call_id=record.call_id,
    )
