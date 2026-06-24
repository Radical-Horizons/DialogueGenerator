"""Schémas Pydantic pour la génération de dialogues."""
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field, field_validator, model_validator
import sys
from pathlib import Path

# Ajouter le répertoire racine au path pour importer constants
_root_dir = Path(__file__).parent.parent.parent
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))

from constants import Defaults, ModelNames
from services.token_estimation_service import DEFAULT_COMPLETION_TOKENS_PER_NODE


class ContextSelection(BaseModel):
    """Sélection de contexte pour la génération.
    
    Attributes:
        characters_full: Liste des noms de personnages à inclure en mode complet.
        characters_excerpt: Liste des noms de personnages à inclure en mode extrait.
        locations_full: Liste des noms de lieux à inclure en mode complet.
        locations_excerpt: Liste des noms de lieux à inclure en mode extrait.
        items_full: Liste des noms d'objets à inclure en mode complet.
        items_excerpt: Liste des noms d'objets à inclure en mode extrait.
        species_full: Liste des noms d'espèces à inclure en mode complet.
        species_excerpt: Liste des noms d'espèces à inclure en mode extrait.
        communities_full: Liste des noms de communautés à inclure en mode complet.
        communities_excerpt: Liste des noms de communautés à inclure en mode extrait.
        dialogues_examples: Liste des titres d'exemples de dialogues à inclure.
        scene_protagonists: Dictionnaire des protagonistes de la scène (sera converti en _scene_protagonists pour le service).
        scene_location: Dictionnaire du lieu de la scène (sera converti en _scene_location pour le service).
        generation_settings: Paramètres de génération additionnels.
        narrative_structures: Structures narratives à inclure.
        chapters: Chapitres à inclure.
        scenes: Scènes à inclure.
    """
    characters_full: List[str] = Field(default_factory=list, description="Liste des personnages (mode complet)")
    characters_excerpt: List[str] = Field(default_factory=list, description="Liste des personnages (mode extrait)")
    locations_full: List[str] = Field(default_factory=list, description="Liste des lieux (mode complet)")
    locations_excerpt: List[str] = Field(default_factory=list, description="Liste des lieux (mode extrait)")
    items_full: List[str] = Field(default_factory=list, description="Liste des objets (mode complet)")
    items_excerpt: List[str] = Field(default_factory=list, description="Liste des objets (mode extrait)")
    species_full: List[str] = Field(default_factory=list, description="Liste des espèces (mode complet)")
    species_excerpt: List[str] = Field(default_factory=list, description="Liste des espèces (mode extrait)")
    communities_full: List[str] = Field(default_factory=list, description="Liste des communautés (mode complet)")
    communities_excerpt: List[str] = Field(default_factory=list, description="Liste des communautés (mode extrait)")
    dialogues_examples: List[str] = Field(default_factory=list, description="Liste des exemples de dialogues")
    narrative_structures: List[str] = Field(default_factory=list, description="Structures narratives sélectionnées")
    chapters: List[str] = Field(default_factory=list, description="Chapitres sélectionnés")
    scenes: List[str] = Field(default_factory=list, description="Scènes sélectionnées")
    scene_protagonists: Optional[Dict[str, Any]] = Field(None, description="Protagonistes de la scène")
    scene_location: Optional[Dict[str, Any]] = Field(None, description="Lieu de la scène")
    generation_settings: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Paramètres de génération")
    
    @field_validator('scene_protagonists', mode='before')
    @classmethod
    def validate_scene_protagonists(cls, v):
        """Convertit les tableaux vides en None pour scene_protagonists."""
        if isinstance(v, list) and len(v) == 0:
            return None
        return v
    
    @field_validator('scene_location', mode='before')
    @classmethod
    def validate_scene_location(cls, v):
        """Convertit les tableaux vides en None pour scene_location."""
        if isinstance(v, list) and len(v) == 0:
            return None
        return v
    
    def to_service_dict(self) -> Dict[str, Any]:
        """Convertit le ContextSelection en dictionnaire pour le service (avec préfixes underscore et métadonnées de mode).
        
        Returns:
            Dictionnaire avec _scene_protagonists, _scene_location, et _element_modes pour compatibilité service.
            Les listes sont fusionnées et un dictionnaire _element_modes indique le mode de chaque élément.
        """
        data = self.model_dump(exclude_none=True)
        
        # Convertir scene_protagonists -> _scene_protagonists
        if "scene_protagonists" in data:
            data["_scene_protagonists"] = data.pop("scene_protagonists")
        # Convertir scene_location -> _scene_location
        if "scene_location" in data:
            data["_scene_location"] = data.pop("scene_location")
        
        # Construire _element_modes pour indiquer le mode de chaque élément
        element_modes: Dict[str, Dict[str, str]] = {}
        
        # Fusionner les listes et créer les métadonnées de mode
        for element_type in ["characters", "locations", "items", "species", "communities"]:
            full_list = data.get(f"{element_type}_full", [])
            excerpt_list = data.get(f"{element_type}_excerpt", [])
            
            # Fusionner les listes (mode full par défaut pour compatibilité)
            merged_list = full_list + excerpt_list
            data[element_type] = merged_list
            
            # Créer le dictionnaire de modes pour ce type
            if merged_list:
                element_modes[element_type] = {}
                for name in full_list:
                    element_modes[element_type][name] = "full"
                for name in excerpt_list:
                    element_modes[element_type][name] = "excerpt"
            
            # Supprimer les listes séparées
            data.pop(f"{element_type}_full", None)
            data.pop(f"{element_type}_excerpt", None)
        
        # Ajouter _element_modes si non vide
        if element_modes:
            data["_element_modes"] = element_modes
        
        return data


# GenerateDialogueVariantsRequest, DialogueVariantResponse, GenerateDialogueVariantsResponse supprimés - système texte libre obsolète, utiliser Unity JSON à la place

# GenerateInteractionVariantsRequest supprimé - système obsolète remplacé par Unity JSON

class BasePromptRequest(BaseModel):
    """Base pour les requêtes de construction de prompt."""
    user_instructions: str = Field(..., min_length=1, description="Instructions spécifiques pour la scène")
    context_selections: ContextSelection = Field(..., description="Sélections de contexte GDD")
    npc_speaker_id: Optional[str] = Field(None, description="ID du PNJ interlocuteur (si None, utiliser le premier personnage sélectionné)")
    player_character_id: Optional[str] = Field(
        None,
        description="PJ jouable (Uresaïr, L'Éthérée, Vethraak, Eonundé) — voix des choices",
    )
    max_context_tokens: int = Field(
        default=Defaults.CONTEXT_TOKENS,
        ge=Defaults.MIN_CONTEXT_TOKENS,
        le=Defaults.MAX_CONTEXT_TOKENS,
        description="Nombre maximum de tokens pour le contexte",
    )
    system_prompt_override: Optional[str] = Field(None, description="Surcharge du system prompt")
    author_profile: Optional[str] = Field(None, description="Profil d'auteur global (style réutilisable entre scènes)")
    game_rules: Optional[str] = Field(None, description="Règles du jeu spécifiques à appliquer au dialogue")
    max_choices: Optional[int] = Field(None, ge=0, le=8, description="Nombre maximum de choix à générer (0-8, ou None pour laisser l'IA décider librement)")
    choices_mode: Literal["free", "capped"] = Field(default="free", description="Mode de génération des choix")
    narrative_tags: Optional[List[str]] = Field(None, description="Tags narratifs pour guider le ton (ex: tension, humour, dramatique)")
    vocabulary_config: Optional[Dict[str, str]] = Field(None, description="Configuration du vocabulaire par niveau")
    include_narrative_guides: bool = Field(default=True, description="Inclure les guides narratifs dans le prompt")
    scene_type: Optional[str] = Field(
        None,
        description=(
            "Type de scène (first_meeting, conversation, …) — influence les beats dramatiques "
            "et l'ancrage première rencontre in-game"
        ),
    )
    organization_mode: Optional[str] = Field(
        "narrative",
        description="Mode d'organisation du contexte GDD (default, narrative, minimal)",
    )
    previous_dialogue_preview: Optional[str] = Field(None, description="Texte formaté du dialogue précédent")
    in_game_flags: Optional[List[Dict[str, Any]]] = Field(None, description="Flags in-game sélectionnés pour la génération réactive")
    llm_model_identifier: str = Field(
        default=ModelNames.GPT_5_MINI,
        description="Identifiant du modèle LLM (estimation tokens / coût / comptage prompt)",
    )
    # Plafond API — doit couvrir le slider UI (COMPLETION_TOKENS_LIMITS.MAX) ; voir .cursor/rules/api_validation_errors.mdc
    max_completion_tokens: Optional[int] = Field(
        default=None,
        ge=100,
        le=Defaults.MAX_COMPLETION_TOKENS,
        description="Nombre maximum de tokens de completion à utiliser pour l'estimation de coût",
    )

    @field_validator('max_context_tokens')
    @classmethod
    def validate_max_context_tokens(cls, v: int) -> int:
        """Valide que max_context_tokens est dans les limites autorisées (règle métier)."""
        if v < Defaults.MIN_CONTEXT_TOKENS:
            raise ValueError(
                f"max_context_tokens doit être au minimum {Defaults.MIN_CONTEXT_TOKENS} (reçu: {v})"
            )
        if v > Defaults.MAX_CONTEXT_TOKENS:
            raise ValueError(f"max_context_tokens ne peut pas dépasser {Defaults.MAX_CONTEXT_TOKENS} (reçu: {v})")
        return v

class EstimateTokensRequest(BasePromptRequest):
    """Requête pour estimer le nombre de tokens.
    
    Hérite de BasePromptRequest pour garantir que l'estimation utilise les mêmes paramètres que la génération.
    """
    field_configs: Optional[Dict[str, List[str]]] = Field(None, description="Configuration des champs de contexte par type d'élément")

class ContextTokenBreakdownRow(BaseModel):
    """Tokens estimés pour un compartiment de la sélection (type + mode), build isolé."""

    entity_type: str = Field(..., description="characters | locations | items | species | communities")
    mode: str = Field(..., description="full | excerpt")
    token_count: int = Field(..., ge=0, description="Nombre de tokens pour ce compartiment seul")


class EstimateTokensResponse(BaseModel):
    """Réponse pour l'estimation de tokens.
    
    Attributes:
        context_tokens: Tokens du bloc contexte GDD **après** troncature avec ``max_context_tokens``
            de la requête (budget utilisateur). Peut être inférieur à ``selection_tokens``.
        selection_tokens: Taille « pleine sélection » mesurée avec un plafond technique élevé
            (``Defaults.MAX_CONTEXT_TOKENS``), sans utiliser le budget comme limite de mesure.
        context_token_breakdown: Détail par type/mode (mesures isolées ; somme potentiellement > selection_tokens).
        context_breakdown_note: Explication sur la cohérence somme vs total.
        token_count: Nombre total de tokens (contexte + prompt).
        total_estimated_tokens: Alias rétrocompatible de token_count (contexte + prompt).
        raw_prompt: Le prompt brut réel qui sera envoyé au LLM.
        prompt_hash: Hash SHA-256 du prompt pour validation.
        structured_prompt: Structure JSON du prompt (optionnel).
    """
    context_tokens: int = Field(
        ...,
        description=(
            "Tokens du contexte GDD tel que construit avec le plafond "
            "`max_context_tokens` de la requête (troncature appliquée). "
            "Ne pas confondre avec `selection_tokens` (mesure sans ce plafond)."
        ),
    )
    selection_tokens: int = Field(
        default=0,
        description="Tokens de la sélection complète mesurés avec plafond technique (ex. MAX_CONTEXT_TOKENS)",
    )
    context_token_breakdown: List[ContextTokenBreakdownRow] = Field(
        default_factory=list,
        description="Répartition par type d'entité et mode (full/excerpt)",
    )
    context_breakdown_note: str = Field(
        default="",
        description="Note sur la cohérence entre total et somme des lignes",
    )
    token_count: int = Field(..., description="Nombre total de tokens")
    total_estimated_tokens: Optional[int] = Field(
        default=None,
        description="Nombre total de tokens (alias rétrocompatible). Si absent, dérivé de token_count.",
    )
    raw_prompt: str = Field(..., description="Le prompt brut réel qui sera envoyé au LLM")
    prompt_hash: str = Field(..., description="Hash SHA-256 du prompt")
    structured_prompt: Optional[Dict[str, Any]] = Field(None, description="Structure JSON du prompt pour affichage structuré")
    completion_tokens: int = Field(
        default=DEFAULT_COMPLETION_TOKENS_PER_NODE,
        ge=0,
        description="Tokens de completion retenus pour l'estimation de coût",
    )
    estimated_cost_eur: Optional[float] = Field(
        default=None,
        description="Coût estimé en euros pour prompt + completion estimée",
    )

    @model_validator(mode="after")
    def _fill_total_estimated_tokens(self) -> "EstimateTokensResponse":
        """Renseigne total_estimated_tokens si non fourni.

        Objectif: rétrocompatibilité avec d'anciens handlers/tests qui attendent
        un champ `total_estimated_tokens`.
        """
        if self.total_estimated_tokens is None:
            self.total_estimated_tokens = self.token_count
        return self


class PrecomputedEntityRef(BaseModel):
    """Référence à une fiche GDD pour lecture tokens précompilés."""

    entity_type: Literal["characters", "locations", "items", "species", "communities"] = Field(
        ...,
        description="Catégorie de sélection API",
    )
    name: str = Field(..., min_length=1, description="Nom canonique GDD (champ Nom)")
    mode: Literal["full", "excerpt"] = Field(default="full", description="Mode full ou excerpt")


class PrecomputedEntityTokensRequest(BaseModel):
    """Requête de lecture tokens depuis le cache disque de précompilation."""

    entities: List[PrecomputedEntityRef] = Field(..., min_length=1, max_length=64)
    organization_mode: str = Field(default="narrative", description="Mode d'organisation du contexte")
    field_configs: Optional[Dict[str, List[str]]] = Field(
        None,
        description="Profil champs (identique estimate-tokens) ; repli sur standard si miss",
    )
    include_prompt_overhead: bool = Field(
        default=False,
        description="Inclure les sections prompt hors GDD (contrat, guides, etc.)",
    )
    user_instructions: str = Field(default=" ", description="Instructions scène (overhead)")
    include_narrative_guides: bool = Field(default=True)
    system_prompt_override: Optional[str] = None
    game_rules: Optional[str] = None
    author_profile: Optional[str] = None
    vocabulary_config: Optional[Dict[str, str]] = None


class PrecomputedEntityTokenRow(BaseModel):
    """Tokens précompilés pour une fiche."""

    entity_type: str
    name: str
    mode: str
    token_count: int = Field(..., ge=0)
    cache_hit: bool = Field(..., description="True si lu depuis le cache disque (sans reconcile global)")
    profile_fallback: bool = Field(
        default=False,
        description="True si profil standard utilisé car le profil demandé était absent",
    )
    context_item: Optional[Dict[str, Any]] = Field(
        None,
        description="ContextItem sérialisé (pour fusion UI incrémentale)",
    )


class PrecomputedEntityTokensResponse(BaseModel):
    """Somme des tokens précompilés pour les fiches demandées."""

    entities: List[PrecomputedEntityTokenRow]
    selection_tokens_sum: int = Field(..., ge=0)
    prompt_overhead_tokens: int = Field(default=0, ge=0)
    prompt_overhead_sections: Optional[List[Dict[str, Any]]] = Field(
        None,
        description="Sections prompt hors GDD (si include_prompt_overhead)",
    )


class ContextOptimizationRules(BaseModel):
    """Règles MVP pour POST /context/optimize (FR21) — persistées côté client."""

    pinned_entity_keys: List[str] = Field(
        default_factory=list,
        description="Clés « type:nom » (ex. characters:Alice) à ne pas réduire en premier",
    )
    strategy: Literal["conservative", "aggressive"] = Field(
        default="conservative",
        description="conservative = réduit d'abord types périphériques ; aggressive l'inverse",
    )
    pre_generation_proxy_warning_threshold_percent: int = Field(
        default=50,
        ge=1,
        le=100,
        description="Seuil d'avertissement sur le proxy pré-génération (distinct du scoring post-génération Story 3.6)",
    )

    @field_validator("pinned_entity_keys")
    @classmethod
    def _limit_pins(cls, v: List[str]) -> List[str]:
        if len(v) > 200:
            raise ValueError("Au plus 200 entités épinglées pour l'optimisation")
        return v


class OptimizeContextRequest(EstimateTokensRequest):
    """Même entrée qu'estimate-tokens + règles d'optimisation. Le plafond cible = max_context_tokens."""

    optimization_rules: ContextOptimizationRules = Field(default_factory=ContextOptimizationRules)


class OptimizeContextChange(BaseModel):
    """Changement de mode full/excerpt pour une entité."""

    entity_type: str = Field(..., description="characters | locations | items | species | communities")
    entity_name: str = Field(..., description="Nom GDD de l'entité")
    from_mode: Literal["full", "excerpt"] = Field(..., description="Mode avant optimisation")
    to_mode: Literal["full", "excerpt"] = Field(..., description="Mode après optimisation")


class OptimizeContextEffectReport(BaseModel):
    """Synthèse lisible des effets d'une proposition d'optimisation."""

    changes_by_entity_type: Dict[str, int] = Field(
        default_factory=dict,
        description="Nombre de changements par type d'entité",
    )
    pinned_entity_keys: List[str] = Field(
        default_factory=list,
        description="Clés d'entités conservées par épinglage",
    )
    tokens_before_by_entity_type: Dict[str, int] = Field(
        default_factory=dict,
        description="Répartition tokens avant optimisation par type d'entité",
    )
    tokens_after_by_entity_type: Dict[str, int] = Field(
        default_factory=dict,
        description="Répartition tokens après optimisation par type d'entité",
    )


class OptimizeContextResponse(BaseModel):
    """Proposition d'optimisation de sélection GDD sous budget (FR21)."""

    proposed_context_selections: ContextSelection = Field(
        ...,
        description="Sélection proposée (appliquer côté UI si l'utilisateur accepte)",
    )
    selection_tokens_before: int = Field(..., ge=0, description="Tokens sélection (pipeline estimate-tokens) avant")
    selection_tokens_after: int = Field(..., ge=0, description="Tokens sélection après optimisation")
    tokens_saved: int = Field(..., ge=0, description="Économie = avant − après")
    changes: List[OptimizeContextChange] = Field(
        default_factory=list,
        description="Liste des passages full→excerpt effectués",
    )
    effect_report: OptimizeContextEffectReport = Field(
        default_factory=OptimizeContextEffectReport,
        description="Rapport d'effets de l'optimisation pour l'UI",
    )
    pre_generation_context_fidelity_proxy_percent: int = Field(
        ...,
        ge=0,
        le=100,
        description=(
            "Proxy pré-génération 0–100 : ratio tokens sélection après/avant (arrondi). "
            "Ne mesure pas la sémantique ; distinct de context_relevance post-génération (Story 3.6)."
        ),
    )
    warnings: List[str] = Field(
        default_factory=list,
        description="Avertissements non bloquants (ex. proxy bas, budget non atteignable)",
    )
    no_op: bool = Field(
        default=False,
        description="True si la sélection respectait déjà le budget (aucun changement)",
    )
    budget_respected: bool = Field(
        ...,
        description="True si selection_tokens_after ≤ plafond demandé (max_context_tokens)",
    )


class PreviewPromptRequest(BasePromptRequest):
    """Requête pour prévisualiser le prompt brut construit.
    
    Hérite de BasePromptRequest pour utiliser les mêmes paramètres que la génération.
    Utilisé pour visualiser le prompt avant génération, sans estimer les tokens.
    """
    field_configs: Optional[Dict[str, List[str]]] = Field(None, description="Configuration des champs de contexte par type d'élément")


class PreviewPromptResponse(BaseModel):
    """Réponse pour la prévisualisation du prompt.
    
    Attributes:
        raw_prompt: Le prompt brut réel qui sera envoyé au LLM (format XML).
        prompt_hash: Hash SHA-256 du prompt pour validation.
        structured_prompt: Structure JSON du prompt pour affichage structuré (optionnel).
    """
    raw_prompt: str = Field(..., description="Le prompt brut réel qui sera envoyé au LLM (format XML)")
    prompt_hash: str = Field(..., description="Hash SHA-256 du prompt pour validation")
    structured_prompt: Optional[Dict[str, Any]] = Field(None, description="Structure JSON du prompt pour affichage structuré")


class GenerateUnityDialogueRequest(BasePromptRequest):
    """Requête pour générer un nœud de dialogue au format Unity JSON."""
    reasoning_effort: Optional[
        Literal["none", "minimal", "low", "medium", "high", "xhigh"]
    ] = Field(
        None,
        description=(
            "Niveau de raisonnement pour GPT-5.x (none=rapide, xhigh=très approfondi). "
            "« minimal » est accepté pour alignement UI (ex. gpt-5-mini)."
        ),
    )
    reasoning_summary: Optional[Literal["auto"]] = Field(None, description="Format du résumé de reasoning (thinking summary). Uniquement 'auto' disponible (les résumés 'detailed' nécessitent une organisation OpenAI vérifiée Tier 2/3, non disponible actuellement). Si None, 'auto' est utilisé par défaut.")
    top_p: Optional[float] = Field(None, ge=0.0, le=1.0, description="Nucleus sampling (0.0-1.0). Alternative/complément à temperature. 0.0=focalisé, 1.0=diversifié.")

    @field_validator("llm_model_identifier", mode="before")
    @classmethod
    def validate_llm_model_identifier_for_structured_output(cls, v: str) -> str:
        """Restreint les modèles autorisés pour garantir le structured output.

        Objectif: fiabiliser la génération Unity (Structured Output obligatoire) sur les
        modèles validés en prod. D'autres modèles peuvent être proposés ailleurs dans
        l'app (tests/coûts), mais cette route doit rester robuste.
        """
        allowed = {
            ModelNames.GPT_5_4,
            ModelNames.GPT_5_2,
            ModelNames.GPT_5_2_PRO,
            ModelNames.GPT_5_MINI,
        }
        if v not in allowed:
            raise ValueError(
                "Modèle non supporté pour la génération Unity (structured output requis). "
                f"Modèles autorisés: {', '.join(sorted(allowed))}. "
                f"Reçu: {v}"
            )
        return v
    
    @field_validator('reasoning_summary', mode='before')
    @classmethod
    def validate_reasoning_summary(cls, v: Optional[str]) -> Optional[str]:
        """Valide que reasoning_summary est uniquement 'auto' (detailed nécessite organisation vérifiée).
        
        Note: Les résumés 'detailed' nécessitent une organisation OpenAI vérifiée (Tier 2/3).
        Notre organisation n'étant pas vérifiée, nous nous limitons à 'auto' pour éviter
        les échecs silencieux où l'API ignore la demande de résumé détaillé.
        """
        if v is not None and v != "auto":
            raise ValueError(
                f"reasoning_summary='{v}' non supporté. "
                f"Uniquement 'auto' disponible (les résumés 'detailed' nécessitent une organisation OpenAI vérifiée Tier 2/3)."
            )
        return v or "auto"  # Par défaut, utiliser "auto"
    
    @field_validator('context_selections', mode='after')
    @classmethod
    def validate_at_least_one_character(cls, v: ContextSelection) -> ContextSelection:
        """Valide qu'au moins un personnage est sélectionné (règle métier Unity).
        
        Raises:
            ValueError: Si aucun personnage n'est sélectionné.
        """
        all_characters = (v.characters_full or []) + (v.characters_excerpt or [])
        if v.scene_protagonists:
            all_characters.extend(
                str(name)
                for name in v.scene_protagonists.values()
                if isinstance(name, str) and name.strip()
            )
        if not all_characters:
            raise ValueError("Au moins un personnage doit être sélectionné pour générer un dialogue Unity")
        return v
    
    @field_validator('max_completion_tokens', mode='before')
    @classmethod
    def validate_max_completion_tokens(cls, v: Optional[int]) -> Optional[int]:
        """Valide que max_completion_tokens est dans les limites autorisées (règle métier).
        
        Recommandation OpenAI: 25000 tokens minimum pour reasoning summary.
        Limite max alignée avec Defaults.MAX_COMPLETION_TOKENS (capacités modèles récents).
        """
        if v is not None:
            if v < 100:
                raise ValueError(f"max_completion_tokens doit être au minimum 100 (reçu: {v})")
            if v > Defaults.MAX_COMPLETION_TOKENS:
                raise ValueError(
                    f"max_completion_tokens ne peut pas dépasser {Defaults.MAX_COMPLETION_TOKENS} (reçu: {v})"
                )
        return v

class GenerateUnityDialogueResponse(BaseModel):
    """Réponse pour la génération d'un nœud de dialogue Unity JSON.
    
    Attributes:
        json_content: Contenu JSON du dialogue au format Unity.
        title: Titre descriptif du dialogue généré par l'IA.
        raw_prompt: Le prompt brut réel utilisé pour la génération (RawPrompt).
        prompt_hash: Hash SHA-256 du prompt pour validation.
        estimated_tokens: Nombre estimé de tokens utilisés.
        warning: Avertissement éventuel.
        structured_prompt: Structure JSON du prompt (optionnel).
        reasoning_trace: Trace de raisonnement du modèle (optionnel, uniquement pour GPT-5.2 avec reasoning effort).
    """
    json_content: str = Field(..., description="Contenu JSON du dialogue au format Unity")
    title: Optional[str] = Field(None, description="Titre descriptif du dialogue généré par l'IA")
    raw_prompt: str = Field(..., description="Le prompt brut réel utilisé pour la génération")
    prompt_hash: str = Field(..., description="Hash SHA-256 du prompt")
    estimated_tokens: int = Field(..., description="Nombre estimé de tokens")
    warning: Optional[str] = Field(None, description="Avertissement (ex: DummyLLMClient utilisé)")
    structured_prompt: Optional[Dict[str, Any]] = Field(None, description="Structure JSON du prompt pour affichage structuré")
    reasoning_trace: Optional[Dict[str, Any]] = Field(None, description="Trace de raisonnement du modèle (effort, summary, items)")



class ExportUnityDialogueRequest(BaseModel):
    """Requête pour exporter un dialogue Unity JSON vers un fichier.
    
    Attributes:
        json_content: Contenu JSON du dialogue au format Unity (tableau de nœuds).
        title: Titre descriptif du dialogue (utilisé pour générer le nom de fichier).
        filename: Nom de fichier optionnel (si non fourni, généré à partir du titre).
    """
    json_content: str = Field(..., description="Contenu JSON du dialogue au format Unity")
    title: str = Field(..., description="Titre descriptif du dialogue")
    filename: Optional[str] = Field(None, description="Nom de fichier optionnel (sans extension)")


class ExportUnityDialogueResponse(BaseModel):
    """Réponse pour l'export d'un dialogue Unity JSON.
    
    Attributes:
        filename: Nom du fichier créé.
        success: Indique si l'export a réussi.
        file_path: Déprécié — absent des réponses API (évite la fuite de chemins serveur).
    """
    filename: str = Field(..., description="Nom du fichier créé")
    success: bool = Field(..., description="Indique si l'export a réussi")
    file_path: Optional[str] = Field(
        None,
        description="Déprécié — non renseigné (utiliser filename)",
    )


class BatchExportFailedItemResponse(BaseModel):
    """Échec d'export pour un document du batch (Story 5.2)."""

    id: str = Field(..., description="Identifiant document (sans extension)")
    errors: List[str] = Field(default_factory=list, description="Messages d'erreur")


class BatchExportRequest(BaseModel):
    """Requête export batch Unity JSON (Story 5.2 / FR50)."""

    document_ids: List[str] = Field(
        ...,
        min_length=1,
        max_length=Defaults.UNITY_EXPORT_BATCH_MAX_ITEMS,
        description="IDs document à exporter",
    )
    skip_validation: bool = Field(
        False,
        description="Si True, écrit sans validation schéma Unity (opt-in)",
    )
    filename_strategy: Literal["preserve", "slug"] = Field(
        "preserve",
        description="Stratégie de nommage : conserver filename ou slug titre",
    )


class BatchExportResponse(BaseModel):
    """Réponse export batch Unity JSON."""

    exported: List[str] = Field(default_factory=list, description="Noms de fichiers exportés")
    failed: List[BatchExportFailedItemResponse] = Field(
        default_factory=list,
        description="Documents en échec avec erreurs",
    )
    cancelled: bool = Field(False, description="Batch annulé côté client (réservé)")
    success: bool = Field(..., description="True si au moins un export réussi sans erreur globale")


class BatchDownloadRequest(BaseModel):
    """Requête téléchargement batch ZIP (Story 5.4 / FR52)."""

    filenames: List[str] = Field(
        ...,
        min_length=1,
        max_length=Defaults.UNITY_EXPORT_BATCH_MAX_ITEMS,
        description="Noms de fichiers exportés",
    )
    compression: Literal["store", "deflate"] = Field(
        "deflate",
        description="Niveau de compression ZIP",
    )


class BatchExportPreviewRequest(BaseModel):
    """Requête preview export batch (Story 5.5 / FR53)."""

    document_ids: List[str] = Field(
        ...,
        min_length=1,
        max_length=Defaults.UNITY_EXPORT_BATCH_MAX_ITEMS,
        description="IDs document sans extension",
    )


class BatchExportPreviewItemResponse(BaseModel):
    """Item preview batch."""

    document_id: str = Field(..., description="Identifiant document")
    filename: str = Field(..., description="Nom fichier export")
    size_bytes: int = Field(..., description="Taille UTF-8 octets")
    node_count: int = Field(..., description="Nombre de nœuds")
    json_preview: str = Field(..., description="Aperçu JSON (éventuellement tronqué)")
    json_preview_truncated: bool = Field(
        False,
        description="True si l'aperçu est tronqué pour perf",
    )


class BatchExportPreviewResponse(BaseModel):
    """Réponse preview export batch."""

    items: List[BatchExportPreviewItemResponse] = Field(default_factory=list)
    total_size_bytes: int = Field(..., description="Taille totale estimée")
    dialogue_count: int = Field(..., description="Nombre de dialogues")


# Schemas pour la bibliothèque Unity Dialogues
class UnityDialogueMetadata(BaseModel):
    """Métadonnées d'un fichier de dialogue Unity JSON.
    
    Attributes:
        filename: Nom du fichier (avec extension .json).
        file_path: Chemin absolu du fichier.
        size_bytes: Taille du fichier en octets.
        modified_time: Date de modification (ISO format).
        title: Titre extrait depuis le JSON (optionnel).
    """
    filename: str = Field(..., description="Nom du fichier")
    file_path: str = Field(..., description="Chemin absolu du fichier")
    size_bytes: int = Field(..., description="Taille en octets")
    modified_time: str = Field(..., description="Date de modification (ISO format)")
    title: Optional[str] = Field(None, description="Titre extrait du dialogue")


class UnityDialogueListResponse(BaseModel):
    """Réponse pour la liste des dialogues Unity.
    
    Attributes:
        dialogues: Liste des métadonnées des fichiers.
        total: Nombre total de fichiers.
    """
    dialogues: List[UnityDialogueMetadata] = Field(..., description="Liste des métadonnées")
    total: int = Field(..., description="Nombre total de fichiers")


class UnitySchemaSectionSummary(BaseModel):
    """Section clé du schéma Unity pour affichage référence (Story 5.3)."""

    name: str = Field(..., description="Nom de la section")
    description: str = Field(..., description="Description courte")
    required_fields: List[str] = Field(default_factory=list, description="Champs requis principaux")


class UnitySchemaReferenceResponse(BaseModel):
    """Métadonnées schéma Unity de référence (Story 5.3 / FR51)."""

    available: bool = Field(..., description="True si le fichier schéma est présent")
    version: Optional[str] = Field(None, description="Version du schéma (ex. 1.2.0)")
    source_path: str = Field(..., description="Chemin canonique du fichier schéma")
    required_root_fields: List[str] = Field(default_factory=list)
    sections: List[UnitySchemaSectionSummary] = Field(default_factory=list)


class UnityDialogueReadResponse(BaseModel):
    """Réponse pour la lecture d'un dialogue Unity.
    
    Attributes:
        filename: Nom du fichier.
        json_content: Contenu JSON brut (string).
        title: Titre extrait du dialogue (optionnel).
        size_bytes: Taille du fichier en octets.
        modified_time: Date de modification (ISO format).
    """
    filename: str = Field(..., description="Nom du fichier")
    json_content: str = Field(..., description="Contenu JSON brut")
    title: Optional[str] = Field(None, description="Titre extrait du dialogue")
    size_bytes: int = Field(..., description="Taille en octets")
    modified_time: str = Field(..., description="Date de modification (ISO format)")


class UnityDialoguePreviewRequest(BaseModel):
    """Requête pour générer un preview texte d'un dialogue Unity.
    
    Attributes:
        json_content: Contenu JSON du dialogue Unity.
    """
    json_content: str = Field(..., description="Contenu JSON du dialogue Unity")


class UnityDialoguePreviewResponse(BaseModel):
    """Réponse pour le preview texte d'un dialogue Unity.
    
    Attributes:
        preview_text: Texte formaté pour injection LLM.
        node_count: Nombre de nœuds dans le dialogue.
    """
    preview_text: str = Field(..., description="Texte formaté pour injection LLM")
    node_count: int = Field(..., description="Nombre de nœuds")
