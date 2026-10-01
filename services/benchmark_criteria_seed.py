"""Grille de critères de départ du benchmark (§5 de la spécification fonctionnelle).

Livrée en donnée : c'est un point de départ à ajuster, pas une vérité du code.
Chaque critère porte un identifiant stable — jamais son libellé — et son sens
explicite, de sorte qu'un critère négatif reste négatif quel que soit l'affichage.

Deux critères portent le poids maximal, pour la même raison — ils décident à eux
seuls si une génération est utilisable :

- la **correction du français**, que les benchmarks anglophones ne mesurent pas et
  où se cassent les modèles fine-tunés sur de l'anglais ;
- la **fidélité au contexte fourni**, parce que l'outil travaille sur 50 000 à
  120 000 caractères de fiches : un modèle qui contredit le monde produit du
  texte à jeter, quelle qu'en soit la beauté.

L'**invention hors contexte** est délibérément séparée de la seconde et faiblement
pondérée : fondue dans la fidélité, elle rendait la note illisible — on ne savait
plus si un 6 signalait un monde contredit ou un ajout heureux. Séparée, elle garde
sa propre colonne et ses propres commentaires, où l'on va chercher les trouvailles
qui méritent d'entrer dans le GDD.

La version 3 (octobre 2026) sépare ce que la v2 laissait au juge de concilier. Le
naturel de l'oral se note **brut**, avec des repères : 28 notes sur 48 valaient
exactement 6, et une échelle aussi comprimée ne voit pas un progrès. La
**cohérence interne de la voix** entre comme critère à part : le jeu assume des
personnages bizarres, et une oralité faible n'est légitime que si la voix est
juste **et** tenue sans faille — règle appliquée par le rapport, pas par le juge,
qui excusait l'oralité au cas par cas (« cohérent avec la fiche, mais… »). Enfin
la justesse de la voix ne récompense plus la recopie : le juge saluait une formule
reprise « presque mot pour mot » comme un signe de fidélité.
"""

from __future__ import annotations

from typing import Any, Dict, List

DEFAULT_GRID_ID = "grille-dialogue-fr"
"""Identifiant de la grille de départ."""

_REPLIQUE = "Qualité de la réplique"
_BRANCHEMENT = "Qualité du branchement"
_CADRE = "Respect du cadre"
_NEGATIFS = "Négatifs"


def default_criteria() -> List[Dict[str, Any]]:
    """Retourne les critères de départ, sous forme sérialisable.

    Returns:
        Liste de définitions de critères prête pour `CriteriaGrid`.
    """
    return [
        # --- Qualité de la réplique ---
        {
            "criterion_id": "voice_fidelity",
            "label": "Justesse de la voix du personnage",
            "description": (
                "Le personnage parle comme sa fiche GDD le décrit : registre, tics, "
                "vocabulaire, rythme, rapport à l'autorité. On le reconnaîtrait sans "
                "son nom. Reprendre mot pour mot une formule de la fiche n'est pas en "
                "soi une preuve de fidélité : c'est la manière qui compte, pas la "
                "citation."
            ),
            "direction": "higher_is_better",
            "weight": 1.5,
            "group": _REPLIQUE,
        },
        {
            "criterion_id": "voice_consistency",
            "label": "Cohérence interne de la voix",
            "description": (
                "D'un panneau à l'autre et d'une branche à l'autre, le personnage parle "
                "selon les mêmes règles : ses singularités — syntaxe, tics, registre, "
                "tutoiement ou vouvoiement — sont tenues sans faille, pas semées au "
                "hasard. Une étrangeté constante est une voix ; une étrangeté "
                "intermittente est une erreur."
            ),
            "direction": "higher_is_better",
            "weight": 1.0,
            "group": _REPLIQUE,
        },
        {
            "criterion_id": "voice_distinction",
            "label": "Distinction entre les voix",
            "description": (
                "Deux personnages ne parlent pas pareil : rythme, niveau de langue et "
                "manières diffèrent nettement."
            ),
            "direction": "higher_is_better",
            "weight": 1.0,
            "group": _REPLIQUE,
        },
        {
            "criterion_id": "oral_naturalness",
            "label": "Naturel de l'oral",
            "description": (
                "Ça se dit à voix haute. Pas de tournure qui ne s'emploie qu'à l'écrit, "
                "pas de phrase qu'un acteur trébucherait à prononcer. Repères : 8 — "
                "chaque phrase se dit d'un souffle, le rythme est celui d'une parole ; "
                "6 — prononçable, mais des phrases longues ou soudées (point-virgule, "
                "deux-points, subordonnées en cascade) trahissent l'écrit ; 4 — il faut "
                "relire une phrase avant de pouvoir la dire. Une syntaxe singulière "
                "exigée par la fiche se note ici comme les autres : c'est la justesse "
                "et la cohérence de la voix, notées à part, qui disent si elle est "
                "légitime."
            ),
            "direction": "higher_is_better",
            "weight": 1.2,
            "group": _REPLIQUE,
        },
        {
            "criterion_id": "concision",
            "label": "Concision",
            "description": (
                "Dit en peu de mots. Pas de tirade là où une phrase suffit, pas de "
                "reformulation de ce qui vient d'être dit."
            ),
            "direction": "higher_is_better",
            "weight": 1.0,
            "group": _REPLIQUE,
        },
        {
            "criterion_id": "french_correctness",
            "label": "Correction du français",
            "description": (
                "Grammaire, accords, conjugaison, idiomes. Toute faute, tout calque de "
                "l'anglais, toute tournure qui sonne traduite doit faire chuter la note."
            ),
            "direction": "higher_is_better",
            "weight": 2.0,
            "group": _REPLIQUE,
        },
        # --- Qualité du branchement ---
        {
            "criterion_id": "option_differentiation",
            "label": "Différenciation des options",
            "description": (
                "Les choix proposés au joueur engagent des intentions réellement "
                "distinctes, et non trois reformulations d'une même réponse."
            ),
            "direction": "higher_is_better",
            "weight": 1.5,
            "group": _BRANCHEMENT,
        },
        {
            "criterion_id": "intent_readability",
            "label": "Lisibilité de l'intention",
            "description": (
                "En lisant un choix, le joueur comprend ce qu'il engage — sans piège, "
                "sans avoir à deviner le ton que prendra sa réplique."
            ),
            "direction": "higher_is_better",
            "weight": 1.2,
            "group": _BRANCHEMENT,
        },
        {
            "criterion_id": "perceptible_consequence",
            "label": "Conséquence perceptible",
            "description": (
                "La réponse du PNJ dépend visiblement du choix fait : le joueur voit "
                "que son option a compté."
            ),
            "direction": "higher_is_better",
            "weight": 1.2,
            "group": _BRANCHEMENT,
        },
        {
            "criterion_id": "branch_coherence",
            "label": "Cohérence des embranchements",
            "description": (
                "Aucune branche ne contredit une autre : les faits, l'humeur du PNJ et "
                "l'état de la scène restent compatibles d'une option à l'autre."
            ),
            "direction": "higher_is_better",
            "weight": 1.0,
            "group": _BRANCHEMENT,
        },
        # --- Respect du cadre ---
        {
            "criterion_id": "context_fidelity",
            "label": "Fidélité au contexte fourni",
            "description": (
                "Utilise ce que le contexte donne, et ne le **contredit pas**. Toute "
                "affirmation incompatible avec les fiches — un fait, un nom, une "
                "relation, un état du monde rendu faux — doit faire chuter la note "
                "lourdement, même si le texte est beau par ailleurs : un dialogue qui "
                "contredit le monde est inutilisable en production. Cite la "
                "contradiction dans ton commentaire. Ce qui dépasse le contexte sans "
                "le contredire ne se juge pas ici mais sur `unsupported_invention`."
            ),
            "direction": "higher_is_better",
            "weight": 2.0,
            "group": _CADRE,
        },
        {
            "criterion_id": "unsupported_invention",
            "label": "Invention hors contexte",
            "description": (
                "Éléments posés comme établis alors que le contexte ne les donne pas, "
                "sans pour autant le contredire : un lieu, un rite, un personnage, un "
                "antécédent inventés de toutes pièces. À pénaliser **légèrement** : "
                "c'est un écart au cadre, pas une faute de fond. **Énumère dans ton "
                "commentaire chaque invention repérée, telle que le texte la formule** "
                "— certaines méritent d'entrer dans le monde, et c'est ton commentaire "
                "qui permet de les retrouver."
            ),
            "direction": "lower_is_better",
            "weight": 0.5,
            "group": _CADRE,
        },
        {
            "criterion_id": "world_codes",
            "label": "Respect des codes du monde",
            "description": (
                "Registre, termes propres à l'univers, interdits du monde. Emploie le "
                "vocabulaire de l'univers là où il existe."
            ),
            "direction": "higher_is_better",
            "weight": 1.2,
            "group": _CADRE,
        },
        {
            "criterion_id": "instruction_compliance",
            "label": "Respect de la consigne",
            "description": (
                "Longueur, nombre de branches et ton demandés sont tenus. Un texte qui "
                "dépasse nettement la longueur demandée doit être pénalisé ici, même "
                "s'il est bon par ailleurs."
            ),
            "direction": "higher_is_better",
            "weight": 1.5,
            "group": _CADRE,
        },
        # --- Négatifs : bas = mieux ---
        {
            "criterion_id": "blandness",
            "label": "Platitude / dialogue de remplissage",
            "description": (
                "Répliques qui n'apprennent rien, ne coûtent rien et pourraient être "
                "coupées sans perte."
            ),
            "direction": "lower_is_better",
            "weight": 1.2,
            "group": _NEGATIFS,
        },
        {
            "criterion_id": "forced_exposition",
            "label": "Exposition forcée",
            "description": (
                "Des personnages s'expliquent mutuellement ce qu'ils savent déjà, pour "
                "informer le joueur."
            ),
            "direction": "lower_is_better",
            "weight": 1.2,
            "group": _NEGATIFS,
        },
        {
            "criterion_id": "ai_tics",
            "label": "Tics d'IA et formules toutes faites",
            "description": (
                "Tournures caractéristiques des modèles, formules creuses, transitions "
                "mécaniques, superlatifs automatiques."
            ),
            "direction": "lower_is_better",
            "weight": 1.5,
            "group": _NEGATIFS,
        },
        {
            "criterion_id": "overwriting",
            "label": "Sur-écriture",
            "description": (
                "Métaphores gratuites, lyrisme déplacé dans une réplique parlée, "
                "adjectifs empilés."
            ),
            "direction": "lower_is_better",
            "weight": 1.0,
            "group": _NEGATIFS,
        },
        {
            "criterion_id": "register_anachronism",
            "label": "Anachronisme de registre",
            "description": (
                "Vocabulaire moderne, jargon technique ou administratif dans un monde "
                "qui ne les connaît pas."
            ),
            "direction": "lower_is_better",
            "weight": 1.2,
            "group": _NEGATIFS,
        },
    ]


def default_grid_payload() -> Dict[str, Any]:
    """Retourne la grille de départ complète, sérialisable.

    Returns:
        Document prêt pour `CriteriaGrid.model_validate`.
    """
    return {
        "grid_id": DEFAULT_GRID_ID,
        "version": 3,
        "name": "Grille dialogue FR (départ)",
        "description": (
            "Grille de départ issue de la spécification fonctionnelle du mode benchmark. "
            "À ajuster : ajouter, retirer ou repondérer un critère ne demande aucune "
            "modification de code."
        ),
        "criteria": default_criteria(),
    }
