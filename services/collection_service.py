"""Service métier pour les collections de dialogues (Story 8.5 / FR84)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Mapping
from uuid import uuid4

from services.repositories.sqlite.collections_repository import (
    CollectionEntry,
    CollectionsRepository,
)
from services.repositories.sqlite.dialogues_index_repository import (
    DialoguesIndexRepository,
)


class CollectionNotFoundError(LookupError):
    """Collection absente ou hors périmètre du demandeur."""


class CollectionDocumentNotFoundError(LookupError):
    """Un ``document_id`` n'existe pas dans ``dialogues_index``."""


@dataclass(frozen=True)
class CollectionView:
    """Vue API d'une collection avec ses membres."""

    id: str
    name: str
    description: str | None
    icon: str | None
    owner_id: str
    created_at: str
    updated_at: str
    dialogue_ids: list[str]


@dataclass(frozen=True)
class CollectionDeleteResult:
    """Résultat d'une suppression de collection."""

    id: str
    removed_dialogue_count: int


def _utc_now_iso() -> str:
    """Horodatage UTC ISO-8601."""
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _actor_id(current_user: Mapping[str, object]) -> str:
    """Extrait l'identifiant utilisateur courant."""
    user_id = current_user.get("id")
    if not isinstance(user_id, str) or not user_id:
        raise ValueError("Identifiant utilisateur manquant")
    return user_id


class CollectionService:
    """CRUD collections + membership, scopé au propriétaire."""

    def __init__(
        self,
        *,
        collections_repository: CollectionsRepository,
        dialogues_index_repository: DialoguesIndexRepository,
    ) -> None:
        """Injecte les repositories SQLite."""
        self._collections = collections_repository
        self._index = dialogues_index_repository

    def _to_view(self, entry: CollectionEntry) -> CollectionView:
        """Enrichit une entrée avec ses ``dialogue_ids``."""
        return CollectionView(
            id=entry.id,
            name=entry.name,
            description=entry.description,
            icon=entry.icon,
            owner_id=entry.owner_id,
            created_at=entry.created_at,
            updated_at=entry.updated_at,
            dialogue_ids=self._collections.list_document_ids(entry.id),
        )

    def _require_owned(
        self,
        collection_id: str,
        current_user: Mapping[str, object],
    ) -> CollectionEntry:
        """Charge une collection appartenant à l'acteur, sinon 404 métier."""
        entry = self._collections.get_by_id(collection_id)
        if entry is None or entry.owner_id != _actor_id(current_user):
            raise CollectionNotFoundError("Collection introuvable")
        return entry

    def create(
        self,
        current_user: Mapping[str, object],
        *,
        name: str,
        description: str | None = None,
        icon: str | None = None,
    ) -> CollectionView:
        """Crée une collection vide pour l'utilisateur courant."""
        now = _utc_now_iso()
        entry = self._collections.create(
            collection_id=str(uuid4()),
            name=name.strip(),
            description=description,
            icon=icon,
            owner_id=_actor_id(current_user),
            created_at=now,
            updated_at=now,
        )
        return self._to_view(entry)

    def list_for_user(self, current_user: Mapping[str, object]) -> list[CollectionView]:
        """Liste les collections du propriétaire courant."""
        entries = self._collections.list_for_owner(_actor_id(current_user))
        return [self._to_view(entry) for entry in entries]

    def get(
        self,
        collection_id: str,
        current_user: Mapping[str, object],
    ) -> CollectionView:
        """Retourne une collection possédée."""
        return self._to_view(self._require_owned(collection_id, current_user))

    def update(
        self,
        collection_id: str,
        current_user: Mapping[str, object],
        *,
        name: str | None = None,
        description: str | None = None,
        icon: str | None = None,
        clear_description: bool = False,
        clear_icon: bool = False,
    ) -> CollectionView:
        """Met à jour nom / description / icône d'une collection possédée."""
        entry = self._require_owned(collection_id, current_user)
        new_name = name.strip() if name is not None else entry.name
        if not new_name:
            raise ValueError("Le nom de collection est vide")
        new_description = (
            None if clear_description else (
                description if description is not None else entry.description
            )
        )
        new_icon = (
            None if clear_icon else (icon if icon is not None else entry.icon)
        )
        updated = self._collections.update(
            collection_id=collection_id,
            name=new_name,
            description=new_description,
            icon=new_icon,
            updated_at=_utc_now_iso(),
        )
        if updated is None:
            raise CollectionNotFoundError("Collection introuvable")
        return self._to_view(updated)

    def delete(
        self,
        collection_id: str,
        current_user: Mapping[str, object],
    ) -> CollectionDeleteResult:
        """Supprime une collection ; les dialogues restent intacts."""
        self._require_owned(collection_id, current_user)
        removed = self._collections.delete(collection_id)
        if removed < 0:
            raise CollectionNotFoundError("Collection introuvable")
        return CollectionDeleteResult(
            id=collection_id,
            removed_dialogue_count=removed,
        )

    def _ensure_documents_exist(self, document_ids: list[str]) -> None:
        """Vérifie que chaque document existe dans l'index."""
        for document_id in document_ids:
            if self._index.find_by_document_id(document_id) is None:
                raise CollectionDocumentNotFoundError(
                    f"Dialogue introuvable: {document_id}"
                )

    def add_dialogues(
        self,
        collection_id: str,
        current_user: Mapping[str, object],
        document_ids: list[str],
    ) -> CollectionView:
        """Ajoute des dialogues (idempotent) à une collection possédée."""
        self._require_owned(collection_id, current_user)
        unique_ids = list(dict.fromkeys(document_ids))
        self._ensure_documents_exist(unique_ids)
        self._collections.add_documents(collection_id, unique_ids)
        return self.get(collection_id, current_user)

    def remove_dialogues(
        self,
        collection_id: str,
        current_user: Mapping[str, object],
        document_ids: list[str],
    ) -> CollectionView:
        """Retire des dialogues d'une collection possédée."""
        self._require_owned(collection_id, current_user)
        unique_ids = list(dict.fromkeys(document_ids))
        self._collections.remove_documents(collection_id, unique_ids)
        return self.get(collection_id, current_user)
