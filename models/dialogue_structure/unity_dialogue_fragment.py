"""Fragment de dialogue complet, généré en un seul appel.

L'unité que l'auteur produit n'est pas un panneau isolé : c'est un panneau, ses
options, et le panneau qui suit chacune d'elles avec ses propres options. Sur un
nœud unique dont les choix pointent vers ``END``, des critères comme « conséquence
perceptible » ou « cohérence des embranchements » n'ont rien à mesurer — le premier
run réel du benchmark les a vus tomber au plancher pour tous les modèles.

**Liste plate, pas imbrication.** Les panneaux forment une liste et chaque choix
désigne sa suite par une **clé locale d'auteur**. Une structure imbriquée
(``choix.panneauSuivant``) figerait la profondeur dans le type et ne saurait pas
exprimer deux choix convergeant vers le même panneau sans le dupliquer.

**Aucun identifiant Unity n'est exposé au modèle**, conformément à
`.claude/rules/unity_dialogue_generation.md`. Une clé locale n'en est pas un : elle
exprime l'intention narrative (« cette réponse mène là ») et disparaît à la
résolution, qui seule attribue ``id``, ``choiceId`` et ``targetNode``. Les champs
``testSuccessNode`` / ``testFailureNode`` de la génération mono-nœud ne sont
délibérément pas repris ici.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field

from models.dialogue_structure.unity_dialogue_node import (
    UnityDialogueConsequencesContent,
    UnityDialogueTraitRequirementContent,
)

MIN_PANELS = 2
MAX_PANELS = 10
"""Bornes du fragment. Portées par le schéma : les Structured Outputs honorent
``minItems`` / ``maxItems``, la forme n'a donc pas à être quémandée au prompt."""

MIN_CHOICES = 2
MAX_CHOICES = 6
"""Bornes des options d'un panneau. Le plafond reste sous les 8 du schéma d'export
Unity — une génération plus large serait recalée en aval sans rien mesurer de plus."""


class UnityDialogueFragmentChoice(BaseModel):
    """Option offerte au joueur, désignant éventuellement le panneau qui la suit."""

    text: str = Field(
        ...,
        description=(
            "Réplique du joueur entre guillemets « … », ou geste en *[italique crochets]* "
            "(ex. *[Lui tend la main.]*)."
        ),
    )
    leadsTo: Optional[str] = Field(
        None,
        description=(
            "Clé du panneau joué juste après ce choix, telle qu'elle apparaît dans "
            "`key`. Laisser vide si la branche s'arrête ici."
        ),
    )
    test: Optional[str] = Field(
        None, description="Format: AttributeType+SkillId:DD (ex: 'Raison+Rhétorique:8')"
    )
    traitRequirements: Optional[List[UnityDialogueTraitRequirementContent]] = Field(
        None, description="Exigences de traits (ex: [{'trait': 'Courageux', 'minValue': 5}])"
    )
    condition: Optional[str] = Field(
        None,
        description=(
            "Condition d'affichage (format: 'FLAG_NAME', 'NOT FLAG_NAME', "
            "ou 'startState == 1')"
        ),
    )
    influenceDelta: Optional[int] = Field(None, description="Modification d'influence")
    respectDelta: Optional[int] = Field(None, description="Modification de respect")


class UnityDialogueFragmentPanel(BaseModel):
    """Un panneau du fragment : une réplique et les options qu'elle ouvre."""

    key: Optional[str] = Field(
        None,
        description=(
            "Nom court et unique servant à désigner ce panneau depuis les choix qui "
            "y mènent (ex. 'ouverture', 'refus_sec'). Sans valeur pour le premier "
            "panneau, qui est l'ouverture."
        ),
    )
    displayName: Optional[str] = Field(
        None,
        description=(
            "Libellé court du panneau pour l'éditeur de graphe (2–6 mots). "
            "Ex: 'Accueil du tavernier', 'Menace voilée'."
        ),
    )
    speaker: Optional[str] = Field(None, description="ID du personnage qui parle")
    line: Optional[str] = Field(
        None,
        description=(
            "Texte du panneau : paroles du PNJ entre guillemets « … » ; didascalies en "
            "*italique* (markdown), voix narrateur 3e personne, hors guillemets."
        ),
    )
    test: Optional[str] = Field(
        None, description="Format: AttributeType+SkillId:DD (ex: 'Raison+Rhétorique:8')"
    )
    consequences: Optional[UnityDialogueConsequencesContent] = Field(
        None, description="Flags narratifs à activer"
    )
    choices: Optional[List[UnityDialogueFragmentChoice]] = Field(
        None,
        min_length=MIN_CHOICES,
        max_length=MAX_CHOICES,
        description="Options offertes au joueur après cette réplique.",
    )


class UnityDialogueFragmentResponse(BaseModel):
    """Réponse de génération d'un fragment complet.

    Le **premier panneau de la liste est l'ouverture** ; les suivants sont atteints
    par les choix qui les désignent.
    """

    title: str = Field(
        ...,
        description="Titre descriptif du fragment (ex: 'Première rencontre à l'atelier')",
    )
    panels: List[UnityDialogueFragmentPanel] = Field(
        ...,
        min_length=MIN_PANELS,
        max_length=MAX_PANELS,
        description=(
            "Panneaux du fragment. Le premier est l'ouverture ; chaque autre est la "
            "suite d'un choix qui le désigne par sa clé."
        ),
    )
