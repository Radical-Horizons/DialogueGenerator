import logging
from typing import Tuple, Optional, Dict, Any, List, Literal
from pathlib import Path
import time
import json
import hashlib
from dataclasses import dataclass
import xml.etree.ElementTree as ET
from utils.xml_utils import (
    parse_xml_element,
    validate_xml_content,
    indent_xml_element,
    create_xml_document,
    extract_text_from_element
)

# Essayer d'importer tiktoken, mais continuer si non disponible
try:
    import tiktoken
    tiktoken_available = True
except ImportError:
    tiktoken_available = False
    tiktoken = None # Pour que les références ultérieures ne lèvent pas de NameError

logger = logging.getLogger(__name__)

@dataclass
class PromptInput:
    """Input unifié pour la construction de prompt.
    
    Contient tous les paramètres nécessaires à la construction d'un prompt
    pour la génération de dialogue Unity, y compris les paramètres optionnels.
    
    Attributes:
        user_instructions: Instructions utilisateur pour la scène.
        npc_speaker_id: Identifiant du personnage non-joueur qui parle.
        player_character_id: Identifiant du personnage joueur (défaut: "URESAIR").
        context_summary: Résumé contextuel en texte (optionnel).
        structured_context: Contexte structuré (PromptStructure) optionnel.
        scene_location: Informations sur le lieu de la scène (optionnel).
        author_profile: Profil d'auteur pour guider le style (optionnel).
        narrative_tags: Tags narratifs pour influencer le ton (optionnel).
        choices_mode: Mode de choix ("free" ou "capped").
        max_choices: Nombre maximum de choix si mode "capped" (optionnel).
        skills_list: Liste des compétences disponibles (optionnel).
        traits_list: Liste des traits disponibles (optionnel).
        vocabulary_config: Configuration du vocabulaire Alteir (optionnel).
        include_narrative_guides: Si True, inclut les guides narratifs.
        in_game_flags: Flags in-game sélectionnés (optionnel).
    """
    user_instructions: str
    npc_speaker_id: str
    player_character_id: str = "URESAIR"
    context_summary: Optional[str] = None
    structured_context: Optional[Any] = None
    scene_location: Optional[Dict[str, str]] = None
    author_profile: Optional[str] = None
    narrative_tags: Optional[List[str]] = None
    choices_mode: Literal["free", "capped"] = "free"
    max_choices: Optional[int] = None
    skills_list: Optional[List[str]] = None
    traits_list: Optional[List[str]] = None
    vocabulary_config: Optional[Dict[str, str]] = None
    include_narrative_guides: bool = True
    in_game_flags: Optional[List[Dict[str, Any]]] = None

@dataclass
class BuiltPrompt:
    """Résultat de la construction de prompt.
    
    Contient le prompt final construit ainsi que ses métadonnées.
    
    Attributes:
        raw_prompt: Le prompt brut complet au format XML.
        token_count: Nombre de tokens estimés dans le prompt.
        sections: Dictionnaire des sections (déprécié, conservé pour compatibilité).
        prompt_hash: Hash SHA-256 du prompt pour validation et cache.
        structured_prompt: Structure de prompt en JSON (PromptStructure) optionnel.
    """
    raw_prompt: str
    token_count: int
    sections: Dict[str, str]
    prompt_hash: str
    structured_prompt: Optional[Any] = None

class PromptEngine:
    """
    Gère la construction de prompts pour les modèles de langage.

    Cette classe combine un system prompt, un contexte de scène, et une instruction
    utilisateur pour créer un prompt final optimisé pour la génération de dialogue.
    """
    _last_info_log_time = {}
    _info_log_interval = 5.0
    _tiktoken_warned_models = set()  # Cache des modèles pour lesquels on a déjà warné
    
    # Mapping des modèles personnalisés vers les encodages tiktoken connus
    # Les modèles GPT récents (GPT-4, GPT-4-turbo, etc.) utilisent cl100k_base
    _MODEL_ENCODING_MAP = {
        "gpt-5.2": "cl100k_base",
        "gpt-5.2-pro": "cl100k_base",
        "gpt-5.2-thinking": "cl100k_base",  # Alias pour compatibilité
        "gpt-5-mini": "cl100k_base",
        "gpt-5-nano": "cl100k_base",
    }
    def _throttled_info_log(self, log_key: str, message: str) -> None:
        """Enregistre un message de log avec limitation de fréquence.
        
        Évite le spam de logs en limitant la fréquence d'enregistrement
        des messages pour une clé donnée. Un message avec la même clé
        ne sera loggé qu'une fois toutes les 5 secondes maximum.
        
        Args:
            log_key: Clé unique pour identifier le type de log (utilisée pour le throttling).
            message: Message à enregistrer dans les logs.
        """
        now = time.time()
        last_time = PromptEngine._last_info_log_time.get(log_key, 0)
        if now - last_time > PromptEngine._info_log_interval:
            logger.info(message)
            PromptEngine._last_info_log_time[log_key] = now

    def __init__(
        self, 
        system_prompt_template: Optional[str] = None,
        context_builder: Optional[Any] = None,
        vocab_service: Optional[Any] = None,
        guides_service: Optional[Any] = None,
        enricher: Optional[Any] = None,
        prompt_builder: Optional[Any] = None
    ) -> None:
        """
        Initialise le PromptEngine.

        Args:
            system_prompt_template (Optional[str]): Un template de system prompt personnalisé.
                                                    Si None, un prompt par défaut sera chargé depuis la configuration.
            context_builder (Optional[ContextBuilder]): Instance de ContextBuilder à utiliser.
                                                       Si None, une instance sera créée quand nécessaire.
            vocab_service (Optional[VocabularyService]): Instance de VocabularyService à utiliser.
                                                        Si None, une instance sera créée quand nécessaire.
            guides_service (Optional[NarrativeGuidesService]): Instance de NarrativeGuidesService à utiliser.
                                                              Si None, une instance sera créée quand nécessaire.
            enricher (Optional[PromptEnricher]): Instance de PromptEnricher à utiliser.
                                                Si None, une instance sera créée avec les services fournis.
        """
        if system_prompt_template is None:
            self.system_prompt_template: str = self._load_default_system_prompt()
        else:
            self.system_prompt_template: str = system_prompt_template
        
        # Stocker le ContextBuilder pour réutilisation (évite les instanciations redondantes)
        self._context_builder: Optional[Any] = context_builder
        
        # Stocker les services pour réutilisation (évite les instanciations redondantes)
        self._vocab_service: Optional[Any] = vocab_service
        self._guides_service: Optional[Any] = guides_service
        
        # Créer PromptEnricher si non fourni
        if enricher is None:
            from services.prompt_enricher import PromptEnricher
            enricher = PromptEnricher(
                vocab_service=self._vocab_service,
                guides_service=self._guides_service
            )
        self._enricher: Optional[Any] = enricher
        
        # Créer PromptBuilder si non fourni
        if prompt_builder is None:
            from services.prompt_builder import PromptBuilder
            prompt_builder = PromptBuilder(
                context_builder=self._context_builder,
                enricher=self._enricher
            )
        self._prompt_builder: Optional[Any] = prompt_builder

    def _load_default_system_prompt(self) -> str:
        """
        Charge le system prompt par défaut depuis la configuration.
        
        Returns:
            str: Le system prompt par défaut.
        """
        try:
            from services.configuration_service import ConfigurationService
            config_service = ConfigurationService()
            prompt = config_service.get_default_system_prompt()
            if prompt:
                return prompt
        except Exception as e:
            logger.warning(f"Impossible de charger le system prompt depuis la configuration: {e}")
        
        # Fallback: prompt minimal si le chargement échoue
        return "Tu es un dialoguiste expert en jeux de rôle narratifs."

    def _count_tokens(self, text: str, model_name: str = "gpt-5.2") -> int:
        """
        Compte le nombre de tokens dans un texte en utilisant tiktoken si disponible.

        Si tiktoken n'est pas disponible ou si une erreur se produit,
        un décompte approximatif basé sur les mots (séparés par des espaces) est utilisé.

        Args:
            text (str): Le texte pour lequel compter les tokens.
            model_name (str): Le nom du modèle à utiliser pour l'encodage (par défaut "gpt-5.2").
                              Cela influence la manière dont tiktoken compte les tokens.
                              Les modèles personnalisés (gpt-5.2, etc.) sont mappés vers cl100k_base.

        Returns:
            int: Le nombre estimé de tokens.
        """
        if tiktoken_available and tiktoken is not None:
            try:
                # Essayer d'abord avec le mapping personnalisé
                encoding_name = self._MODEL_ENCODING_MAP.get(model_name)
                if encoding_name:
                    encoding = tiktoken.get_encoding(encoding_name)
                else:
                    # Essayer avec encoding_for_model pour les modèles standards
                    encoding = tiktoken.encoding_for_model(model_name)
                return len(encoding.encode(text))
            except Exception as e:
                # Warn seulement une fois par modèle pour éviter le spam
                if model_name not in PromptEngine._tiktoken_warned_models:
                    logger.warning(
                        f"Erreur lors du comptage des tokens avec tiktoken pour le modèle {model_name}: {e}. "
                        f"Repli sur le comptage de mots. (Ce warning ne s'affichera qu'une fois par modèle)"
                    )
                    PromptEngine._tiktoken_warned_models.add(model_name)
                pass # Tomber vers le comptage de mots
        
        # Fallback si tiktoken n'est pas disponible ou a échoué
        return len(text.split())


    def _format_tone_section(self, generation_params: Dict[str, Any]) -> Optional[str]:
        """Formate la section ton et style en combinant tone et narrative_tags.
        
        Args:
            generation_params: Dictionnaire contenant les paramètres de génération.
            
        Returns:
            Chaîne formatée pour la section ton et style, ou None si aucun ton n'est défini.
        """
        tone = generation_params.get("tone")
        narrative_tags = generation_params.get("narrative_tags", [])
        
        if not tone and not narrative_tags:
            return None
        
        parts = []
        if tone:
            parts.append(f"Ton général : {tone}")
        if narrative_tags:
            tags_text = ", ".join([f"#{tag}" for tag in narrative_tags])
            parts.append(f"Tags narratifs : {tags_text}")
            parts.append("Adapte le style, le rythme et l'intensité émotionnelle en fonction de ces tags.")
        
        return "\n".join(parts)

    # build_prompt() est la méthode principale pour construire tous les prompts
    
    def _parse_xml_to_prompt_structure(
        self, 
        xml_root: ET.Element, 
        structured_context: Optional[Any],
        total_tokens: int
    ) -> Optional[Any]:
        """Parse un élément XML <prompt> et le convertit en PromptStructure (JSON).
        
        Args:
            xml_root: Élément XML racine <prompt>.
            structured_context: Contexte structuré existant (PromptStructure) pour la section context.
            total_tokens: Nombre total de tokens du prompt.
            
        Returns:
            PromptStructure complet ou None si le parsing échoue.
        """
        from models.prompt_structure import PromptStructure, PromptSection, PromptMetadata
        from datetime import datetime
        
        try:
            sections = []
            
            # Mapping des balises XML vers les sections
            section_mapping = {
                "contract": ("other", "SECTION 0. CONTRAT GLOBAL"),
                "technical": ("other", "SECTION 1. INSTRUCTIONS TECHNIQUES (NORMATIVES)"),
                "narrative_guides": ("other", "SECTION 2B. GUIDES NARRATIFS"),
                "vocabulary": ("other", "SECTION 2C. VOCABULAIRE ALTEIR"),
                "scene_instructions": ("instruction", "SECTION 3. INSTRUCTIONS DE SCÈNE (PRIORITÉ EFFECTIVE)"),
            }
            
            # Parser chaque section XML
            for child in xml_root:
                tag = child.tag
                
                # Section context : utiliser structured_context si disponible
                if tag == "context":
                    if structured_context:
                        # Chercher la section context dans structured_context
                        context_section = None
                        for section in structured_context.sections:
                            if section.type == "context" and section.categories:
                                context_section = section
                                break
                        
                        if context_section:
                            sections.append(context_section)
                        else:
                            # Fallback : créer une section basique depuis le XML
                            content = extract_text_from_element(child)
                            if content:
                                sections.append(PromptSection(
                                    type="context",
                                    title="SECTION 2A. CONTEXTE GDD",
                                    content=content,
                                    tokenCount=self._count_tokens(content)
                                ))
                    else:
                        # Pas de structured_context : parser le XML
                        content = extract_text_from_element(child)
                        if content:
                            sections.append(PromptSection(
                                type="context",
                                title="SECTION 2A. CONTEXTE GDD",
                                content=content,
                                tokenCount=self._count_tokens(content)
                            ))
                
                # Autres sections : utiliser le mapping
                elif tag in section_mapping:
                    section_type, section_title = section_mapping[tag]
                    content = extract_text_from_element(child)
                    if content:
                        sections.append(PromptSection(
                            type=section_type,
                            title=section_title,
                            content=content,
                            tokenCount=self._count_tokens(content)
                        ))
            
            # Extraire organizationMode de manière sécurisée
            organization_mode = None
            if structured_context and structured_context.metadata:
                org_mode = structured_context.metadata.organizationMode
                if isinstance(org_mode, str):
                    organization_mode = org_mode
            
            # Créer la structure finale
            return PromptStructure(
                sections=sections,
                metadata=PromptMetadata(
                    totalTokens=total_tokens,
                    generatedAt=datetime.now().isoformat(),
                    organizationMode=organization_mode
                )
            )
        except Exception as e:
            logger.warning(f"Erreur lors du parsing XML vers PromptStructure: {e}")
            return None
    
    def build_prompt(self, input: PromptInput) -> BuiltPrompt:
        """Builder unique et pur pour tous les prompts.
        
        Aucune dépendance à OpenAI, aucun side-effect.
        Toutes les injections (vocabulaire, guides, contraintes) sont ici.
        
        Args:
            input: Objet PromptInput contenant tous les paramètres.
            
        Returns:
            BuiltPrompt avec raw_prompt (exact), token_count, sections, prompt_hash.
        """
        # Gérer le contexte structuré ou texte (nécessaire pour _build_context_section)
        structured_context = None
        if input.structured_context:
            structured_context = input.structured_context
        
        # ASSEMBLAGE FINAL EN XML (construction via PromptBuilder)
        root = self._prompt_builder.build_structure(input)
        
        # Créer le document XML complet avec déclaration
        full_prompt = create_xml_document(root)
        
        num_tokens = self._count_tokens(full_prompt)
        prompt_hash = hashlib.sha256(full_prompt.encode('utf-8')).hexdigest()
        
        # Parser le XML pour générer structured_prompt (JSON)
        final_structured_prompt = None
        if structured_context:
            try:
                final_structured_prompt = self._parse_xml_to_prompt_structure(root, structured_context, num_tokens)
            except Exception as e:
                logger.warning(f"Erreur lors du parsing XML vers PromptStructure: {e}")
        
        # Valider le XML final
        # Cette validation est critique car le XML généré doit être valide pour être utilisé
        # par le LLM. Si la validation échoue, on capture tous les détails possibles pour
        # faciliter le débogage (ligne, colonne, caractère problématique, etc.)
        if not validate_xml_content(full_prompt):
            logger.error("XML invalide généré dans build_prompt()")
            
            # Capturer les détails précis de l'erreur XML pour faciliter le débogage
            xml_error_details = {}
            try:
                # Extraire le contenu XML sans la déclaration <?xml ... ?>
                xml_content = full_prompt.split('?>', 1)[-1].strip()
                # Tenter de parser pour obtenir les détails de l'erreur
                ET.fromstring(xml_content)
            except ET.ParseError as parse_err:
                # Extraire ligne et colonne depuis le message d'erreur
                # Format typique: "line X, column Y"
                import re
                lineno = None
                offset = None
                msg = str(parse_err)
                logger.error(f"Message d'erreur complet: {repr(msg)}")
                
                # Essayer plusieurs méthodes pour extraire la position de l'erreur
                match = re.search(r'line (\d+), column (\d+)', msg)
                if match:
                    lineno = int(match.group(1))
                    offset = int(match.group(2))
                    logger.error(f"Regex match réussi: ligne {lineno}, colonne {offset}")
                elif hasattr(parse_err, 'position') and parse_err.position:
                    # Méthode alternative si l'exception expose directement la position
                    lineno, offset = parse_err.position
                elif hasattr(parse_err, 'lineno'):
                    # Méthode de fallback pour les anciennes versions
                    lineno = parse_err.lineno
                    offset = getattr(parse_err, 'offset', None) or getattr(parse_err, 'colno', None)
                else:
                    logger.error(f"Regex match échoué pour: {msg}")
                
                # Extraire la ligne problématique et le caractère autour de l'erreur
                error_line = None
                problematic_char = None
                
                if lineno and offset:
                    lines = xml_content.split('\n')
                    if lineno <= len(lines):
                        error_line = lines[lineno - 1]
                        if offset <= len(error_line):
                            # Extraire un contexte autour du caractère problématique (±10 caractères)
                            start = max(0, offset - 10)
                            end = min(len(error_line), offset + 10)
                            problematic_char = error_line[start:end]
                
                # Construire un dictionnaire de détails pour l'exception
                xml_error_details = {
                    "line": lineno,
                    "column": offset,
                    "error_line": error_line,
                    "problematic_char": problematic_char,
                    "raw_xml_preview": full_prompt[:2000] if len(full_prompt) > 2000 else full_prompt,
                    "raw_xml_length": len(full_prompt)
                }
                
                # Logger tous les détails pour faciliter le débogage
                logger.error(f"Détails de l'erreur XML: {parse_err}")
                logger.error(f"Position: ligne {lineno}, colonne {offset}")
                if error_line:
                    logger.error(f"Ligne problématique: {repr(error_line)}")
                if problematic_char:
                    logger.error(f"Caractère problématique (colonne {offset}): {repr(problematic_char)}")
            except Exception as e:
                logger.error(f"Erreur lors de la validation XML: {e}")
            
            # Créer une exception personnalisée avec les détails XML attachés
            # Cela permet au code appelant d'accéder aux détails pour un meilleur traitement d'erreur
            error = ValueError("XML invalide dans le prompt final")
            error.xml_error_details = xml_error_details
            error.raw_xml = full_prompt
            raise error
        
        # sections_content est déprécié mais conservé pour compatibilité (dict vide)
        # Le structured_prompt (JSON) est maintenant la source de vérité
        sections_content = {}
        
        return BuiltPrompt(
            raw_prompt=full_prompt,
            token_count=num_tokens,
            sections=sections_content,
            prompt_hash=prompt_hash,
            structured_prompt=final_structured_prompt
        ) 