"""Prompts du juge de benchmark — construits depuis la grille, jamais en dur.

Le prompt énumère les critères tels que la grille les définit : identifiant,
libellé, consigne, et sens explicite. Ajouter un critère à la grille suffit à le
faire apparaître ici ; aucune liste n'est dupliquée dans le code.

Conformément à `.claude/rules/structured_output.md`, le prompt ne redit pas ce que
le schéma impose déjà (forme de la réponse, bornes des notes) : il porte la
logique métier — quoi évaluer, dans quel sens, et ce qui ne doit pas peser.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, List, Optional

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
            f"{SCORE_MAX} = le défaut est massif (c'est le pire)."
        )
    else:
        sense = f"0 = très mauvais, {SCORE_MAX} = excellent."
    return (
        f"{index}. `{criterion_id}` — {label}\n"
        f"   {description}\n"
        f"   {sense}"
    )


SCORE_MAX = 10
"""Borne haute de l'échelle de notation, telle qu'annoncée au juge.

Les agrégats (`benchmark_report_service`) importent cette valeur : un barème
changé ici sans elle rendrait la normalisation `lower_is_better` fausse d'un
facteur, sous un en-tête qui continuerait d'afficher « /10 ».
"""

JUDGE_CONTEXT_MAX_CHARS = 24000
"""Plafond du contexte transmis au juge.

Le prompt d'un candidat peut atteindre 30k tokens de fiches GDD : l'envoyer
entier à chaque verdict coûterait plus cher que la génération notée. La coupure
est signalée au juge, qui sait alors qu'il ne voit pas tout.
"""


def _context_block(context: Optional[str]) -> str:
    """Construit le bloc de contexte remis au juge.

    Plusieurs critères — justesse de la voix, fidélité au contexte fourni, respect
    de la consigne — demandent de comparer la génération à ce que l'auteur avait
    sous les yeux. Sans ce bloc, le juge les note à l'aveugle et le dit lui-même
    dans ses commentaires : la note existe, elle ne mesure rien.

    Args:
        context: Prompt réellement soumis au candidat, ou ``None``.

    Returns:
        Bloc prêt à insérer, ou une mise en garde explicite si le contexte manque.
    """
    if not context or not context.strip():
        return (
            "CONTEXTE FOURNI À L'AUTEUR : indisponible.\n"
            "Tu ne peux pas vérifier la fidélité au monde ni la justesse de la voix "
            "par rapport aux fiches. Sur ces critères, note ce que le texte démontre "
            "de cohérence interne, et dis dans ton commentaire que la vérification "
            "externe est impossible.\n\n"
        )
    trimmed = context.strip()
    note = ""
    if len(trimmed) > JUDGE_CONTEXT_MAX_CHARS:
        trimmed = trimmed[:JUDGE_CONTEXT_MAX_CHARS]
        note = (
            "\n[…contexte coupé par l'outil : tu n'en vois que le début. "
            "Ne reproche pas à l'auteur d'employer un élément absent de cet extrait.]"
        )
    return (
        "CONTEXTE FOURNI À L'AUTEUR\n"
        "Voici exactement ce que l'auteur du dialogue avait sous les yeux : consigne "
        "de scène et fiches du monde. C'est la référence pour juger la fidélité et "
        "la justesse des voix.\n"
        f"```\n{trimmed}{note}\n```\n\n"
    )


def build_rubric_judge_user_prompt(
    grid: "CriteriaGrid", unity_json: str, *, context: Optional[str] = None
) -> str:
    """Construit le message utilisateur de la notation absolue.

    Args:
        grid: Grille de critères employée.
        unity_json: Génération à noter, au format Unity.
        context: Prompt soumis au candidat, référence des critères de fidélité.

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
        + _context_block(context)
        + "CRITÈRES\n\n" + "\n\n".join(blocks) + "\n\n"
        "Attention aux critères marqués SENS INVERSÉ : une note haute y signale un "
        "défaut marqué, pas une qualité.\n\n"
        f"Rends une entrée pour chacun de ces identifiants, sans en omettre ni en "
        f"ajouter : {expected_ids}.\n\n"
        "DIALOGUE À NOTER\n```json\n"
        f"{unity_json}\n```"
    )


BENCHMARK_PAIRWISE_JUDGE_SYSTEM_PROMPT = (
    "Tu es juge de dialogues de jeu de rôle écrits en français. On te soumet deux "
    "propositions, A et B, écrites à partir de la MÊME consigne et du MÊME contexte.\n"
    "Pour chaque critère de la grille, tu désignes la proposition la meilleure, ou "
    "« tie » si elles se valent, et tu indiques l'ampleur de l'écart.\n"
    "Tu ignores qui a écrit chaque proposition, et cela n'a aucune importance.\n"
    "Ne préfère pas une proposition parce qu'elle est plus longue ou plus fournie : "
    "à qualité égale, la plus concise vaut mieux.\n"
    "Juge chaque critère indépendamment : une proposition peut gagner sur l'un et "
    "perdre sur l'autre."
)


def build_pairwise_judge_user_prompt(
    grid: "CriteriaGrid",
    text_a: str,
    text_b: str,
    *,
    truncated: bool,
    context: Optional[str] = None,
) -> str:
    """Construit le message utilisateur d'une comparaison par paires.

    Args:
        grid: Grille de critères employée.
        text_a: Proposition A, déjà tronquée à la limite commune.
        text_b: Proposition B, déjà tronquée à la limite commune.
        truncated: ``True`` si au moins un des deux textes a été coupé.
        context: Prompt commun aux deux propositions — elles viennent du même cas,
            donc du même contexte, et un seul bloc suffit.

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
    # La mention n'apparaît QUE si une coupure a réellement eu lieu : l'envoyer
    # systématiquement apprendrait au juge à excuser toute fin abrupte, y compris
    # une génération réellement tronquée par le modèle — soit exactement le défaut
    # qu'un benchmark de dialogue doit détecter.
    truncation_note = (
        "\nAu moins une des propositions a été coupée à une limite de longueur "
        "imposée par l'outil, et porte alors une marque explicite en fin de texte. "
        "Cette coupure-là est un artefact de présentation : ne la pénalise pas. "
        "En revanche, une réplique qui s'interrompt sans cette marque est bien un "
        "défaut du texte.\n"
        if truncated
        else ""
    )
    return (
        "Compare les deux propositions ci-dessous sur chacun des critères suivants.\n\n"
        + _context_block(context)
        + "CRITÈRES\n\n" + "\n\n".join(blocks) + "\n\n"
        "Pour les critères marqués SENS INVERSÉ, la meilleure proposition est celle "
        "où le défaut décrit est le MOINS présent.\n\n"
        f"Rends une entrée pour chacun de ces identifiants, sans en omettre ni en "
        f"ajouter : {expected_ids}.\n"
        f"{truncation_note}\n"
        "PROPOSITION A\n```json\n"
        f"{text_a}\n```\n\n"
        "PROPOSITION B\n```json\n"
        f"{text_b}\n```"
    )
