"""Schémas Pydantic pour les templates de génération custom."""
import re
from datetime import datetime
from typing import Any, List, Literal, Optional
from uuid import UUID

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator, model_validator

from api.schemas.preset import PresetConfiguration, PresetMetadata


TEMPLATE_NAME_MAX_LENGTH = 120
TEMPLATE_DESCRIPTION_MAX_LENGTH = 2000
TEMPLATE_CATEGORY_MAX_LENGTH = 120
TEMPLATE_ICON_MAX_LENGTH = 16

# Bornes A/B (Story 6.7) : source unique, consommée par le schéma (422 Pydantic)
# et par TemplateABTestingService.validate_launch_params (garde métier). Elles
# plafonnent la dépense LLM d'un run — N × 2 générations à la profondeur demandée.
MIN_GENERATIONS = 1
MAX_GENERATIONS = 5
MIN_MAX_DEPTH = 1
MAX_MAX_DEPTH = 4


def _strip_required_name(value: str) -> str:
    """Normalise le nom : strip, puis refuse le vide (422)."""
    stripped = value.strip()
    if not stripped:
        raise ValueError("Le nom du template ne peut pas être vide")
    return stripped


class TemplateConfiguration(PresetConfiguration):
    """Configuration snapshotée d'un template (PresetConfiguration + champs LLM optionnels)."""

    llmProvider: Optional[str] = Field(
        None,
        description="Fournisseur LLM (openai, mistral, openrouter)",
    )
    temperature: Optional[float] = Field(
        None,
        description="Température de sampling (optionnelle)",
    )


class TemplateHistoryEntry(BaseModel):
    """Événement d'historique (création ou mise à jour)."""

    at: datetime = Field(..., description="Horodatage ISO 8601")
    action: Literal["created", "updated", "restored"] = Field(
        ...,
        description="Type d'événement",
    )


class Template(BaseModel):
    """Modèle complet d'un template custom."""

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(..., description="UUID du template (nom fichier)")
    name: str = Field(..., description="Nom du template", min_length=1)
    description: str = Field(default="", description="Description libre")
    category: str = Field(default="Général", description="Catégorie d'affichage")
    icon: str = Field(default="📋", description="Emoji icône")
    metadata: PresetMetadata = Field(..., description="Métadonnées de création / modification")
    configuration: TemplateConfiguration = Field(..., description="Snapshot de configuration")
    history: List[TemplateHistoryEntry] = Field(
        default_factory=list,
        description="Historique des dates (created / updated)",
    )
    ownerId: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("ownerId", "owner_id"),
        description="Identifiant JWT du propriétaire (absent = legacy public)",
    )
    visibility: Literal["shared", "private"] = Field(
        default="shared",
        description="Statut persisté : partagé avec l'équipe (défaut) ou brouillon privé",
    )
    relation: Optional[Literal["owned", "team", "legacy"]] = Field(
        default=None,
        description="Relation de l'acteur au template (calculée, non persistée)",
    )
    ownerUsername: Optional[str] = Field(
        default=None,
        description="Username du propriétaire (calculé, non persisté)",
    )
    sharedByUsername: Optional[str] = Field(
        default=None,
        description="Username affiché sur une carte partagée (calculé)",
    )

    @field_validator("id")
    @classmethod
    def validate_uuid(cls, v: str) -> str:
        """Valide que l'ID est un UUID."""
        try:
            UUID(v)
        except ValueError as exc:
            raise ValueError(f"Invalid UUID format: {v}") from exc
        return v

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        """Refuse un nom vide après strip."""
        return _strip_required_name(v)

    @model_validator(mode="before")
    @classmethod
    def hydrate_history_from_metadata(cls, data: Any) -> Any:
        """Complète history[] depuis metadata si le JSON disque est antérieur au champ."""
        if not isinstance(data, dict) or data.get("history"):
            return data
        metadata = data.get("metadata") or {}
        created = metadata.get("created") if isinstance(metadata, dict) else None
        if not created:
            return data
        entries: List[dict[str, Any]] = [{"at": created, "action": "created"}]
        modified = metadata.get("modified") if isinstance(metadata, dict) else None
        if modified and modified != created:
            entries.append({"at": modified, "action": "updated"})
        data["history"] = entries
        return data


class TemplateCreate(BaseModel):
    """Payload de création d'un template."""

    name: str = Field(
        ...,
        description="Nom du template",
        min_length=1,
        max_length=TEMPLATE_NAME_MAX_LENGTH,
    )
    description: str = Field(
        default="",
        description="Description libre",
        max_length=TEMPLATE_DESCRIPTION_MAX_LENGTH,
    )
    category: str = Field(
        default="Général",
        description="Catégorie d'affichage",
        max_length=TEMPLATE_CATEGORY_MAX_LENGTH,
    )
    icon: str = Field(
        default="📋",
        description="Emoji icône",
        max_length=TEMPLATE_ICON_MAX_LENGTH,
    )
    configuration: TemplateConfiguration = Field(..., description="Snapshot de configuration")
    visibility: Literal["shared", "private"] = Field(
        default="shared",
        description="Partagé avec l'équipe par défaut ; `private` pour un brouillon",
    )

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        """Refuse un nom vide après strip."""
        return _strip_required_name(v)


class TemplateShareCreateRequest(BaseModel):
    """Invitation d'un writer existant par username."""

    username: str = Field(..., min_length=1, max_length=64)
    canEdit: bool = Field(default=False, description="Droit d'édition (PUT), pas DELETE")

    def normalized_username(self) -> str:
        """Retourne le username trimé, ou lève si vide après trim."""
        trimmed = self.username.strip()
        if not trimmed:
            raise ValueError("Le nom d'utilisateur est vide")
        return trimmed


class TemplateShareTargetResponse(BaseModel):
    """Writer actif proposable comme destinataire."""

    id: str
    username: str


class TemplateShareResponse(BaseModel):
    """Partage d'équipe exposé à l'API."""

    template_id: str
    user_id: str
    username: str
    created_at: str
    can_edit: bool = False


class TemplateCreateResponse(Template):
    """Réponse POST 201 / PUT 200 : template persisté + warnings GDD (jamais bloquants)."""

    warnings: List[str] = Field(
        default_factory=list,
        description="Avertissements de références GDD obsolètes ou résolues",
    )


class TemplateUpdate(BaseModel):
    """Payload PUT partiel d'un template."""

    name: Optional[str] = Field(
        None,
        description="Nom du template",
        min_length=1,
        max_length=TEMPLATE_NAME_MAX_LENGTH,
    )
    description: Optional[str] = Field(
        None,
        description="Description libre",
        max_length=TEMPLATE_DESCRIPTION_MAX_LENGTH,
    )
    category: Optional[str] = Field(
        None,
        description="Catégorie d'affichage",
        max_length=TEMPLATE_CATEGORY_MAX_LENGTH,
    )
    icon: Optional[str] = Field(
        None,
        description="Emoji icône",
        max_length=TEMPLATE_ICON_MAX_LENGTH,
    )
    configuration: Optional[TemplateConfiguration] = Field(
        None,
        description="Snapshot de configuration (remplacement complet si fourni)",
    )
    visibility: Optional[Literal["shared", "private"]] = Field(
        None,
        description="Statut de visibilité ; seul le propriétaire ou un admin peut le changer",
    )

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        """Refuse un nom vide après strip (si le champ est envoyé)."""
        if v is None:
            return v
        return _strip_required_name(v)


PREBUILT_SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


class PrebuiltTemplate(BaseModel):
    """Fiche Alteir lecture seule (catalogue versionné, slug stable)."""

    id: str = Field(..., description="Slug stable (pas un UUID)")
    name: str = Field(..., min_length=1, max_length=TEMPLATE_NAME_MAX_LENGTH)
    description: str = Field(default="", max_length=TEMPLATE_DESCRIPTION_MAX_LENGTH)
    category: str = Field(default="Général", max_length=TEMPLATE_CATEGORY_MAX_LENGTH)
    icon: str = Field(default="📋", max_length=TEMPLATE_ICON_MAX_LENGTH)
    gddSystem: str = Field(..., description="Système GDD principal (affichage)")
    sceneTypeHint: str = Field(..., description="Hint type_scene (Epic 15, non branché)")
    objectif: str = Field(default="")
    casUsage: str = Field(default="")
    examples: List[str] = Field(default_factory=list)
    addedAt: datetime = Field(..., description="Date d'ajout ISO 8601 (badge Nouveau)")
    configuration: TemplateConfiguration = Field(..., description="Snapshot applicable")

    @field_validator("id")
    @classmethod
    def validate_slug(cls, v: str) -> str:
        """Refuse un id qui n'est pas un slug [a-z0-9-]."""
        if not PREBUILT_SLUG_PATTERN.match(v):
            raise ValueError(f"Invalid prebuilt slug: {v}")
        return v


class MarketplaceListing(BaseModel):
    """Fiche marketplace (snapshot publié + métadonnées auteur / notes)."""

    id: str = Field(..., description="UUID de la fiche marketplace")
    sourceTemplateId: str = Field(..., description="UUID du custom d'origine")
    authorId: str = Field(..., description="users.id de l'auteur")
    authorUsername: str = Field(..., description="Nom affiché de l'auteur")
    name: str = Field(..., min_length=1)
    description: str = Field(default="")
    category: str = Field(default="Général")
    icon: str = Field(default="📋")
    configuration: TemplateConfiguration = Field(..., description="Snapshot figé")
    createdAt: str = Field(..., description="Horodatage ISO de publication")
    usageCount: int = Field(default=0, ge=0)
    ratingAverage: Optional[float] = Field(
        default=None,
        description="Moyenne 1–5, None si aucune note",
    )
    ratingCount: int = Field(default=0, ge=0)
    isAnonymous: bool = Field(default=False)
    isOfficial: bool = Field(default=False)


class MarketplacePublishRequest(BaseModel):
    """Publication d'un template custom vers le marketplace."""

    templateId: str = Field(..., description="UUID du custom à publier")
    anonymous: bool = Field(default=False, description="Masque le username auteur")

    @field_validator("templateId")
    @classmethod
    def validate_template_id(cls, v: str) -> str:
        """Refuse un identifiant qui n'est pas un UUID."""
        try:
            UUID(v)
        except ValueError as exc:
            raise ValueError(f"Invalid UUID format: {v}") from exc
        return v


class MarketplaceRatingRequest(BaseModel):
    """Note 1–5 sur une fiche marketplace."""

    stars: int = Field(..., ge=1, le=5, description="Note entière de 1 à 5")


class MarketplaceOfficialRequest(BaseModel):
    """Marquage catalogue officiel (admin)."""

    isOfficial: bool = Field(..., description="Fiche officielle")


class MarketplaceCommentCreateRequest(BaseModel):
    """Commentaire marketplace (writer, pas guest)."""

    body: str = Field(..., min_length=1, max_length=500)

    @field_validator("body")
    @classmethod
    def strip_body(cls, v: str) -> str:
        """Refuse un commentaire vide après trim."""
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Le commentaire est vide")
        return trimmed


class MarketplaceCommentResponse(BaseModel):
    """Commentaire d'une fiche marketplace."""

    id: str
    listingId: str
    authorUsername: str
    body: str
    createdAt: str


class ABTestCreateRequest(BaseModel):
    """Lancement d'un test A/B entre deux templates."""

    templateAId: str = Field(..., min_length=1, description="UUID custom, prebuilt:{slug} ou marketplace:{id}")
    templateBId: str = Field(..., min_length=1, description="UUID custom, prebuilt:{slug} ou marketplace:{id}")
    generationsPerTemplate: int = Field(
        default=3,
        ge=MIN_GENERATIONS,
        le=MAX_GENERATIONS,
        description=f"N générations par template ({MIN_GENERATIONS}–{MAX_GENERATIONS})",
    )
    maxDepth: int = Field(
        default=2,
        ge=MIN_MAX_DEPTH,
        le=MAX_MAX_DEPTH,
        description=f"Profondeur expand-tree ({MIN_MAX_DEPTH}–{MAX_MAX_DEPTH})",
    )
    winnerMode: Literal["score", "score_thumbs", "score_cost"] = Field(
        default="score",
        description="Critère de gagnant (score juge, pouces, ou coût)",
    )


class ABTestCreateResponse(BaseModel):
    """Accusé 202 d'un job A/B."""

    testId: str
    status: str
    current: int = 0
    total: int = 0


class ABTestFeedbackRequest(BaseModel):
    """Pouce humain sur une génération (hors calcul du gagnant)."""

    generationId: str = Field(..., min_length=1)
    thumb: Literal["up", "down", "none"]


class TemplateSuggestionRequest(BaseModel):
    """Contexte de génération pour classer les templates (Story 6.9)."""

    instructions: str = Field(default="", description="Brief / instructions utilisateur")
    sceneType: str = Field(default="", description="Type de scène du formulaire")
    characters: List[str] = Field(default_factory=list)
    locations: List[str] = Field(default_factory=list)
    rencontreInitialeByCharacter: dict[str, str] = Field(
        default_factory=dict,
        description="Section rencontre_initiale des fiches déjà chargées",
    )


class TemplateSuggestionItem(BaseModel):
    """Candidat classé (custom, pré-built ou marketplace)."""

    source: Literal["custom", "prebuilt", "marketplace"]
    id: str
    name: str
    description: str = ""
    category: str = "Général"
    icon: str = "📋"
    score: int = Field(..., ge=0, le=100)
    reasons: List[str] = Field(default_factory=list)
    configuration: TemplateConfiguration
    relation: Optional[Literal["owned", "team", "legacy"]] = None
    sceneTypeHint: Optional[str] = None
    gddSystem: Optional[str] = None
    objectif: Optional[str] = None
    casUsage: Optional[str] = None
    examples: Optional[List[str]] = None
    addedAt: Optional[datetime] = None


class TemplateSuggestionUsedRequest(BaseModel):
    """Incrément du compteur perso après un Charger réussi."""

    source: Literal["custom", "prebuilt", "marketplace"]
    id: str = Field(..., min_length=1)
    sceneType: str = Field(default="", description="Type de scène au moment du Charger")
    characters: List[str] = Field(default_factory=list)


class TemplateVersionSummary(BaseModel):
    """Snapshot d'historique (timeline éditeur)."""

    id: str
    at: str
    name: str
    instructionsPreview: str


class TemplateSuggestionUsedResponse(BaseModel):
    """Nouvelle valeur du compteur perso."""

    source: str
    id: str
    useCount: int


