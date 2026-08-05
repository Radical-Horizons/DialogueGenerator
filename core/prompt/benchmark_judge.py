"""Prompts du juge de benchmark — construits depuis la grille, jamais en dur.

Le prompt énumère les critères tels que la grille les définit : identifiant,
libellé, consigne, et sens explicite. Ajouter un critère à la grille suffit à le
faire apparaître ici ; aucune liste n'est dupliquée dans le code.

Conformément à `.claude/rules/structured_output.md`, le prompt ne redit pas ce que
le schéma impose déjà (forme de la réponse, bornes des notes) : il porte la
logique métier — quoi évaluer, dans quel sens, et ce qui ne doit pas peser.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, List

if TYPE_CHECKING:  # pragma: no cover - import de typage seulement
    from api.schemas.benchmark_judging import CriteriaGrid

BENCHMARK_RUBRIC_JUDGE_SYSTEM_PROMPT = (
    "Tu es juge de dialogues de jeu de rôle écrits en français. Tu évalues un "
    "fragment de dialogue au format JSON Unity : une réplique de PNJ et les choix "
    "proposés au joueur.\n"
    "Tu notes chaque critère de la grille fournie, indépendamment des autres, en "
    "reprenant son identifiant exactement tel qu'il t'est donné.\n"
    "Tu ne juges ni la longueur en soi, ni la mise en forme du JSON : uniquement ce "
    "que les critères décrivent.\n"
    "Tu ne compares à aucun autre texte : tu notes celui-ci, seul."
)


def _format_criterion(index: int, criterion_id: str, label: str, description: str, direction: str) -> str:
    """Met en forme une ligne de critère pour le prompt.

    Args:
        index: Numéro d'ordre affiché.
        criterion_id: Identifiant stable à reprendre dans la réponse.
        label: Libellé lisible.
        description: Consigne d'évaluation.
        direction: Sens du critère.

    Returns:
        Bloc texte du critère.
    """
    if direction == "lower_is_better":
        sense = (
            "SENS INVERSÉ — 0 = le défaut est absent (c'est le mieux), "
            "10 = le défaut est massif (c'est le pire)."
        )
    else:
        sense = "0 = très mauvais, 10 = excellent."
    return (
        f"{index}. `{criterion_id}` — {label}\n"
        f"   {description}\n"
        f"   {sense}"
    )


def build_rubric_judge_user_prompt(grid: "CriteriaGrid", unity_json: str) -> str:
    """Construit le message utilisateur de la notation absolue.

    Args:
        grid: Grille de critères employée.
        unity_json: Génération à noter, au format Unity.

    Returns:
        Texte du prompt utilisateur.
    """
    blocks: List[str] = [
        _format_criterion(
            index,
            criterion.criterion_id,
            criterion.label,
            criterion.description,
            criterion.direction,
        )
        for index, criterion in enumerate(grid.criteria, start=1)
    ]
    expected_ids = ", ".join(f"`{cid}`" for cid in grid.criterion_ids())
    return (
        "Note le dialogue ci-dessous sur chacun des critères suivants.\n\n"
        "CRITÈRES\n\n" + "\n\n".join(blocks) + "\n\n"
        "Attention aux critères marqués SENS INVERSÉ : une note haute y signale un "
        "défaut marqué, pas une qualité.\n\n"
        f"Rends une entrée pour chacun de ces identifiants, sans en omettre ni en "
        f"ajouter : {expected_ids}.\n\n"
        "DIALOGUE À NOTER\n```json\n"
        f"{unity_json}\n```"
    )
