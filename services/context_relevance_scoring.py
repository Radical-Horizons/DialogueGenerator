"""Heuristique de pertinence contexte GDD ↔ sortie générée (Story 3.6, FR16).

Approche déterministe : recouvrement lexical entre sections du prompt système
(ou prompt complet) et le texte **dialogue** extrait de la réponse LLM (pas le
dump API brut). Tokens alphanumériques d’au moins 4 caractères. Aucun appel LLM.
"""
from __future__ import annotations

import json
import re
import time
from datetime import datetime, UTC
from typing import Any, Dict, List, Optional, Tuple

SCORING_METHOD = "keyword_overlap_v2"
MIN_OVERLAP_TOKEN_LEN = 4
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
    """Extrait des tokens alphanumériques (min 4 caractères) pour overlap."""
    if not text or not text.strip():
        return set()
    pat = rf"[\wÀ-ÿ]{{{MIN_OVERLAP_TOKEN_LEN},}}"
    return {
        m.group(0).lower()
        for m in re.finditer(pat, text, flags=re.UNICODE)
    }


def _overlap_percent(context_words: set[str], generated_words: set[str]) -> float:
    if not context_words:
        return 0.0
    inter = len(context_words & generated_words)
    return round(100.0 * inter / len(context_words), 1)


def _looks_like_openai_responses_dump(data: dict) -> bool:
    """Dump typique ``model_dump_json()`` de l’API Responses (OpenAI)."""
    return "output" in data and isinstance(data.get("output"), list)


def _collect_generate_interaction_payloads(obj: Any) -> List[Dict[str, Any]]:
    """Repère les charges utiles de l’outil ``generate_interaction`` (OpenAI / Mistral)."""
    out: List[Dict[str, Any]] = []
    if isinstance(obj, dict):
        name = obj.get("name")
        args_raw = obj.get("arguments")
        fn = obj.get("function")
        if isinstance(fn, dict):
            name = name or fn.get("name")
            args_raw = args_raw if args_raw is not None else fn.get("arguments")
        if name == "generate_interaction" and args_raw:
            if isinstance(args_raw, str):
                try:
                    parsed = json.loads(args_raw)
                    if isinstance(parsed, dict):
                        out.append(parsed)
                except json.JSONDecodeError:
                    pass
            elif isinstance(args_raw, dict):
                out.append(args_raw)
        for v in obj.values():
            out.extend(_collect_generate_interaction_payloads(v))
    elif isinstance(obj, list):
        for v in obj:
            out.extend(_collect_generate_interaction_payloads(v))
    return out


def _looks_like_unity_dialogue_dict(d: dict) -> bool:
    """JSON dialogue minimal (tests ou réponse déjà réduite)."""
    if not isinstance(d, dict):
        return False
    if isinstance(d.get("line"), str) and d["line"].strip():
        return True
    if isinstance(d.get("node"), dict):
        return True
    ch = d.get("choices")
    return isinstance(ch, list) and len(ch) > 0


def _unity_payload_text_parts(data: dict) -> List[str]:
    """Textes narratifs issus d’une charge ``generate_interaction`` ou d’un nœud Unity."""
    texts: List[str] = []
    title = data.get("title")
    if isinstance(title, str) and title.strip():
        texts.append(title.strip())

    node = data.get("node")
    target: Dict[str, Any] = node if isinstance(node, dict) else data

    for key in ("line", "speaker", "test"):
        val = target.get(key)
        if isinstance(val, str) and val.strip():
            texts.append(val.strip())

    cons = target.get("consequences")
    if isinstance(cons, dict):
        for key in ("description", "flag"):
            val = cons.get(key)
            if isinstance(val, str) and val.strip():
                texts.append(val.strip())

    choices = target.get("choices")
    if isinstance(choices, list):
        for ch in choices:
            if not isinstance(ch, dict):
                continue
            for key in ("text", "test", "condition"):
                val = ch.get(key)
                if isinstance(val, str) and val.strip():
                    texts.append(val.strip())
    return texts


def _structured_dialogue_plain_text(data: dict) -> str:
    """Extrait uniquement le contenu dialogue (hors bruit API / schémas / reasoning)."""
    parts: List[str] = []
    for payload in _collect_generate_interaction_payloads(data):
        parts.extend(_unity_payload_text_parts(payload))
    if parts:
        return "\n".join(parts)
    if _looks_like_unity_dialogue_dict(data):
        return "\n".join(_unity_payload_text_parts(data))
    return ""


def _legacy_concat_all_json_strings(data: Any) -> str:
    """Ancien comportement : toute chaîne du JSON (hors cas Responses déjà filtrés)."""
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


def _extract_text_from_response_blob(response_str: str) -> str:
    """Texte utilisé pour le scoring : dialogue structuré si possible, sinon chaînes JSON."""
    if not response_str or not response_str.strip():
        return ""
    try:
        data = json.loads(response_str)
    except json.JSONDecodeError:
        return response_str

    if isinstance(data, dict):
        structured = _structured_dialogue_plain_text(data)
        if structured.strip():
            return structured
        if _looks_like_openai_responses_dump(data):
            # Ne pas mélanger instructions système / schémas / reasoning du dump API.
            return ""
        return _legacy_concat_all_json_strings(data)

    return _legacy_concat_all_json_strings(data)


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
        "method": SCORING_METHOD,
        "computation_ms": elapsed_ms,
        "computed_at": computed_at,
        "suggestions_hints": hints,
    }
    if request_id is not None:
        result["request_id"] = request_id
    return result


def split_prompt_system_input(full_prompt: str) -> Tuple[str, str]:
    """Expose le découpage système / entrée utilisateur pour d’autres services (ex. FR17)."""
    return _split_system_and_input(full_prompt)


def slice_gdd_type_bodies(system_text: str) -> Dict[str, str]:
    """Découpe le bloc système par types GDD (Personnages, Lieux, …) ; sinon seau « other »."""
    sections = _slice_sections(system_text)
    if sections:
        return sections
    st = system_text.strip()
    if st:
        return {"other": st}
    return {}


def tokenize_words_for_overlap(text: str) -> set[str]:
    """Tokens pour recouvrement lexical (réutilisable hors de ce module)."""
    return _tokenize_words(text)


def overlap_percent_sets(context_words: set[str], generated_words: set[str]) -> float:
    """Pourcentage de recouvrement |ctx∩gen|/|ctx|."""
    return _overlap_percent(context_words, generated_words)


def extract_generated_plain_text(response_str: str) -> str:
    """Texte dialogue extrait de la réponse persistée (outil ``generate_interaction`` si présent).

    Pour un dump OpenAI Responses sans ``function_call`` exploitable, ne renvoie pas
    les chaînes annexes (évite de mélanger instructions / schémas au « texte généré »).
    """
    return _extract_text_from_response_blob(response_str)
