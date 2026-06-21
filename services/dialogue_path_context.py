"""Reconstruction du chemin ancêtre START → parent pour les prompts de génération."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

DIALOGUE_GENERATION_CONSTRAINTS_SUFFIX = (
    "\n\nContraintes de génération:\n"
    "- Ne pas ajouter d'attribut test (jet de compétence / barre de test) sur les choix ; "
    "les traitRequirements restent autorisés.\n"
    "- Chaque réplique PNJ : 2 à 5 phrases, concis et jouable (sauf climax explicite).\n"
    "- Conserver le même registre de tutoiement/vouvoiement que le nœud START.\n"
)


@dataclass(frozen=True)
class DialoguePathStep:
    """Une étape du chemin : réplique PNJ puis éventuel choix PJ suivant."""

    speaker: str
    line: str
    player_choice_after: Optional[str] = None


def _build_parent_map(
    nodes: List[Dict[str, Any]],
) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, Tuple[Dict[str, Any], str]]]:
    """Indexe les nœuds et la relation enfant → (parent, texte du choix)."""
    nodes_by_id: Dict[str, Dict[str, Any]] = {}
    for node in nodes:
        node_id = node.get("id")
        if node_id:
            nodes_by_id[str(node_id)] = node

    parent_map: Dict[str, Tuple[Dict[str, Any], str]] = {}
    for node in nodes:
        source_id = node.get("id")
        if not source_id:
            continue
        for choice in node.get("choices") or []:
            target = choice.get("targetNode")
            if not target or target == "END":
                continue
            target_key = str(target)
            if target_key in nodes_by_id and target_key not in parent_map:
                parent_map[target_key] = (node, str(choice.get("text") or ""))
    return nodes_by_id, parent_map


def build_ancestor_path_steps(
    nodes: List[Dict[str, Any]],
    target_node_id: str,
) -> List[DialoguePathStep]:
    """Construit le chemin du START jusqu'au nœud cible (inclus).

    Args:
        nodes: Tous les nœuds connus du dialogue (format Unity JSON).
        target_node_id: ID du nœud parent pour lequel on génère la suite.

    Returns:
        Étapes ordonnées : réplique PNJ, choix PJ, … jusqu'à la réplique du parent.
    """
    nodes_by_id, parent_map = _build_parent_map(nodes)
    target_key = str(target_node_id)
    if target_key not in nodes_by_id:
        return []

    chain: List[Tuple[Dict[str, Any], str]] = []
    current = target_key
    visited: set[str] = set()
    while current in parent_map and current not in visited:
        visited.add(current)
        parent, choice_text = parent_map[current]
        chain.append((parent, choice_text))
        parent_id = parent.get("id")
        if not parent_id:
            break
        current = str(parent_id)
    chain.reverse()

    steps: List[DialoguePathStep] = []
    for parent, choice_after in chain:
        steps.append(
            DialoguePathStep(
                speaker=str(parent.get("speaker") or "PNJ"),
                line=str(parent.get("line") or ""),
                player_choice_after=choice_after or None,
            )
        )

    target_node = nodes_by_id[target_key]
    steps.append(
        DialoguePathStep(
            speaker=str(target_node.get("speaker") or "PNJ"),
            line=str(target_node.get("line") or ""),
            player_choice_after=None,
        )
    )
    return steps


def format_generation_prompt(
    path_steps: List[DialoguePathStep],
    user_instructions: str,
    culminating_choice_text: Optional[str] = None,
    player_choice_label: str = "PJ",
) -> str:
    """Formate le prompt utilisateur avec l'historique complet du dialogue."""
    lines = ["Historique du dialogue (du début jusqu'au nœud parent):"]
    if not path_steps:
        lines.append("(aucun contexte antérieur)")
    for step in path_steps:
        lines.append(f"{step.speaker}: {step.line}")
        if step.player_choice_after:
            lines.append(f"{player_choice_label}: {step.player_choice_after}")

    if culminating_choice_text is not None:
        lines.extend(
            [
                "",
                "Réponse du joueur (choix à développer):",
                culminating_choice_text,
            ]
        )

    lines.extend(
        [
            "",
            "Instructions pour la suite:",
            user_instructions,
            "",
        ]
    )
    return "\n".join(lines)


def build_enriched_generation_prompt(
    *,
    nodes: Optional[List[Dict[str, Any]]],
    parent_node_id: str,
    parent_speaker: str,
    parent_line: str,
    user_instructions: str,
    choice_text: Optional[str] = None,
    player_choice_label: str = "PJ",
) -> str:
    """Prompt enrichi : chemin ancêtre complet si ``nodes`` fourni, sinon parent seul."""
    if nodes:
        path_steps = build_ancestor_path_steps(nodes, parent_node_id)
        if path_steps:
            return format_generation_prompt(
                path_steps,
                user_instructions,
                choice_text,
                player_choice_label=player_choice_label,
            )

    choice_prefix = player_choice_label
    if choice_text is not None:
        return (
            f"Contexte précédent:\n{parent_speaker}: {parent_line}\n\n"
            f"Réponse du {choice_prefix}:\n{choice_text}\n\n"
            f"Instructions pour la suite:\n{user_instructions}\n"
        )
    return (
        f"Contexte précédent:\n{parent_speaker}: {parent_line}\n\n"
        f"Instructions pour la suite:\n{user_instructions}\n"
    )
