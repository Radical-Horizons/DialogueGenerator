"""Reconstruction du chemin ancêtre START → parent pour les prompts de génération."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from services.dialogue_dramatic_progression import DIALOGUE_GENERATION_GLOBAL_CONSTRAINTS

DIALOGUE_GENERATION_CONSTRAINTS_SUFFIX = DIALOGUE_GENERATION_GLOBAL_CONSTRAINTS

# Ordre de lecture d'un choix testé : l'issue « normale » avant l'issue critique,
# pour que « réussite ou réussite critique » se lise dans le bon sens quand un même
# nœud sert aux deux.
TEST_OUTCOME_FIELDS: Tuple[Tuple[str, str], ...] = (
    ("testSuccessNode", "réussite"),
    ("testCriticalSuccessNode", "réussite critique"),
    ("testFailureNode", "échec"),
    ("testCriticalFailureNode", "échec critique"),
)


@dataclass(frozen=True)
class DialoguePathStep:
    """Une étape du chemin : réplique PNJ, éventuel choix PJ suivant et issue de son test."""

    speaker: str
    line: str
    player_choice_after: Optional[str] = None
    test_outcome_after: Optional[str] = None


@dataclass(frozen=True)
class _ParentLink:
    """Lien enfant → parent : nœud parent, texte du choix, issue du test éventuel."""

    parent: Dict[str, Any]
    choice_text: str
    test_outcome: Optional[str] = None


def describe_test_outcome(test: str, outcomes: List[str]) -> str:
    """Phrase d'historique pour un enfant atteint par l'issue d'un test.

    Args:
        test: Test du choix (``Caractéristique+Compétence:DD``).
        outcomes: Issues menant au même enfant, dans l'ordre de ``TEST_OUTCOME_FIELDS``.

    Returns:
        Ex. « Échec ou échec critique du test Intelligence+Orientation:15 ».
    """
    label = " ou ".join(outcomes)
    return f"{label[:1].upper()}{label[1:]} du test {test}"


def _links_from_choice(
    choice: Dict[str, Any],
    known_ids: set[str],
) -> List[Tuple[str, Optional[str]]]:
    """Cibles d'un choix avec l'issue de test qui y mène (``None`` pour ``targetNode``)."""
    links: List[Tuple[str, Optional[str]]] = []
    test = str(choice.get("test") or "").strip()
    if test:
        outcomes_by_target: Dict[str, List[str]] = {}
        for field, label in TEST_OUTCOME_FIELDS:
            target = choice.get(field)
            if target and target != "END" and str(target) in known_ids:
                outcomes_by_target.setdefault(str(target), []).append(label)
        for target, outcomes in outcomes_by_target.items():
            links.append((target, describe_test_outcome(test, outcomes)))
    target = choice.get("targetNode")
    if target and target != "END" and str(target) in known_ids:
        links.append((str(target), None))
    return links


def _build_parent_map(
    nodes: List[Dict[str, Any]],
) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, _ParentLink]]:
    """Indexe les nœuds et la relation enfant → parent (choix direct ou issue de test)."""
    nodes_by_id: Dict[str, Dict[str, Any]] = {}
    for node in nodes:
        node_id = node.get("id")
        if node_id:
            nodes_by_id[str(node_id)] = node

    known_ids = set(nodes_by_id)
    parent_map: Dict[str, _ParentLink] = {}
    for node in nodes:
        if not node.get("id"):
            continue
        for choice in node.get("choices") or []:
            choice_text = str(choice.get("text") or "")
            for target, outcome in _links_from_choice(choice, known_ids):
                if target not in parent_map:
                    parent_map[target] = _ParentLink(node, choice_text, outcome)
    return nodes_by_id, parent_map


def build_ancestor_path_steps(
    nodes: List[Dict[str, Any]],
    target_node_id: str,
) -> List[DialoguePathStep]:
    """Construit le chemin du START jusqu'au nœud cible (inclus).

    Un nœud atteint par l'issue d'un test (``testFailureNode``…) a pour parent le nœud
    du choix testé : l'étape porte alors le texte du choix et l'issue du test.

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

    chain: List[_ParentLink] = []
    current = target_key
    visited: set[str] = set()
    while current in parent_map and current not in visited:
        visited.add(current)
        link = parent_map[current]
        chain.append(link)
        parent_id = link.parent.get("id")
        if not parent_id:
            break
        current = str(parent_id)
    chain.reverse()

    steps: List[DialoguePathStep] = [
        DialoguePathStep(
            speaker=str(link.parent.get("speaker") or "PNJ"),
            line=str(link.parent.get("line") or ""),
            player_choice_after=link.choice_text or None,
            test_outcome_after=link.test_outcome,
        )
        for link in chain
    ]

    target_node = nodes_by_id[target_key]
    steps.append(
        DialoguePathStep(
            speaker=str(target_node.get("speaker") or "PNJ"),
            line=str(target_node.get("line") or ""),
            player_choice_after=None,
        )
    )
    return steps


DIALOGUE_REFERENCE_MAX_CHARS = 40000
DIALOGUE_REFERENCE_HEADER = (
    "Reste du dialogue déjà écrit (autres branches, hors chemin courant) — faits établis et "
    "ton de référence : ne pas les contredire, ne pas en recopier les formules."
)


def format_dialogue_reference(
    nodes: Optional[List[Dict[str, Any]]],
    exclude_ids: set[str],
    player_choice_label: str = "PJ",
    max_chars: int = DIALOGUE_REFERENCE_MAX_CHARS,
) -> str:
    """Les nœuds hors du chemin courant, en lecture compacte.

    Un prolongement ne voit sinon que sa branche : il contredit ce que les branches
    sœurs ont établi (vécu sur Voknir, 2026-11-19 : « je vous guiderai » alors que trois
    autres branches posent qu'il en est incapable).

    Args:
        nodes: Tous les nœuds du dialogue (format Unity JSON).
        exclude_ids: Nœuds déjà présents dans l'historique du chemin.
        player_choice_label: Nom du PJ pour les choix.
        max_chars: Plafond du bloc ; les nœuds au-delà sont comptés, pas cités.

    Returns:
        Bloc texte terminé par une ligne vide, ou ``""`` s'il n'y a rien d'autre.
    """
    if not nodes:
        return ""
    lines: List[str] = []
    used = 0
    omitted = 0
    for node in nodes:
        node_id = str(node.get("id") or "")
        line = str(node.get("line") or "").strip()
        if not node_id or node_id in exclude_ids or not line:
            continue
        block = [f"{node.get('speaker') or 'PNJ'}: {line}"]
        for choice in node.get("choices") or []:
            text = str(choice.get("text") or "").strip()
            if text:
                block.append(f"  {player_choice_label}: {text}")
        chunk = "\n".join(block)
        if used + len(chunk) > max_chars:
            omitted += 1
            continue
        lines.append(chunk)
        used += len(chunk)
    if not lines:
        return ""
    if omitted:
        lines.append(f"(… {omitted} nœud(s) non cités, faute de place)")
    return "\n".join([DIALOGUE_REFERENCE_HEADER, *lines, "", ""])


def ancestor_path_node_ids(
    nodes: Optional[List[Dict[str, Any]]],
    target_node_id: str,
) -> set[str]:
    """IDs des nœuds du chemin START → cible (cible incluse), ceux de l'historique."""
    if not nodes:
        return set()
    nodes_by_id, parent_map = _build_parent_map(nodes)
    current = str(target_node_id)
    if current not in nodes_by_id:
        return set()
    ids = {current}
    while current in parent_map:
        parent_id = str(parent_map[current].parent.get("id") or "")
        if not parent_id or parent_id in ids:
            break
        ids.add(parent_id)
        current = parent_id
    return ids


def infer_child_generation_depth(
    path_steps: Optional[List[DialoguePathStep]],
) -> int:
    """Profondeur du nœud à générer (1 = premier enfant après START)."""
    if not path_steps:
        return 1
    choices_taken = sum(1 for step in path_steps if step.player_choice_after)
    return choices_taken + 1


def format_path_history_lines(
    path_steps: List[DialoguePathStep],
    player_choice_label: str = "PJ",
) -> List[str]:
    """Lignes « Historique du dialogue » : répliques, choix du PJ et issues de test."""
    lines = ["Historique du dialogue (du début jusqu'au nœud parent):"]
    if not path_steps:
        lines.append("(aucun contexte antérieur)")
    for step in path_steps:
        lines.append(f"{step.speaker}: {step.line}")
        if step.player_choice_after:
            lines.append(f"{player_choice_label}: {step.player_choice_after}")
        if step.test_outcome_after:
            lines.append(f"[{step.test_outcome_after}]")
    return lines


def format_generation_prompt(
    path_steps: List[DialoguePathStep],
    user_instructions: str,
    culminating_choice_text: Optional[str] = None,
    player_choice_label: str = "PJ",
) -> str:
    """Formate le prompt utilisateur avec l'historique complet du dialogue."""
    lines = format_path_history_lines(path_steps, player_choice_label)

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
