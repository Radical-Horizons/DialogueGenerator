"""Service de construction de la structure XML des prompts.

Ce module contient PromptBuilder qui est responsable de la construction
de la structure XML des prompts, séparant cette responsabilité de PromptEngine
qui orchestre la construction complète (structure + enrichissements + tokens).
"""
import logging
from typing import Optional, TYPE_CHECKING, List, Dict, Any
import xml.etree.ElementTree as ET

from utils.xml_utils import escape_xml_text
from services.prompt_xml_parsers import build_narrative_guides_xml, build_vocabulary_xml
from services.context_truncator import ContextTruncator, cap_context_text_to_budget

# Réserve tokens pour l’enveloppe XML plate (<context><gdd_context>) quand le XML hiérarchique dépasse le budget.
_XML_CONTEXT_ENVELOPE_TOKEN_RESERVE = 96

if TYPE_CHECKING:
    from core.prompt.prompt_engine import PromptInput
    from core.context.context_builder import ContextBuilder
    from services.prompt_enricher import PromptEnricher

logger = logging.getLogger(__name__)


class PromptBuilder:
    """Constructeur de la structure XML des prompts.
    
    Responsabilité unique : construction de la structure XML des sections du prompt.
    Ne gère pas les enrichissements (vocabulaire, guides) qui sont délégués à PromptEnricher.
    Ne gère pas le comptage de tokens ni le hash, qui sont gérés par PromptEngine.
    """
    
    def __init__(
        self,
        context_builder: Optional['ContextBuilder'] = None,
        enricher: Optional['PromptEnricher'] = None
    ):
        """Initialise le PromptBuilder.
        
        Args:
            context_builder: ContextBuilder pour la sérialisation du contexte structuré.
            enricher: PromptEnricher pour les enrichissements (vocabulaire, guides).
        """
        self._context_builder = context_builder
        self._enricher = enricher
    
    def build_structure(self, input: 'PromptInput') -> ET.Element:
        """Construit la structure XML complète du prompt.
        
        Args:
            input: Objet PromptInput contenant tous les paramètres.
            
        Returns:
            Élément XML racine <prompt> avec toutes les sections.
        """
        root = ET.Element("prompt")
        
        # Section 0 : Contrat global
        contract_elem = self._build_contract_section(input)
        if contract_elem is not None:
            root.append(contract_elem)
        
        # Section 1 : Instructions techniques
        technical_elem = self._build_technical_section(input)
        if technical_elem is not None:
            root.append(technical_elem)
        
        # Section 2A : Contexte GDD
        context_elem = self._build_context_section(input)
        if context_elem is not None:
            root.append(context_elem)
        
        # Section 2B : Guides narratifs
        guides_elem = self._build_narrative_guides_section(input)
        if guides_elem is not None:
            root.append(guides_elem)
        
        # Section 2C : Vocabulaire
        vocab_elem = self._build_vocabulary_section(input)
        if vocab_elem is not None:
            root.append(vocab_elem)
        
        # Section 3 : Instructions de scène
        scene_elem = self._build_scene_instructions_section(input)
        if scene_elem is not None:
            root.append(scene_elem)
        
        return root
    
    def _build_contract_section(self, input: 'PromptInput') -> Optional[ET.Element]:
        """Construit la section <contract> directement en XML.
        
        Args:
            input: Objet PromptInput contenant les paramètres.
            
        Returns:
            Élément XML <contract> ou None si la section est vide.
        """
        contract_elem = ET.Element("contract")
        has_content = False
        
        # DIRECTIVES D'AUTEUR (GLOBAL)
        if input.author_profile and input.author_profile.strip():
            author_elem = ET.SubElement(contract_elem, "author_directives")
            author_elem.text = escape_xml_text(input.author_profile)
            has_content = True

        if input.game_rules and input.game_rules.strip():
            rules_elem = ET.SubElement(contract_elem, "game_rules")
            rules_elem.text = escape_xml_text(input.game_rules)
            has_content = True
        
        # TON NARRATIF
        if input.narrative_tags and len(input.narrative_tags) > 0:
            tags_text = ", ".join([f"#{tag}" for tag in input.narrative_tags])
            if tags_text.strip():
                tone_elem = ET.SubElement(contract_elem, "narrative_tone")
                tone_elem.text = escape_xml_text(f"Ton : {tags_text}. Adapte le style, le rythme et l'intensité émotionnelle en fonction de ces tags.")
                has_content = True
        
        # RÈGLES DE PRIORITÉ (toujours présentes car essentielles)
        priority_text = "En cas de conflit entre les instructions, l'ordre de priorité est :\n1. Instructions de scène (SECTION 3) - prévalent sur tout\n2. Directives d'auteur (SECTION 0) - modulent le style global\n3. System prompt - règles générales de base"
        if priority_text.strip():
            priority_elem = ET.SubElement(contract_elem, "priority_rules")
            priority_elem.text = escape_xml_text(priority_text)
            has_content = True
        
        # FORMAT DE SORTIE / INTERDICTIONS (toujours présentes car essentielles)
        format_text = "**IMPORTANT : Génère UN SEUL nœud de dialogue (un nœud = une réplique du PNJ + choix du joueur).**\nNe génère PAS de séquence de nœuds. Le Structured Output garantit le format JSON, mais tu dois respecter cette logique métier."
        if format_text.strip():
            format_elem = ET.SubElement(contract_elem, "output_format")
            format_elem.text = escape_xml_text(format_text)
            has_content = True
        
        # Ne retourner que si au moins un élément a du contenu
        return contract_elem if has_content else None
    
    def _build_technical_section(self, input: 'PromptInput') -> Optional[ET.Element]:
        """Construit la section <technical> directement en XML.
        
        Args:
            input: Objet PromptInput contenant les paramètres.
            
        Returns:
            Élément XML <technical> ou None si la section est vide.
        """
        technical_elem = ET.Element("technical")
        has_content = False
        
        # INSTRUCTIONS DE GÉNÉRATION
        gen_elem = ET.SubElement(technical_elem, "generation_instructions")
        gen_parts = [
            "Règles de contenu :",
            f"- Speaker (répliques `line`) : {input.npc_speaker_id} — interlocuteur de la scène",
            f"- Choix (`choices`) : voix du PJ {input.player_character_id}",
            "- L'Éthérée ne doit jamais apparaître comme speaker ; ses répliques passent par les choices.",
            "- Tests d'attributs : Format 'AttributeType+SkillId:DD' (ex: 'Raison+Rhétorique:8'). La compétence est obligatoire."
        ]
        
        # Instructions sur le nombre de choix
        if input.choices_mode == "capped" and input.max_choices is not None:
            if input.max_choices == 0:
                gen_parts.append("- Ce nœud ne doit PAS avoir de choix (choices). Si le nœud n'a ni line ni choices, il termine le dialogue.")
            else:
                gen_parts.append(f"- Nombre de choix : Entre 1 et {input.max_choices} selon ce qui est approprié pour la scène.")
        else:
            gen_parts.append("- Nombre de choix : L'IA décide librement entre 2 et 8 choix selon ce qui est approprié pour la scène. Le nœud DOIT avoir au moins 2 choix.")
        
        # INSTRUCTION POUR RÉACTIVITÉ AUX FLAGS (si des flags sont fournis)
        if input.in_game_flags and len(input.in_game_flags) > 0:
            gen_parts.append("- **IMPORTANT : Le PNJ doit réagir/mentionner explicitement au moins 1 flag in-game sélectionné dans son dialogue.**")
        
        gen_elem.text = escape_xml_text("\n".join(gen_parts))
        has_content = True
        
        # COMPÉTENCES DISPONIBLES
        if input.skills_list:
            skills_elem = ET.SubElement(technical_elem, "available_skills")
            skills_text = ", ".join(input.skills_list[:50])
            if len(input.skills_list) > 50:
                skills_text += f" (et {len(input.skills_list) - 50} autres compétences)"
            skills_content = f"Compétences disponibles: {skills_text}\nUtilise ces compétences dans les tests d'attributs (format: 'AttributeType+NomCompétence:DD')."
            skills_elem.text = escape_xml_text(skills_content)
            has_content = True
        
        # TRAITS DISPONIBLES
        if input.traits_list:
            traits_elem = ET.SubElement(technical_elem, "available_traits")
            traits_text = ", ".join(input.traits_list[:30])
            if len(input.traits_list) > 30:
                traits_text += f" (et {len(input.traits_list) - 30} autres traits)"
            traits_content = f"Traits disponibles: {traits_text}\nUtilise ces traits dans traitRequirements des choix (format: [{{'trait': 'NomTrait', 'minValue': 5}}]).\nLes traits peuvent être positifs (ex: 'Courageux') ou négatifs (ex: 'Lâche')."
            traits_elem.text = escape_xml_text(traits_content)
            has_content = True
        
        return technical_elem if has_content else None
    
    def _build_in_game_flags_element(self, flags: List[Dict[str, Any]]) -> Optional[ET.Element]:
        """Construit l'élément XML pour les flags in-game.
        
        Args:
            flags: Liste des flags sélectionnés avec leurs valeurs.
                   Format: [{"id": "PLAYER_KILLED_BOSS", "value": true, "category": "Event"}, ...]
                   
        Returns:
            Élément XML <in_game_flags> ou None si la liste est vide.
        """
        if not flags or len(flags) == 0:
            return None
        
        flags_elem = ET.Element("in_game_flags")
        
        # Construire le texte formaté [FLAGS IN-GAME] key=value, key2=value2, ...
        flag_pairs = []
        for flag in flags:
            flag_id = flag.get("id", "")
            flag_value = flag.get("value")
            
            if flag_id and flag_value is not None:
                # Sérialiser la valeur selon le type
                if isinstance(flag_value, bool):
                    value_str = "true" if flag_value else "false"
                else:
                    value_str = str(flag_value)
                
                flag_pairs.append(f"{flag_id}={value_str}")
        
        if flag_pairs:
            flags_text = "[FLAGS IN-GAME] " + ", ".join(flag_pairs)
            flags_elem.text = escape_xml_text(flags_text)
            return flags_elem
        
        return None
    
    def _build_context_section(self, input: 'PromptInput') -> Optional[ET.Element]:
        """Construit la section <context> directement en XML.
        
        Args:
            input: Objet PromptInput contenant les paramètres.
            
        Returns:
            Élément XML <context> ou None si la section est vide.
        """
        # Si on a un contexte structuré, utiliser serialize_context_to_xml
        if input.structured_context:
            try:
                if self._context_builder is None:
                    raise ValueError(
                        "ContextBuilder non injecté dans PromptBuilder. "
                        "Utilisez le ServiceContainer pour créer PromptBuilder avec ses dépendances."
                    )

                cb = self._context_builder
                context_root = cb._context_serializer.serialize_to_xml(input.structured_context)

                if context_root is None:
                    raise ValueError("serialize_context_to_xml a retourné None")

                if context_root.tag != "context":
                    logger.warning(f"Élément XML inattendu: {context_root.tag}, attendu 'context'")
                    raise ValueError(f"Tag XML inattendu: {context_root.tag}")

                max_tok = input.max_context_tokens
                if max_tok is not None and max_tok > 0:
                    text_ser = cb.serialize_context_to_text(input.structured_context)
                    capped_text = cap_context_text_to_budget(text_ser, max_tok)
                    trunc = ContextTruncator()
                    xml_tok = trunc.count_tokens(
                        ET.tostring(context_root, encoding="unicode", method="xml")
                    )
                    text_was_truncated = capped_text != text_ser
                    if text_was_truncated or xml_tok > max_tok:
                        if text_was_truncated:
                            body_text = capped_text
                        else:
                            inner_budget = max(1, max_tok - _XML_CONTEXT_ENVELOPE_TOKEN_RESERVE)
                            body_text = cap_context_text_to_budget(text_ser, inner_budget)
                        flat_ctx = ET.Element("context")
                        gdd_el = ET.SubElement(flat_ctx, "gdd_context")
                        gdd_el.text = escape_xml_text(body_text)
                        if input.in_game_flags and len(input.in_game_flags) > 0:
                            flags_elem = self._build_in_game_flags_element(input.in_game_flags)
                            if flags_elem is not None:
                                flat_ctx.insert(0, flags_elem)
                        logger.debug(
                            "Contexte prompt: forme plate sous budget (text_trunc=%s xml_tok=%s max=%s)",
                            text_was_truncated,
                            xml_tok,
                            max_tok,
                        )
                        return flat_ctx

                if input.in_game_flags and len(input.in_game_flags) > 0:
                    flags_elem = self._build_in_game_flags_element(input.in_game_flags)
                    if flags_elem is not None:
                        context_root.insert(0, flags_elem)

                return context_root
            except Exception as e:
                logger.error(
                    f"Erreur lors de la conversion du contexte structuré en XML: {e}. "
                    f"Type d'erreur: {type(e).__name__}. "
                    f"Le système nécessite structured_context pour fonctionner correctement.",
                    exc_info=True
                )
                # Lever une exception claire plutôt que de fallback
                raise ValueError(
                    f"Impossible de sérialiser le contexte structuré en XML: {e}"
                ) from e
        
        # Si pas de structured_context, vérifier si on a au moins un lieu de scène
        # (certains cas peuvent ne pas nécessiter de contexte GDD)
        if input.scene_location:
            context_elem = ET.Element("context")
            location_elem = ET.SubElement(context_elem, "location")
            lieu = input.scene_location.get("lieu", "Non spécifié")
            sous_lieu = input.scene_location.get("sous_lieu")
            location_text = f"Lieu : {lieu}"
            if sous_lieu:
                location_text += f"\nSous-Lieu : {sous_lieu}"
            location_elem.text = escape_xml_text(location_text)
            
            # INJECTION DES FLAGS IN-GAME (si présents et pas de structured_context)
            if input.in_game_flags and len(input.in_game_flags) > 0:
                flags_elem = self._build_in_game_flags_element(input.in_game_flags)
                if flags_elem is not None:
                    context_elem.insert(0, flags_elem)
            
            return context_elem
        
        # Aucun contexte disponible
        return None
    
    def _build_narrative_guides_xml(self, guides_text: str) -> ET.Element:
        """Parse le texte des guides narratifs et crée une structure XML.
        
        Délègue à build_narrative_guides_xml() du module prompt_xml_parsers.
        
        Args:
            guides_text: Texte formaté des guides (format Markdown simplifié).
            
        Returns:
            Élément XML <narrative_guides> avec structure hiérarchique.
        """
        return build_narrative_guides_xml(guides_text)
    
    def _build_narrative_guides_section(self, input: 'PromptInput') -> Optional[ET.Element]:
        """Construit la section <narrative_guides> directement en XML.
        
        Args:
            input: Objet PromptInput contenant les paramètres.
            
        Returns:
            Élément XML <narrative_guides> ou None si la section est vide.
        """
        if not input.include_narrative_guides:
            return None
        
        if not self._enricher:
            return None
        
        guides_parts = []
        guides_parts = self._enricher.enrich_with_narrative_guides(guides_parts, input.include_narrative_guides, format_style="unity")
        
        if not guides_parts:
            return None
        
        # Utiliser la nouvelle méthode pour structurer en XML
        guides_text = "\n".join(guides_parts)
        return self._build_narrative_guides_xml(guides_text)
    
    def _build_vocabulary_xml(self, vocab_text: str) -> ET.Element:
        """Parse le texte du vocabulaire et crée une structure XML.
        
        Délègue à build_vocabulary_xml() du module prompt_xml_parsers.
        
        Args:
            vocab_text: Texte formaté du vocabulaire (format "Terme: Définition").
            
        Returns:
            Élément XML <vocabulary> avec structure hiérarchique par niveau de popularité.
        """
        return build_vocabulary_xml(vocab_text)
    
    def _build_vocabulary_section(self, input: 'PromptInput') -> Optional[ET.Element]:
        """Construit la section <vocabulary> directement en XML.
        
        Args:
            input: Objet PromptInput contenant les paramètres.
            
        Returns:
            Élément XML <vocabulary> ou None si la section est vide.
        """
        if not input.vocabulary_config:
            return None
        
        if not self._enricher:
            return None
        
        vocab_parts = []
        vocab_parts = self._enricher.enrich_with_vocabulary(vocab_parts, input.vocabulary_config, input.context_summary, format_style="unity")
        
        if not vocab_parts:
            return None
        
        # Utiliser la nouvelle méthode pour structurer en XML
        vocab_text = "\n".join(vocab_parts)
        return self._build_vocabulary_xml(vocab_text)
    
    def _build_scene_instructions_section(self, input: 'PromptInput') -> Optional[ET.Element]:
        """Construit la section <scene_instructions> directement en XML.
        
        Args:
            input: Objet PromptInput contenant les paramètres.
            
        Returns:
            Élément XML <scene_instructions> ou None si la section est vide.
        """
        if not input.user_instructions or not input.user_instructions.strip():
            return None
        
        scene_elem = ET.Element("scene_instructions")
        scene_elem.text = escape_xml_text(input.user_instructions)
        return scene_elem
