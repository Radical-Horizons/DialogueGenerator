"""Résolution de noms GDD (alias, noms historiques, recherche floue)."""
from __future__ import annotations

import logging
import re
import unicodedata
from typing import Dict, List, Optional, Tuple

from services.edit_distance import levenshtein_bounded
from services.element_repository import ElementCategory, ElementRepository
from services.gdd_loader import GDDData

logger = logging.getLogger(__name__)

_LABEL_CANDIDATE = Tuple[str, str]  # (label affiché / alias, Nom canonique)


class GddNameResolver:
    """Résout un libellé preset vers le ``Nom`` canonique d'une fiche GDD."""

    def __init__(self, gdd_data: GDDData, repository: Optional[ElementRepository] = None) -> None:
        """Initialise le resolver.

        Args:
            gdd_data: Données GDD chargées.
            repository: Repository optionnel (sinon créé depuis ``gdd_data``).
        """
        self._gdd_data = gdd_data
        self._repository = repository or ElementRepository(gdd_data)
        self._label_cache: Dict[ElementCategory, List[_LABEL_CANDIDATE]] = {}

    @staticmethod
    def _normalize_label(text: str) -> str:
        """Normalise un libellé pour comparaison (casse, accents, apostrophes)."""
        if not text:
            return ""
        normalized = text.replace("\u2019", "'").replace("\u2018", "'")
        normalized = normalized.replace("\u201C", '"').replace("\u201D", '"')
        normalized = normalized.replace("\u00A0", " ")
        normalized = unicodedata.normalize("NFKD", normalized.lower().strip())
        normalized = "".join(c for c in normalized if not unicodedata.combining(c))
        normalized = re.sub(r"[^a-z0-9' ]+", " ", normalized)
        normalized = re.sub(r"\s+", " ", normalized).strip()
        return normalized

    def _category_labels(self, category: ElementCategory) -> List[_LABEL_CANDIDATE]:
        """Construit l'index label → Nom canonique (avec cache)."""
        if category in self._label_cache:
            return self._label_cache[category]

        labels: List[_LABEL_CANDIDATE] = []
        for element in self._repository.get_all(category):
            if not isinstance(element, dict):
                continue
            nom = element.get("Nom")
            if not nom:
                continue
            canonical = str(nom)
            labels.append((canonical, canonical))

            alias_raw = element.get("values", {}).get("Alias") if isinstance(element.get("values"), dict) else None
            if alias_raw:
                for part in str(alias_raw).split(","):
                    token = part.strip()
                    if not token:
                        continue
                    labels.append((token, canonical))
                    labels.append((f"{token} {canonical}".strip(), canonical))

        self._label_cache[category] = labels
        return labels

    def _fuzzy_match(self, search_name: str, labels: List[_LABEL_CANDIDATE]) -> Optional[str]:
        """Recherche floue sur les libellés indexés."""
        norm_search = self._normalize_label(search_name)
        if not norm_search:
            return None

        for label, canonical in labels:
            if self._normalize_label(label) == norm_search:
                return canonical

        for label, canonical in labels:
            norm_label = self._normalize_label(label)
            if len(norm_label) >= 5 and (norm_label in norm_search or norm_search in norm_label):
                return canonical

        search_tokens = set(norm_search.split())
        if search_tokens:
            for label, canonical in labels:
                label_tokens = set(self._normalize_label(label).split())
                if search_tokens <= label_tokens or label_tokens <= search_tokens:
                    return canonical

        max_dist = max(2, min(6, len(norm_search) // 4))
        best_canonical: Optional[str] = None
        best_distance = max_dist + 1
        seen_canonical: set[str] = set()
        for _label, canonical in labels:
            if canonical in seen_canonical:
                continue
            seen_canonical.add(canonical)
            norm_canonical = self._normalize_label(canonical)
            distance = levenshtein_bounded(norm_search, norm_canonical, max_dist)
            if distance < best_distance:
                best_distance = distance
                best_canonical = canonical
                if best_distance == 0:
                    break

        return best_canonical if best_distance <= max_dist else None

    def resolve(self, category: ElementCategory, search_name: str) -> Optional[str]:
        """Résout un nom vers le ``Nom`` canonique GDD.

        Ordre : correspondance exacte / alias (``ElementRepository``), puis fuzzy.

        Args:
            category: Catégorie GDD.
            search_name: Libellé issu d'un preset ou d'une sélection.

        Returns:
            ``Nom`` canonique si trouvé, sinon ``None``.
        """
        if not search_name or not str(search_name).strip():
            return None

        cleaned = str(search_name).strip()
        element = self._repository.get_by_name(category, cleaned)
        if isinstance(element, dict) and element.get("Nom"):
            return str(element["Nom"])

        fuzzy = self._fuzzy_match(cleaned, self._category_labels(category))
        if fuzzy and fuzzy != cleaned:
            logger.info(
                "Résolution fuzzy GDD %s: %r -> %r",
                category.value,
                cleaned,
                fuzzy,
            )
        return fuzzy

    def resolve_character(self, name: str) -> Optional[str]:
        """Résout un nom de personnage."""
        return self.resolve(ElementCategory.CHARACTERS, name)

    def resolve_location(self, name: str) -> Optional[str]:
        """Résout un nom de lieu."""
        return self.resolve(ElementCategory.LOCATIONS, name)
