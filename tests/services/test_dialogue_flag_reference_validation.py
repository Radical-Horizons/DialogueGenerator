"""Tests validation références flags vs dialogueFlags déclarés (Story 9.5 / FR93)."""

from __future__ import annotations

import pytest

from services.dialogue_flag_reference_validation import (
    analyze_dialogue_flag_references,
)


def _minimal_doc(
    *,
    declared: list[str],
    ref_in_visibility: str | None = None,
    ref_in_effect: str | None = None,
) -> dict:
    """Document minimal avec un nœud dialogue et optionnellement conditions/effets."""
    node: dict = {
        "id": "NODE_A",
        "stableId": "stable-a",
        "displayName": "Nœud A",
        "line": "Hello",
        "nextNode": "END",
    }
    if ref_in_visibility:
        node["visibilityConditions"] = {
            "combinator": "AND",
            "items": [
                {"kind": "flag_bool", "flagId": ref_in_visibility, "equals": True}
            ],
        }
    if ref_in_effect:
        node["choices"] = [
            {
                "choiceId": "c1",
                "text": "Go",
                "choiceEffects": [
                    {"kind": "set_bool", "flagId": ref_in_effect, "value": True}
                ],
            }
        ]
    flags = [{"flagId": fid, "type": "bool", "initialValue": True} for fid in declared]
    return {
        "schemaVersion": "1.2.0",
        "dialogueFlags": flags,
        "nodes": [node],
    }


def test_error_when_referenced_flag_not_in_dialogue_flags():
    doc = _minimal_doc(declared=["VF_OK"], ref_in_visibility="VF_MISSING")
    result = analyze_dialogue_flag_references(
        doc, catalog_flag_ids=frozenset({"VF_OK", "VF_MISSING"})
    )
    assert result.error_count >= 1
    err = next(e for e in result.errors if e.flag_id == "VF_MISSING")
    assert err.node_id == "NODE_A"
    assert "non déclaré" in err.message.lower() or "dialogueflags" in err.message.lower()


def test_warning_unused_declared_flag():
    doc = _minimal_doc(declared=["VF_A", "VF_UNUSED"], ref_in_visibility="VF_A")
    result = analyze_dialogue_flag_references(doc, catalog_flag_ids=frozenset({"VF_A", "VF_UNUSED"}))
    warns = [w for w in result.warnings if w.flag_id == "VF_UNUSED"]
    assert len(warns) == 1


def test_suggestion_typo_near_declared():
    doc = _minimal_doc(declared=["VF_BOOL"], ref_in_visibility="VF_BOLL")
    result = analyze_dialogue_flag_references(doc, catalog_flag_ids=frozenset({"VF_BOOL"}))
    err = next(e for e in result.errors if e.flag_id == "VF_BOLL")
    assert err.suggested_flag_id == "VF_BOOL"


def test_no_suggestion_when_distance_too_large():
    doc = _minimal_doc(declared=["VF_BOOL"], ref_in_visibility="VF_XYZ123")
    result = analyze_dialogue_flag_references(doc, catalog_flag_ids=frozenset({"VF_BOOL"}))
    err = next(e for e in result.errors if e.flag_id == "VF_XYZ123")
    assert err.suggested_flag_id is None


def test_summary_ok_counts():
    doc = _minimal_doc(declared=["VF_A"], ref_in_visibility="VF_A")
    result = analyze_dialogue_flag_references(doc, catalog_flag_ids=frozenset({"VF_A"}))
    assert result.error_count == 0
    assert result.used_flag_count == 1
    assert "0 erreur" in result.summary.lower()
    assert "1" in result.summary  # flags utilisés
