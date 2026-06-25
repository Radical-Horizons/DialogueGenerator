"""Service de construction de la structure XML des prompts.

Ce module contient PromptBuilder qui est responsable de la construction
de la structure XML des prompts, séparant cette responsabilité de PromptEngine
qui orchestre la construction complète (structure + enrichissements + tokens).
"""
import logging
from typing import Optional, TYPE_CHECKING, List, Dict, Any
import xml.etree.ElementTree as ET

from utils.xml_utils import escape_xml_text
from services.dialogue_dramatic_progression import DIALOGUE_ORALITY_PROMPT_LINES
from services.prompt_xml_parsers import build_narrative_guides_xml, build_vocabulary_xml
from services.context_truncator import ContextTruncator, cap_context_text_to_budget
from services.context_serializer.text_serializer import TextSerializer

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
        priority_text = (
            "En cas de conflit entre les instructions, l'ordre de priorité est :\n"
            "1. Instructions de scène (<scene_instructions>) — prévalent sur tout\n"
            "2. Directives d'auteur (<author_directives>) — modulent le style global\n"
            "3. Règles de génération (<generation_instructions>) et system prompt"
        )
        if priority_text.strip():
            priority_elem = ET.SubElement(contract_elem, "priority_rules")
            priority_elem.text = escape_xml_text(priority_text)
            has_content = True
        
        # FORMAT DE SORTIE / INTERDICTIONS (toujours présentes car essentielles)
        format_text = (
            "**IMPORTANT : Génère UN SEUL nœud de dialogue (un nœud = une réplique du PNJ + choix du joueur).**\n"
            "Ne génère PAS de séquence de nœuds dans un même appel : l'expansion d'arbre se fait par "
            "appels successifs (un nœud par requête). Le Structured Output garantit le format JSON, "
            "mais tu dois respecter cette logique métier."
        )
        if format_text.strip():
            format_elem = ET.SubElement(contract_elem, "output_format")
            format_elem.text = escape_xml_text(format_text)
            has_content = True
        
        # Ne retourner que si au moins un élément a du contenu
        return contract_elem if has_content else None
    
    # Titres de sections et mots-clés signalant des champs de voix du speaker.
    _VOICE_SECTION_TITLES: tuple[str, ...] = ("VOIX ET STYLE",)
    _VOICE_FIELD_KEYWORDS: tuple[str, ...] = (
        "Voix", "Style de dialogue", "Expressions courantes",
        "Présence physique", "Registre", "Langage",
    )

    def _item_section_text(self, item_section: Any) -> str:
        """Texte d'une section de fiche (``content`` ou ``raw_content`` sérialisé)."""
        content = (getattr(item_section, "content", None) or "").strip()
        if content:
            return content
        raw_content = getattr(item_section, "raw_content", None)
        if raw_content is None:
            return ""
        return TextSerializer._raw_content_to_text(raw_content).strip()

    def _build_speaker_voice_section(self, input: 'PromptInput') -> Optional[ET.Element]:
        """Extrait les champs voix du NPC speaker depuis structured_context et les injecte.

        Le bloc ``<speaker_voice>`` est inséré dans ``<technical>`` **avant** la
        zone soumise au budget de troncature, ce qui garantit sa présence même si
        la fiche du PNJ est tronquée par le budget contexte.

        Args:
            input: Objet PromptInput (npc_speaker_id + structured_context requis).

        Returns:
            Élément XML ``<speaker_voice>`` ou None si aucun contenu trouvé.
        """
        if not input.structured_context or not input.npc_speaker_id:
            return None

        npc_name = input.npc_speaker_id.strip()
        voice_parts: List[str] = []

        try:
            from services.scene_dramatis import normalize_character_name

            npc_key = normalize_character_name(npc_name)
            for section in input.structured_context.sections:
                cats = getattr(section, "categories", None) or []
                for category in cats:
                    if getattr(category, "type", "") != "characters":
                        continue
                    for item in getattr(category, "items", []):
                        item_name = (getattr(item, "name", None) or "").strip()
                        real_name = ((getattr(item, "metadata", None) or {}).get("real_name", "") or "").strip()
                        if (
                            normalize_character_name(item_name) != npc_key
                            and normalize_character_name(real_name) != npc_key
                        ):
                            continue
                        voice_section_content: List[str] = []
                        other_voice_fields: List[str] = []
                        for item_section in getattr(item, "sections", []):
                            title = (getattr(item_section, "title", "") or "").strip().upper()
                            content = self._item_section_text(item_section)
                            if not content:
                                continue
                            if title in self._VOICE_SECTION_TITLES:
                                voice_section_content.append(content)
                            else:
                                for kw in self._VOICE_FIELD_KEYWORDS:
                                    if kw.lower() in content.lower()[:120]:
                                        other_voice_fields.append(content)
                                        break
                        voice_parts.extend(voice_section_content or other_voice_fields)
                        break
                if voice_parts:
                    break
        except Exception:
            logger.debug("_build_speaker_voice_section: erreur de lecture du structured_context", exc_info=True)
            return None

        if not voice_parts:
            return None

        raw_content = "\n\n".join(voice_parts)
        # Limiter à 400 tokens (≈ 1600 caractères) pour rester hors budget contexte
        if len(raw_content) > 1600:
            cut = raw_content[:1600]
            last_nl = cut.rfind("\n")
            raw_content = (cut[:last_nl] if last_nl > 1200 else cut) + "\n... (extrait)"

        voice_elem = ET.Element("speaker_voice")
        voice_elem.text = escape_xml_text(
            f"Voix du PNJ {npc_name} — à respecter dans toutes les répliques `line` :\n{raw_content}"
        )
        return voice_elem

    def _build_technical_section(self, input: 'PromptInput') -> Optional[ET.Element]:
        """Construit la section <technical> directement en XML.
        
        Args:
            input: Objet PromptInput contenant les paramètres.
            
        Returns:
            Élément XML <technical> ou None si la section est vide.
        """
        technical_elem = ET.Element("technical")
        has_content = False

        # SECTION VOIX DU SPEAKER — injectée avant la zone soumise au budget contexte
        speaker_voice_elem = self._build_speaker_voice_section(input)
        if speaker_voice_elem is not None:
            technical_elem.append(speaker_voice_elem)
            has_content = True
        
        # INSTRUCTIONS DE GÉNÉRATION
        gen_elem = ET.SubElement(technical_elem, "generation_instructions")
        gen_parts = [
            "Règles de contenu :",
            f"- Speaker (répliques `line`) : {input.npc_speaker_id} — interlocuteur de la scène",
            f"- Choix (`choices`) : voix du PJ {input.player_character_id}",
            "- L'Éthérée ne doit jamais apparaître comme speaker ; ses répliques passent par les choices.",
            "- Tests d'attributs : Format 'Caractéristique+Compétence:DD' (ex. 'Intelligence+Rhétorique:8'). Utilisez exactement les identifiants listés ci-dessous (sans espace).",
        ]
        gen_parts.extend(DIALOGUE_ORALITY_PROMPT_LINES)
        
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

        if input.attributes_list:
            attrs_elem = ET.SubElement(technical_elem, "available_attributes")
            attrs_text = ", ".join(input.attributes_list)
            attrs_content = (
                f"Caractéristiques disponibles: {attrs_text}\n"
                "Utilisez exactement ces noms (sans espace) avant le « + » dans les tests."
            )
            attrs_elem.text = escape_xml_text(attrs_content)
            has_content = True
        
        # COMPÉTENCES DISPONIBLES
        if input.skills_list:
            skills_elem = ET.SubElement(technical_elem, "available_skills")
            skills_text = ", ".join(input.skills_list[:80])
            if len(input.skills_list) > 80:
                skills_text += f" (et {len(input.skills_list) - 80} autres compétences)"
            skills_content = (
                f"Compétences disponibles (identifiants sans espace): {skills_text}\n"
                "Utilisez exactement ces identifiants après le « + » (format: Caractéristique+Compétence:DD)."
            )
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
    
    def _character_names_from_structured(self, structured_context: Any) -> List[str]:
        """Liste les noms de fiches personnages dans le contexte structuré."""
        names: List[str] = []
        for section in getattr(structured_context, "sections", None) or []:
            for category in getattr(section, "categories", None) or []:
                if getattr(category, "type", "") != "characters":
                    continue
                for item in getattr(category, "items", []) or []:
                    name = (getattr(item, "name", None) or "").strip()
                    if name:
                        names.append(name)
        return names

    def _cap_gdd_context_text(self, text_ser: str, max_tok: int, input: 'PromptInput') -> str:
        """Applique le plafond tokens en protégeant la fiche du PNJ speaker."""
        protect = [input.npc_speaker_id] if input.npc_speaker_id else None
        all_chars = (
            self._character_names_from_structured(input.structured_context)
            if input.structured_context
            else None
        )
        return cap_context_text_to_budget(
            text_ser,
            max_tok,
            protect_entity_names=protect,
            all_entity_names=all_chars,
        )

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
                    capped_text = self._cap_gdd_context_text(text_ser, max_tok, input)
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
                            body_text = self._cap_gdd_context_text(text_ser, inner_budget, input)
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
            scene_loc = dict(input.scene_location)
            if self._context_builder is not None:
                from services.gdd_relation_resolver import resolve_scene_location_labels

                scene_loc.update(
                    resolve_scene_location_labels(
                        scene_loc,
                        self._context_builder.locations,
                    )
                )
            lieu = scene_loc.get("lieu", "Non spécifié")
            sous_lieu = scene_loc.get("sous_lieu")
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
        guides_parts = self._enricher.enrich_with_narrative_guides(
            guides_parts,
            input.include_narrative_guides,
            format_style="unity",
            include_rules=False,
        )
        
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
