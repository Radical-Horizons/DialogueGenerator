"""Agrégation des métadonnées éditoriales légères d'un dialogue."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from services.configuration_service import ConfigurationService
from services.llm_usage_service import LLMUsageService
from services.repositories.sqlite.dialogues_index_repository import (
    DialogueIndexEntry,
    DialoguesIndexRepository,
)
from services.repositories.sqlite.user_repository import UserRepository
from services.unity_dialogue_search_fields import count_nodes, extract_search_fields

logger = logging.getLogger(__name__)


class DialogueMetadataNotFoundError(LookupError):
    """Signale qu'aucune entrée indexée exploitable ne correspond au dialogue."""


@dataclass(frozen=True)
class DialogueMetadata:
    """Vue métier agrégée des métadonnées d'un dialogue."""

    document_id: str
    name: str
    storage_path: str
    owner_id: str | None
    owner_username: str | None
    last_modified_by: str | None
    last_modified_by_username: str | None
    created_at: str
    updated_at: str
    node_count: int
    total_cost_eur: float
    cost_per_node_eur: float


@dataclass(frozen=True)
class DialogueListingMetadata:
    """Champs FR86 ajoutés à un item du listing Unity."""

    total_cost_eur: float | None
    last_modified_by: str | None
    last_modified_by_username: str | None


class DialogueMetadataService:
    """Agrège index, document Unity, utilisateurs et coûts LLM."""

    def __init__(
        self,
        *,
        dialogues_index_repository: DialoguesIndexRepository,
        user_repository: UserRepository,
        llm_usage_service: LLMUsageService,
        config_service: ConfigurationService,
    ) -> None:
        """Injecte les repositories et le service de coûts existant."""
        self._index = dialogues_index_repository
        self._users = user_repository
        self._llm_usage = llm_usage_service
        self._config = config_service

    @staticmethod
    def _normalize_index_timestamp(value: str) -> str:
        """Normalise un timestamp SQLite/ISO en ISO-8601 UTC avec suffixe Z."""
        raw = value.strip()
        if not raw:
            return raw
        if raw.endswith("Z") or "+" in raw[10:]:
            return raw.replace(" ", "T") if " " in raw and "T" not in raw else raw
        try:
            parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            try:
                parsed = datetime.strptime(raw, "%Y-%m-%d %H:%M:%S").replace(
                    tzinfo=timezone.utc
                )
            except ValueError:
                return raw
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

    def _resolve_username(self, user_id: str | None) -> str | None:
        """Résout un identifiant utilisateur sans faire échouer l'agrégat."""
        if not user_id:
            return None
        try:
            user = self._users.find_by_id(user_id)
        except (OSError, RuntimeError) as exc:
            logger.warning(
                "Résolution username impossible pour %s: %s",
                user_id,
                exc,
            )
            return None
        return user["username"] if user is not None else None

    @staticmethod
    def _read_document(entry: DialogueIndexEntry) -> Any:
        """Lit le JSON Unity référencé par l'index."""
        path = Path(entry.storage_path)
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise DialogueMetadataNotFoundError(
                f"Document dialogue introuvable ou illisible: {entry.document_id}"
            ) from exc

    def _find_entry(self, document_id: str) -> DialogueIndexEntry | None:
        """Retourne l'index ou un repli fichier pour un dialogue historique."""
        entry = self._index.find_by_document_id(document_id)
        if entry is not None:
            return entry
        configured_path = self._config.get_unity_dialogues_path()
        if not configured_path:
            return None
        path = Path(configured_path) / f"{document_id}.json"
        try:
            stat = path.stat()
        except OSError:
            return None
        created_at = datetime.fromtimestamp(
            min(stat.st_ctime, stat.st_mtime),
            tz=timezone.utc,
        ).isoformat()
        updated_at = datetime.fromtimestamp(
            stat.st_mtime,
            tz=timezone.utc,
        ).isoformat()
        return DialogueIndexEntry(
            document_id=document_id,
            owner_id=None,
            storage_path=str(path.resolve()),
            last_modified_by=None,
            created_at=created_at,
            updated_at=updated_at,
        )

    def get_dialogue_metadata(self, document_id: str) -> DialogueMetadata:
        """Retourne les métadonnées complètes du dialogue indexé."""
        entry = self._find_entry(document_id)
        if entry is None:
            raise DialogueMetadataNotFoundError(
                f"Dialogue non indexé: {document_id}"
            )

        document = self._read_document(entry)
        fields = extract_search_fields(document)
        node_count = count_nodes(document) or 0
        costs = self._llm_usage.get_dialogue_costs(document_id)
        total_cost_eur = float(costs.get("total_cost_eur", 0.0) or 0.0)
        name = fields.title or Path(entry.storage_path).stem

        return DialogueMetadata(
            document_id=document_id,
            name=name,
            storage_path=entry.storage_path,
            owner_id=entry.owner_id,
            owner_username=self._resolve_username(entry.owner_id),
            last_modified_by=entry.last_modified_by,
            last_modified_by_username=self._resolve_username(
                entry.last_modified_by
            ),
            created_at=self._normalize_index_timestamp(entry.created_at),
            updated_at=self._normalize_index_timestamp(entry.updated_at),
            node_count=node_count,
            total_cost_eur=total_cost_eur,
            cost_per_node_eur=(
                round(total_cost_eur / node_count, 8)
                if node_count > 0
                else 0.0
            ),
        )

    def get_listing_metadata(
        self,
        document_ids: list[str],
    ) -> dict[str, DialogueListingMetadata]:
        """Construit l'enrichissement du listing avec un agrégat de coûts batch."""
        if not document_ids:
            return {}
        wanted = set(document_ids)
        cost_map: dict[str, float] = {}
        for item in self._llm_usage.get_all_dialogues_costs():
            dialogue_id = str(item.get("dialogue_id") or "")
            if dialogue_id in wanted:
                cost_map[dialogue_id] = float(
                    item.get("total_cost_eur", 0.0) or 0.0
                )
        username_cache: dict[str, str | None] = {}
        result: dict[str, DialogueListingMetadata] = {}

        for document_id in document_ids:
            entry = self._index.find_by_document_id(document_id)
            last_modified_by = entry.last_modified_by if entry is not None else None
            if last_modified_by and last_modified_by not in username_cache:
                username_cache[last_modified_by] = self._resolve_username(
                    last_modified_by
                )
            result[document_id] = DialogueListingMetadata(
                total_cost_eur=cost_map.get(document_id),
                last_modified_by=last_modified_by,
                last_modified_by_username=(
                    username_cache.get(last_modified_by)
                    if last_modified_by
                    else None
                ),
            )
        return result
