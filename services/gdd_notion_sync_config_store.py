"""Persistance configuration sync GDD Notion (hors secret en réponse API)."""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from services.gdd_notion_sync_utils import normalize_notion_id

logger = logging.getLogger(__name__)

DEFAULT_SETTINGS: Dict[str, Any] = {
    "schema_version": 1,
    "sync_interval_minutes": 60,
    "auto_sync_enabled": False,
    "sources": [],
    "included_categories": [],
}


class GddNotionSyncConfigStore:
    """Stockage fichier JSON + token optionnel sur disque."""

    def __init__(
        self,
        settings_path: Path,
        token_path: Path,
    ) -> None:
        """Initialise les chemins de persistance.

        Args:
            settings_path: Fichier JSON des paramètres non secrets.
            token_path: Fichier texte une ligne (token Notion), optionnel si NOTION_API_KEY.
        """
        self._settings_path = settings_path
        self._token_path = token_path

    @property
    def settings_path(self) -> Path:
        return self._settings_path

    @property
    def token_path(self) -> Path:
        return self._token_path

    def ensure_dirs(self) -> None:
        """Crée les répertoires parents si besoin."""
        self._settings_path.parent.mkdir(parents=True, exist_ok=True)

    def load_settings(self) -> Dict[str, Any]:
        """Charge settings.json fusionné avec les défauts."""
        self.ensure_dirs()
        if not self._settings_path.exists():
            return dict(DEFAULT_SETTINGS)
        try:
            raw = json.loads(self._settings_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Config sync GDD illisible (%s): %s", self._settings_path, exc)
            return dict(DEFAULT_SETTINGS)
        if not isinstance(raw, dict):
            return dict(DEFAULT_SETTINGS)
        merged = dict(DEFAULT_SETTINGS)
        merged.update(raw)
        return merged

    def save_settings(self, data: Dict[str, Any]) -> None:
        """Écrit les paramètres (sans token)."""
        self.ensure_dirs()
        to_write = dict(DEFAULT_SETTINGS)
        to_write.update(data)
        self._settings_path.write_text(
            json.dumps(to_write, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def read_token(self) -> Optional[str]:
        """Lit le token depuis fichier dédié puis NOTION_API_KEY."""
        if self._token_path.exists():
            try:
                t = self._token_path.read_text(encoding="utf-8").strip()
                if t:
                    return t
            except OSError as exc:
                logger.warning("Lecture token sync GDD échouée: %s", exc)
        env = os.getenv("NOTION_API_KEY", "").strip()
        return env or None

    def write_token(self, token: str) -> None:
        """Persiste le token (fichier local restreint au déploiement)."""
        self.ensure_dirs()
        self._token_path.write_text(token.strip(), encoding="utf-8")

    def clear_token_file(self) -> None:
        """Supprime le fichier token (retomber sur env uniquement)."""
        try:
            if self._token_path.exists():
                self._token_path.unlink()
        except OSError as exc:
            logger.warning("Suppression token sync GDD échouée: %s", exc)

    def token_configured(self) -> bool:
        """True si un token fichier ou variable d'environnement est disponible."""
        return bool(self.read_token())

    def public_settings_view(self) -> Dict[str, Any]:
        """Vue sérialisable API (aucun secret)."""
        s = self.load_settings()
        return {
            "schema_version": s.get("schema_version", 1),
            "sync_interval_minutes": int(s.get("sync_interval_minutes") or 60),
            "auto_sync_enabled": bool(s.get("auto_sync_enabled")),
            "sources": list(s.get("sources") or []),
            "included_categories": list(s.get("included_categories") or []),
            "token_configured": self.token_configured(),
        }

    def validate_sources(self, sources: List[Dict[str, Any]]) -> None:
        """Valide la forme des sources (lève ValueError si invalide)."""
        for i, src in enumerate(sources):
            if not isinstance(src, dict):
                raise ValueError(f"sources[{i}] doit être un objet")
            if src.get("kind") not in ("database", "page"):
                raise ValueError(f"sources[{i}].kind doit être database ou page")
            if not str(src.get("category_file", "")).strip():
                raise ValueError(f"sources[{i}].category_file requis")
            raw_id = str(src.get("notion_id", "")).strip()
            if not raw_id:
                raise ValueError(f"sources[{i}].notion_id requis")
            try:
                src["notion_id"] = normalize_notion_id(raw_id)
            except ValueError as exc:
                raise ValueError(f"sources[{i}].notion_id: {exc}") from exc
