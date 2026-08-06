"""Résolution d'un fragment généré en document Unity plat.

Le modèle désigne l'enchaînement par des **clés locales d'auteur** ; Unity attend
des identifiants techniques reliés par ``targetNode``. La traduction se fait ici,
et nulle part ailleurs : c'est l'application qui attribue les identifiants, jamais
le LLM (`.claude/rules/unity_dialogue_generation.md`).

Les anomalies de référence — clé inconnue, clé dupliquée, panneau inatteignable —
sont **retournées**, pas levées : le mode benchmark les transforme en génération
``invalid``, exclue des moyennes, jamais notée zéro. Une exception ferait tomber
le run entier pour une sortie que le protocole sait déjà qualifier.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from models.dialogue_structure.unity_dialogue_fragment import (
    UnityDialogueFragmentResponse,
)

START_NODE_ID = "START"
"""Identifiant du panneau d'ouverture, aligné sur ``enrich_with_ids``."""

END_MARKER = "END"
"""Fin de branche : reconnu par Unity, jamais matérialisé en nœud."""

SCHEMA_VERSION = "1.1.0"


@dataclass
class FragmentResolution:
    """Document résolu et anomalies de référence relevées.

    Attributes:
        document: Document Unity ``{schemaVersion, nodes}``.
        title: Titre proposé par le modèle.
        reference_errors: Anomalies lisibles ; vides si le fragment est cohérent.
        panel_count: Nombre de panneaux résolus.
    """

    document: Dict[str, Any]
    title: str
    reference_errors: List[str] = field(default_factory=list)
    panel_count: int = 0


def _node_id(index: int) -> str:
    """Compose l'identifiant technique d'un panneau.

    Args:
        index: Rang du panneau dans la liste générée.

    Returns:
        ``START`` pour l'ouverture, un identifiant unique sinon.
    """
    return START_NODE_ID if index == 0 else f"node-{uuid.uuid4().hex}"


def _choice_id(node_id: str, index: int) -> str:
    """Compose l'identifiant d'un choix.

    Args:
        node_id: Panneau portant le choix.
        index: Rang du choix.

    Returns:
        Identifiant stable du choix.
    """
    return f"choice_{node_id}_{index}"


def _display_name_for(panel: Any, node_id: str, fallback_title: str) -> str:
    """Résout le ``displayName`` d'un panneau.

    Priorité : valeur du modèle → titre du fragment → première ligne → identifiant.

    Args:
        panel: Panneau généré.
        node_id: Identifiant technique attribué.
        fallback_title: Titre du fragment.

    Returns:
        Libellé non vide.
    """
    for candidate in ((panel.displayName or "").strip(), fallback_title.strip()):
        if candidate:
            return candidate
    line = (panel.line or "").strip()
    if line:
        first = line.split("\n", 1)[0].strip()
        if first:
            return first
    return node_id


def resolve_fragment(
    response: UnityDialogueFragmentResponse,
    *,
    speaker_fallback: Optional[str] = None,
) -> FragmentResolution:
    """Convertit un fragment généré en document Unity plat.

    Args:
        response: Fragment généré, à clés locales.
        speaker_fallback: Locuteur appliqué aux panneaux qui n'en déclarent pas.

    Returns:
        Le document résolu et les anomalies de référence relevées.
    """
    panels = list(response.panels)
    errors: List[str] = []

    # Attribution des identifiants avant toute résolution : un choix peut désigner
    # un panneau situé plus loin dans la liste.
    ids: List[str] = [_node_id(index) for index in range(len(panels))]
    key_to_id: Dict[str, str] = {}
    for index, panel in enumerate(panels):
        key = (panel.key or "").strip()
        if not key:
            # L'ouverture n'a pas besoin de clé : rien ne la désigne.
            if index == 0:
                continue
            errors.append(f"Panneau {index + 1} sans clé : aucun choix ne peut le désigner")
            continue
        if key in key_to_id:
            errors.append(f"Clé de panneau en double : '{key}'")
            continue
        key_to_id[key] = ids[index]

    referenced: set[str] = set()
    nodes: List[Dict[str, Any]] = []

    for index, panel in enumerate(panels):
        node_id = ids[index]
        choices: List[Dict[str, Any]] = []
        for position, choice in enumerate(panel.choices or []):
            target = END_MARKER
            leads_to = (choice.leadsTo or "").strip()
            if leads_to:
                if leads_to in key_to_id:
                    target = key_to_id[leads_to]
                    referenced.add(leads_to)
                else:
                    # La clé non résolue est conservée telle quelle plutôt que rabattue
                    # sur END : la porte de connexité la verra pendre, alors qu'un END
                    # silencieux ferait passer une branche cassée pour une fin voulue.
                    target = leads_to
                    errors.append(
                        f"Le choix {position + 1} du panneau {index + 1} mène à '{leads_to}', "
                        f"qui ne correspond à aucun panneau"
                    )
            entry: Dict[str, Any] = {
                "choiceId": _choice_id(node_id, position),
                "text": choice.text,
                "targetNode": target,
            }
            for name in ("test", "condition", "influenceDelta", "respectDelta"):
                value = getattr(choice, name, None)
                if value is not None:
                    entry[name] = value
            if choice.traitRequirements:
                entry["traitRequirements"] = [
                    requirement.model_dump(exclude_none=True)
                    for requirement in choice.traitRequirements
                ]
            choices.append(entry)

        node: Dict[str, Any] = {
            "id": node_id,
            "displayName": _display_name_for(panel, node_id, response.title),
            "line": panel.line or "",
            "choices": choices,
        }
        speaker = (panel.speaker or "").strip() or (speaker_fallback or "").strip()
        if speaker:
            node["speaker"] = speaker
        if panel.test is not None:
            node["test"] = panel.test
        if panel.consequences is not None:
            node["consequences"] = panel.consequences.model_dump(exclude_none=True)
        nodes.append(node)

    for index, panel in enumerate(panels[1:], start=1):
        key = (panel.key or "").strip()
        if key and key not in referenced:
            errors.append(f"Panneau '{key}' inatteignable : aucun choix n'y mène")

    return FragmentResolution(
        document={"schemaVersion": SCHEMA_VERSION, "nodes": nodes},
        title=response.title,
        reference_errors=errors,
        panel_count=len(nodes),
    )
