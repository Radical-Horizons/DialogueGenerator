"""Autorité unique pour l'accès et les mutations des documents dialogue."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
import threading
from typing import Mapping
from uuid import uuid4

from services.repositories.sqlite.dialogue_shares_repository import (
    DialogueSharesRepository,
)
from services.repositories.sqlite.dialogues_index_repository import (
    DialogueIndexEntry,
    DialoguesIndexRepository,
)

logger = logging.getLogger(__name__)


class DialogueAccessDeniedError(PermissionError):
    """Signale qu'un utilisateur ne possède pas le dialogue demandé."""


class DialogueNotFoundError(FileNotFoundError):
    """Signale l'absence d'un document ou d'un layout."""


@dataclass(frozen=True)
class DialogueRevisionConflictError(Exception):
    """Porte l'état serveur lors d'un conflit de révision."""

    payload: dict[str, object]
    revision: int


@dataclass(frozen=True)
class DialogueCapabilities:
    """Capacités calculées par l'autorité d'accès."""

    can_read: bool
    can_edit: bool
    can_delete: bool
    is_owner: bool


@dataclass(frozen=True)
class PersistedDocument:
    """Document canonique lu avec révision et capacités."""

    document: dict[str, object]
    revision: int
    was_legacy_list: bool
    capabilities: DialogueCapabilities


@dataclass(frozen=True)
class PersistedLayout:
    """Layout lu avec sa révision."""

    layout: dict[str, object]
    revision: int


class DocumentPersistenceService:
    """Centralise RBAC, révisions, fichiers et index SQLite."""

    def __init__(
        self,
        repository: DialoguesIndexRepository,
        shares_repository: DialogueSharesRepository | None = None,
    ) -> None:
        """Initialise le service avec l'index et les partages injectés."""
        self._repository = repository
        self._shares_repository = shares_repository
        self._lock = threading.RLock()

    @staticmethod
    def _actor_id(current_user: Mapping[str, object]) -> str:
        """Retourne l'identifiant stable de l'acteur."""
        actor_id = str(current_user.get("id") or "").strip()
        if not actor_id:
            raise DialogueAccessDeniedError("Utilisateur sans identifiant stable")
        return actor_id

    @staticmethod
    def _is_admin(current_user: Mapping[str, object]) -> bool:
        """Indique si l'acteur est un administrateur actif."""
        return (
            current_user.get("role") == "admin"
            and current_user.get("is_active") is True
        )

    @staticmethod
    def _is_guest(current_user: Mapping[str, object]) -> bool:
        """Indique si l'acteur est une session invité JWT (hors table users)."""
        return current_user.get("role") == "guest"

    @staticmethod
    def _normalized_path(path: Path | str) -> str:
        """Normalise un chemin pour une comparaison fiable sous Windows."""
        return os.path.normcase(str(Path(path).resolve()))

    def _referenced_actor_id(
        self,
        current_user: Mapping[str, object],
    ) -> str | None:
        """Retourne un acteur référençable, avec bypass admin local nullable."""
        actor_id = self._actor_id(current_user)
        if self._repository.user_exists(actor_id):
            return actor_id
        if self._is_admin(current_user):
            return None
        raise DialogueAccessDeniedError("Utilisateur absent du référentiel SQLite")

    def capabilities(
        self,
        document_id: str,
        current_user: Mapping[str, object],
        document_path: Path | None = None,
    ) -> DialogueCapabilities:
        """Calcule les capacités owner/admin/guest/co-éditeur sans divulguer le propriétaire."""
        if self._is_guest(current_user):
            return DialogueCapabilities(
                can_read=True,
                can_edit=False,
                can_delete=False,
                is_owner=False,
            )
        actor_id = self._actor_id(current_user)
        entry = self._repository.find_by_document_id(document_id)
        path_matches = (
            entry is None
            or document_path is None
            or self._normalized_path(entry.storage_path)
            == self._normalized_path(document_path)
        )
        is_owner = (
            path_matches
            and entry is not None
            and entry.owner_id == actor_id
        )
        if path_matches and (self._is_admin(current_user) or is_owner):
            return DialogueCapabilities(
                can_read=True,
                can_edit=True,
                can_delete=True,
                is_owner=is_owner,
            )
        is_shared_writer = (
            path_matches
            and entry is not None
            and self._shares_repository is not None
            and self._shares_repository.has_writer_share(document_id, actor_id)
        )
        if is_shared_writer:
            return DialogueCapabilities(
                can_read=True,
                can_edit=True,
                can_delete=False,
                is_owner=False,
            )
        return DialogueCapabilities(
            can_read=False,
            can_edit=False,
            can_delete=False,
            is_owner=False,
        )

    def require_access(
        self,
        document_id: str,
        current_user: Mapping[str, object],
        document_path: Path | None = None,
    ) -> DialogueCapabilities:
        """Autorise la lecture pour le propriétaire, un admin ou un invité."""
        capabilities = self.capabilities(document_id, current_user, document_path)
        if not capabilities.can_read:
            raise DialogueAccessDeniedError(
                f"Accès refusé au dialogue {document_id}"
            )
        return capabilities

    def require_edit(
        self,
        document_id: str,
        current_user: Mapping[str, object],
        document_path: Path | None = None,
    ) -> DialogueCapabilities:
        """Autorise une mutation d'édition (owner/admin/co-éditeur writer)."""
        capabilities = self.require_access(document_id, current_user, document_path)
        if not capabilities.can_edit:
            raise DialogueAccessDeniedError(
                f"Écriture refusée pour le dialogue {document_id}"
            )
        return capabilities

    def require_delete(
        self,
        document_id: str,
        current_user: Mapping[str, object],
        document_path: Path | None = None,
    ) -> DialogueCapabilities:
        """Autorise uniquement la suppression (owner/admin, pas co-éditeur)."""
        capabilities = self.require_access(document_id, current_user, document_path)
        if not capabilities.can_delete:
            raise DialogueAccessDeniedError(
                f"Suppression refusée pour le dialogue {document_id}"
            )
        return capabilities

    def can_list(
        self,
        document_id: str,
        current_user: Mapping[str, object],
        document_path: Path,
    ) -> bool:
        """Indique si le dialogue peut apparaître dans la bibliothèque."""
        return self.capabilities(
            document_id,
            current_user,
            document_path,
        ).can_read

    @staticmethod
    def _read_revision(path: Path) -> int:
        """Lit une révision sidecar, avec repli historique à 1."""
        if not path.exists():
            return 1
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            return int(payload.get("revision", 1))
        except (json.JSONDecodeError, OSError, TypeError, ValueError):
            return 1

    @staticmethod
    def _meta_bytes(revision: int) -> bytes:
        """Sérialise un sidecar de révision."""
        return json.dumps(
            {
                "revision": revision,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            ensure_ascii=False,
            indent=2,
        ).encode("utf-8")

    @staticmethod
    def _document_bytes(document: dict[str, object]) -> bytes:
        """Sérialise le document canonique en UTF-8."""
        return json.dumps(document, ensure_ascii=False, indent=2).encode("utf-8")

    @staticmethod
    def _replace_file(path: Path, content: bytes) -> None:
        """Remplace atomiquement un fichier sur Windows et POSIX."""
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
        try:
            temporary.write_bytes(content)
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)

    @staticmethod
    def _create_file(path: Path, content: bytes) -> None:
        """Crée un fichier sans écrasement, même en présence de concurrence."""
        path.parent.mkdir(parents=True, exist_ok=True)
        descriptor = os.open(
            path,
            os.O_CREAT | os.O_EXCL | os.O_WRONLY,
            0o666,
        )
        try:
            with os.fdopen(descriptor, "wb") as stream:
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
        except BaseException:
            path.unlink(missing_ok=True)
            raise

    @staticmethod
    def _snapshot(paths: list[Path]) -> dict[Path, bytes | None]:
        """Capture les fichiers avant mutation pour compensation."""
        return {path: path.read_bytes() if path.exists() else None for path in paths}

    def _restore(self, snapshot: dict[Path, bytes | None]) -> None:
        """Restaure exactement un snapshot de fichiers."""
        for path, content in snapshot.items():
            if content is None:
                path.unlink(missing_ok=True)
            else:
                self._replace_file(path, content)

    def read_document(
        self,
        base_dir: Path,
        document_id: str,
        current_user: Mapping[str, object],
    ) -> PersistedDocument:
        """Lit le document source de vérité après contrôle d'accès."""
        with self._lock:
            path = base_dir / f"{document_id}.json"
            capabilities = self.require_access(
                document_id,
                current_user,
                path,
            )
            if not path.exists():
                raise DialogueNotFoundError(document_id)
            raw = json.loads(path.read_text(encoding="utf-8"))
            was_legacy_list = isinstance(raw, list)
            document = (
                {"schemaVersion": "1.1.0", "nodes": raw}
                if was_legacy_list
                else raw
            )
            if not isinstance(document, dict):
                raise ValueError("Le document persisté doit être un objet ou une liste")
            return PersistedDocument(
                document=document,
                revision=self._read_revision(base_dir / f"{document_id}.meta"),
                was_legacy_list=was_legacy_list,
                capabilities=capabilities,
            )

    def write_document(
        self,
        base_dir: Path,
        document_id: str,
        document: dict[str, object],
        client_revision: int,
        current_user: Mapping[str, object],
        sequence: int | None = None,
        create_only: bool = False,
    ) -> int:
        """Écrit document, révision et séquence puis indexe après succès fichier."""
        with self._lock:
            document_path = base_dir / f"{document_id}.json"
            meta_path = base_dir / f"{document_id}.meta"
            sequence_path = base_dir / f"{document_id}.seq"
            existed = document_path.exists()
            entry = self._repository.find_by_document_id(document_id)
            if existed or entry is not None:
                self.require_edit(document_id, current_user, document_path)
                if create_only:
                    if existed:
                        current = self.read_document(
                            base_dir,
                            document_id,
                            current_user,
                        )
                        raise DialogueRevisionConflictError(
                            payload=current.document,
                            revision=current.revision,
                        )
                    raise DialogueRevisionConflictError(
                        payload={"schemaVersion": "1.1.0", "nodes": []},
                        revision=1,
                    )
                if entry is not None and not existed:
                    raise DialogueNotFoundError(document_id)
                current_revision = self._read_revision(meta_path)
                if client_revision != current_revision:
                    current = self.read_document(base_dir, document_id, current_user)
                    raise DialogueRevisionConflictError(
                        payload=current.document,
                        revision=current.revision,
                    )
                new_revision = current_revision + 1
            else:
                if self._is_guest(current_user):
                    raise DialogueAccessDeniedError(
                        f"Écriture refusée pour le dialogue {document_id}"
                    )
                if client_revision != 1:
                    raise DialogueRevisionConflictError(
                        payload={"schemaVersion": "1.1.0", "nodes": []},
                        revision=1,
                    )
                new_revision = 1

            snapshot_paths = [meta_path, sequence_path]
            if not create_only:
                snapshot_paths.insert(0, document_path)
            snapshot = self._snapshot(snapshot_paths)
            actor_id = self._referenced_actor_id(current_user)
            created_document = False
            try:
                if create_only:
                    try:
                        self._create_file(
                            document_path,
                            self._document_bytes(document),
                        )
                    except FileExistsError as exc:
                        self.require_edit(
                            document_id,
                            current_user,
                            document_path,
                        )
                        current = self.read_document(
                            base_dir,
                            document_id,
                            current_user,
                        )
                        raise DialogueRevisionConflictError(
                            payload=current.document,
                            revision=current.revision,
                        ) from exc
                    created_document = True
                else:
                    self._replace_file(document_path, self._document_bytes(document))
                self._replace_file(meta_path, self._meta_bytes(new_revision))
                if sequence is not None:
                    self._replace_file(sequence_path, f"{sequence}\n".encode("utf-8"))
                if entry is not None:
                    self._repository.update_after_write(document_id, actor_id)
                elif not existed:
                    self._repository.create(
                        document_id=document_id,
                        owner_id=actor_id,
                        storage_path=document_path,
                        last_modified_by=actor_id,
                    )
            except Exception:
                self._restore(snapshot)
                if created_document:
                    document_path.unlink(missing_ok=True)
                logger.exception(
                    "Compensation après échec de persistance du dialogue %s",
                    document_id,
                )
                raise
            return new_revision

    def read_layout(
        self,
        document_base_dir: Path,
        layout_base_dir: Path,
        document_id: str,
        current_user: Mapping[str, object],
    ) -> PersistedLayout:
        """Lit un layout après contrôle d'accès."""
        with self._lock:
            self.require_access(
                document_id,
                current_user,
                document_base_dir / f"{document_id}.json",
            )
            path = layout_base_dir / f"{document_id}.layout.json"
            if not path.exists():
                raise DialogueNotFoundError(document_id)
            layout = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(layout, dict):
                raise ValueError("Le layout persisté doit être un objet")
            return PersistedLayout(
                layout=layout,
                revision=self._read_revision(
                    layout_base_dir / f"{document_id}.layout.meta"
                ),
            )

    def write_layout(
        self,
        document_base_dir: Path,
        layout_base_dir: Path,
        document_id: str,
        layout: dict[str, object],
        client_revision: int,
        current_user: Mapping[str, object],
    ) -> int:
        """Écrit un layout révisionné et actualise l'index existant."""
        with self._lock:
            self.require_edit(
                document_id,
                current_user,
                document_base_dir / f"{document_id}.json",
            )
            if not (document_base_dir / f"{document_id}.json").exists():
                raise DialogueNotFoundError(document_id)
            layout_path = layout_base_dir / f"{document_id}.layout.json"
            meta_path = layout_base_dir / f"{document_id}.layout.meta"
            if layout_path.exists():
                current_revision = self._read_revision(meta_path)
                if client_revision != current_revision:
                    current = self.read_layout(
                        document_base_dir,
                        layout_base_dir,
                        document_id,
                        current_user,
                    )
                    raise DialogueRevisionConflictError(
                        payload=current.layout,
                        revision=current.revision,
                    )
                new_revision = current_revision + 1
            else:
                if client_revision != 1:
                    raise DialogueRevisionConflictError(payload={}, revision=1)
                new_revision = 1

            snapshot = self._snapshot([layout_path, meta_path])
            try:
                self._replace_file(layout_path, self._document_bytes(layout))
                self._replace_file(meta_path, self._meta_bytes(new_revision))
                self._repository.update_after_write(
                    document_id,
                    self._referenced_actor_id(current_user),
                )
            except Exception:
                self._restore(snapshot)
                logger.exception(
                    "Compensation après échec de persistance du layout %s",
                    document_id,
                )
                raise
            return new_revision

    def delete_document(
        self,
        document_base_dir: Path,
        layout_base_dir: Path | None,
        document_id: str,
        current_user: Mapping[str, object],
    ) -> None:
        """Supprime document, révisions, layout, séquence et index en compensation."""
        with self._lock:
            document_path = document_base_dir / f"{document_id}.json"
            self.require_delete(document_id, current_user, document_path)
            if not document_path.exists():
                raise DialogueNotFoundError(document_id)
            paths: list[Path] = [
                document_path,
                document_base_dir / f"{document_id}.meta",
                document_base_dir / f"{document_id}.seq",
            ]
            if layout_base_dir is not None:
                paths.extend(
                    [
                        layout_base_dir / f"{document_id}.layout.json",
                        layout_base_dir / f"{document_id}.layout.meta",
                    ]
                )
            snapshot = self._snapshot(paths)
            try:
                for path in paths:
                    path.unlink(missing_ok=True)
                self._repository.delete(document_id)
            except Exception:
                self._restore(snapshot)
                logger.exception(
                    "Compensation après échec de suppression du dialogue %s",
                    document_id,
                )
                raise
