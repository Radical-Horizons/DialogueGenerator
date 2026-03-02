"""Service pour gérer les guides narratifs (Guide des dialogues + Guide de narration)."""
import logging
import re
from typing import Dict, Any, Optional, List

from shared.caches import get_notion_cache

logger = logging.getLogger(__name__)


class NarrativeGuidesService:
    """Service pour gérer les guides narratifs.
    
    Charge les guides depuis le cache Notion, extrait les règles clés,
    et formate pour injection dans les prompts système.
    """
    
    def __init__(self, cache=None):
        """Initialise le service des guides narratifs.
        
        Args:
            cache: Instance de NotionCache. Si None, utilise le singleton.
        """
        self.cache = cache or get_notion_cache()
        logger.info("NarrativeGuidesService initialisé")
    
    def load_guides(self, force_refresh: bool = False) -> Dict[str, Any]:
        """Charge les guides depuis le cache.
        
        Args:
            force_refresh: Si True, force le rechargement (ignore le cache).
        
        Returns:
            Dictionnaire avec les guides (dialogue_guide, narrative_guide).
        """
        if force_refresh:
            logger.info("Rechargement forcé des guides (cache ignoré)")
            return {}
        
        dialogue_guide_data = self.cache.get("dialogue_guide")
        narrative_guide_data = self.cache.get("narrative_guide")
        
        guides = {
            "dialogue_guide": dialogue_guide_data.get("content", "") if dialogue_guide_data else "",
            "narrative_guide": narrative_guide_data.get("content", "") if narrative_guide_data else ""
        }
        
        logger.info(
            f"Guides chargés: dialogue ({len(guides['dialogue_guide'])} chars), "
            f"narration ({len(guides['narrative_guide'])} chars)"
        )
        
        return guides
    
    def extract_rules(self, guides: Dict[str, Any]) -> Dict[str, List[str]]:
        """Extrait les règles clés des guides (ton, structure, interdits).
        
        Args:
            guides: Dictionnaire avec les guides (dialogue_guide, narrative_guide).
        
        Returns:
            Dictionnaire avec les règles extraites par catégorie.
        """
        rules = {
            "ton": [],
            "structure": [],
            "interdits": [],
            "principes": []
        }
        
        # Extraire depuis le guide des dialogues
        dialogue_content = guides.get("dialogue_guide", "")
        if dialogue_content:
            dialogue_rules = self._extract_dialogue_rules(dialogue_content)
            rules["ton"].extend(dialogue_rules.get("ton", []))
            rules["structure"].extend(dialogue_rules.get("structure", []))
            rules["principes"].extend(dialogue_rules.get("principes", []))
        
        # Extraire depuis le guide de narration
        narrative_content = guides.get("narrative_guide", "")
        if narrative_content:
            narrative_rules = self._extract_narrative_rules(narrative_content)
            rules["ton"].extend(narrative_rules.get("ton", []))
            rules["structure"].extend(narrative_rules.get("structure", []))
            rules["interdits"].extend(narrative_rules.get("interdits", []))
            rules["principes"].extend(narrative_rules.get("principes", []))
        
        # Dédupliquer
        for key in rules:
            rules[key] = list(set(rules[key]))
        
        logger.info(
            f"Règles extraites: {len(rules['ton'])} ton, {len(rules['structure'])} structure, "
            f"{len(rules['interdits'])} interdits, {len(rules['principes'])} principes"
        )
        
        return rules
    
    def format_for_prompt(self, guides: Dict[str, Any], include_rules: bool = True) -> str:
        """Formate les guides pour injection dans le prompt système.
        
        Args:
            guides: Dictionnaire avec les guides.
            include_rules: Si True, inclut les règles extraites.
        
        Returns:
            Texte formaté pour injection dans le prompt.
        """
        lines = ["[GUIDES NARRATIFS]"]
        
        # Guide des dialogues
        dialogue_content = guides.get("dialogue_guide", "")
        if dialogue_content:
            lines.append("\n--- GUIDE DES DIALOGUES ---")
            # Simplifier le markdown pour le prompt (enlever les callouts complexes)
            simplified = self._simplify_markdown(dialogue_content)
            lines.append(simplified)
        
        # Guide de narration
        narrative_content = guides.get("narrative_guide", "")
        if narrative_content:
            lines.append("\n--- GUIDE DE NARRATION ---")
            simplified = self._simplify_markdown(narrative_content)
            lines.append(simplified)
        
        # Règles extraites (optionnel)
        if include_rules:
            rules = self.extract_rules(guides)
            if any(rules.values()):
                lines.append("\n--- RÈGLES CLÉS EXTRAITES ---")
                
                if rules["ton"]:
                    lines.append("\nTON:")
                    for rule in rules["ton"][:5]:  # Limiter à 5 règles principales
                        lines.append(f"- {rule}")
                
                if rules["structure"]:
                    lines.append("\nSTRUCTURE:")
                    for rule in rules["structure"][:5]:
                        lines.append(f"- {rule}")
                
                if rules["interdits"]:
                    lines.append("\nINTERDITS:")
                    for rule in rules["interdits"][:5]:
                        lines.append(f"- {rule}")
        
        formatted_text = "\n".join(lines)
        logger.debug(f"Formatage guides: {len(formatted_text)} caractères")
        return formatted_text
    
    def _extract_dialogue_rules(self, content: str) -> Dict[str, List[str]]:
        """Extrait les règles depuis le guide des dialogues.
        
        Args:
            content: Contenu markdown du guide des dialogues.
        
        Returns:
            Dictionnaire avec les règles par catégorie.
        """
        rules = {
            "ton": [],
            "structure": [],
            "principes": []
        }
        
        # Extraire les sections importantes
        # Rechercher les callouts et sections clés
        callout_pattern = r'<callout[^>]*>.*?</callout>'
        callouts = re.findall(callout_pattern, content, re.DOTALL)
        
        for callout in callouts:
            # Extraire le texte du callout
            text_match = re.search(r'>(.*?)</callout>', callout, re.DOTALL)
            if text_match:
                text = text_match.group(1).strip()
                # Détecter le type de règle selon le contenu
                if any(keyword in text.lower() for keyword in ["ton", "langage", "registre", "complexité"]):
                    rules["ton"].append(text[:200])  # Limiter la longueur
                elif any(keyword in text.lower() for keyword in ["structure", "format", "embranchement", "choix"]):
                    rules["structure"].append(text[:200])
                else:
                    rules["principes"].append(text[:200])
        
        return rules
    
    def _extract_narrative_rules(self, content: str) -> Dict[str, List[str]]:
        """Extrait les règles depuis le guide de narration.
        
        Args:
            content: Contenu markdown du guide de narration.
        
        Returns:
            Dictionnaire avec les règles par catégorie.
        """
        rules = {
            "ton": [],
            "structure": [],
            "interdits": [],
            "principes": []
        }
        
        # Extraire les callouts
        callout_pattern = r'<callout[^>]*>.*?</callout>'
        callouts = re.findall(callout_pattern, content, re.DOTALL)
        
        for callout in callouts:
            text_match = re.search(r'>(.*?)</callout>', callout, re.DOTALL)
            if text_match:
                text = text_match.group(1).strip()
                
                # Détecter les interdits (mots-clés négatifs)
                if any(keyword in text.lower() for keyword in ["éviter", "ne pas", "interdit", "pas de"]):
                    rules["interdits"].append(text[:200])
                elif any(keyword in text.lower() for keyword in ["ton", "style", "registre"]):
                    rules["ton"].append(text[:200])
                elif any(keyword in text.lower() for keyword in ["structure", "format", "organisation"]):
                    rules["structure"].append(text[:200])
                else:
                    rules["principes"].append(text[:200])
        
        # Extraire les sections principales (titres)
        section_pattern = r'^#+\s+(.+)$'
        sections = re.findall(section_pattern, content, re.MULTILINE)
        for section in sections[:10]:  # Limiter à 10 sections
            if section not in rules["structure"]:
                rules["structure"].append(section)
        
        return rules
    
    def _simplify_markdown(self, content: str) -> str:
        """Simplifie le markdown pour le prompt (enlève les balises complexes).
        
        Args:
            content: Contenu markdown.
        
        Returns:
            Texte simplifié.
        """
        # Enlever les callouts (remplacer par le texte)
        content = re.sub(r'<callout[^>]*>', '', content)
        content = re.sub(r'</callout>', '', content)
        
        # Enlever les mentions de pages
        content = re.sub(r'<mention-page[^>]*>.*?</mention-page>', '', content)
        
        # Enlever les balises HTML restantes
        content = re.sub(r'<[^>]+>', '', content)
        
        # Nettoyer les espaces multiples
        content = re.sub(r'\n{3,}', '\n\n', content)
        content = re.sub(r' {2,}', ' ', content)
        
        return content.strip()

