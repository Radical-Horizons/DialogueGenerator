"""Tests LoreContradictionValidator / extraction texte (FR38)."""
from __future__ import annotations

from models.prompt_structure import (
    ContextCategory,
    ContextItem,
    ItemSection,
    PromptMetadata,
    PromptSection,
    PromptStructure,
)
from services.graph_dialogue_text import build_node_id_to_lore_text
from services.lore_vague_reference import LORE_POTENTIAL_AMBIGUITY_TYPE, LoreGddEntityCandidate
from services.lore_contradiction_validator import (
    LoreGddFact,
    LoreVitalityContext,
    build_lore_summary,
    extract_vitality_facts_from_prompt_structure,
    extract_vitality_contexts_from_prompt_structure,
    infer_vitality_from_gdd_blob,
    merge_lore_facts_with_context_builder,
    validate_explicit_lore_contradictions,
)


def test_infer_vitality_alive_and_dead_signals_none() -> None:
    """Signaux contradictoires dans le même blob → pas de fait net (ambigu)."""
    assert infer_vitality_from_gdd_blob("Le héros est vivant mais on dit qu'il est mort.") is None


def test_infer_vitality_dead() -> None:
    assert infer_vitality_from_gdd_blob("AliasTest est décédé lors du siège.") == "dead"


def test_infer_vitality_alive() -> None:
    assert infer_vitality_from_gdd_blob("AliasTest est toujours en vie.") == "alive"


def test_validate_explicit_alive_fact_vs_death_line() -> None:
    nodes = [
        {
            "id": "N1",
            "type": "dialogueNode",
            "data": {
                "id": "N1",
                "displayName": "Scène",
                "line": "AliasTest est mort, c'est confirmé.",
            },
        }
    ]
    facts = [
        LoreGddFact(
            entity_name="AliasTest",
            category="characters",
            gdd_path="Personnages › AliasTest",
            vitality="alive",
        )
    ]
    valid, errors, warnings, summary, se_only, c_count, n_count, pw, pn, _, _ = (
        validate_explicit_lore_contradictions(nodes, [], facts)
    )
    assert valid is False
    assert c_count == 1
    assert n_count == 1
    assert "1 contradiction" in summary and "1 nœud" in summary
    assert se_only in summary
    assert "potentiel" not in se_only.lower() and "ambiguïté" not in se_only.lower()
    assert warnings == []
    assert pw == 0 and pn == 0
    assert errors[0]["type"] == "lore_contradiction_explicit"
    assert errors[0]["node_id"] == "N1"
    assert "AliasTest" in errors[0]["message"]


def test_validate_explicit_dead_fact_vs_alive_line() -> None:
    nodes = [
        {
            "id": "N2",
            "type": "dialogueNode",
            "data": {
                "id": "N2",
                "displayName": "X",
                "line": "FigureBeta est vivant et marche dans la place.",
            },
        }
    ]
    facts = [
        LoreGddFact(
            entity_name="FigureBeta",
            category="characters",
            gdd_path="Personnages › FigureBeta",
            vitality="dead",
        )
    ]
    valid, errors, _, _, _, _, _, _, _, _, _ = validate_explicit_lore_contradictions(nodes, [], facts)
    assert valid is False
    assert len(errors) == 1


def test_ambiguous_no_entity_name_no_error() -> None:
    """Sans nom d'entité résolu, une mention de mort ne doit pas lever d'erreur explicite."""
    nodes = [
        {
            "id": "N1",
            "type": "dialogueNode",
            "data": {
                "id": "N1",
                "displayName": "X",
                "line": "Quelqu'un est mort dans la ville.",
            },
        }
    ]
    facts = [
        LoreGddFact(
            entity_name="AliasTest",
            category="characters",
            gdd_path="P › A",
            vitality="alive",
        )
    ]
    valid, errors, _, _, _, _, _, _, _, _, _ = validate_explicit_lore_contradictions(nodes, [], facts)
    assert valid is True
    assert errors == []


def test_choice_text_scanned() -> None:
    nodes = [
        {
            "id": "N1",
            "type": "dialogueNode",
            "data": {
                "id": "N1",
                "displayName": "X",
                "line": "",
                "choices": [{"text": "Dire qu'AliasTest est mort.", "targetNode": ""}],
            },
        }
    ]
    facts = [
        LoreGddFact(
            entity_name="AliasTest",
            category="characters",
            gdd_path="P › A",
            vitality="alive",
        )
    ]
    valid, errors, _, _, _, _, _, _, _, _, _ = validate_explicit_lore_contradictions(nodes, [], facts)
    assert valid is False
    assert len(errors) >= 1


def test_extract_vitality_from_prompt_structure_minimal() -> None:
    structure = PromptStructure(
        sections=[
            PromptSection(
                type="context",
                title="CTX",
                content="",
                tokenCount=0,
                categories=[
                    ContextCategory(
                        type="characters",
                        title="Personnages",
                        items=[
                            ContextItem(
                                id="p1",
                                name="AliasGamma",
                                sections=[
                                    ItemSection(title="Bio", content="AliasGamma est vivant.", tokenCount=0)
                                ],
                                tokenCount=0,
                                metadata={"real_name": "AliasGamma"},
                            )
                        ],
                        tokenCount=0,
                    )
                ],
            )
        ],
        metadata=PromptMetadata(totalTokens=0, generatedAt="2026-01-01T00:00:00", organizationMode="default"),
    )
    facts = extract_vitality_facts_from_prompt_structure(structure)
    assert len(facts) == 1
    assert facts[0].vitality == "alive"
    assert facts[0].entity_name == "AliasGamma"


def test_merge_lore_facts_without_builder_returns_base() -> None:
    base = [
        LoreGddFact(
            entity_name="E1",
            category="c",
            gdd_path="p",
            vitality="alive",
        ),
    ]
    merged, contexts, amb = merge_lore_facts_with_context_builder(base, {}, "", None)
    assert len(merged) == 1
    assert contexts == []
    assert amb == []


def test_build_node_id_to_lore_text_skips_start() -> None:
    nodes = [
        {"id": "START", "type": "startNode", "data": {"label": "S"}},
        {
            "id": "N1",
            "type": "dialogueNode",
            "data": {"id": "N1", "displayName": "A", "line": "Hello"},
        },
    ]
    m = build_node_id_to_lore_text(nodes)
    assert "START" not in m
    assert "N1" in m


def test_build_lore_summary_plural() -> None:
    s = build_lore_summary(2, 3, 0, 0, 5)
    assert "2 contradictions" in s
    assert "3 nœuds" in s


def test_build_lore_summary_zero_explicit_with_analyzed_nodes() -> None:
    s = build_lore_summary(0, 0, 0, 0, 3)
    assert "Aucune contradiction lore explicite" in s
    assert "3" in s


def test_potential_warning_gdd_contradictory_and_mention_in_dialogue() -> None:
    nodes = [
        {
            "id": "N1",
            "type": "dialogueNode",
            "data": {
                "id": "N1",
                "displayName": "S",
                "line": "On parle de DeltaChar en passant.",
            },
        }
    ]
    contexts = [
        LoreVitalityContext(
            entity_name="DeltaChar",
            category="characters",
            gdd_path="Perso › DeltaChar",
            vitality=None,
            gdd_contradictory_vitality=True,
            has_vitality_signals_in_gdd=True,
        )
    ]
    valid, errors, warnings, summary, se_only, _, _, pw, pn, _, _ = (
        validate_explicit_lore_contradictions(nodes, [], [], contexts)
    )
    assert valid is True
    assert errors == []
    assert pw >= 1
    assert pn >= 1
    assert warnings[0]["type"] == "lore_contradiction_potential"
    assert "potentiel" in summary.lower()
    assert "Aucune contradiction lore explicite" in se_only
    assert "potentiel" not in se_only.lower()


def test_potential_warning_no_gdd_anchor_but_vitality_in_dialogue() -> None:
    nodes = [
        {
            "id": "N1",
            "type": "dialogueNode",
            "data": {
                "id": "N1",
                "displayName": "S",
                "line": "EpsilonChar est mort sur le pont.",
            },
        }
    ]
    contexts = [
        LoreVitalityContext(
            entity_name="EpsilonChar",
            category="characters",
            gdd_path="Perso › EpsilonChar",
            vitality=None,
            gdd_contradictory_vitality=False,
            has_vitality_signals_in_gdd=False,
        )
    ]
    valid, errors, warnings, _, _, _, _, pw, _, _, _ = validate_explicit_lore_contradictions(
        nodes, [], [], contexts
    )
    assert valid is True
    assert errors == []
    assert pw == 1
    assert warnings[0]["severity"] == "warning"


def test_potential_ambiguity_vague_le_port_two_locations() -> None:
    """FR39 : mention « le port » + ≥2 lieux GDD contenant « port » → lore_potential_ambiguity."""
    nodes = [
        {
            "id": "N1",
            "type": "dialogueNode",
            "data": {
                "id": "N1",
                "displayName": "Scène",
                "line": "Rendez-vous le port avant la nuit.",
            },
        }
    ]
    entities = [
        LoreGddEntityCandidate("Lieu Alpha Port Royal", "locations", "Lieux › Lieu Alpha Port Royal"),
        LoreGddEntityCandidate("Port du Synthétique", "locations", "Lieux › Port du Synthétique"),
    ]
    valid, errors, warnings, summary, se_only, _, _, _, _, amb_w, amb_n = (
        validate_explicit_lore_contradictions(nodes, [], [], None, entities)
    )
    assert valid is True
    assert errors == []
    assert amb_w >= 1
    assert amb_n >= 1
    amb = [w for w in warnings if w["type"] == LORE_POTENTIAL_AMBIGUITY_TYPE]
    assert len(amb) >= 1
    assert amb[0].get("lore_subtype") == "vague_article_noun"
    assert amb[0].get("lore_warning_key")
    assert len(amb[0].get("ambiguity_candidates", [])) >= 2
    assert "ambiguïté" in summary.lower()
    assert "Aucune contradiction lore explicite" in se_only
    assert "ambiguïté" not in se_only.lower()


def test_build_lore_summary_includes_ambiguity_segment() -> None:
    s = build_lore_summary(0, 0, 0, 0, 2, 1, 1)
    assert "ambiguïté" in s.lower()


def test_extract_vitality_contexts_contradictory_gdd() -> None:
    structure = PromptStructure(
        sections=[
            PromptSection(
                type="context",
                title="CTX",
                content="",
                tokenCount=0,
                categories=[
                    ContextCategory(
                        type="characters",
                        title="Personnages",
                        items=[
                            ContextItem(
                                id="p1",
                                name="ZetaChar",
                                sections=[
                                    ItemSection(
                                        title="Bio",
                                        content="ZetaChar est vivant. ZetaChar est mort selon une autre source.",
                                        tokenCount=0,
                                    )
                                ],
                                tokenCount=0,
                                metadata={"real_name": "ZetaChar"},
                            )
                        ],
                        tokenCount=0,
                    )
                ],
            )
        ],
        metadata=PromptMetadata(totalTokens=0, generatedAt="2026-01-01T00:00:00", organizationMode="default"),
    )
    ctxs = extract_vitality_contexts_from_prompt_structure(structure)
    assert len(ctxs) == 1
    assert ctxs[0].gdd_contradictory_vitality is True
