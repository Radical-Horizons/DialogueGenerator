"""Service pour gérer le vocabulaire Alteir avec filtrage par popularité."""
import logging
import re
from typing import List, Dict, Any, Optional
from pathlib import Path

from api.utils.notion_cache import get_notion_cache

logger = logging.getLogger(__name__)

# Ordre de popularité (du plus au moins populaire)
# Valeurs réelles depuis Notion : Mondialement, Régionalement, Localement, Communautaire, Occulte
POPULARITY_ORDER = {
    "Mondialement": 1,
    "Régionalement": 2,
    "Localement": 3,
    "Communautaire": 4,
    "Occulte": 5
}

DEFAULT_MIN_POPULARITY = "Régionalement"


class VocabularyService:
    """Service pour gérer le vocabulaire Alteir.
    
    Charge le vocabulaire depuis le cache Notion, filtre par niveau de popularité,
    et formate pour injection dans les prompts système.
    """
    
    def __init__(self, cache=None):
        """Initialise le service de vocabulaire.
        
        Args:
            cache: Instance de NotionCache. Si None, utilise le singleton.
        """
        # IMPORTANT: ne pas résoudre le singleton au __init__ pour faciliter les tests.
        # Certains tests patchent `get_notion_cache` après l'initialisation du container FastAPI.
        # En résolvant le cache au moment de l'usage, on évite un couplage à l'ordre d'initialisation.
        self.cache = cache
        logger.info("VocabularyService initialisé")
    
    def load_vocabulary(self, force_refresh: bool = False) -> List[Dict[str, Any]]:
        """Charge le vocabulaire depuis le cache.
        
        Args:
            force_refresh: Si True, force le rechargement (ignore le cache).
            
        Returns:
            Liste des termes avec leurs métadonnées.
        """
        if force_refresh:
            logger.info("Rechargement forcé du vocabulaire (cache ignoré)")
            return []
        
        cache = self.cache
        if cache is None:
            cache = get_notion_cache()

        vocabulary_data = cache.get("vocabulary")
        
        if vocabulary_data is None:
            logger.warning("Vocabulaire non trouvé dans le cache. Synchronisation nécessaire.")
            return []
        
        terms = vocabulary_data.get("terms", [])
        logger.info(f"Vocabulaire chargé: {len(terms)} termes")
        return terms
    
    def filter_by_popularity(
        self,
        terms: List[Dict[str, Any]],
        min_level: str = DEFAULT_MIN_POPULARITY
    ) -> List[Dict[str, Any]]:
        """Filtre les termes par niveau de popularité.
        
        Inclut le niveau sélectionné + tous les niveaux plus populaires.
        
        Args:
            terms: Liste des termes à filtrer.
            min_level: Niveau de popularité minimum ("Mondialement", "Régionalement", etc.).
                      Si "Localement" est sélectionné, inclut Mondialement + Régionalement + Localement.
        
        Returns:
            Liste des termes filtrés, triés par popularité puis alphabétiquement.
        """
        if not terms:
            return []
        
        # Vérifier que le niveau est valide
        if min_level not in POPULARITY_ORDER:
            logger.warning(f"Niveau de popularité invalide: {min_level}. Utilisation du défaut: {DEFAULT_MIN_POPULARITY}")
            min_level = DEFAULT_MIN_POPULARITY
        
        min_order = POPULARITY_ORDER[min_level]
        
        # Filtrer les termes
        filtered_terms = []
        for term in terms:
            popularity = term.get("popularité")
            if popularity in POPULARITY_ORDER and POPULARITY_ORDER[popularity] <= min_order:
                filtered_terms.append(term)
        
        # Trier par popularité (ordre croissant) puis alphabétiquement par terme
        filtered_terms.sort(
            key=lambda t: (
                POPULARITY_ORDER.get(t.get("popularité", "Occulte"), 99),
                t.get("term", "").lower()
            )
        )
        
        logger.info(
            f"Filtrage vocabulaire: {len(filtered_terms)}/{len(terms)} termes "
            f"(niveau minimum: {min_level})"
        )
        
        return filtered_terms
    
    def format_for_prompt(
        self,
        terms: List[Dict[str, Any]],
        max_terms: Optional[int] = None
    ) -> str:
        """Formate les termes pour injection dans le prompt système.
        
        Format: `[VOCABULAIRE ALTEIR] Terme: définition`
        
        Args:
            terms: Liste des termes à formater.
            max_terms: Nombre maximum de termes à inclure (None = tous).
        
        Returns:
            Texte formaté pour injection dans le prompt.
        """
        if not terms:
            return ""
        
        # Limiter le nombre de termes si nécessaire
        terms_to_format = terms[:max_terms] if max_terms else terms
        
        lines = ["[VOCABULAIRE ALTEIR]"]
        
        for term in terms_to_format:
            terme = term.get("term", "")
            definition = term.get("definition", "")
            
            if terme:
                if definition:
                    lines.append(f"{terme}: {definition}")
                else:
                    lines.append(f"{terme}: (définition non disponible)")
        
        formatted_text = "\n".join(lines)
        
        if max_terms and len(terms) > max_terms:
            formatted_text += f"\n\n(Note: {len(terms) - max_terms} autres termes non affichés)"
        
        logger.debug(f"Formatage vocabulaire: {len(terms_to_format)} termes formatés")
        return formatted_text
    
    def get_terms_by_category(
        self,
        terms: List[Dict[str, Any]],
        category: str
    ) -> List[Dict[str, Any]]:
        """Filtre les termes par catégorie.
        
        Args:
            terms: Liste des termes à filtrer.
            category: Catégorie à filtrer (ex: "Magie", "Technologie").
        
        Returns:
            Liste des termes de la catégorie spécifiée.
        """
        filtered = [
            term for term in terms
            if term.get("category") == category
        ]
        
        logger.debug(f"Filtrage par catégorie '{category}': {len(filtered)} termes")
        return filtered
    
    def get_statistics(self, terms: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Calcule des statistiques sur le vocabulaire.
        
        Args:
            terms: Liste des termes.
        
        Returns:
            Dictionnaire avec statistiques (nombre par popularité, par catégorie, etc.).
        """
        stats = {
            "total": len(terms),
            "by_popularité": {},
            "by_category": {},
            "by_type": {}
        }
        
        for term in terms:
            # Par popularité
            popularity = term.get("popularité", "Occulte")
            stats["by_popularité"][popularity] = stats["by_popularité"].get(popularity, 0) + 1
            
            # Par catégorie
            category = term.get("category", "Autre")
            stats["by_category"][category] = stats["by_category"].get(category, 0) + 1
            
            # Par type
            type_term = term.get("type", "")
            if type_term:
                stats["by_type"][type_term] = stats["by_type"].get(type_term, 0) + 1
        
        return stats
    
    def count_terms_by_popularity(
        self,
        terms: List[Dict[str, Any]],
        min_level: str = DEFAULT_MIN_POPULARITY
    ) -> int:
        """Compte le nombre de termes qui seront inclus pour un niveau de popularité donné.
        
        Args:
            terms: Liste complète des termes.
            min_level: Niveau de popularité minimum.
        
        Returns:
            Nombre de termes qui seront inclus.
        """
        filtered = self.filter_by_popularity(terms, min_level)
        return len(filtered)
    
    def filter_by_context_mentions(
        self,
        terms: List[Dict[str, Any]],
        context_text: str,
        level: str
    ) -> List[Dict[str, Any]]:
        """Filtre les termes d'un niveau spécifique qui sont mentionnés dans le contexte.
        
        Analyse le texte du contexte pour trouver les termes du vocabulaire qui y apparaissent.
        Recherche insensible à la casse et support des formes de base (sans accents si nécessaire).
        
        Args:
            terms: Liste complète des termes du vocabulaire.
            context_text: Texte du contexte à analyser (context_summary).
            level: Niveau de popularité à filtrer ("Mondialement", "Régionalement", etc.).
        
        Returns:
            Liste des termes du niveau spécifié qui sont mentionnés dans le contexte.
        """
        if not terms or not context_text:
            return []
        
        # Normaliser le texte du contexte (minuscules pour comparaison insensible à la casse)
        context_lower = context_text.lower()
        
        # Filtrer d'abord les termes du niveau spécifié
        level_terms = [
            term for term in terms
            if term.get("popularité", "") == level
        ]
        
        # Trouver les termes mentionnés dans le contexte
        mentioned_terms = []
        for term in level_terms:
            term_text = term.get("term", "")
            if not term_text:
                continue
            
            # Recherche simple : le terme apparaît-il dans le contexte ?
            # Recherche insensible à la casse
            term_lower = term_text.lower()
            
            # Recherche exacte du terme (mot entier)
            # Pattern pour trouver le terme comme mot entier (avec limites de mot)
            pattern = r'\b' + re.escape(term_lower) + r'\b'
            if re.search(pattern, context_lower):
                mentioned_terms.append(term)
                logger.debug(f"Terme trouvé dans le contexte: {term_text}")
        
        logger.info(
            f"Filtrage par mentions: {len(mentioned_terms)}/{len(level_terms)} termes du niveau '{level}' "
            f"trouvés dans le contexte"
        )
        
        return mentioned_terms
    
    def filter_by_config(
        self,
        terms: List[Dict[str, Any]],
        config: Dict[str, str],
        context_text: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Filtre les termes selon une configuration par niveau.
        
        Args:
            terms: Liste complète des termes du vocabulaire.
            config: Dictionnaire mappant chaque niveau à un mode ("all", "auto", "none").
                    Clés: "Mondialement", "Régionalement", "Localement", "Communautaire", "Occulte".
            context_text: Texte du contexte (requis si un niveau est en mode "auto").
        
        Returns:
            Liste des termes filtrés selon la configuration.
        """
        if not terms:
            return []
        
        all_levels = ["Mondialement", "Régionalement", "Localement", "Communautaire", "Occulte"]
        filtered_terms = []
        
        for level in all_levels:
            mode = config.get(level, "none")
            
            if mode == "none":
                continue
            elif mode == "all":
                # Inclure tous les termes de ce niveau spécifique
                exact_level_terms = [
                    term for term in terms
                    if term.get("popularité", "") == level
                ]
                filtered_terms.extend(exact_level_terms)
            elif mode == "auto":
                # Inclure uniquement les termes de ce niveau mentionnés dans le contexte
                if not context_text:
                    logger.warning(f"Mode 'auto' pour le niveau '{level}' mais aucun contexte fourni. Ignoré.")
                    continue
                auto_terms = self.filter_by_context_mentions(terms, context_text, level)
                filtered_terms.extend(auto_terms)
        
        # Supprimer les doublons (au cas où un terme apparaîtrait plusieurs fois)
        seen_terms = set()
        unique_terms = []
        for term in filtered_terms:
            term_key = term.get("term", "")
            if term_key and term_key not in seen_terms:
                seen_terms.add(term_key)
                unique_terms.append(term)
        
        # Trier par popularité puis alphabétiquement
        unique_terms.sort(
            key=lambda t: (
                POPULARITY_ORDER.get(t.get("popularité", "Occulte"), 99),
                t.get("term", "").lower()
            )
        )
        
        logger.info(
            f"Filtrage par configuration: {len(unique_terms)} termes sélectionnés"
        )
        
        return unique_terms

