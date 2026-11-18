"""Validation Unity pour nœuds enrichis post-génération (structure + choix).

Aligne génération graphe / expand-tree sur le pipeline standalone
(``UnityJsonRenderer.validate_nodes`` + règles ``max_choices`` / ``choices_mode``).
"""
from __future__ import annotations

import logging
from functools import lru_cache
from typing import AbstractSet, Any, Dict, List, Literal, Optional, Sequence, Tuple

from services.json_renderer.unity_json_renderer import UnityJsonRenderer

logger = logging.getLogger(__name__)

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


@lru_cache(maxsize=1)
def _skill_check_catalog_ids() -> Tuple[frozenset[str], frozenset[str]]:
    """(caractéristiques, compétences) du catalogue Unity, lus une fois par processus."""
    from services.skill_check_catalog import (
        load_attribute_ids_for_prompt,
        load_skill_ids_for_prompt,
    )

    return frozenset(load_attribute_ids_for_prompt()), frozenset(load_skill_ids_for_prompt())


def find_off_catalog_tests(
    node: Dict[str, Any],
    *,
    attribute_ids: Optional[AbstractSet[str]] = None,
    skill_ids: Optional[AbstractSet[str]] = None,
) -> List[str]:
    """Signale les tests dont la caractéristique ou la compétence n'existe pas.

    Le format ``Caractéristique+Compétence:DD`` est garanti par le schéma ; les
    identifiants, non. Un test hors catalogue reste exportable mais ne se résoudra pas
    dans Unity : c'est un avertissement, pas une erreur.

    Args:
        node: Nœud Unity enrichi.
        attribute_ids: Caractéristiques admises (défaut : les 8 du catalogue).
        skill_ids: Compétences admises (défaut : ``SkillCatalog.csv`` ; vide = non vérifié).

    Returns:
        Un message par identifiant inconnu, dans l'ordre des choix.
    """
    if attribute_ids is None or skill_ids is None:
        default_attributes, default_skills = _skill_check_catalog_ids()
        attribute_ids = default_attributes if attribute_ids is None else attribute_ids
        skill_ids = default_skills if skill_ids is None else skill_ids

    label = str(node.get("id", "?"))
    warnings: List[str] = []
    for index, choice in enumerate(node.get("choices") or []):
        test = str((choice or {}).get("test") or "").strip()
        if not test:
            continue
        attribute, _, skill = test.split(":", 1)[0].partition("+")
        if attribute not in attribute_ids:
            warnings.append(
                f"Nœud '{label}', choix {index} : caractéristique « {attribute} » "
                f"hors catalogue (test « {test} »)."
            )
        if skill and skill_ids and skill not in skill_ids:
            warnings.append(
                f"Nœud '{label}', choix {index} : compétence « {skill} » "
                f"hors catalogue (test « {test} »)."
            )
    return warnings


def validate_enriched_node(
    node: Dict[str, Any],
    *,
    max_choices: Optional[int] = None,
    choices_mode: ChoicesMode = "capped",
    context_label: Optional[str] = None,
) -> List[str]:
    """Structure + nombre de choix pour un nœud enrichi unique.

    Args:
        node: Nœud Unity enrichi.
        max_choices: Plafond de choix pour cette génération (``0`` = feuille).
        choices_mode: Mode capped ou free (voir ``validate_choice_count``).
        context_label: Libellé pour les messages d'erreur.

    Returns:
        Avertissements non bloquants (tests hors catalogue), déjà journalisés.

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
    warnings = find_off_catalog_tests(node)
    for warning in warnings:
        logger.warning("Test hors catalogue : %s", warning)
    return warnings


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
