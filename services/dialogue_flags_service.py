"""Service métier liaisons flags ↔ document dialogue (Story 9.1)."""

from __future__ import annotations

from typing import Any, Dict, List, Tuple

from services.dialogue_flag_validation import (
    normalize_dialogue_flag_bindings,
    threshold_warnings_for_bindings,
)
from services.flag_catalog_service import FlagCatalogService


class DialogueFlagsService:
    """Valide et normalise le champ JSON ``dialogueFlags`` du document canonique."""

    def __init__(self, catalog: FlagCatalogService) -> None:
        """Initialise avec le catalogue CSV partagé Unity.

        Args:
            catalog: Service de lecture du fichier ``FlagCatalog.csv``.
        """
        self._catalog = catalog

    def definitions_by_id(self) -> Dict[str, Dict[str, Any]]:
        """Index des définitions enrichies par ``id``."""
        defs = self._catalog.load_definitions()
        return {str(d["id"]): d for d in defs}

    def normalize_and_warnings(self, dialogue_flags_raw: Any) -> Tuple[List[Dict[str, Any]], List[str]]:
        """Normalise les liaisons et calcule les alertes seuils GDD.

        Args:
            dialogue_flags_raw: Champ ``dialogueFlags`` brut (liste ou ``None``).

        Returns:
            Tuple (liste normalisée, messages d'alerte non bloquants).

        Raises:
            ValueError: si une liaison est invalide (le routeur convertit en 422).
        """
        idx = self.definitions_by_id()
        normalized = normalize_dialogue_flag_bindings(dialogue_flags_raw, idx)
        warnings = threshold_warnings_for_bindings(normalized, idx)
        return normalized, warnings
