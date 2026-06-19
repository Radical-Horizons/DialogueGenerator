"""Sérialisation de structures de prompt en format texte.

Ce module gère la conversion des structures PromptStructure en format texte
avec marqueurs pour compatibilité avec le format legacy.
"""
import logging
import json
from typing import Any, Dict, List
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models.prompt_structure import PromptStructure

logger = logging.getLogger(__name__)


class TextSerializer:
    """Sérialise une structure PromptStructure en texte formaté pour le LLM.
    
    Génère un format texte avec marqueurs "--- ... ---" pour compatibilité
    avec le format legacy et lisibilité pour l'humain.
    """

    @staticmethod
    def _raw_content_to_text(raw_content: Any) -> str:
        """Convertit `raw_content` (structure Python) en texte lisible.

        Le modèle `ItemSection` peut contenir `raw_content` (dict) au lieu de `content` (str).
        Cette méthode assure la compatibilité du rendu texte avec le format legacy.
        """
        if raw_content is None:
            return ""

        def fmt_value(value: Any) -> str:
            if value is None:
                return ""
            if isinstance(value, (str, int, float, bool)):
                return str(value)
            # Pour listes/dicts, conserver la structure en JSON lisible
            try:
                return json.dumps(value, ensure_ascii=False)
            except Exception:
                return str(value)

        # Dict principal: "Label: valeur" par ligne
        if isinstance(raw_content, dict):
            lines: List[str] = []
            for k, v in raw_content.items():
                rendered = fmt_value(v)
                if rendered == "":
                    continue
                lines.append(f"{k}: {rendered}")
            return "\n".join(lines)

        # Liste: une ligne par item
        if isinstance(raw_content, list):
            return "\n".join(fmt_value(v) for v in raw_content if fmt_value(v) != "")

        return fmt_value(raw_content)
    
    def serialize(self, prompt_structure: 'PromptStructure') -> str:
        """Sérialise une structure PromptStructure en texte formaté pour le LLM.
        
        Args:
            prompt_structure: Structure JSON du prompt.
            
        Returns:
            Texte formaté avec marqueurs --- ... --- pour compatibilité.
            
        Example:
            >>> serializer = TextSerializer()
            >>> text = serializer.serialize(prompt_structure)
            >>> "--- CONTEXTE GDD ---" in text
            True
        """
        from models.prompt_structure import PromptSection, ContextCategory, ContextItem
        
        text_parts = []
        
        for section in prompt_structure.sections:
            if section.type == "system_prompt":
                text_parts.append(section.content)
            elif section.type == "context":
                # Ajouter le titre de section si présent
                if section.title:
                    text_parts.append(f"\n--- {section.title} ---")
                
                # Parcourir les catégories
                if section.categories:
                    for category in section.categories:
                        text_parts.append(f"\n--- {category.title} ---")
                        
                        # Parcourir les items de la catégorie
                        for item in category.items:
                            # Marqueur de l'élément
                            text_parts.append(f"--- {item.name} ---")
                            
                            # Parcourir les sections de l'item
                            for item_section in item.sections:
                                text_parts.append(f"--- {item_section.title} ---")
                                # Les sections peuvent être représentées par `raw_content` (structure Python)
                                # plutôt que `content` (texte). On rend `raw_content` en fallback.
                                content = item_section.content
                                if (not content) and getattr(item_section, "raw_content", None):
                                    content = self._raw_content_to_text(item_section.raw_content)
                                text_parts.append(content)
                                text_parts.append("")  # Ligne vide entre sections
            elif section.content:
                text_parts.append(section.content)
            else:
                # Autres types de sections
                if section.title:
                    text_parts.append(f"\n--- {section.title} ---")
                text_parts.append(section.content)
        
        return "\n".join(text_parts).strip()
