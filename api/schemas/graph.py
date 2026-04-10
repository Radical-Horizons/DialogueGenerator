"""Schémas Pydantic pour l'API de gestion de graphes."""
import re
from datetime import datetime
from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator

from services.ai_slop_detector import (
    MAX_CUSTOM_REGEX_PATTERN_CHARS,
    MAX_CUSTOM_REGEX_PATTERN_COUNT,
    custom_regex_pattern_policy_violation,
)


class LoadGraphRequest(BaseModel):
    """Requête pour charger un dialogue Unity JSON et le convertir en graphe."""
    json_content: str = Field(..., description="Contenu JSON Unity (tableau de nœuds)")


class GraphMetadata(BaseModel):
    """Métadonnées d'un graphe."""
    title: str = Field(..., description="Titre du dialogue")
    node_count: int = Field(..., description="Nombre de nœuds")
    edge_count: int = Field(..., description="Nombre de connexions")
    filename: Optional[str] = Field(None, description="Nom du fichier (si sauvegardé)")


class LoadGraphResponse(BaseModel):
    """Réponse après chargement d'un graphe."""
    nodes: List[Dict[str, Any]] = Field(..., description="Nœuds ReactFlow")
    edges: List[Dict[str, Any]] = Field(..., description="Edges ReactFlow")
    metadata: GraphMetadata = Field(..., description="Métadonnées du graphe")


class SaveGraphRequest(BaseModel):
    """Requête pour sauvegarder un graphe modifié."""
    nodes: List[Dict[str, Any]] = Field(..., description="Nœuds ReactFlow")
    edges: List[Dict[str, Any]] = Field(..., description="Edges ReactFlow")
    metadata: GraphMetadata = Field(..., description="Métadonnées du graphe")
    seq: Optional[int] = Field(None, description="Séquence monotone côté client (ADR-006)")
    document_id: Optional[str] = Field(None, description="ID stable du document (ex. filename)")


class SaveGraphResponse(BaseModel):
    """Réponse après sauvegarde d'un graphe."""
    success: bool = Field(..., description="Succès de l'opération")
    filename: str = Field(..., description="Nom du fichier sauvegardé")
    json_content: str = Field(..., description="Contenu Unity JSON généré")
    ack_seq: Optional[int] = Field(None, description="Séquence reconnue par le serveur (ADR-006)")
    last_seq: Optional[int] = Field(None, description="Dernier seq connu pour ce document (ADR-006)")


class EstimateCostRequest(BaseModel):
    """Requête pour estimer le coût LLM avant génération (même structure que GenerateNodeRequest)."""
    parent_node_id: str = Field(..., description="ID du nœud parent")
    parent_node_content: Dict[str, Any] = Field(..., description="Contenu du nœud parent (pour contexte)")
    user_instructions: str = Field(..., description="Instructions pour guider l'IA")
    context_selections: Dict[str, Any] = Field(..., description="Sélection de contexte GDD")
    max_choices: Optional[int] = Field(None, description="Nombre maximum de choix (0-8)")
    npc_speaker_id: Optional[str] = Field(None, description="ID du PNJ interlocuteur")
    system_prompt_override: Optional[str] = Field(None, description="Surcharge du system prompt")
    narrative_tags: Optional[List[str]] = Field(None, description="Tags narratifs")
    llm_model_identifier: Optional[str] = Field(None, description="Identifiant du modèle LLM")
    target_choice_index: Optional[int] = Field(None, description="Index du choix spécifique (si None, tous les choix sans targetNode)")
    generate_all_choices: bool = Field(False, description="Si True, estimation pour un nœud par choix sans targetNode")


class EstimateCostPerNodeBreakdown(BaseModel):
    """Détail d'estimation par nœud (batch)."""
    choice_index: Optional[int] = Field(None, description="Index du choix (si batch)")
    prompt_tokens: int = Field(..., description="Tokens prompt estimés pour ce nœud")
    completion_tokens: int = Field(..., description="Tokens completion estimés pour ce nœud")
    estimated_cost_eur: float = Field(..., description="Coût estimé pour ce nœud (€)")


class EstimateCostResponse(BaseModel):
    """Réponse d'estimation de coût (sans appel LLM)."""
    estimated_cost_eur: float = Field(..., description="Coût total estimé (€, converti depuis USD)")
    prompt_tokens: int = Field(..., description="Tokens prompt estimés")
    completion_tokens: int = Field(..., description="Tokens completion estimés (total si batch)")
    model_id: str = Field(..., description="Modèle utilisé pour l'estimation")
    provider: str = Field(..., description="Provider LLM (ex: openai, mistral)")
    batch_count: Optional[int] = Field(None, description="Nombre de nœuds en batch (1 si single)")
    per_node_breakdown: Optional[List[EstimateCostPerNodeBreakdown]] = Field(
        None,
        description="Détail par nœud (si batch)"
    )
    alternative_provider: Optional[str] = Field(None, description="Provider alternatif pour comparaison (AC #3)")
    alternative_model_id: Optional[str] = Field(None, description="Modèle alternatif utilisé pour la comparaison")
    alternative_cost_eur: Optional[float] = Field(None, description="Coût estimé avec le provider alternatif (€)")
    cost_difference_pct: Optional[float] = Field(
        None,
        description="Différence de coût vs provider actuel en % (négatif = alternatif moins cher)"
    )


class GenerateNodeRequest(BaseModel):
    """Requête pour générer un nœud en contexte."""
    parent_node_id: str = Field(..., description="ID du nœud parent")
    parent_node_content: Dict[str, Any] = Field(..., description="Contenu du nœud parent (pour contexte)")
    user_instructions: str = Field(..., description="Instructions pour guider l'IA")
    context_selections: Dict[str, Any] = Field(..., description="Sélection de contexte GDD")
    max_choices: Optional[int] = Field(None, description="Nombre maximum de choix (0-8)")
    npc_speaker_id: Optional[str] = Field(None, description="ID du PNJ interlocuteur")
    system_prompt_override: Optional[str] = Field(None, description="Surcharge du system prompt")
    narrative_tags: Optional[List[str]] = Field(None, description="Tags narratifs")
    llm_model_identifier: Optional[str] = Field(None, description="Identifiant du modèle LLM")
    target_choice_index: Optional[int] = Field(None, description="Index du choix spécifique à connecter (si None, génère pour tous les choix sans targetNode)")
    generate_all_choices: bool = Field(False, description="Si True, génère un nœud pour chaque choix sans targetNode")
    dialogue_id: Optional[str] = Field(None, description="ID du dialogue (pour annotation post-hoc des coûts)")


class SuggestedConnection(BaseModel):
    """Connexion suggérée entre nœuds."""
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    from_node: str = Field(..., description="ID du nœud source", alias="from")
    to_node: str = Field(..., description="ID du nœud cible", alias="to")
    via_choice_index: Optional[int] = Field(None, description="Index du choix (si applicable)")
    connection_type: str = Field("choice", description="Type de connexion (choice, nextNode, success, failure)")


class GenerateNodeResponse(BaseModel):
    """Réponse après génération d'un nœud."""
    node: Optional[Dict[str, Any]] = Field(None, description="Nœud généré (avec ID) - pour backward compatibility")
    nodes: Optional[List[Dict[str, Any]]] = Field(None, description="Liste de nœuds générés (pour génération batch)")
    suggested_connections: List[SuggestedConnection] = Field(..., description="Connexions suggérées")
    parent_node_id: str = Field(..., description="ID du nœud parent")
    context_gdd_content_fingerprint: Optional[str] = Field(
        None,
        description="Empreinte SHA-256 du contexte GDD structuré au moment de la génération (Story 3.9)",
    )
    batch_count: Optional[int] = Field(None, description="Nombre total de nœuds générés en batch (si applicable)")
    generated_choices_count: Optional[int] = Field(
        None,
        description="Nombre de nouveaux nœuds générés pour les choix (batch)"
    )
    connected_choices_count: Optional[int] = Field(
        None,
        description="Nombre de choix déjà connectés (ignorés dans le batch)"
    )
    failed_choices_count: Optional[int] = Field(
        None,
        description="Nombre de choix en échec lors de la génération batch"
    )
    total_choices_count: Optional[int] = Field(
        None,
        description="Nombre total de choix sur le nœud parent"
    )


class ValidateGraphRequest(BaseModel):
    """Requête pour valider un graphe."""
    nodes: List[Dict[str, Any]] = Field(..., description="Nœuds ReactFlow")
    edges: List[Dict[str, Any]] = Field(..., description="Edges ReactFlow")


class LoreAmbiguityCandidatePayload(BaseModel):
    """Candidat GDD pour une ambiguïté de mention vague (FR39)."""

    name: str = Field(..., description="Nom affichable de l'entité")
    category: str = Field(..., description="Catégorie GDD (ex. locations)")
    gdd_path: str = Field(..., description="Chemin stable affichable (ex. Lieux › Nom)")


class ValidationErrorDetail(BaseModel):
    """Détail d'une erreur de validation."""
    type: str = Field(..., description="Type d'erreur")
    node_id: Optional[str] = Field(None, description="ID du nœud concerné")
    message: str = Field(..., description="Message d'erreur")
    severity: str = Field("error", description="Sévérité (error, warning)")
    target: Optional[str] = Field(None, description="Cible de la référence (si applicable)")
    cycle_path: Optional[str] = Field(None, description="Chemin complet du cycle (format: 'A → B → C → A')")
    cycle_nodes: Optional[List[str]] = Field(None, description="Liste des nœuds dans le cycle")
    cycle_id: Optional[str] = Field(None, description="ID stable du cycle (pour marquage intentionnel)")
    gdd_reference: Optional[str] = Field(
        None,
        description="Référence entrée GDD (ex. catégorie › nom) pour erreurs lore (FR38)",
    )
    lore_subtype: Optional[str] = Field(
        None,
        description="Sous-type heuristique pour avertissements lore (FR39)",
    )
    lore_warning_key: Optional[str] = Field(
        None,
        description="Clé stable pour persistance état warning (FR39, ex. localStorage)",
    )
    ambiguity_candidates: Optional[List[LoreAmbiguityCandidatePayload]] = Field(
        None,
        description="Candidats GDD lorsque type=lore_potential_ambiguity (FR39)",
    )


class GddLoreFactPayload(BaseModel):
    """Fait GDD injecté (tests / client) pour validation lore explicite."""

    entity_name: str = Field(..., description="Nom canonique de l'entité")
    category: str = Field(..., description="Catégorie GDD (ex. characters)")
    gdd_path: str = Field(..., description="Chemin stable affichable (ex. Personnages › Nom)")
    vitality: Literal["alive", "dead"] = Field(..., description="Vitalité selon le GDD")


class ValidateLoreExplicitRequest(BaseModel):
    """Requête validation contradictions lore explicites (FR38)."""

    nodes: List[Dict[str, Any]] = Field(..., description="Nœuds ReactFlow")
    edges: List[Dict[str, Any]] = Field(..., description="Edges ReactFlow")
    context_selections: Dict[str, Any] = Field(
        default_factory=dict,
        description="Sélections contexte (même forme que génération) pour extraction via ContextBuilder",
    )
    scene_instruction: str = Field(
        default="",
        description="Instruction de scène (optionnelle, passée au ContextBuilder)",
    )
    gdd_lore_facts: List[GddLoreFactPayload] = Field(
        default_factory=list,
        description="Faits explicites (prioritaires, fusionnés avec l'extraction contexte)",
    )


class ValidateLoreExplicitResponse(BaseModel):
    """Réponse validation lore explicite."""

    valid: bool = Field(..., description="True si aucune contradiction explicite")
    errors: List[ValidationErrorDetail] = Field(
        default_factory=list,
        description="Erreurs lore (type lore_contradiction_explicit)",
    )
    warnings: List[ValidationErrorDetail] = Field(
        default_factory=list,
        description=(
            "Avertissements lore révisables : lore_contradiction_potential (AC 4.3), "
            "lore_potential_ambiguity (FR39), sans erreurs explicites"
        ),
    )
    contradiction_count: int = Field(..., description="Nombre de contradictions explicites")
    nodes_with_contradictions_count: int = Field(..., description="Nombre de nœuds distincts concernés (explicite)")
    potential_warnings_count: int = Field(
        0,
        description="Nombre d'avertissements lore_contradiction_potential",
    )
    nodes_with_potential_warnings_count: int = Field(
        0,
        description="Nombre de nœuds distincts avec avertissement potentiel",
    )
    ambiguity_warnings_count: int = Field(
        0,
        description="Nombre d'avertissements lore_potential_ambiguity (FR39)",
    )
    nodes_with_ambiguity_warnings_count: int = Field(
        0,
        description="Nombre de nœuds distincts avec ambiguïté référentielle vague",
    )
    summary: str = Field(
        ...,
        description="Résumé agrégé : explicite + avertissements potentiels + ambiguïtés + nœuds analysés",
    )
    summary_explicit_only: str = Field(
        ...,
        description="Résumé contradictions explicites seul (bandeau UI ; aligné filtres client FR39 AC #5)",
    )


class ValidateGraphResponse(BaseModel):
    """Réponse après validation d'un graphe."""
    valid: bool = Field(..., description="True si aucune erreur")
    errors: List[ValidationErrorDetail] = Field(..., description="Liste des erreurs")
    warnings: List[ValidationErrorDetail] = Field(..., description="Liste des warnings")


class SimulateFlowRequest(BaseModel):
    """Requête de simulation de flux pour détecter dead ends et cul-de-sacs (FR46)."""

    nodes: List[Dict[str, Any]] = Field(..., description="Nœuds ReactFlow")
    edges: List[Dict[str, Any]] = Field(..., description="Arêtes ReactFlow")


class FlowCoverageStats(BaseModel):
    """Statistiques de couverture après simulation de flux (FR47).

    Exclut ``endNode``/``testNode``/``startNode`` de ``total_nodes``.
    ``coverage_percentage`` vaut 100.0 quand ``total_nodes == 0``.
    """

    total_nodes: int = Field(..., description="Nœuds contenu (hors END, testNode)")
    accessible_count: int = Field(..., description="Nœuds contenu atteignables")
    dead_end_count: int = Field(..., description="Nœuds inatteignables (dead ends)")
    cul_de_sac_count: int = Field(..., description="Nœuds cul-de-sacs")
    coverage_percentage: float = Field(..., description="Pourcentage de couverture (0–100, 1 décimale)")


class SimulateFlowResponse(BaseModel):
    """Réponse de simulation de flux (FR46 + FR47).

    ``dead_ends`` : nœuds inatteignables depuis l'entrée (sévérité ``error``).
    ``cul_de_sacs`` : nœuds atteignables sans sortie vers un nœud non-END (sévérité ``warning``).
    ``coverage`` : statistiques de couverture (FR47).
    """

    dead_ends: List[ValidationErrorDetail] = Field(
        default_factory=list,
        description="Nœuds inatteignables depuis l'entrée (dead ends, severity=error)",
    )
    cul_de_sacs: List[ValidationErrorDetail] = Field(
        default_factory=list,
        description="Nœuds sans sortie non-END (cul-de-sacs, severity=warning)",
    )
    coverage: Optional[FlowCoverageStats] = Field(
        default=None,
        description="Statistiques de couverture (FR47) ; None si non calculé",
    )


class ValidateSchemaRequest(BaseModel):
    """Requête de validation conformité schéma JSON Unity (FR48 / Story 4.13)."""

    nodes: List[Dict[str, Any]] = Field(..., description="Nœuds ReactFlow")
    edges: List[Dict[str, Any]] = Field(..., description="Arêtes ReactFlow")


class ValidateSchemaResponse(BaseModel):
    """Réponse de validation conformité schéma JSON Unity (FR48 / Story 4.13).

    ``is_valid`` : True si le document Unity produit est 100% conforme au schéma.
    ``errors`` : liste des messages d'erreur (vide si conforme).
    ``error_count`` : raccourci ``len(errors)`` pour faciliter l'affichage UI.
    """

    is_valid: bool = Field(..., description="True si le schéma Unity est conforme à 100%")
    errors: List[str] = Field(..., description="Messages d'erreur détectés")
    error_count: int = Field(..., description="Nombre d'erreurs (== len(errors))")


class CalculateLayoutRequest(BaseModel):
    """Requête pour calculer un layout automatique."""
    nodes: List[Dict[str, Any]] = Field(..., description="Nœuds ReactFlow")
    edges: List[Dict[str, Any]] = Field(..., description="Edges ReactFlow")
    algorithm: str = Field("dagre", description="Algorithme de layout (dagre, manual)")
    direction: str = Field("TB", description="Direction (TB, LR, BT, RL)")


class CalculateLayoutResponse(BaseModel):
    """Réponse après calcul de layout."""
    nodes: List[Dict[str, Any]] = Field(..., description="Nœuds avec positions calculées")


class AcceptNodeRequest(BaseModel):
    """Requête pour accepter un nœud généré."""
    dialogue_id: str = Field(..., description="ID du dialogue (filename)")


class RejectNodeRequest(BaseModel):
    """Requête pour rejeter un nœud généré."""
    dialogue_id: str = Field(..., description="ID du dialogue (filename)")


class RegenerateNodeRequest(BaseModel):
    """Requête pour régénérer un nœud avec de nouvelles instructions (Story 1.10)."""
    dialogue_id: str = Field(..., description="ID du dialogue (filename)")
    new_instructions: str = Field(..., description="Nouvelles instructions pour la régénération")
    preserve_connections: bool = Field(True, description="Préserver les connexions du nœud")
    parent_node_id: str = Field(..., description="ID du nœud parent (contexte de génération)")
    parent_node_content: Dict[str, Any] = Field(..., description="Contenu du nœud parent")
    context_selections: Dict[str, Any] = Field(default_factory=dict, description="Sélection de contexte GDD")
    system_prompt_override: Optional[str] = Field(None, description="Surcharge du system prompt")
    llm_model_identifier: Optional[str] = Field(None, description="Identifiant du modèle LLM")
    via_choice_index: Optional[int] = Field(None, description="Index du choix parent (si connexion par choix)")


class RegenerateNodeResponse(BaseModel):
    """Réponse après régénération d'un nœud (remplacement in-place, même ID)."""
    node: Dict[str, Any] = Field(..., description="Nœud régénéré (id = node_id demandé)")
    suggested_connections: List[SuggestedConnection] = Field(..., description="Connexions suggérées (parent → nouveau nœud)")
    context_gdd_content_fingerprint: Optional[str] = Field(
        None,
        description="Empreinte GDD après régénération (Story 3.9)",
    )


class NodePromptResponse(BaseModel):
    """Réponse GET /graph/prompt — prompt exact ou reconstruit pour un nœud (Story 1.14)."""
    raw_prompt: str = Field(..., description="Prompt brut envoyé au LLM (ou reconstruit)")
    prompt_tokens: Optional[int] = Field(None, description="Tokens du prompt (si disponible)")
    completion_tokens: Optional[int] = Field(None, description="Tokens de la réponse (si disponible)")
    timestamp: Optional[datetime] = Field(None, description="Horodatage de la génération (si stocké)")
    is_historical: bool = Field(..., description="True si prompt stocké à l'époque, False si reconstruit")
    message: Optional[str] = Field(None, description="Message informatif (ex: prompt reconstruit, contexte modifié)")


class AiSlopDetectionOptions(BaseModel):
    """Options de détection AI slop (FR43) — corps optionnel de la requête."""

    include_gpt_isms: bool = Field(True, description="Activer la détection de formulations type GPT-ism")
    include_repetitions: bool = Field(True, description="Activer la détection de répétitions textuelles")
    include_generic_phrases: bool = Field(True, description="Activer les phrases génériques du catalogue")
    custom_keywords: List[str] = Field(default_factory=list, description="Mots ou sous-chaînes supplémentaires")
    custom_regex_patterns: List[str] = Field(
        default_factory=list,
        max_length=MAX_CUSTOM_REGEX_PATTERN_COUNT,
        description=(
            "Motifs regex Python (IGNORECASE côté service) — "
            f"max {MAX_CUSTOM_REGEX_PATTERN_COUNT} motifs, "
            f"{MAX_CUSTOM_REGEX_PATTERN_CHARS} caractères chacun ; motifs à risque ReDoS refusés."
        ),
    )

    @field_validator("custom_regex_patterns", mode="after")
    @classmethod
    def validate_regex_patterns(cls, patterns: List[str]) -> List[str]:
        """Valide limites, politique anti-ReDoS heuristique et syntaxe des regex."""
        for p in patterns:
            s = str(p).strip()
            if not s:
                continue
            violation = custom_regex_pattern_policy_violation(s)
            if violation:
                raise ValueError(violation) from None
            try:
                re.compile(s)
            except re.error as exc:
                raise ValueError(f"Regex invalide : {p!r} ({exc})") from exc
        return patterns


class DetectAiSlopRequest(BaseModel):
    """Requête détection « AI slop » — même charge utile que validate (nodes + edges)."""

    nodes: List[Dict[str, Any]] = Field(..., description="Nœuds ReactFlow")
    edges: List[Dict[str, Any]] = Field(..., description="Edges ReactFlow")
    options: Optional[AiSlopDetectionOptions] = Field(
        None,
        description="Options de détection (familles, motifs personnalisés)",
    )


class AiSlopOccurrenceItem(BaseModel):
    """Une occurrence détectée (avertissement non bloquant)."""

    kind: Literal["gpt_ism", "repetition", "generic_phrase"] = Field(
        ...,
        description="Famille : gpt_ism, repetition ou generic_phrase",
    )
    node_id: str = Field(..., description="ID ReactFlow du nœud")
    node_display_id: Optional[str] = Field(None, description="stableId / id document affichable")
    field: str = Field(..., description="Champ source (line, choice_N, …)")
    excerpt: str = Field(..., description="Texte du segment (tronqué pour l’UI)")
    matched_span: str = Field(..., description="Portion correspondant au motif")
    suggestion: str = Field(..., description="Piste de remplacement heuristique")
    severity: Literal["warning"] = Field("warning", description="Sévérité (toujours warning pour FR43)")


class AiSlopRepetitionGroup(BaseModel):
    """Groupe de répétitions d’une même phrase normalisée."""

    normalized_phrase: str = Field(..., description="Phrase normalisée (casse / espaces)")
    occurrence_count: int = Field(..., description="Nombre d’occurrences du segment")
    node_ids: List[str] = Field(..., description="Nœuds distincts concernés")
    sample_excerpt: str = Field(..., description="Exemple de texte brut")


class DetectAiSlopResponse(BaseModel):
    """Réponse détection AI slop."""

    summary_gpt_isms: str = Field(..., description="Résumé lisible pour GPT-isms")
    summary_repetitions: str = Field(..., description="Résumé lisible pour répétitions")
    summary_generic_phrases: str = Field(..., description="Résumé lisible pour phrases génériques")
    gpt_ism_occurrence_count: int = Field(0, description="Nombre d’occurrences GPT-ism (hors regex seule)")
    gpt_ism_distinct_node_count: int = Field(0, description="Nombre de nœuds distincts touchés (GPT-ism)")
    generic_phrase_occurrence_count: int = Field(0, description="Nombre d’occurrences génériques")
    repetition_group_count: int = Field(0, description="Nombre de phrases répétées (groupes)")
    occurrences: List[AiSlopOccurrenceItem] = Field(default_factory=list)
    repetition_groups: List[AiSlopRepetitionGroup] = Field(default_factory=list)
    message: Optional[str] = Field(
        None,
        description="Contexte (graphe vide, tout désactivé, etc.) — ne pas confondre avec succès silencieux",
    )


class DetectContextDroppingOptions(BaseModel):
    """Options détection context dropping (FR44 / Story 4.10)."""

    rules_profile: Optional[Literal["strict", "light"]] = Field(
        None,
        description="Profil : 'strict' (défaut) ou 'light' (tolérance élevée).",
    )
    tolerance: Optional[float] = Field(
        None,
        ge=0.0,
        le=1.0,
        description="Seuil souple [0, 1] — None = comportement par défaut du profil.",
    )
    mandatory_info: Optional[List[str]] = Field(
        None,
        description="Labels d'informations dont la présence est obligatoire dans le graphe (AC #4).",
    )
    dialogue_type: Optional[str] = Field(
        None,
        description="Type de dialogue (ex. 'combat') pour appliquer les surcharges de règles (AC #5).",
    )
    dialogue_type_overrides: Optional[Dict[str, Any]] = Field(
        None,
        description="Surcharges par type (ex. {'combat': {'rules_profile': 'strict'}}) (AC #5).",
    )


class DetectContextDroppingRequest(BaseModel):
    """Requête détection context dropping — alignée validate-lore-explicit + graphe."""

    nodes: List[Dict[str, Any]] = Field(..., description="Nœuds ReactFlow")
    edges: List[Dict[str, Any]] = Field(..., description="Edges ReactFlow")
    context_selections: Dict[str, Any] = Field(
        default_factory=dict,
        description="Sélections contexte GDD (même famille que validate_graph / génération)",
    )
    scene_instruction: str = Field(
        default="",
        description="Consigne de scène optionnelle (lignes analysées comme faits candidats)",
    )
    context_text: Optional[str] = Field(
        None,
        description="Texte libre optionnel (tests ou client) complémentaire aux sélections",
    )
    options: Optional[DetectContextDroppingOptions] = Field(
        None,
        description="Profil strict/léger ; champs futurs sans casser les clients",
    )


class ContextDroppingCaseItem(BaseModel):
    """Un cas détecté (absence, usage trop indirect, ou information obligatoire manquante)."""

    kind: Literal["context_dropping", "too_subtle", "mandatory_missing"] = Field(
        ...,
        description="Absence détectable ou signal trop faible (subtilité)",
    )
    node_id: Optional[str] = Field(
        None,
        description="Nœud cible pour focus (premier dialogue) ou portée globale",
    )
    node_display_id: Optional[str] = Field(None, description="stableId / id document affichable")
    context_label: str = Field(..., description="Fragment du contexte concerné")
    message: str = Field(..., description="Message actionnable affiché")
    suggestion: str = Field(..., description="Piste pour renforcer l'explicitation")
    severity: Literal["warning", "info"] = Field(..., description="warning = absence ; info = subtilité")


class DetectContextDroppingResponse(BaseModel):
    """Réponse détection context dropping (FR44)."""

    summary: str = Field(..., description="Résumé du type « X cas de context dropping détectés »")
    case_count: int = Field(..., description="Nombre d'entrées dans cases (cohérent avec summary)")
    cases: List[ContextDroppingCaseItem] = Field(default_factory=list)
    message: Optional[str] = Field(
        None,
        description="Contexte (graphe vide, contexte vide, RAS heuristique) — explicite pour ne pas confondre avec succès silencieux",
    )
    rules_profile_effective: str = Field(
        ...,
        description="Profil réellement appliqué (strict ou light)",
    )
