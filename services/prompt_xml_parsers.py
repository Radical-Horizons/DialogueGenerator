"""Parseurs XML purs pour les sections de prompts (guides narratifs, vocabulaire).

Ces fonctions sont pures (pas de side-effects, pas de dépendances externes)
et peuvent être réutilisées par PromptEngine et PromptBuilder.
"""
import logging
import xml.etree.ElementTree as ET
from typing import Optional

from utils.xml_utils import sanitize_xml_text

logger = logging.getLogger(__name__)


def build_narrative_guides_xml(guides_text: str) -> ET.Element:
    """Parse le texte des guides narratifs et crée une structure XML.
    
    Args:
        guides_text: Texte formaté des guides (format Markdown simplifié).
        
    Returns:
        Élément XML <narrative_guides> avec structure hiérarchique.
    """
    guides_elem = ET.Element("narrative_guides")
    
    if not guides_text or not guides_text.strip():
        return guides_elem
    
    lines = guides_text.split('\n')
    current_section = None
    current_subsection = None
    current_content = []
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        # Détecter les sections principales
        if line.startswith("--- GUIDE DES DIALOGUES ---"):
            if current_section is not None and current_content:
                # Finaliser la section précédente
                if current_subsection is not None:
                    current_subsection.text = sanitize_xml_text("\n".join(current_content))
                current_content = []
            
            current_section = ET.SubElement(guides_elem, "dialogue_guide")
            current_subsection = None
            i += 1
            continue
        elif line.startswith("--- GUIDE DE NARRATION ---"):
            if current_section is not None and current_content:
                # Finaliser la section précédente
                if current_subsection is not None:
                    current_subsection.text = sanitize_xml_text("\n".join(current_content))
                current_content = []
            
            current_section = ET.SubElement(guides_elem, "narrative_guide")
            current_subsection = None
            i += 1
            continue
        elif line.startswith("--- RÈGLES CLÉS EXTRAITES ---"):
            if current_section is not None and current_content:
                # Finaliser la section précédente
                if current_subsection is not None:
                    current_subsection.text = sanitize_xml_text("\n".join(current_content))
                current_content = []
            
            current_section = ET.SubElement(guides_elem, "extracted_rules")
            current_subsection = None
            i += 1
            continue
        
        # Détecter les sous-sections dans le guide des dialogues
        if current_section is not None and current_section.tag == "dialogue_guide":
            if line.startswith("# ") or line.startswith("## "):
                # Titre de sous-section
                if current_subsection is not None and current_content:
                    current_subsection.text = sanitize_xml_text("\n".join(current_content))
                    current_content = []
                
                # Extraire le titre (enlever # et espaces)
                title = line.lstrip("# ").strip()
                # Mapper vers des tags sémantiques
                title_lower = title.lower()
                if "habillage" in title_lower:
                    tag = "habillage"
                elif "technique" in title_lower:
                    tag = "technique"
                elif "interactivité" in title_lower or "interactivite" in title_lower:
                    tag = "interactivity"
                else:
                    tag = title_lower.replace(" ", "_").replace("é", "e")
                
                current_subsection = ET.SubElement(current_section, tag)
                i += 1
                continue
            elif line.startswith("TON:") or line.startswith("STRUCTURE:") or line.startswith("INTERDITS:"):
                # Sous-section dans extracted_rules
                if current_subsection is not None and current_content:
                    current_subsection.text = sanitize_xml_text("\n".join(current_content))
                    current_content = []
                
                rule_type = line.rstrip(":").lower()
                current_subsection = ET.SubElement(current_section, rule_type)
                i += 1
                continue
        
        # Ajouter le contenu à la sous-section courante ou à la section
        if line or current_content:  # Garder les lignes vides si on a déjà du contenu
            if current_subsection is not None:
                current_content.append(lines[i])  # Garder l'original avec espaces
            elif current_section is not None:
                # Pas de sous-section, ajouter directement à la section
                if not current_content:
                    current_content = []
                current_content.append(lines[i])
        
        i += 1
    
    # Finaliser la dernière section
    if current_subsection is not None and current_content:
        current_subsection.text = sanitize_xml_text("\n".join(current_content))
    elif current_section is not None and current_content and current_section.tag != "dialogue_guide":
        # Section sans sous-sections, mettre le contenu directement
        current_section.text = sanitize_xml_text("\n".join(current_content))
    
    return guides_elem


def build_vocabulary_xml(vocab_text: str) -> ET.Element:
    """Parse le texte du vocabulaire et crée une structure XML.
    
    Args:
        vocab_text: Texte formaté du vocabulaire (format "Terme: Définition").
        
    Returns:
        Élément XML <vocabulary> avec structure hiérarchique par niveau de popularité.
    """
    vocab_elem = ET.Element("vocabulary")
    
    if not vocab_text or not vocab_text.strip():
        return vocab_elem
    
    lines = vocab_text.split('\n')
    current_scope = None
    current_scope_level = None
    
    # Mapping des niveaux de popularité vers les valeurs d'attribut
    level_mapping = {
        "mondialement": "mondial",
        "régionalement": "regional",
        "regionalement": "regional",
        "localement": "local",
        "communautaire": "communautaire",
        "occulte": "occulte",
    }
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        # Ignorer les lignes vides et les en-têtes
        if not line or line.startswith("[VOCABULAIRE"):
            i += 1
            continue
        
        # Détecter un niveau de popularité (format "Mondialement:" ou "Mondialement")
        line_lower = line.lower().rstrip(":")
        if line_lower in level_mapping:
            # Finaliser le scope précédent si nécessaire
            if current_scope and current_scope_level:
                # Le scope est déjà créé, continuer à ajouter des termes
                pass
            else:
                # Créer un nouveau scope
                scope_level = level_mapping[line_lower]
                current_scope = ET.SubElement(vocab_elem, "scope")
                current_scope.set("level", scope_level)
                current_scope_level = scope_level
            i += 1
            continue
        
        # Détecter un terme (format "Terme: Définition")
        if ':' in line:
            parts = line.split(':', 1)
            if len(parts) == 2:
                term_name = parts[0].strip()
                term_definition = parts[1].strip()
                
                if term_name:
                    # Si pas de scope actuel, créer un scope par défaut
                    if current_scope is None:
                        current_scope = ET.SubElement(vocab_elem, "scope")
                        current_scope.set("level", "mondial")  # Par défaut
                        current_scope_level = "mondial"
                    
                    # Créer l'élément term
                    term_elem = ET.SubElement(current_scope, "term")
                    term_elem.set("name", sanitize_xml_text(term_name))
                    if term_definition:
                        term_elem.text = sanitize_xml_text(term_definition)
        
        i += 1
    
    return vocab_elem