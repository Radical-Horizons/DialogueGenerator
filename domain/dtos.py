"""Domain-level Data Transfer Objects (API-agnostic).

Ces DTOs sont utilisables par les services sans dépendre de FastAPI ou d'autres frameworks HTTP.
Les schémas API (api/schemas/) peuvent mapper vers/depuis ces DTOs.
"""
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional, Literal


@dataclass
class ContextSelectionDTO:
    """Sélection de contexte pour la génération (domain level).
    
    Attributes:
        characters: Liste des noms de personnages avec leur mode (full/excerpt).
        locations: Liste des noms de lieux avec leur mode.
        items: Liste des noms d'objets avec leur mode.
        species: Liste des noms d'espèces avec leur mode.
        communities: Liste des noms de communautés avec leur mode.
        dialogues_examples: Liste des titres d'exemples de dialogues.
        scene_protagonists: Protagonistes de la scène.
        scene_location: Lieu de la scène.
        generation_settings: Paramètres de génération additionnels.
        element_modes: Dictionnaire des modes par type d'élément.
    """
    characters: List[str] = field(default_factory=list)
    locations: List[str] = field(default_factory=list)
    items: List[str] = field(default_factory=list)
    species: List[str] = field(default_factory=list)
    communities: List[str] = field(default_factory=list)
    dialogues_examples: List[str] = field(default_factory=list)
    scene_protagonists: Optional[Dict[str, Any]] = None
    scene_location: Optional[Dict[str, Any]] = None
    generation_settings: Dict[str, Any] = field(default_factory=dict)
    element_modes: Optional[Dict[str, Dict[str, str]]] = None
    
    def to_service_dict(self) -> Dict[str, Any]:
        """Convertit en dictionnaire pour le service (avec préfixes underscore).
        
        Returns:
            Dictionnaire compatible avec les services existants.
        """
        data: Dict[str, Any] = {
            "characters": self.characters,
            "locations": self.locations,
            "items": self.items,
            "species": self.species,
            "communities": self.communities,
            "dialogues_examples": self.dialogues_examples,
        }
        
        if self.scene_protagonists:
            data["_scene_protagonists"] = self.scene_protagonists
        if self.scene_location:
            data["_scene_location"] = self.scene_location
        if self.element_modes:
            data["_element_modes"] = self.element_modes
        
        return data


@dataclass
class UnityDialogueGenerationInput:
    """Entrée pour la génération de dialogue Unity (domain level).
    
    Cette dataclass contient toutes les informations nécessaires pour générer
    un dialogue Unity, sans dépendre des schémas HTTP.
    """
    user_instructions: str
    context_selections: ContextSelectionDTO
    npc_speaker_id: Optional[str] = None
    max_context_tokens: int = 1500
    system_prompt_override: Optional[str] = None
    author_profile: Optional[str] = None
    max_choices: Optional[int] = None
    choices_mode: Literal["free", "capped"] = "free"
    narrative_tags: Optional[List[str]] = None
    vocabulary_config: Optional[Dict[str, str]] = None
    include_narrative_guides: bool = True
    previous_dialogue_preview: Optional[str] = None
    in_game_flags: Optional[List[Dict[str, Any]]] = None
    
    # LLM configuration
    llm_model_identifier: str = "gpt-5.2-mini"
    max_completion_tokens: Optional[int] = None
    reasoning_effort: Optional[Literal["none", "low", "medium", "high", "xhigh"]] = None
    reasoning_summary: Optional[Literal["auto"]] = None
    top_p: Optional[float] = None


@dataclass
class UnityDialogueGenerationResult:
    """Résultat de la génération de dialogue Unity (domain level).
    
    Cette dataclass contient le résultat de la génération, sans dépendre
    des schémas HTTP.
    """
    json_content: str
    raw_prompt: str
    prompt_hash: str
    estimated_tokens: int
    title: Optional[str] = None
    warning: Optional[str] = None
    structured_prompt: Optional[Dict[str, Any]] = None
    reasoning_trace: Optional[Dict[str, Any]] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convertit en dictionnaire.
        
        Returns:
            Dictionnaire avec tous les champs.
        """
        result = {
            "json_content": self.json_content,
            "raw_prompt": self.raw_prompt,
            "prompt_hash": self.prompt_hash,
            "estimated_tokens": self.estimated_tokens,
        }
        
        if self.title is not None:
            result["title"] = self.title
        if self.warning is not None:
            result["warning"] = self.warning
        if self.structured_prompt is not None:
            result["structured_prompt"] = self.structured_prompt
        if self.reasoning_trace is not None:
            result["reasoning_trace"] = self.reasoning_trace
        
        return result


@dataclass
class GenerationEvent:
    """Événement de génération pour streaming (domain level).
    
    Types d'événements :
    - step: Étape de progression (Prompting, Generating, Validating)
    - metadata: Métadonnées (tokens, coût)
    - chunk: Chunk de texte streamé
    - complete: Génération terminée avec résultat
    - error: Erreur de génération
    """
    type: Literal["step", "metadata", "chunk", "complete", "error"]
    data: Dict[str, Any]
