"""Service pour organiser intelligemment les sections du contexte dans le prompt."""
import logging
from typing import List, Dict, Optional, Tuple
from collections import defaultdict

logger = logging.getLogger(__name__)

# Import des modèles de structure JSON
try:
    from models.prompt_structure import ContextItem, ItemSection
except ImportError:
    # Fallback si les modèles ne sont pas encore disponibles
    ContextItem = None
    ItemSection = None


class ContextOrganizer:
    """Organise les champs du contexte en sections logiques pour le prompt.
    
    IMPORTANT - Format du prompt généré :
    Le prompt généré par ContextBuilder inclut des marqueurs explicites pour chaque élément :
    - `--- PNJ 1 ---`, `--- PNJ 2 ---` pour les personnages
    - `--- LIEU 1 ---`, `--- LIEU 2 ---` pour les lieux
    - `--- OBJET 1 ---` pour les objets
    - `--- ESPÈCE 1 ---` pour les espèces
    - `--- COMMUNAUTÉ 1 ---` pour les communautés
    - `--- QUÊTE 1 ---` pour les quêtes
    
    Ces marqueurs sont ajoutés par ContextBuilder AVANT l'appel à organize_context().
    Ils permettent au frontend de parser la structure de manière fiable et garantissent
    une source de vérité unique entre le prompt brut et le mode structuré.
    
    Voir docs/PROMPT_STRUCTURE.md pour la spécification complète du format.
    """
    
    # Ordre des sections pour le mode "narrative"
    NARRATIVE_SECTIONS = [
        "identity",
        "characterization",
        "voice",
        "background",
        "mechanics",
    ]
    
    # Labels des sections
    SECTION_LABELS = {
        "identity": "IDENTITÉ",
        "characterization": "CARACTÉRISATION",
        "voice": "VOIX ET STYLE",
        "background": "HISTOIRE ET RELATIONS",
        "mechanics": "MÉCANIQUES",
    }
    
    # Champs essentiels distincts (2 critères indépendants) :
    # - ESSENTIAL_CONTEXT_FIELDS : champs essentiels du CONTEXTE NARRATIF (après "Introduction")
    # - ESSENTIAL_METADATA_FIELDS : champs essentiels des MÉTADONNÉES (avant "Introduction")
    #
    # IMPORTANT: un champ peut être "métadonnée" et "essentiel", ou "contexte" et "essentiel".
    # Ces listes ne définissent PAS la frontière métadonnées/contexte (c'est `is_metadata`).
    ESSENTIAL_CONTEXT_FIELDS = {
        "character": [
            # Minimum utile pour écrire une scène/dialogue :
            "Introduction.Résumé de la fiche",
            "Registre de langage du personnage",
            "Expressions courantes",
            "Caractérisation.Désir",
            "Caractérisation.Faiblesse",
            "Background.Relations",
        ],
        "location": [
            "Introduction.Résumé de la fiche",
        ],
        "item": [
            "Introduction.Résumé de la fiche",
        ],
        "species": [
            "Introduction.Résumé de la fiche",
        ],
        "community": [
            "Introduction.Résumé de la fiche",
        ],
    }

    ESSENTIAL_METADATA_FIELDS = {
        "character": [
            "Nom",
            "Alias",
            "Occupation",
            "Espèce",
        ],
        "location": [
            "Nom",
        ],
        "item": [
            "Nom",
            "Type",
        ],
        "species": [
            "Nom",
            "Type",
        ],
        "community": [
            "Nom",
        ],
    }
    
    def __init__(self):
        """Initialise l'organisateur."""
        # Importer le déduplicateur
        try:
            from services.context_serializer.deduplicator import FieldDeduplicator
            self.deduplicator = FieldDeduplicator()
        except ImportError:
            logger.warning("FieldDeduplicator non disponible, déduplication désactivée")
            self.deduplicator = None
    
    def organize_context(
        self,
        element_data: Dict,
        element_type: str,
        fields_to_include: List[str],
        organization_mode: str = "default",
        field_labels_map: Optional[Dict[str, str]] = None,
        element_mode: Optional[str] = None
    ) -> str:
        """Organise les champs d'un élément selon le mode d'organisation.
        
        Args:
            element_data: Données complètes de l'élément
            element_type: Type d'élément ("character", "location", etc.)
            fields_to_include: Liste des chemins de champs à inclure
            organization_mode: Mode d'organisation ("default", "narrative", "minimal")
            field_labels_map: Dictionnaire {field_path: label} depuis context_config.json (optionnel)
            element_mode: Mode de sélection ("full" ou "excerpt") pour adapter les labels (optionnel)
            
        Returns:
            Texte formaté avec les champs organisés.
        """
        # Valider que les champs existent réellement (filtrage silencieux avec log)
        if fields_to_include:
            try:
                from services.context_field_detector import ContextFieldDetector
                from core.context.context_builder import ContextBuilder
                
                # Essayer de récupérer le ContextBuilder depuis le contexte (si disponible)
                # Sinon, on valide uniquement en extrayant les valeurs
                validated_fields = []
                for field_path in fields_to_include:
                    # Vérifier que le champ peut être extrait des données
                    value = self._extract_field_value(element_data, field_path)
                    if value is not None:
                        validated_fields.append(field_path)
                    else:
                        logger.debug(
                            f"[{element_type}] Champ '{field_path}' ignoré: "
                            f"non trouvé dans les données de l'élément"
                        )
                
                if len(validated_fields) < len(fields_to_include):
                    # Attendu : la config agrège des chemins présents sur *d'autres* fiches ;
                    # chaque élément n'expose qu'un sous-ensemble. Éviter WARNING en boucle (spam console).
                    logger.debug(
                        "[%s] %s champ(s) absent(s) de cette fiche filtré(s) sur %s chemins demandés",
                        element_type,
                        len(fields_to_include) - len(validated_fields),
                        len(fields_to_include),
                    )
                
                fields_to_include = validated_fields
            except Exception as e:
                logger.warning(f"Impossible de valider les champs pour '{element_type}': {e}")
                # Continuer avec les champs fournis si la validation échoue
        
        if organization_mode == "minimal":
            return self._organize_minimal(element_data, element_type, fields_to_include, field_labels_map, element_mode)
        elif organization_mode == "narrative":
            return self._organize_narrative(element_data, element_type, fields_to_include, field_labels_map, element_mode)
        else:  # default
            return self._organize_default(element_data, element_type, fields_to_include, field_labels_map, element_mode)
    
    def _organize_default(
        self,
        element_data: Dict,
        element_type: str,
        fields_to_include: List[str],
        field_labels_map: Optional[Dict[str, str]] = None,
        element_mode: Optional[str] = None
    ) -> str:
        """Organisation par défaut : ordre linéaire des champs."""
        parts = []
        
        for field_path in fields_to_include:
            value = self._extract_field_value(element_data, field_path)
            if value is None:
                continue
            
            label = self._generate_label(field_path, field_labels_map, element_mode)
            formatted_value = self._format_value(value)
            parts.append(f"{label}: {formatted_value}")
        
        return "\n".join(parts)
    
    def _organize_narrative(
        self,
        element_data: Dict,
        element_type: str,
        fields_to_include: List[str],
        field_labels_map: Optional[Dict[str, str]] = None,
        element_mode: Optional[str] = None
    ) -> str:
        """Organisation narrative : groupement par sections logiques."""
        # Grouper les champs par catégorie
        fields_by_category = defaultdict(list)
        
        for field_path in fields_to_include:
            category = self._categorize_field(field_path, element_type)
            fields_by_category[category or "other"].append(field_path)
        
        # Construire les sections dans l'ordre défini
        sections = []
        for section_key in self.NARRATIVE_SECTIONS:
            if section_key in fields_by_category:
                section_label = self.SECTION_LABELS.get(section_key, section_key.upper())
                section_fields = fields_by_category[section_key]
                
                section_parts = [f"--- {section_label} ---"]
                for field_path in section_fields:
                    value = self._extract_field_value(element_data, field_path)
                    if value is None:
                        continue
                    
                    label = self._generate_label(field_path, field_labels_map, element_mode)
                    formatted_value = self._format_value(value)
                    section_parts.append(f"{label}: {formatted_value}")
                
                if len(section_parts) > 1:  # Au moins un champ (en plus du titre)
                    sections.append("\n".join(section_parts))
        
        # Ajouter les champs non catégorisés à la fin
        if "other" in fields_by_category:
            other_fields = fields_by_category["other"]
            if other_fields:
                section_parts = ["--- AUTRES INFORMATIONS ---"]
                for field_path in other_fields:
                    value = self._extract_field_value(element_data, field_path)
                    if value is None:
                        continue
                    
                    label = self._generate_label(field_path, field_labels_map, element_mode)
                    formatted_value = self._format_value(value)
                    section_parts.append(f"{label}: {formatted_value}")
                
                sections.append("\n".join(section_parts))
        
        return "\n\n".join(sections)
    
    def _organize_minimal(
        self,
        element_data: Dict,
        element_type: str,
        fields_to_include: List[str],
        field_labels_map: Optional[Dict[str, str]] = None,
        element_mode: Optional[str] = None
    ) -> str:
        """Organisation minimale : seulement les champs essentiels."""
        # Filtrer pour ne garder que les champs essentiels
        essential_fields = self.ESSENTIAL_CONTEXT_FIELDS.get(element_type, [])
        
        # Intersection entre fields_to_include et essential_fields
        minimal_fields = [
            f for f in fields_to_include 
            if f in essential_fields or any(essential in f for essential in essential_fields)
        ]
        
        # Si aucun champ essentiel n'est dans la liste, utiliser les premiers champs
        if not minimal_fields:
            minimal_fields = fields_to_include[:5]  # Limiter à 5 champs
        
        return self._organize_default(element_data, element_type, minimal_fields, field_labels_map, element_mode)
    
    def _extract_field_value(self, data: Dict, path: str) -> Optional[any]:
        """Extrait la valeur d'un champ depuis un chemin."""
        from services.gdd_sections_split import extract_gdd_field_value

        return extract_gdd_field_value(data, path)
    
    def _format_value(self, value: any, for_json: bool = False) -> any:
        """Formate une valeur pour l'affichage.
        
        Args:
            value: Valeur à formater
            for_json: Si True, retourne la structure Python directement (pour raw_content).
                     Si False, convertit en string (pour compatibilité avec l'ancien format texte).
        
        Returns:
            Structure Python (dict/list) si for_json=True, sinon string.
        """
        if for_json:
            # Mode JSON : retourner la structure telle quelle
            return value
        
        # Mode texte (compatibilité) : convertir en string
        if isinstance(value, dict):
            # Pour les dicts, essayer de trouver un résumé ou convertir en JSON
            if "Résumé" in value or "Résumé de la fiche" in value:
                return str(value.get("Résumé") or value.get("Résumé de la fiche", ""))
            # Sinon, convertir en JSON compact
            import json
            return json.dumps(value, ensure_ascii=False, indent=2)
        elif isinstance(value, list):
            # Pour les listes, joindre les éléments
            if not value:
                return "Aucun"
            if isinstance(value[0], dict):
                # Liste de dicts - extraire les noms si possible
                names = [item.get("Nom", item.get("Titre", str(item))) for item in value]
                return ", ".join(names)
            else:
                return ", ".join(str(item) for item in value)
        else:
            return str(value)
    
    def _generate_label(
        self, 
        path: str, 
        field_labels_map: Optional[Dict[str, str]] = None,
        element_mode: Optional[str] = None
    ) -> str:
        """Génère un label lisible à partir d'un chemin.
        
        Args:
            path: Chemin du champ (ex: "Background.Histoire de l'Espèce")
            field_labels_map: Dictionnaire {field_path: label} depuis context_config.json (optionnel)
            element_mode: Mode de sélection ("full" ou "excerpt") pour adapter les labels (optionnel)
            
        Returns:
            Label formaté avec indication du mode si applicable.
        """
        # Si un label existe dans la config, l'utiliser
        if field_labels_map and path in field_labels_map:
            label = field_labels_map[path]
        else:
            # Sinon, générer le label depuis le chemin
            parts = path.split(".")
            last_part = parts[-1]
            
            # Remplacer les underscores et capitaliser
            label = last_part.replace("_", " ").replace("-", " ")
            label = " ".join(word.capitalize() for word in label.split())
        
        # Adapter le label selon le mode
        if element_mode == "full":
            # En mode full, remplacer "(extrait)" par "(complet)"
            if "(extrait)" in label:
                label = label.replace("(extrait)", "(complet)")
        elif element_mode == "excerpt":
            # En mode excerpt, s'assurer que "(extrait)" est présent
            if "(extrait)" not in label and "(complet)" not in label:
                label = f"{label} (extrait)"
        
        return label
    
    def _categorize_field(self, path: str, element_type: str) -> Optional[str]:
        """Catégorise un champ selon son chemin."""
        path_lower = path.lower()
        
        # Vérifier les catégories spécifiques en premier (priorité)
        if any(kw in path_lower for kw in ["dialogue", "registre", "lexical", "expression", "voix", "langage"]):
            return "voice"
        
        if any(kw in path_lower for kw in ["désir", "faiblesse", "compulsion", "qualité", "défaut"]):
            return "characterization"
        
        if any(kw in path_lower for kw in ["background", "histoire", "contexte", "relation", "évènement", "centre"]):
            return "background"
        
        if any(kw in path_lower for kw in ["pouvoir", "héritage", "compétence", "stat", "attribut", "trait"]):
            return "mechanics"
        
        # Catégories basées sur les mots-clés génériques (en dernier)
        if any(kw in path_lower for kw in ["nom", "alias", "occupation", "type", "rôle", "catégorie"]):
            return "identity"
        
        return None
    
    def organize_context_json(
        self,
        element_data: Dict,
        element_type: str,
        fields_to_include: List[str],
        organization_mode: str = "default",
        field_labels_map: Optional[Dict[str, str]] = None,
        element_mode: Optional[str] = None
    ) -> Optional['ContextItem']:
        """Organise les champs d'un élément selon le mode d'organisation et retourne une structure JSON.
        
        Args:
            element_data: Données complètes de l'élément
            element_type: Type d'élément ("character", "location", etc.)
            fields_to_include: Liste des chemins de champs à inclure
            organization_mode: Mode d'organisation ("default", "narrative", "minimal")
            field_labels_map: Dictionnaire {field_path: label} depuis context_config.json (optionnel)
            element_mode: Mode de sélection ("full" ou "excerpt") pour adapter les labels (optionnel)
            
        Returns:
            ContextItem structuré avec sections, ou None si les modèles ne sont pas disponibles.
        """
        if ContextItem is None or ItemSection is None:
            logger.warning("Modèles de structure JSON non disponibles, impossible de créer ContextItem")
            return None
        
        # Dédupliquer les champs AVANT l'organisation
        if self.deduplicator and fields_to_include:
            deduplicated_fields = self.deduplicator.deduplicate_fields(fields_to_include, element_data)
            if len(deduplicated_fields) < len(fields_to_include):
                logger.info(
                    f"[{element_type}] Déduplication: {len(fields_to_include)} -> {len(deduplicated_fields)} champs"
                )
            fields_to_include = deduplicated_fields
        
        # Valider les champs
        validated_fields = []
        for field_path in fields_to_include:
            value = self._extract_field_value(element_data, field_path)
            if value is not None:
                validated_fields.append(field_path)
        
        if not validated_fields:
            return None
        
        # Organiser selon le mode
        if organization_mode == "narrative":
            sections = self._organize_narrative_json(
                element_data, element_type, validated_fields, field_labels_map, element_mode
            )
        elif organization_mode == "minimal":
            sections = self._organize_minimal_json(
                element_data, element_type, validated_fields, field_labels_map, element_mode
            )
        else:  # default
            sections = self._organize_default_json(
                element_data, element_type, validated_fields, field_labels_map, element_mode
            )
        
        # Calculer le token count total
        total_token_count = sum(section.tokenCount or 0 for section in sections)
        
        # Extraire le nom de l'élément pour les métadonnées
        element_name = element_data.get("Nom", "Unknown")
        
        return ContextItem(
            id="",  # Sera défini par le caller
            name="",  # Sera défini par le caller
            sections=sections,
            tokenCount=total_token_count,
            metadata={"element_name": element_name}
        )
    
    def _organize_default_json(
        self,
        element_data: Dict,
        element_type: str,
        fields_to_include: List[str],
        field_labels_map: Optional[Dict[str, str]] = None,
        element_mode: Optional[str] = None
    ) -> List['ItemSection']:
        """Organisation par défaut : ordre linéaire des champs en JSON.
        
        Retourne directement le contenu sans wrapper "INFORMATIONS" pour éviter un niveau inutile.
        Le contenu sera affiché directement dans l'item parent.
        """
        sections = []
        section_content = {}
        
        for field_path in fields_to_include:
            value = self._extract_field_value(element_data, field_path)
            if value is None:
                continue
            
            label = self._generate_label(field_path, field_labels_map, element_mode)
            # Stocker la structure Python directement
            section_content[label] = value
        
        if section_content:
            # Retourner avec raw_content (structure Python) au lieu de content (texte)
            sections.append(ItemSection(
                title="",  # Titre vide pour indiquer que c'est le contenu direct
                content="",  # Vide pour compatibilité
                raw_content=section_content,
                tokenCount=self._estimate_tokens(str(section_content))
            ))
        
        return sections
    
    def _organize_narrative_json(
        self,
        element_data: Dict,
        element_type: str,
        fields_to_include: List[str],
        field_labels_map: Optional[Dict[str, str]] = None,
        element_mode: Optional[str] = None
    ) -> List['ItemSection']:
        """Organisation narrative : groupement par sections logiques en JSON."""
        sections = []
        
        # Grouper les champs par catégorie
        fields_by_category = defaultdict(list)
        for field_path in fields_to_include:
            category = self._categorize_field(field_path, element_type)
            fields_by_category[category or "other"].append(field_path)
        
        # Construire les sections dans l'ordre défini
        for section_key in self.NARRATIVE_SECTIONS:
            if section_key in fields_by_category:
                section_label = self.SECTION_LABELS.get(section_key, section_key.upper())
                section_fields = fields_by_category[section_key]
                
                # Collecter les valeurs structurées
                section_content = {}
                for field_path in section_fields:
                    value = self._extract_field_value(element_data, field_path)
                    if value is None:
                        continue
                    
                    label = self._generate_label(field_path, field_labels_map, element_mode)
                    # Stocker la structure Python directement, pas de conversion en texte
                    section_content[label] = value
                
                if section_content:
                    # Créer une section avec raw_content (structure Python) au lieu de content (texte)
                    sections.append(ItemSection(
                        title=section_label,
                        content="",  # Vide pour compatibilité, raw_content sera utilisé en priorité
                        raw_content=section_content,
                        tokenCount=self._estimate_tokens(str(section_content))
                    ))
        
        # Ajouter les champs non catégorisés
        if "other" in fields_by_category:
            other_fields = fields_by_category["other"]
            if other_fields:
                section_content = {}
                for field_path in other_fields:
                    value = self._extract_field_value(element_data, field_path)
                    if value is None:
                        continue
                    
                    label = self._generate_label(field_path, field_labels_map, element_mode)
                    section_content[label] = value
                
                if section_content:
                    sections.append(ItemSection(
                        title="AUTRES INFORMATIONS",
                        content="",
                        raw_content=section_content,
                        tokenCount=self._estimate_tokens(str(section_content))
                    ))
        
        return sections
    
    def _organize_minimal_json(
        self,
        element_data: Dict,
        element_type: str,
        fields_to_include: List[str],
        field_labels_map: Optional[Dict[str, str]] = None,
        element_mode: Optional[str] = None
    ) -> List['ItemSection']:
        """Organisation minimale : seulement les champs essentiels en JSON."""
        # Filtrer pour ne garder que les champs essentiels
        essential_fields = self.ESSENTIAL_CONTEXT_FIELDS.get(element_type, [])
        
        minimal_fields = [
            f for f in fields_to_include 
            if f in essential_fields or any(essential in f for essential in essential_fields)
        ]
        
        if not minimal_fields:
            minimal_fields = fields_to_include[:5]  # Limiter à 5 champs
        
        return self._organize_default_json(element_data, element_type, minimal_fields, field_labels_map, element_mode)
    
    def _estimate_tokens(self, text: str) -> int:
        """Estime le nombre de tokens dans un texte."""
        # Estimation simple : ~4 caractères par token
        # Pour une estimation plus précise, il faudrait utiliser tiktoken
        return len(text) // 4

