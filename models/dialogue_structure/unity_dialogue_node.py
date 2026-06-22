"""Modèles Pydantic pour la génération de nœuds de dialogue Unity JSON.

Ces modèles représentent le contenu créatif généré par l'IA, sans les IDs techniques
qui seront ajoutés automatiquement par le système.
"""
from typing import List, Optional, Any

from pydantic import BaseModel, Field, field_validator


class UnityDialogueConsequencesContent(BaseModel):
    """Contenu des conséquences (flags narratifs) généré par l'IA."""
    flag: str = Field(..., description="Nom du flag narratif")
    description: Optional[str] = Field(
        None,
        description="Effet narratif ou mécanique (staging, flags, état du monde) — pas dans line.",
    )


class UnityDialogueTraitRequirementContent(BaseModel):
    """Exigence de trait pour débloquer un choix."""

    trait: str = Field(..., description="Nom du trait requis (ex: 'Courageux')")
    minValue: int = Field(
        ...,
        ge=-100,
        le=100,
        description="Valeur minimale requise pour ce trait (ex: 5).",
    )


class UnityDialogueChoiceContent(BaseModel):
    """Contenu d'un choix généré par l'IA."""
    text: str = Field(
        ...,
        description=(
            "Réplique du joueur entre guillemets « … », ou geste en *[italique crochets]* "
            "(ex. *[Lui tend la main.]*)."
        ),
    )
    test: Optional[str] = Field(None, description="Format: AttributeType+SkillId:DD (ex: 'Raison+Rhétorique:8')")
    testCriticalFailureNode: Optional[str] = Field(None, description="ID du nœud cible en cas d'échec critique (score < DD - 5)")
    testFailureNode: Optional[str] = Field(None, description="ID du nœud cible en cas d'échec (score >= DD - 5 et < DD)")
    testSuccessNode: Optional[str] = Field(None, description="ID du nœud cible en cas de réussite (score >= DD et < DD + 5)")
    testCriticalSuccessNode: Optional[str] = Field(None, description="ID du nœud cible en cas de réussite critique (score >= DD + 5)")
    traitRequirements: Optional[List[UnityDialogueTraitRequirementContent]] = Field(
        None, 
        description="Exigences de traits (ex: [{'trait': 'Courageux', 'minValue': 5}])"
    )
    allowInfluenceForcing: Optional[bool] = Field(None, description="Permet forcing via influence")
    influenceThreshold: Optional[int] = Field(None, description="Seuil d'influence requis")
    influenceDelta: Optional[int] = Field(None, description="Modification d'influence (peut être négatif)")
    respectDelta: Optional[int] = Field(None, description="Modification de respect (peut être négatif)")
    condition: Optional[str] = Field(
        None, 
        description="Condition d'affichage (format: 'FLAG_NAME', 'NOT FLAG_NAME', ou 'startState == 1')"
    )


class UnityDialogueNodeContent(BaseModel):
    """Contenu d'un nœud de dialogue généré par l'IA (sans ID technique).
    
    L'ID sera généré automatiquement par le système.
    """
    speaker: Optional[str] = Field(None, description="ID du personnage qui parle (contrôlé par l'auteur)")
    line: Optional[str] = Field(
        None,
        description=(
            "Texte du nœud : paroles du PNJ entre guillemets « … » ; didascalies en *italique* "
            "(markdown), voix narrateur 3e personne, hors guillemets. Retours à la ligne \\n autorisés."
        ),
    )
    test: Optional[str] = Field(
        None, 
        description="Format: AttributeType+SkillId:DD (ex: 'Raison+Rhétorique:8'). La compétence est obligatoire."
    )
    consequences: Optional[UnityDialogueConsequencesContent] = Field(None, description="Flags narratifs à activer")
    isLongRest: Optional[bool] = Field(None, description="Si true, déclenche un repos long")
    startState: Optional[int] = Field(None, description="État de démarrage pour dialogues multi-entrées")
    choices: Optional[List[UnityDialogueChoiceContent]] = Field(None, description="Choix disponibles pour le joueur")

    @field_validator("consequences", mode="before")
    @classmethod
    def normalize_consequences(cls, value: Any) -> Any:
        """Normalise `consequences` en objet unique.

        Certains providers / modes (structured output, streaming) renvoient parfois
        `node.consequences` comme une liste d'objets (souvent de taille 1) au lieu
        d'un objet unique conforme au schéma. On convertit donc :
        - `[{...}]` -> `{...}`
        - `[]` -> `None`
        - `[x, ...]` -> `x` (premier élément)
        """
        if value is None:
            return None
        if isinstance(value, list):
            if len(value) == 0:
                return None
            return value[0]
        return value


class UnityDialogueGenerationResponse(BaseModel):
    """Réponse de génération : un seul nœud de dialogue (sans ID technique).
    
    Le système génère un nœud à la fois contenant une réplique du PNJ et les choix du joueur.
    Les IDs seront ajoutés automatiquement par le système.
    """
    title: str = Field(
        ...,
        description="Titre descriptif du dialogue (ex: 'Rencontre avec le tavernier', 'Discussion sur la quête')"
    )
    node: UnityDialogueNodeContent = Field(
        ..., 
        description="Un seul nœud de dialogue généré par l'IA (réplique PNJ + choix joueur)"
    )

