"""Service de persistance des règles anti-context-dropping (Story 4.10).

Responsabilités :
- Lecture/écriture du fichier ``data/validation-rules/context-dropping.json`` (UTF-8).
- Séparation stricte : validation Pydantic pure / I/O fichier Path.
- Thread-safe via ``threading.Lock``.
"""
from __future__ import annotations

import json
import logging
import threading
from pathlib import Path
from typing import Any, Dict

from api.schemas.validation_rules import ContextDroppingRulesSchema
from services.context_dropping_constants import DEFAULT_RULES_PROFILE

logger = logging.getLogger(__name__)

# Alias public utilisé dans les tests et le container.
ContextDroppingRulesData = ContextDroppingRulesSchema

DEFAULT_RULES: ContextDroppingRulesData = ContextDroppingRulesData(
    rules_profile=DEFAULT_RULES_PROFILE,
    tolerance=None,
    mandatory_info=[],
    dialogue_type_overrides={},
    schema_version="1.0",
)


class ContextDroppingRulesService:
    """Gère la persistance des règles de validation anti-context-dropping.

    Args:
        storage_file: Chemin vers le fichier JSON de persistance.
    """

    def __init__(self, storage_file: Path) -> None:
        self._storage_file = storage_file
        self._lock = threading.Lock()
        storage_file.parent.mkdir(parents=True, exist_ok=True)
        logger.debug("ContextDroppingRulesService initialisé avec %s", storage_file)

    # ── Lecture ──────────────────────────────────────────────────────────────

    def get_rules(self) -> ContextDroppingRulesData:
        """Retourne les règles persistées, ou les défauts si le fichier est absent.

        Returns:
            Instance ``ContextDroppingRulesData`` — jamais ``None``.

        Raises:
            ValueError: Si le fichier existe mais contient un JSON invalide.
        """
        with self._lock:
            return self._read_rules()

    def _read_rules(self) -> ContextDroppingRulesData:
        if not self._storage_file.exists():
            logger.debug("Fichier règles absent — retour des défauts documentés.")
            return DEFAULT_RULES.model_copy(deep=True)

        raw = self._storage_file.read_text(encoding="utf-8")
        try:
            data: Dict[str, Any] = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ValueError(
                f"JSON invalide dans {self._storage_file}: {exc}"
            ) from exc

        return ContextDroppingRulesData.model_validate(data)

    # ── Écriture ─────────────────────────────────────────────────────────────

    def save_rules(self, rules: ContextDroppingRulesData) -> ContextDroppingRulesData:
        """Persiste les règles dans le fichier JSON.

        Args:
            rules: Données validées à écrire.

        Returns:
            Les règles telles qu'elles ont été sauvegardées.
        """
        # Validation Pydantic pure (séparée de l'I/O) — re-valide pour détecter
        # toute incohérence introduite avant l'appel.
        validated = ContextDroppingRulesData.model_validate(rules.model_dump())
        payload = validated.model_dump(mode="json")

        with self._lock:
            self._write_file(payload)

        logger.info("Règles anti-context-dropping sauvegardées dans %s", self._storage_file)
        return validated

    def _write_file(self, payload: Dict[str, Any]) -> None:
        """I/O atomique : écriture UTF-8 dans le fichier de stockage."""
        self._storage_file.parent.mkdir(parents=True, exist_ok=True)
        self._storage_file.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
