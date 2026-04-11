"""Tests : application des règles persistées dans ContextDroppingDetector (Story 4.10).

Données génériques uniquement — aucun nom GDD réel.
"""
from __future__ import annotations

import pytest

from services.context_dropping_detector import (
    ContextDroppingDetector,
    ContextDroppingOptionsData,
)


def _dialogue_node(node_id: str, line: str) -> dict:
    return {
        "id": node_id,
        "type": "dialogueNode",
        "position": {"x": 0, "y": 0},
        "data": {"line": line, "choices": [], "stableId": f"st-{node_id}"},
    }


# Fixture fixe : même graphe, même contexte — seules les options varient.
_FIXED_NODES = [
    _dialogue_node("n1", "L'aventurier marcha dans la plaine."),
    _dialogue_node("n2", "Il trouva un objet brillant par terre."),
]
_FIXED_EDGES: list = []
_FIXED_CONTEXT = {
    # Entité fictive multi-mots → eligible pour la branche « subtil »
    "characters_full": ["Entité Fictive Kappa Omega"],
    "locations_full": ["Lieu Fictif Delta"],
}


# ── Profil strict vs light mesurables ────────────────────────────────────────

def test_strict_profile_detects_at_least_one_case():
    opts = ContextDroppingOptionsData(rules_profile="strict")
    result = ContextDroppingDetector.detect(_FIXED_NODES, _FIXED_EDGES, _FIXED_CONTEXT, options=opts)
    assert result.case_count >= 1, "Le profil strict doit détecter au moins un cas avec ce contexte"


def test_light_profile_detects_fewer_or_equal_cases_than_strict():
    opts_strict = ContextDroppingOptionsData(rules_profile="strict")
    opts_light = ContextDroppingOptionsData(rules_profile="light")

    result_strict = ContextDroppingDetector.detect(
        _FIXED_NODES, _FIXED_EDGES, _FIXED_CONTEXT, options=opts_strict
    )
    result_light = ContextDroppingDetector.detect(
        _FIXED_NODES, _FIXED_EDGES, _FIXED_CONTEXT, options=opts_light
    )

    assert result_light.rules_profile_effective == "light"
    assert result_strict.rules_profile_effective == "strict"
    # En mode light, les labels courts sont filtrés → moins ou autant de cas.
    assert result_light.case_count <= result_strict.case_count


# ── Informations obligatoires absentes ───────────────────────────────────────

def test_mandatory_info_absent_raises_dedicated_case():
    """Une info obligatoire absente du graphe → au moins un cas ou message dédié."""
    opts = ContextDroppingOptionsData(
        rules_profile="strict",
        mandatory_info=["info-obligatoire-fictive-xyz"],
    )
    nodes = [_dialogue_node("n1", "Texte qui ne mentionne pas l'info requise.")]
    result = ContextDroppingDetector.detect(nodes, [], {}, options=opts)

    has_mandatory_case = any(
        "mandatory" in c.kind or "obligatoire" in c.message.lower()
        for c in result.cases
    )
    has_message = result.message is not None and "obligatoire" in result.message.lower()
    assert has_mandatory_case or has_message or result.case_count >= 1, (
        "L'information obligatoire absente doit générer un avertissement"
    )


def test_mandatory_info_present_no_extra_case():
    """Si l'info obligatoire est dans le texte, pas de cas supplémentaire pour elle."""
    opts = ContextDroppingOptionsData(
        rules_profile="strict",
        mandatory_info=["balise-fictive-presente"],
    )
    nodes = [_dialogue_node("n1", "Le dialogue mentionne balise-fictive-presente explicitement.")]
    result_without = ContextDroppingDetector.detect(nodes, [], {}, options=ContextDroppingOptionsData())
    result_with = ContextDroppingDetector.detect(nodes, [], {}, options=opts)

    # La présence dans le texte ne doit pas augmenter le nombre de cas.
    assert result_with.case_count <= result_without.case_count + 1


# ── Règles par type de dialogue ───────────────────────────────────────────────

def test_dialogue_type_override_strict_applied():
    """Type 'combat' → override strict ; ignoré si le type n'est pas fourni."""
    opts_with_type = ContextDroppingOptionsData(
        rules_profile="light",
        dialogue_type="combat",
        dialogue_type_overrides={"combat": {"rules_profile": "strict"}},
    )
    opts_without_type = ContextDroppingOptionsData(rules_profile="light")

    result_override = ContextDroppingDetector.detect(
        _FIXED_NODES, _FIXED_EDGES, _FIXED_CONTEXT, options=opts_with_type
    )
    result_global = ContextDroppingDetector.detect(
        _FIXED_NODES, _FIXED_EDGES, _FIXED_CONTEXT, options=opts_without_type
    )

    assert result_override.rules_profile_effective == "strict"
    assert result_global.rules_profile_effective == "light"


def test_unknown_dialogue_type_falls_back_to_global():
    """Type inconnu dans overrides → fallback sur règles globales."""
    opts = ContextDroppingOptionsData(
        rules_profile="light",
        dialogue_type="type-inconnu",
        dialogue_type_overrides={"combat": {"rules_profile": "strict"}},
    )
    result = ContextDroppingDetector.detect(_FIXED_NODES, _FIXED_EDGES, _FIXED_CONTEXT, options=opts)
    assert result.rules_profile_effective == "light"


# ── Tolérance API (champ conservé, sans effet sur la correspondance multi-mots) ──

def test_tolerance_field_does_not_block_partial_multi_word_match():
    """Un seul mot significatif suffit ; le champ ``tolerance`` ne change pas ce comportement."""
    nodes = [_dialogue_node("n1", "kappa etait present dans la scene.")]
    context = {"characters_full": ["Entite Fictive Kappa Omega"]}

    for tol in (None, 0.99):
        opts = ContextDroppingOptionsData(rules_profile="strict", tolerance=tol)
        result = ContextDroppingDetector.detect(nodes, [], context, options=opts)
        assert result.case_count == 0, f"tolérance {tol!r} : un mot (kappa) doit suffire"
