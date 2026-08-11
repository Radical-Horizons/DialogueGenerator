"""Service d'indexation FTS des dialogues Unity (Story 8.6 / FR85)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import logging
import time
from pathlib import Path
from typing import Any, Mapping

from services.repositories.sqlite.dialogues_search_repository import (
    DialogueSearchStats,
    DialoguesSearchRepository,
)
from services.unity_dialogue_search_fields import extract_search_fields

logger = logging.getLogger(__name__)


class DialogueReindexConflictError(RuntimeError):
    """Un rebuild est déjà en cours."""


@dataclass(frozen=True)
class DialogueSearchHit:
    """Résultat minimal d'une recherche FTS."""

    document_id: str


@dataclass(frozen=True)
class DialogueSearchResult:
    """Réponse search avec chronométrage."""

    hits: list[DialogueSearchHit]
    elapsed_ms: float
    query: str


class DialogueIndexService:
    """Indexe, recherche et reconstruit l'index FTS des dialogues."""

    def __init__(self, search_repository: DialoguesSearchRepository) -> None:
        """Injecte le repository FTS."""
        self._search = search_repository

    def index_document(self, document_id: str, document: Any) -> None:
        """Upsert FTS pour un document Unity parsé."""
        fields = extract_search_fields(document)
        speakers_blob = " ".join(fields.speakers) if fields.speakers else ""
        # Inclure le stem pour retrouver aussi par fragment de filename (FR81).
        body_parts = [document_id.replace("-", " ").replace("_", " ")]
        if fields.search_text:
            body_parts.append(fields.search_text)
        body = " ".join(body_parts)
        self._search.upsert(
            document_id=document_id,
            title=fields.title or document_id,
            speakers=speakers_blob,
            body=body,
        )

    def remove_document(self, document_id: str) -> None:
        """Retire un document de l'index."""
        self._search.delete(document_id)

    def search(
        self,
        raw_query: str,
        *,
        limit: int = 500,
    ) -> DialogueSearchResult:
        """Exécute une recherche FTS et enregistre la durée."""
        match = DialoguesSearchRepository.build_fts_match_query(raw_query)
        if match is None:
            raise ValueError("Requête de recherche vide")
        started = time.perf_counter()
        document_ids = self._search.search(match, limit=limit)
        elapsed_ms = (time.perf_counter() - started) * 1000.0
        self._search.record_search_ms(elapsed_ms)
        return DialogueSearchResult(
            hits=[DialogueSearchHit(document_id=doc_id) for doc_id in document_ids],
            elapsed_ms=elapsed_ms,
            query=raw_query.strip(),
        )

    def get_stats(self) -> DialogueSearchStats:
        """Retourne les statistiques admin de l'index."""
        return self._search.get_stats()

    def begin_rebuild(self) -> None:
        """Passe atomiquement le statut à ``running`` ou lève un conflit."""
        if not self._search.try_begin_rebuild():
            raise DialogueReindexConflictError("Réindexation déjà en cours")

    def rebuild_from_directory(self, unity_dir: Path) -> int:
        """Reconstruit l'index en scannant le dossier Unity.

        Returns:
            Nombre de documents indexés avec succès.
        """
        self._search.clear_all()
        indexed = 0
        total_bytes = 0
        if not unity_dir.exists():
            now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
            self._search.finalize_rebuild(
                indexed_count=0,
                index_bytes=0,
                rebuilt_at=now,
            )
            return 0
        json_files = [
            path
            for path in unity_dir.glob("*.json")
            if not path.name.endswith(".layout.json")
            and not path.name.endswith(".json.json")
        ]
        for path in json_files:
            try:
                raw = path.read_text(encoding="utf-8")
                total_bytes += len(raw.encode("utf-8"))
                payload = json.loads(raw)
                self.index_document(path.stem, payload)
                indexed += 1
            except (OSError, json.JSONDecodeError, TypeError, ValueError) as exc:
                logger.warning(
                    "Skip réindexation %s: %s",
                    path.name,
                    exc,
                )
        now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        self._search.finalize_rebuild(
            indexed_count=indexed,
            index_bytes=total_bytes,
            rebuilt_at=now,
        )
        return indexed

    def fail_rebuild(self, message: str) -> None:
        """Marque le rebuild en erreur."""
        self._search.set_rebuild_status("error", error=message)

    def filter_accessible_hits(
        self,
        hits: list[DialogueSearchHit],
        *,
        current_user: Mapping[str, object],
        unity_dir: Path,
        can_list,
    ) -> list[DialogueSearchHit]:
        """Filtre les hits FTS selon le RBAC listing existant."""
        visible: list[DialogueSearchHit] = []
        for hit in hits:
            path = unity_dir / f"{hit.document_id}.json"
            try:
                if can_list(hit.document_id, current_user, path):
                    visible.append(hit)
            except Exception:
                logger.debug(
                    "Accès refusé/ignoré pour hit search %s",
                    hit.document_id,
                    exc_info=True,
                )
        return visible
