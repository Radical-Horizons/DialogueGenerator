"""Détection heuristique de « AI slop » sur le texte des nœuds de dialogue (FR43)."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Literal, Optional, Sequence, Tuple

from services.ai_slop_default_catalog import DEFAULT_GENERIC_PHRASES, DEFAULT_GPT_ISMS

# Limites anti-abus / mitigation ReDoS (regex utilisateur sur tout le graphe).
MAX_CUSTOM_REGEX_PATTERN_COUNT: int = 32
MAX_CUSTOM_REGEX_PATTERN_CHARS: int = 512
# Plafond d’occurrences par regex et par segment (évite explosion mémoire / CPU côté résultats).
_MAX_FINDITER_MATCHES_PER_SEGMENT: int = 500


def custom_regex_pattern_policy_violation(pattern: str) -> Optional[str]:
    """Retourne un message d’erreur si le motif dépasse les limites ou semble à risque ReDoS.

    Args:
        pattern: Motif déjà normalisé (strip), non vide.

    Returns:
        Message d’erreur lisible, ou ``None`` si accepté.
    """
    if len(pattern) > MAX_CUSTOM_REGEX_PATTERN_CHARS:
        return (
            f"Regex trop longue (max {MAX_CUSTOM_REGEX_PATTERN_CHARS} caractères) : "
            f"{pattern[:80]!r}…"
        )
    if re.search(r"\([^()]*[*+][^)]*\)[*+?]", pattern):
        return (
            "Regex refusée (quantificateurs imbriqués typiques ReDoS, ex. (a+)+, (.*)*) : "
            f"{pattern[:120]!r}"
        )
    if re.search(r"\{\s*\d{4,}", pattern):
        return f"Regex refusée (limite de répétition {{n}} trop élevée) : {pattern[:120]!r}"
    return None


def _normalize_phrase(text: str) -> str:
    """Normalise pour comparaison de répétitions (casse, espaces)."""
    t = text.strip().lower()
    t = re.sub(r"\s+", " ", t)
    return t


def _display_id(node: Dict[str, Any], data: Dict[str, Any], fallback: str) -> str:
    sid = data.get("stableId")
    if isinstance(sid, str) and sid.strip():
        return sid.strip()
    nid = data.get("id")
    if isinstance(nid, str) and nid.strip():
        return nid.strip()
    return fallback


@dataclass
class AiSlopDetectionOptionsData:
    """Options runtime alignées sur le schéma API."""

    include_gpt_isms: bool = True
    include_repetitions: bool = True
    include_generic_phrases: bool = True
    custom_keywords: List[str] = field(default_factory=list)
    custom_regex_patterns: List[str] = field(default_factory=list)


@dataclass
class TextSegment:
    """Segment textuel indexé dans un nœud."""

    node_id: str
    node_display_id: str
    field: str
    text: str


@dataclass
class SlopOccurrenceInternal:
    kind: Literal["gpt_ism", "repetition", "generic_phrase"]
    node_id: str
    node_display_id: str
    field: str
    excerpt: str
    matched_span: str
    suggestion: str


@dataclass
class RepetitionGroupInternal:
    normalized_phrase: str
    occurrence_count: int
    node_ids: List[str]
    sample_excerpt: str


@dataclass
class AiSlopDetectionResult:
    """Résultat interne du scan."""

    occurrences: List[SlopOccurrenceInternal] = field(default_factory=list)
    repetition_groups: List[RepetitionGroupInternal] = field(default_factory=list)
    message: Optional[str] = None


class AISlopDetector:
    """Scanne les nœuds pour GPT-isms, répétitions et phrases génériques."""

    _MIN_REPETITION_LEN: int = 12

    @classmethod
    def extract_segments(cls, nodes: Sequence[Dict[str, Any]]) -> List[TextSegment]:
        """Extrait les lignes et libellés de choix pertinents."""
        out: List[TextSegment] = []
        for node in nodes:
            if not isinstance(node, dict):
                continue
            nid = str(node.get("id", "") or "")
            data = node.get("data")
            if not isinstance(data, dict):
                continue
            disp = _display_id(node, data, nid)
            ntype = str(node.get("type", "") or "")
            if ntype != "dialogueNode" and "line" not in data:
                continue
            line = data.get("line")
            if isinstance(line, str) and line.strip():
                out.append(TextSegment(nid, disp, "line", line.strip()))
            choices = data.get("choices")
            if isinstance(choices, list):
                for i, c in enumerate(choices):
                    if isinstance(c, dict):
                        tx = c.get("text")
                        if isinstance(tx, str) and tx.strip():
                            out.append(TextSegment(nid, disp, f"choice_{i}", tx.strip()))
        return out

    @classmethod
    def _compile_custom_regexes(
        cls, patterns: Sequence[str]
    ) -> Tuple[List[re.Pattern[str]], Optional[str]]:
        compiled: List[re.Pattern[str]] = []
        non_empty = 0
        for p in patterns:
            p = str(p).strip()
            if not p:
                continue
            non_empty += 1
            if non_empty > MAX_CUSTOM_REGEX_PATTERN_COUNT:
                return (
                    [],
                    f"Trop de regex personnalisées (max {MAX_CUSTOM_REGEX_PATTERN_COUNT}).",
                )
            policy_err = custom_regex_pattern_policy_violation(p)
            if policy_err:
                return [], policy_err
            try:
                compiled.append(re.compile(p, re.IGNORECASE))
            except re.error as exc:
                return [], f"Regex invalide : {p!r} ({exc})"
        return compiled, None

    @classmethod
    def detect(
        cls,
        nodes: Sequence[Dict[str, Any]],
        _edges: Sequence[Dict[str, Any]],
        options: Optional[AiSlopDetectionOptionsData] = None,
    ) -> AiSlopDetectionResult:
        """Analyse le graphe ; ``edges`` réservé pour cohérence d’API."""
        opts = options or AiSlopDetectionOptionsData()
        result = AiSlopDetectionResult()

        if not nodes:
            result.message = "Aucun nœud à analyser."
            return result

        segments = cls.extract_segments(nodes)
        if not segments:
            result.message = (
                "Aucun texte de dialogue ou de choix trouvé dans les nœuds (graphe vide ou "
                "sans contenu textuel)."
            )
            return result

        # Répétitions (phrase normalisée -> listes de segments)
        phrase_locations: Dict[str, List[TextSegment]] = {}
        for seg in segments:
            key = _normalize_phrase(seg.text)
            if len(key) < cls._MIN_REPETITION_LEN:
                continue
            phrase_locations.setdefault(key, []).append(seg)

        if opts.include_repetitions:
            for phrase, locs in phrase_locations.items():
                if len(locs) < 2:
                    continue
                node_ids = []
                seen: set[str] = set()
                for s in locs:
                    if s.node_id not in seen:
                        seen.add(s.node_id)
                        node_ids.append(s.node_id)
                result.repetition_groups.append(
                    RepetitionGroupInternal(
                        normalized_phrase=phrase,
                        occurrence_count=len(locs),
                        node_ids=node_ids,
                        sample_excerpt=locs[0].text[:200],
                    )
                )
                for s in locs:
                    result.occurrences.append(
                        SlopOccurrenceInternal(
                            kind="repetition",
                            node_id=s.node_id,
                            node_display_id=s.node_display_id,
                            field=s.field,
                            excerpt=s.text[:400],
                            matched_span=s.text[:400],
                            suggestion=(
                                "Varier la formulation ou fusionner les passages redondants "
                                "pour éviter l’effet « copier-coller »."
                            ),
                        )
                    )

        regexes, regex_err = cls._compile_custom_regexes(opts.custom_regex_patterns)
        if regex_err:
            result.message = regex_err
            result.occurrences.clear()
            result.repetition_groups.clear()
            return result

        scan_pairs: List[Tuple[str, str, str]] = []
        if opts.include_gpt_isms:
            for sub, sug in DEFAULT_GPT_ISMS:
                scan_pairs.append(("gpt_ism", sub.lower(), sug))
        if opts.include_generic_phrases:
            for sub, sug in DEFAULT_GENERIC_PHRASES:
                scan_pairs.append(("generic_phrase", sub.lower(), sug))
        for kw in opts.custom_keywords:
            k = str(kw).strip()
            if k:
                scan_pairs.append(
                    (
                        "gpt_ism",
                        k.lower(),
                        "Adapter ou retirer ce motif personnalisé selon le contexte de scène.",
                    )
                )

        if scan_pairs:
            for seg in segments:
                low = seg.text.lower()
                for kind, sub, sug in scan_pairs:
                    pos = 0
                    while True:
                        idx = low.find(sub, pos)
                        if idx < 0:
                            break
                        span = seg.text[idx : idx + len(sub)]
                        result.occurrences.append(
                            SlopOccurrenceInternal(
                                kind=kind,
                                node_id=seg.node_id,
                                node_display_id=seg.node_display_id,
                                field=seg.field,
                                excerpt=seg.text[:400],
                                matched_span=span,
                                suggestion=sug,
                            )
                        )
                        pos = idx + max(1, len(sub))

        if regexes:
            for seg in segments:
                for rx in regexes:
                    match_count = 0
                    for m in rx.finditer(seg.text):
                        match_count += 1
                        if match_count > _MAX_FINDITER_MATCHES_PER_SEGMENT:
                            break
                        result.occurrences.append(
                            SlopOccurrenceInternal(
                                kind="gpt_ism",
                                node_id=seg.node_id,
                                node_display_id=seg.node_display_id,
                                field=seg.field,
                                excerpt=seg.text[:400],
                                matched_span=m.group(0),
                                suggestion="Réviser le passage correspondant à la regex personnalisée.",
                            )
                        )

        # Si tout désactivé, message explicite
        if (
            not opts.include_gpt_isms
            and not opts.include_repetitions
            and not opts.include_generic_phrases
            and not opts.custom_keywords
            and not opts.custom_regex_patterns
        ):
            result.message = "Toutes les familles de détection sont désactivées."
            result.occurrences.clear()
            result.repetition_groups.clear()

        return result
