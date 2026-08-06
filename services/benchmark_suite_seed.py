"""Jeu de cas de départ du benchmark, ancré dans le GDD réel.

Un benchmark embarque son jeu de test : EQ-Bench livre ses 32 prompts, il ne
demande pas à l'utilisateur d'écrire les siens. Ces cas sont donc du **contenu
livré**, pas un exemple — mais ils restent de la donnée, éditables et exportables
comme n'importe quelle autre suite une fois semés sur disque.

Toutes les entités citées existent dans ``data/GDD_categories/`` sous leur nom
canonique exact, apostrophes comprises : ``Plis d’ossements`` et ``Van’Doei``
prennent l'apostrophe courbe, les noms de personnages l'apostrophe droite. Un
nom approximatif ne lève aucune erreur — il produit silencieusement un contexte
vide, et un run entier de mesures sur du vide.

Composition du contexte, par rôle : le PNJ locuteur en fiche complète, Uresaïr en
extrait, le lieu de la scène et son lieu parent en extrait. Jamais deux fiches
complètes : elles pèsent 56k à 109k caractères et satureraient à elles seules le
budget de contexte.
"""

from __future__ import annotations

from typing import Any, Dict, List

from api.schemas.benchmark import BenchmarkSuite

SMOKE_SUITE_ID = "alteir-smoke"
"""Suite de fumée : trois cas, de quoi valider la chaîne pour quelques centimes."""

STANDARD_SUITE_ID = "alteir-standard"
"""Suite standard du first playable : cinq cas, cinq PNJ, cinq fonctions."""

PLAYER_CHARACTER = "Uresaïr"
"""Seul PJ du first playable. Les PNJ sont toujours les locuteurs."""

MAX_WORDS_PER_PANEL = 300
"""Plafond du système de dialogue (cible 150). Contrainte vérifiable : c'est une porte."""

BRANCHES = 3
"""Branches demandées à l'ouverture. Chaque branche coûte des tokens de sortie,
pas un appel de plus : le fragment entier est produit en une fois."""

MIN_PANELS = 1 + BRANCHES
"""Ouverture + une suite par branche. En dessous, le fragment est incomplet."""

MIN_CHOICES = 2
MAX_CHOICES = 8
"""Le GDD annonce 2 à 10 options ; le schéma d'export Unity en plafonne 8.

C'est le schéma qui recale la génération : caler l'attente sur 10 rendrait `valid`
une sortie que la porte ``schema`` refuse par ailleurs, et le cas mentirait sur
ce qu'il mesure.
"""

CONTEXT_TOKENS_SHORT = 10000
CONTEXT_TOKENS_LONG = 30000
"""Deux régimes de contexte : la tenue de la voix quand le contexte grossit est
l'un des écarts qu'on cherche à mesurer entre modèles.

Le régime court est calé sur ``Defaults.MIN_CONTEXT_TOKENS`` — l'API refuse en
dessous, et c'est de toute façon le plancher utile quand une fiche de personnage
complète occupe déjà l'essentiel du budget.
"""

COMPLETION_TOKENS = 2000
"""De quoi écrire un panneau et ses options sans jamais tronquer.

Un plafond serré produirait des générations coupées, que les portes recaleraient :
on mesurerait la limite qu'on a posée, pas le modèle.
"""


def _case(
    *,
    case_id: str,
    title: str,
    npc: str,
    location: str,
    parent_locations: List[str],
    species: List[str],
    categories: Dict[str, str],
    instructions: str,
    context_tokens: int,
) -> Dict[str, Any]:
    """Construit un cas de benchmark à partir de ses composants.

    Args:
        case_id: Identifiant stable du cas.
        title: Libellé lisible.
        npc: Nom canonique GDD du PNJ locuteur (fiche complète).
        location: Nom canonique GDD du lieu de la scène (extrait).
        parent_locations: Lieux englobants, en extrait. Vide si aucun n'est connu.
        species: Espèces à joindre en extrait.
        categories: Étiquettes d'axe → valeur, utilisées par le découpage du rapport.
        instructions: Consigne de scène adressée au modèle.
        context_tokens: Budget de contexte du cas.

    Returns:
        Le cas sous forme de dictionnaire, validé plus tard par Pydantic.
    """
    return {
        "case_id": case_id,
        "title": title,
        "categories": categories,
        "expectations": {
            "min_choices": MIN_CHOICES,
            "max_choices": MAX_CHOICES,
            "max_words": MAX_WORDS_PER_PANEL,
            "min_panels": MIN_PANELS,
        },
        "request": {
            "user_instructions": instructions,
            "npc_speaker_id": npc,
            "player_character_id": PLAYER_CHARACTER,
            "context_selections": {
                "characters_full": [npc],
                "characters_excerpt": [PLAYER_CHARACTER],
                "locations_excerpt": [location, *parent_locations],
                "species_excerpt": species,
            },
            "max_context_tokens": context_tokens,
            "max_completion_tokens": COMPLETION_TOKENS,
        },
    }


_VOKNIR = _case(
    case_id="voknir-premiere-rencontre",
    title="Voknir — première rencontre, atelier",
    npc="Voknir Esh'Maradel",
    location="Atelier des Matrices Ossifiées",
    parent_locations=[],
    species=["Van’Doei"],
    categories={
        "fonction": "premiere-rencontre",
        "ton": "inquiet",
        "contexte": "court",
        "personnage": "Voknir",
    },
    context_tokens=CONTEXT_TOKENS_SHORT,
    instructions=(
        "Uresaïr entre pour la première fois dans l'atelier de Voknir Esh'Maradel. "
        "C'est le tout premier dialogue du jeu avec un PNJ : il installe le rapport "
        "entre ces deux-là, et il est aussi la porte d'entrée du joueur dans le monde.\n\n"
        "Écris le panneau d'ouverture de Voknir, trois options pour Uresaïr, et "
        "pour chacune le panneau qui la suit avec ses propres options.\n\n"
        "Priorités, dans cet ordre :\n"
        "1. Le ton de Voknir et sa manière de s'adresser à Uresaïr — leur rapport "
        "doit être lisible dès la première réplique, sans être expliqué.\n"
        "2. Une entrée intelligible dans l'univers et chez les Van’Doei pour un "
        "joueur qui ne connaît rien encore : ce qu'il faut comprendre doit passer "
        "par ce que Voknir fait et dit de son travail, pas par un exposé.\n"
        "3. Des options qui laissent à Uresaïr des postures nettes et distinctes."
    ),
)

_GENKA = _case(
    case_id="genka-marchandage",
    title="Genka Lien — marchandage, tunnel vertébral",
    npc="Genka Lien",
    location="Tunnel vertébral",
    parent_locations=[],
    species=[],
    categories={
        "fonction": "marchandage",
        "ton": "cordial-retors",
        "contexte": "court",
        "personnage": "Genka Lien",
    },
    context_tokens=CONTEXT_TOKENS_SHORT,
    instructions=(
        "Uresaïr croise Genka Lien dans le Tunnel vertébral. Genka a quelque chose "
        "qu'elle veut, et compte bien le lui faire payer autrement qu'en monnaie.\n\n"
        "Écris le panneau où Genka pose son prix, trois options pour Uresaïr, et "
        "pour chacune la réaction de Genka avec les options qu'elle ouvre.\n\n"
        "Ce qui est mesuré ici : la langue de Genka. Son parler de routes, ses "
        "comparaisons spontanées avec d'autres lieux, sa façon de traiter les idées "
        "abstraites comme des gens venus d'ailleurs. Le marchandage doit s'entendre "
        "dans la manière de parler, pas seulement dans ce qui est dit.\n\n"
        "Au moins une option doit permettre de refuser sans rompre."
    ),
)

_ZAEHRIA = _case(
    case_id="zaehria-confrontation",
    title="Zaehria — confrontation, Périphérie Caudale",
    npc="Zaehria Neth'Varu",
    location="Strate I - La Périphérie Caudale",
    parent_locations=["Plis d’ossements"],
    species=[],
    categories={
        "fonction": "confrontation",
        "ton": "tendu",
        "contexte": "long",
        "personnage": "Zaehria",
    },
    context_tokens=CONTEXT_TOKENS_LONG,
    instructions=(
        "Uresaïr et Zaehria Neth'Varu s'affrontent dans la Périphérie Caudale, au "
        "seuil des Plis d’ossements. Le désaccord porte sur ce qu'il faut faire "
        "ensuite, et aucune des deux n'a l'intention de céder la première.\n\n"
        "Écris le panneau de Zaehria au moment où le ton monte, trois options pour "
        "Uresaïr, et pour chacune la suite immédiate avec ses propres options.\n\n"
        "Ce qui est mesuré ici : la tenue de la voix de Zaehria sous tension et "
        "avec beaucoup de contexte disponible. Le lieu doit peser sur la scène. "
        "Les options doivent offrir de désamorcer, de tenir bon et d'aggraver — "
        "et la nature du risque de chacune doit être lisible dans son libellé, "
        "sans annoncer la conséquence elle-même."
    ),
)

_ENSEVELIE = _case(
    case_id="ensevelie-revelation",
    title="L'Ensevelie — révélation, Nexus Synaptique",
    npc="L'Ensevelie",
    location="Strate IV - Le Nexus Synaptique",
    parent_locations=["Plis d’ossements"],
    species=[],
    categories={
        "fonction": "revelation",
        "ton": "solennel",
        "contexte": "court",
        "personnage": "L'Ensevelie",
    },
    context_tokens=CONTEXT_TOKENS_SHORT,
    instructions=(
        "Uresaïr atteint L'Ensevelie dans le Nexus Synaptique, au plus profond des "
        "Plis d’ossements. Ce qu'elle dit change la compréhension qu'Uresaïr a de "
        "sa propre situation.\n\n"
        "Écris le panneau de la révélation, trois options pour Uresaïr, et pour "
        "chacune ce que L'Ensevelie répond, avec les options qui s'ouvrent alors.\n\n"
        "Ce qui est mesuré ici : la fiche de L'Ensevelie ne décrit pas sa voix. Il "
        "faut donc en inventer une, cohérente avec ce que le lieu et sa situation "
        "impliquent, sans contredire ce que le contexte affirme. Les options "
        "doivent couvrir l'accueil, le doute et le refus de la révélation."
    ),
)

_AKTHAR = _case(
    case_id="akthar-interdit",
    title="Akthar-Neth — ce dont il refuse de parler, Nef Centrale",
    npc="Akthar-Neth Amatru",
    location="Nef Centrale",
    parent_locations=["Léviathan pétrifié"],
    species=[],
    categories={
        "fonction": "revelation",
        "ton": "grave",
        "contexte": "long",
        "personnage": "Akthar-Neth",
    },
    context_tokens=CONTEXT_TOKENS_LONG,
    instructions=(
        "Uresaïr interroge Akthar-Neth Amatru dans la Nef Centrale du Léviathan "
        "pétrifié, et l'amène précisément sur ce qu'il ne veut pas aborder.\n\n"
        "Écris le panneau de sa réponse, trois options pour Uresaïr, et pour "
        "chacune la suite immédiate avec ses propres options.\n\n"
        "Ce qui est mesuré ici : sa fiche déclare ce dont il refuse de parler. Il "
        "doit se dérober en restant lui-même — détourner, se taire, répondre à côté "
        "— sans céder par complaisance envers le joueur, et sans que le refus "
        "devienne un mur qui ferme la scène. Les options doivent laisser à Uresaïr "
        "de quoi insister, contourner ou renoncer."
    ),
)


def default_suite_payloads() -> List[Dict[str, Any]]:
    """Retourne les suites de départ, dans l'ordre où elles sont semées.

    Returns:
        Documents bruts, validés à l'écriture par ``BenchmarkSuite``.
    """
    return [
        {
            "suite_id": SMOKE_SUITE_ID,
            "version": 1,
            "name": "Alteir — fumée",
            "description": (
                "Trois cas pour valider la chaîne complète (génération, portes, "
                "notation, duels) sur un budget de quelques centimes."
            ),
            "cases": [_VOKNIR, _GENKA, _ENSEVELIE],
        },
        {
            "suite_id": STANDARD_SUITE_ID,
            "version": 1,
            "name": "Alteir — first playable",
            "description": (
                "Cinq cas couvrant les cinq PNJ du first playable et cinq fonctions "
                "de dialogue, en contexte court et long. Les didascalies de narration "
                "relèvent du mode de run : lancer deux runs pour trancher cet axe."
            ),
            "cases": [_VOKNIR, _GENKA, _ZAEHRIA, _ENSEVELIE, _AKTHAR],
        },
    ]


def referenced_gdd_entities() -> Dict[str, List[str]]:
    """Recense les entités GDD citées par les suites de départ, par catégorie.

    Sert au test qui vérifie leur existence réelle sur disque : un nom approximatif
    ne lève aucune erreur au runtime, il vide silencieusement le contexte.

    Returns:
        Catégorie GDD → noms canoniques cités, dédoublonnés et triés.
    """
    collected: Dict[str, set] = {"personnages": set(), "lieux": set(), "especes": set()}
    for payload in default_suite_payloads():
        for case in payload["cases"]:
            selections = case["request"]["context_selections"]
            collected["personnages"].update(selections.get("characters_full", []))
            collected["personnages"].update(selections.get("characters_excerpt", []))
            collected["lieux"].update(selections.get("locations_excerpt", []))
            collected["especes"].update(selections.get("species_excerpt", []))
    return {category: sorted(names) for category, names in collected.items()}


def default_suites() -> List[BenchmarkSuite]:
    """Construit et valide les suites de départ.

    Returns:
        Les suites validées par Pydantic.
    """
    return [BenchmarkSuite.model_validate(payload) for payload in default_suite_payloads()]
