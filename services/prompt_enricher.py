"""Service pour enrichir les prompts avec vocabulaire et guides narratifs."""
import logging
from typing import List, Dict, Optional, Any

logger = logging.getLogger(__name__)


class PromptEnricher:
    """Enrichit les prompts avec du vocabulaire et des guides narratifs.
    
    Cette classe est responsable de l'injection de contenu enrichi (vocabulaire,
    guides narratifs) dans les parties de prompt. Elle sépare la logique
    d'enrichissement de la construction de la structure du prompt.
    """
    
    def __init__(
        self,
        vocab_service: Optional[Any] = None,
        guides_service: Optional[Any] = None
    ) -> None:
        """Initialise le PromptEnricher.
        
        Args:
            vocab_service: Instance de VocabularyService à utiliser.
                          Si None, une instance sera créée quand nécessaire.
            guides_service: Instance de NarrativeGuidesService à utiliser.
                           Si None, une instance sera créée quand nécessaire.
        """
        # Stocker les services pour réutilisation (évite les instanciations redondantes)
        self._vocab_service: Optional[Any] = vocab_service
        self._guides_service: Optional[Any] = guides_service
    
    def enrich_with_vocabulary(
        self,
        prompt_parts: List[str],
        vocabulary_config: Optional[Dict[str, str]] = None,
        context_text: Optional[str] = None,
        format_style: str = "standard"
    ) -> List[str]:
        """Injecte le vocabulaire dans les parties du prompt.
        
        Args:
            prompt_parts: Liste des parties du prompt à enrichir.
            vocabulary_config: Configuration du vocabulaire par niveau (dict avec clés "Mondialement", "Régionalement", etc.
                              et valeurs "all", "auto", "none"). Si None, n'injecte pas de vocabulaire.
            context_text: Texte du contexte pour la détection automatique (requis si un niveau est en mode "auto").
            format_style: Style de formatage ("standard" ou "unity").
            
        Returns:
            Liste des parties du prompt enrichie avec le vocabulaire.
        """
        if not vocabulary_config:
            return prompt_parts
        
        # Utiliser le service injecté, ou instancier si nécessaire (compatibilité rétroactive)
        vocab_service = self._vocab_service
        if vocab_service is None:
            try:
                from services.vocabulary_service import VocabularyService
                vocab_service = VocabularyService()
            except Exception as e:
                logger.warning(f"Erreur lors du chargement du vocabulaire: {e}")
                return prompt_parts
        
        try:
            all_terms = vocab_service.load_vocabulary()
            if all_terms:
                filtered_terms = vocab_service.filter_by_config(all_terms, vocabulary_config, context_text)
                vocab_text = vocab_service.format_for_prompt(filtered_terms)
                if vocab_text:
                    if format_style == "unity":
                        prompt_parts.append(vocab_text)
                        prompt_parts.append("")
                    else:  # standard
                        prompt_parts.append("\n" + vocab_text)
        except Exception as e:
            logger.warning(f"Erreur lors de l'injection du vocabulaire: {e}")
        
        return prompt_parts
    
    def enrich_with_narrative_guides(
        self,
        prompt_parts: List[str],
        include_narrative_guides: bool,
        format_style: str = "standard",
        include_rules: bool = True,
    ) -> List[str]:
        """Injecte les guides narratifs dans les parties du prompt.
        
        Args:
            prompt_parts: Liste des parties du prompt à enrichir.
            include_narrative_guides: Si True, inclut les guides narratifs.
            format_style: Style de formatage ("standard" ou "unity").
            include_rules: Si True, inclut les règles extraites (souvent bruitées).
            
        Returns:
            Liste des parties du prompt enrichie avec les guides narratifs.
        """
        if not include_narrative_guides:
            return prompt_parts
        
        # Utiliser le service injecté, ou instancier si nécessaire (compatibilité rétroactive)
        guides_service = self._guides_service
        if guides_service is None:
            try:
                from services.narrative_guides_service import NarrativeGuidesService
                guides_service = NarrativeGuidesService()
            except Exception as e:
                logger.warning(f"Erreur lors du chargement des guides: {e}")
                return prompt_parts
        
        try:
            guides = guides_service.load_guides()
            if guides.get("dialogue_guide") or guides.get("narrative_guide"):
                guides_text = guides_service.format_for_prompt(guides, include_rules=include_rules)
                if guides_text:
                    if format_style == "unity":
                        prompt_parts.append(guides_text)
                        prompt_parts.append("")
                    else:  # standard
                        prompt_parts.append("\n" + guides_text)
        except Exception as e:
            logger.warning(f"Erreur lors de l'injection des guides narratifs: {e}")
        
        return prompt_parts
