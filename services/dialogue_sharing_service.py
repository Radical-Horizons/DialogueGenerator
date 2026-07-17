"""Service métier pour le partage co-édition des dialogues entre writers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping

from services.document_persistence_service import (
    DialogueAccessDeniedError,
    DocumentPersistenceService,
)
from services.repositories.sqlite.dialogue_shares_repository import (
    DialogueShareEntry,
    DialogueSharesRepository,
)
from services.repositories.sqlite.dialogues_index_repository import (
    DialoguesIndexRepository,
)
from services.repositories.sqlite.user_repository import UserRepository


class DialogueShareNotFoundError(LookupError):
    """Signale l'absence d'un partage ou d'un utilisateur cible."""


class DialogueShareConflictError(ValueError):
    """Signale un conflit métier sur un partage (doublon, auto-partage)."""

    def __init__(self, message: str, *, code: str = "conflict") -> None:
        """Initialise le conflit avec un code stable pour le mapping HTTP."""
        super().__init__(message)
        self.code = code


class DialogueShareSelfShareError(DialogueShareConflictError):
    """Signale une tentative de partage avec le propriétaire."""

    def __init__(self, message: str) -> None:
        """Marque le conflit comme auto-partage (HTTP 400)."""
        super().__init__(message, code="self_share")


@dataclass(frozen=True)
class DialogueShareView:
    """Vue API d'un partage co-édition."""

    document_id: str
    user_id: str
    username: str
    permission: str
    created_at: str


class DialogueSharingService:
    """Gère grant/revoke/list des partages writer, réservé owner/admin."""

    def __init__(
        self,
        *,
        shares_repository: DialogueSharesRepository,
        dialogues_index_repository: DialoguesIndexRepository,
        user_repository: UserRepository,
        persistence_service: DocumentPersistenceService,
    ) -> None:
        """Injecte les dépendances SQLite et l'autorité d'accès."""
        self._shares = shares_repository
        self._index = dialogues_index_repository
        self._users = user_repository
        self._persistence = persistence_service

    def _require_share_manager(
        self,
        document_id: str,
        current_user: Mapping[str, object],
    ) -> None:
        """Autorise uniquement le propriétaire ou un administrateur."""
        if current_user.get("role") == "guest":
            raise DialogueAccessDeniedError(
                f"Gestion des partages refusée pour {document_id}"
            )
        capabilities = self._persistence.capabilities(document_id, current_user)
        is_admin = (
            current_user.get("role") == "admin"
            and current_user.get("is_active") is True
        )
        if not (capabilities.is_owner or is_admin):
            raise DialogueAccessDeniedError(
                f"Gestion des partages refusée pour {document_id}"
            )
        entry = self._index.find_by_document_id(document_id)
        if entry is None:
            raise DialogueShareNotFoundError(
                f"Dialogue non indexé: {document_id}"
            )

    @staticmethod
    def _to_view(entry: DialogueShareEntry) -> DialogueShareView:
        """Normalise une entrée repository pour l'API."""
        return DialogueShareView(
            document_id=entry.document_id,
            user_id=entry.user_id,
            username=entry.username or entry.user_id,
            permission=entry.permission,
            created_at=entry.created_at,
        )

    def list_shares(
        self,
        document_id: str,
        current_user: Mapping[str, object],
    ) -> list[DialogueShareView]:
        """Liste les co-éditeurs d'un dialogue pour owner/admin."""
        self._require_share_manager(document_id, current_user)
        return [self._to_view(entry) for entry in self._shares.list_for_document(document_id)]

    def grant_share(
        self,
        document_id: str,
        username: str,
        current_user: Mapping[str, object],
    ) -> DialogueShareView:
        """Invite un writer actif par username à co-éditer le dialogue."""
        self._require_share_manager(document_id, current_user)
        target = self._users.find_by_username(username)
        if target is None:
            raise DialogueShareNotFoundError(
                f"Utilisateur introuvable: {username}"
            )
        if not target["is_active"] or target["role"] != "writer":
            raise DialogueShareNotFoundError(
                f"Utilisateur introuvable: {username}"
            )

        entry = self._index.find_by_document_id(document_id)
        if entry is None:
            raise DialogueShareNotFoundError(
                f"Dialogue non indexé: {document_id}"
            )
        actor_id = str(current_user.get("id") or "").strip()
        if target["id"] == actor_id or (
            entry.owner_id is not None and target["id"] == entry.owner_id
        ):
            raise DialogueShareSelfShareError(
                "Impossible de partager un dialogue avec son propriétaire"
            )

        try:
            created = self._shares.create(
                document_id=document_id,
                user_id=target["id"],
                permission="writer",
            )
        except LookupError as exc:
            raise DialogueShareNotFoundError(str(exc)) from exc
        except ValueError as exc:
            raise DialogueShareConflictError(str(exc), code="duplicate") from exc
        return self._to_view(created)

    def revoke_share(
        self,
        document_id: str,
        user_id: str,
        current_user: Mapping[str, object],
    ) -> None:
        """Révoque le partage d'un co-éditeur."""
        self._require_share_manager(document_id, current_user)
        if not self._shares.delete(document_id, user_id):
            raise DialogueShareNotFoundError(
                f"Partage introuvable: {document_id}/{user_id}"
            )
