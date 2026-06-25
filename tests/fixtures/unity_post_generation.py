"""Fixture canonique — sortie LLM / graphe post-génération (START, flag mixte, choix test).

Réutilisée par tests export, PUT, enrich_with_ids, validate-schema et miroir Vitest.
"""
from __future__ import annotations

from typing import Any, Dict, List, Tuple

from models.dialogue_structure.unity_dialogue_node import (
    UnityDialogueChoiceContent,
    UnityDialogueConsequencesContent,
    UnityDialogueGenerationResponse,
    UnityDialogueNodeContent,
)

RAW_POST_GENERATION_NODE: Dict[str, Any] = {
    "id": "START",
    "speaker": "PNJ",
    "line": "Bonjour voyageur",
    "consequences": {
        "flag": "FLAG_rencontre_valkazer_init",
        "description": "Première rencontre",
    },
    "choices": [
        {
            "text": "Tenter",
            "test": "Volonté+Adaptabilité:12",
        }
    ],
}

RAW_POST_GENERATION_DOCUMENT: Dict[str, Any] = {
    "schemaVersion": "1.2.0",
    "nodes": [dict(RAW_POST_GENERATION_NODE)],
}


def react_flow_graph_payload() -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Simule nodes/edges React Flow après génération (choix test, pas d'arête dialogue)."""
    node = RAW_POST_GENERATION_DOCUMENT["nodes"][0]
    return [
        {
            "id": "START",
            "type": "dialogueNode",
            "position": {"x": 0, "y": 0},
            "data": dict(node),
        }
    ], []


def llm_generation_response() -> UnityDialogueGenerationResponse:
    """Réponse LLM typique avant enrich_with_ids (sans id / choiceId / targetNode)."""
    node = RAW_POST_GENERATION_NODE
    cons = node.get("consequences") or {}
    choices_raw = node.get("choices") or []
    choices = [
        UnityDialogueChoiceContent(
            text=str(c.get("text", "")),
            test=c.get("test") if isinstance(c, dict) else None,
        )
        for c in choices_raw
        if isinstance(c, dict)
    ]
    return UnityDialogueGenerationResponse(
        title="Rencontre",
        node=UnityDialogueNodeContent(
            speaker=str(node.get("speaker", "")),
            line=str(node.get("line", "")),
            consequences=UnityDialogueConsequencesContent(
                flag=str(cons.get("flag", "")),
                description=str(cons.get("description", "")),
            ),
            choices=choices,
        ),
    )
