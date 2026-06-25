"""Validation Unity pour nœuds enrichis post-génération (structure + choix).

Aligne génération graphe / expand-tree sur le pipeline standalone
(``UnityJsonRenderer.validate_nodes`` + règles ``max_choices`` / ``choices_mode``).
"""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, Sequence

from services.json_renderer.unity_json_renderer import UnityJsonRenderer

ChoicesMode = Literal["free", "capped"]


class UnityNodeValidationError(ValueError):
    """Erreur de validation structurelle ou métier sur un nœud Unity enrichi."""


def validate_choice_count(
    choices: Optional[Sequence[Any]],
    *,
    max_choices: Optional[int],
    choices_mode: ChoicesMode = "capped",
    node_label: str = "?",
) -> None:
    """Applique les règles UI / ``UnityDialogueGenerationService`` sur une liste de choix.

    Args:
        choices: Liste de choix (ou ``None`` pour nœud terminal sans branche).
        max_choices: Plafond explicite (``0`` = feuille sans choix).
        choices_mode: ``capped`` (respect du plafond) ou ``free`` (2–8 choix ou terminal).
        node_label: Identifiant affiché dans les messages d'erreur.

    Raises:
        UnityNodeValidationError: Si le nombre de choix est incohérent.
    """
    if max_choices is not None:
        if max_choices == 0:
            if choices:
                raise UnityNodeValidationError(
                    f"Nœud '{node_label}': feuille attendue (max_choices=0) "
                    f"mais {len(choices)} choix présents."
                )
            return
        if choices and len(choices) > max_choices:
            raise UnityNodeValidationError(
                f"Nœud '{node_label}': {len(choices)} choix > max_choices={max_choices}."
            )
        return

    if choices_mode != "free":
        return

    if choices is None:
        return

    num_choices = len(choices)
    if num_choices == 0:
        raise UnityNodeValidationError(
            f"Nœud '{node_label}': mode libre — liste de choix vide interdite "
            "(utiliser choices=null pour une feuille)."
        )
    if num_choices == 1:
        raise UnityNodeValidationError(
            f"Nœud '{node_label}': mode libre — un seul choix interdit (minimum 2)."
        )
    if num_choices > 8:
        raise UnityNodeValidationError(
            f"Nœud '{node_label}': mode libre — {num_choices} choix (> 8)."
        )


def validate_enriched_nodes(
    nodes: List[Dict[str, Any]],
    *,
    context_label: Optional[str] = None,
) -> None:
    """Valide ids, références et champs test (``UnityJsonRenderer.validate_nodes``).

    Args:
        nodes: Nœuds Unity enrichis (dict).
        context_label: Préfixe optionnel pour le message d'erreur.

    Raises:
        UnityNodeValidationError: Si la validation structurelle échoue.
    """
    renderer = UnityJsonRenderer()
    is_valid, errors = renderer.validate_nodes(nodes)
    if not is_valid:
        prefix = f"{context_label}: " if context_label else ""
        raise UnityNodeValidationError(f"{prefix}{'; '.join(errors)}")


def validate_enriched_node(
    node: Dict[str, Any],
    *,
    max_choices: Optional[int] = None,
    choices_mode: ChoicesMode = "capped",
    context_label: Optional[str] = None,
) -> None:
    """Structure + nombre de choix pour un nœud enrichi unique.

    Args:
        node: Nœud Unity enrichi.
        max_choices: Plafond de choix pour cette génération (``0`` = feuille).
        choices_mode: Mode capped ou free (voir ``validate_choice_count``).
        context_label: Libellé pour les messages d'erreur.

    Raises:
        UnityNodeValidationError: Si structure ou choix invalides.
    """
    if node.get("choices") == []:
        node["choices"] = None

    label = context_label or str(node.get("id", "?"))
    validate_enriched_nodes([node], context_label=label)
    validate_choice_count(
        node.get("choices"),
        max_choices=max_choices,
        choices_mode=choices_mode,
        node_label=label,
    )


def infer_choices_mode(
    choices_mode: Optional[ChoicesMode],
    max_choices: Optional[int],
) -> ChoicesMode:
    """Déduit le mode choix comme l'UI (capped si plafond explicite, sinon free).

    Args:
        choices_mode: Valeur explicite ou ``None``.
        max_choices: Plafond numérique éventuel.

    Returns:
        ``capped`` ou ``free``.
    """
    if choices_mode is not None:
        return choices_mode
    return "capped" if max_choices is not None else "free"
