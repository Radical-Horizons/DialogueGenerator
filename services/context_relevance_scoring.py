"""Heuristique de pertinence contexte GDD ↔ sortie générée (Story 3.6, FR16).

Approche déterministe : recouvrement lexical entre sections du prompt système
(ou prompt complet) et le texte extrait de la réponse LLM. Aucun appel LLM.
"""
from __future__ import annotations

import json
import re
import time
from datetime import datetime, UTC
from typing import Any, Dict, List, Optional, Tuple

SCORING_METHOD_V1 = "keyword_overlap_v1"
LOW_SCORE_THRESHOLD_PERCENT = 30.0
INPUT_MARKER = "\n\n--- Input ---\n"

# Types normalisés pour le breakdown (clés API stables).
SECTION_SPECS: List[Tuple[str, re.Pattern[str]]] = [
    ("characters", re.compile(r"(?im)^#*\s*(?:Personnages|Characters)\b[^\n]*$")),
    ("locations", re.compile(r"(?im)^#*\s*(?:Lieux|Locations)\b[^\n]*$")),
    ("regions", re.compile(r"(?im)^#*\s*(?:Régions|Regions)\b[^\n]*$")),
    ("themes", re.compile(r"(?im)^#*\s*(?:Thèmes|Themes)\b[^\n]*$")),
    ("items", re.compile(r"(?im)^#*\s*(?:Objets|Items)\b[^\n]*$")),
    ("species", re.compile(r"(?im)^#*\s*(?:Espèces|Espèce|Species)\b[^\n]*$")),
    ("communities", re.compile(r"(?im)^#*\s*(?:Communautés|Communities)\b[^\n]*$")),
]


def _tokenize_words(text: str) -> set[str]:
    """Extrait des tokens alphanumériques (min 3 caractères) pour overlap."""
    if not text or not text.strip():
        return set()
    return {
        m.group(0).lower()
        for m in re.finditer(r"[\wÀ-ÿ]{3,}", text, flags=re.UNICODE)
    }


def _overlap_percent(context_words: set[str], generated_words: set[str]) -> float:
    if not context_words:
        return 0.0
    inter = len(context_words & generated_words)
    return round(100.0 * inter / len(context_words), 1)


def _extract_text_from_response_blob(response_str: str) -> str:
    """Concatène les chaînes trouvées dans du JSON de réponse (réponse brute API)."""
    if not response_str or not response_str.strip():
        return ""
    try:
        data = json.loads(response_str)
    except json.JSONDecodeError:
        return response_str

    parts: List[str] = []

    def walk(obj: Any) -> None:
        if isinstance(obj, str) and obj.strip():
            parts.append(obj)
        elif isinstance(obj, dict):
            for v in obj.values():
                walk(v)
        elif isinstance(obj, list):
            for v in obj:
                walk(v)

    walk(data)
    return "\n".join(parts)


def _split_system_and_input(full_prompt: str) -> Tuple[str, str]:
    if INPUT_MARKER in full_prompt:
        system, rest = full_prompt.split(INPUT_MARKER, 1)
        return system.strip(), rest.strip()
    return full_prompt.strip(), ""


def _slice_sections(system_text: str) -> Dict[str, str]:
    """Découpe le bloc système en sections par en-têtes GDD connus."""
    if not system_text:
        return {}

    lines = system_text.splitlines()
    matches: List[Tuple[int, str, str]] = []
    for i, line in enumerate(lines):
        for type_key, pattern in SECTION_SPECS:
            if pattern.match(line.strip()):
                matches.append((i, type_key, line.strip()))
                break

    if not matches:
        return {}

    matches.sort(key=lambda x: x[0])
    sections: Dict[str, str] = {}
    for j, (start_idx, type_key, _header) in enumerate(matches):
        end_idx = matches[j + 1][0] if j + 1 < len(matches) else len(lines)
        body = "\n".join(lines[start_idx + 1 : end_idx]).strip()
        if body:
            sections[type_key] = body
    return sections


def _classify_reflected(
    breakdown: Dict[str, float],
) -> Tuple[List[str], List[str]]:
    """Répartit les types en « reflétés » vs « faibles » selon des seuils."""
    reflected: List[str] = []
    weak: List[str] = []
    for key, pct in sorted(breakdown.items()):
        if pct >= 40.0:
            reflected.append(key)
        else:
            weak.append(key)
    return reflected, weak


def compute_context_relevance_result(
    stored_prompt: str,
    stored_response: str,
    *,
    low_threshold_percent: float = LOW_SCORE_THRESHOLD_PERCENT,
    request_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Calcule le rapport de pertinence à persister sur ``LLMUsageRecord``.

    Args:
        stored_prompt: Prompt tel que stocké (Story 1.15), incluant système + input.
        stored_response: Réponse brute du LLM.
        low_threshold_percent: Seuil d’avertissement « faible utilisation ».

    Returns:
        Dictionnaire sérialisable (JSON) avec scores, breakdown, hints.
    """
    t0 = time.perf_counter()
    system_text, _input_tail = _split_system_and_input(stored_prompt)
    generated_text = _extract_text_from_response_blob(stored_response)
    gen_words = _tokenize_words(generated_text)

    sections = _slice_sections(system_text)
    breakdown: Dict[str, float] = {}
    weights: Dict[str, int] = {}

    if sections:
        for type_key, body in sections.items():
            cw = _tokenize_words(body)
            weights[type_key] = len(cw)
            breakdown[type_key] = _overlap_percent(cw, gen_words)
    else:
        ctx = system_text if system_text else stored_prompt
        cw = _tokenize_words(ctx)
        weights["other"] = len(cw)
        breakdown["other"] = _overlap_percent(cw, gen_words)

    total_w = sum(weights.values()) or 1
    score_percent = round(
        sum(breakdown[k] * weights.get(k, 0) for k in breakdown) / total_w,
        1,
    )

    reflected, weak = _classify_reflected(breakdown)
    low_warning = score_percent < low_threshold_percent
    hints: List[str] = []
    if low_warning:
        hints.append(
            "Enrichir les instructions utilisateur pour citer explicitement le lore à utiliser."
        )
        hints.append(
            "Passer des entités en mode « complet » plutôt qu’extrait si le score reste faible."
        )

    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    computed_at = datetime.now(UTC).isoformat()

    result: Dict[str, Any] = {
        "score_percent": score_percent,
        "breakdown_by_type": breakdown,
        "reflected_types": reflected,
        "weak_types": weak,
        "low_context_warning": low_warning,
        "low_threshold_percent": low_threshold_percent,
        "method": SCORING_METHOD_V1,
        "computation_ms": elapsed_ms,
        "computed_at": computed_at,
        "suggestions_hints": hints,
    }
    if request_id is not None:
        result["request_id"] = request_id
    return result
