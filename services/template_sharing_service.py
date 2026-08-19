"""Partage d'équipe des templates custom (pointeur live, Story 6.8)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Mapping, Optional, Tuple
from uuid import UUID

from api.schemas.template import TEMPLATE_NAME_MAX_LENGTH, Template
from api.utils.job_ownership import template_owner_key
from services.repositories.sqlite.template_shares_repository import (
    TemplateShareEntry,
    TemplateSharesRepository,
)
from services.repositories.sqlite.user_repository import UserRepository
from services.template_service import TemplateService

GUEST_OWNER_ID = "guest"


class TemplateShareNotFoundError(LookupError):
    """Template, share ou utilisateur cible introuvable."""


class TemplateShareForbiddenError(Exception):
    """Action refusée (pas owner/admin, ou hors visibilité)."""


class TemplateShareConflictError(ValueError):
    """Conflit métier (doublon)."""

    def __init__(self, message: str, *, code: str = "conflict") -> None:
        """Initialise le conflit avec un code stable pour le mapping HTTP."""
        super().__init__(message)
        self.code = code


class TemplateShareSelfShareError(TemplateShareConflictError):
    """Tentative de partage avec soi-même ou le propriétaire."""

    def __init__(self, message: str) -> None:
        """Marque le conflit comme auto-partage (HTTP 400)."""
        super().__init__(message, code="self_share")


class TemplateShareValidationError(ValueError):
    """Paramètre invalide (pré-built, id non UUID)."""


@dataclass(frozen=True)
class TemplateShareView:
    """Vue API d'un destinataire."""

    template_id: str
    user_id: str
    username: str
    created_at: str
    can_edit: bool = False


@dataclass(frozen=True)
class TemplateShareTarget:
    """Writer actif proposable comme destinataire."""

    id: str
    username: str


class TemplateSharingService:
    """ACL live : owner_id JSON + table template_shares."""

    def __init__(
        self,
        *,
        shares_repository: TemplateSharesRepository,
        user_repository: UserRepository,
    ) -> None:
        """Injecte les repositories SQLite (le TemplateService reste par requête)."""
        self._shares = shares_repository
        self._users = user_repository

    @staticmethod
    def _actor_id(current_user: Mapping[str, object]) -> str:
        """Identifiant owner (UUID writer, ``guest:{sid}`` pour un invité)."""
        return template_owner_key(current_user)

    @staticmethod
    def _is_admin(current_user: Mapping[str, object]) -> bool:
        """Admin actif."""
        return (
            current_user.get("role") == "admin"
            and current_user.get("is_active") is True
        )

    @staticmethod
    def _owner_id(template: Template) -> Optional[str]:
        """Owner persisté, ou None si legacy."""
        raw = (template.ownerId or "").strip()
        return raw or None

    def _username_for(self, user_id: str) -> str:
        """Résout un nom affiché (guest hors table users)."""
        if user_id == GUEST_OWNER_ID or user_id.startswith("guest:"):
            return GUEST_OWNER_ID
        record = self._users.find_by_id(user_id)
        if record is None:
            return user_id
        return str(record["username"])

    def relation(
        self,
        template: Template,
        current_user: Mapping[str, object],
        shared_ids: Optional[set[str]] = None,
    ) -> Optional[str]:
        """``legacy`` / ``owned`` / ``granted`` — ma relation au template, ou None si hors liste."""
        actor = self._actor_id(current_user)
        owner = self._owner_id(template)
        if owner is None:
            return "legacy"
        if owner == actor:
            return "owned"
        ids = shared_ids
        if ids is None:
            ids = self._shares.list_template_ids_for_user(actor) if actor else set()
        if template.id in ids:
            return "granted"
        # Le statut porté par le template : `shared` le rend visible de l'équipe
        # sans qu'un partage nominatif soit nécessaire. `private` = brouillon.
        if getattr(template, "visibility", "shared") == "shared":
            return "granted"
        return None

    def can_read(
        self,
        template: Template,
        current_user: Mapping[str, object],
        shared_ids: Optional[set[str]] = None,
    ) -> bool:
        """Lecture : visible en liste, ou admin."""
        if self._is_admin(current_user):
            return True
        return self.relation(template, current_user, shared_ids) is not None

    def can_write(self, template: Template, current_user: Mapping[str, object]) -> bool:
        """PUT : owner, admin, ou share ``can_edit``.

        Un template sans ``ownerId`` (legacy 6.1) reste lisible par tous
        (``relation: legacy``) mais n'est mutable que par un admin : personne
        ne peut revendiquer l'écriture sur un objet que nul ne possède.
        """
        if self._is_admin(current_user):
            return True
        owner = self._owner_id(template)
        if owner is None:
            return False
        actor = self._actor_id(current_user)
        if owner == actor:
            return True
        return bool(actor) and self._shares.has_edit_share(template.id, actor)

    def can_change_visibility(
        self, template: Template, current_user: Mapping[str, object]
    ) -> bool:
        """Statut privé/partagé : propriétaire ou admin uniquement.

        Plus strict que :meth:`can_write` : un destinataire avec droit d'édition
        peut modifier le contenu, pas décider qui voit le template.

        Args:
            template: Template visé.
            current_user: Principal auth.

        Returns:
            True si l'acteur peut changer le statut.
        """
        if self._is_admin(current_user):
            return True
        owner = self._owner_id(template)
        if owner is None:
            return False
        return owner == self._actor_id(current_user)

    def can_manage_shares(
        self, template: Template, current_user: Mapping[str, object]
    ) -> bool:
        """Partage : template owned (pas legacy) + owner ou admin."""
        owner = self._owner_id(template)
        if owner is None:
            return False
        if self._is_admin(current_user):
            return True
        return owner == self._actor_id(current_user)

    def annotate(
        self,
        template: Template,
        current_user: Mapping[str, object],
        shared_ids: Optional[set[str]] = None,
    ) -> Template:
        """Ajoute relation / usernames (non persistés)."""
        vis = self.relation(template, current_user, shared_ids)
        owner = self._owner_id(template)
        if vis is None:
            vis = "legacy" if owner is None else None
        owner_name = self._username_for(owner) if owner else None
        shared_by = owner_name if vis == "granted" else None
        return template.model_copy(
            update={
                "relation": vis,
                "ownerUsername": owner_name,
                "sharedByUsername": shared_by,
            }
        )

    def list_visible(
        self,
        templates: List[Template],
        current_user: Mapping[str, object],
    ) -> List[Template]:
        """Filtre la liste disque selon l'ACL."""
        actor = self._actor_id(current_user)
        shared_ids = self._shares.list_template_ids_for_user(actor) if actor else set()
        visible: List[Template] = []
        for template in templates:
            vis = self.relation(template, current_user, shared_ids)
            if vis is None:
                continue
            visible.append(self.annotate(template, current_user, shared_ids))
        return visible

    def require_readable(
        self,
        template: Template,
        current_user: Mapping[str, object],
    ) -> Template:
        """404 métier si hors visibilité (admin autorisé)."""
        if not self.can_read(template, current_user):
            raise TemplateShareNotFoundError(f"Template {template.id} introuvable")
        return self.annotate(template, current_user)

    def require_writable(
        self,
        template: Template,
        current_user: Mapping[str, object],
    ) -> Template:
        """403 si mutation interdite."""
        self.require_readable(template, current_user)
        if not self.can_write(template, current_user):
            raise TemplateShareForbiddenError(
                f"Modification refusée pour {template.id}"
            )
        return template

    def can_delete(self, template: Template, current_user: Mapping[str, object]) -> bool:
        """DELETE JSON : owner ou admin — pas un share ``can_edit``.

        Même règle que :meth:`can_write` pour un legacy sans ``ownerId`` :
        admin uniquement.
        """
        if self._is_admin(current_user):
            return True
        owner = self._owner_id(template)
        if owner is None:
            return False
        return owner == self._actor_id(current_user)

    def require_deletable(
        self, template: Template, current_user: Mapping[str, object]
    ) -> Template:
        """403 si suppression interdite."""
        self.require_readable(template, current_user)
        if not self.can_delete(template, current_user):
            raise TemplateShareForbiddenError(
                f"Suppression refusée pour {template.id}"
            )
        return template

    def _require_uuid(self, template_id: str) -> str:
        """Refuse un id non UUID (pré-built / slug)."""
        try:
            return str(UUID(template_id))
        except ValueError as exc:
            raise TemplateShareValidationError(
                "Les templates pré-built ne sont pas partageables"
            ) from exc

    def _load(
        self,
        template_service: TemplateService,
        template_id: str,
    ) -> Template:
        """Charge un custom UUID."""
        canonical = self._require_uuid(template_id)
        try:
            return template_service.get_template(canonical)
        except FileNotFoundError as exc:
            raise TemplateShareNotFoundError(str(exc)) from exc

    def list_shares(
        self,
        template_service: TemplateService,
        template_id: str,
        current_user: Mapping[str, object],
    ) -> List[TemplateShareView]:
        """Liste les destinataires (owner/admin)."""
        template = self._load(template_service, template_id)
        self._require_share_manager(template, current_user)
        return [self._to_view(entry) for entry in self._shares.list_for_template(template.id)]

    def list_share_targets(
        self, current_user: Mapping[str, object]
    ) -> List[TemplateShareTarget]:
        """Writers actifs hors soi-même (picker d'équipe)."""
        actor = self._actor_id(current_user)
        targets: List[TemplateShareTarget] = []
        for record in self._users.list_all():
            if not record["is_active"] or record["role"] != "writer":
                continue
            if record["id"] == actor:
                continue
            targets.append(
                TemplateShareTarget(id=record["id"], username=str(record["username"]))
            )
        return targets

    def grant_share(
        self,
        template_service: TemplateService,
        template_id: str,
        username: str,
        current_user: Mapping[str, object],
        can_edit: bool = False,
    ) -> TemplateShareView:
        """Invite un writer actif par username."""
        template = self._load(template_service, template_id)
        self._require_share_manager(template, current_user)
        target = self._users.find_by_username(username)
        if target is None or not target["is_active"] or target["role"] != "writer":
            raise TemplateShareNotFoundError(f"Utilisateur introuvable: {username}")
        actor = self._actor_id(current_user)
        owner = self._owner_id(template)
        if target["id"] == actor or (owner is not None and target["id"] == owner):
            raise TemplateShareSelfShareError(
                "Impossible de partager un template avec son propriétaire"
            )
        try:
            created = self._shares.create(
                template_id=template.id,
                user_id=target["id"],
                can_edit=can_edit,
            )
        except LookupError as exc:
            raise TemplateShareNotFoundError(str(exc)) from exc
        except ValueError as exc:
            raise TemplateShareConflictError(str(exc), code="duplicate") from exc
        return self._to_view(created)

    def revoke_share(
        self,
        template_service: TemplateService,
        template_id: str,
        user_id: str,
        current_user: Mapping[str, object],
    ) -> None:
        """Révoque un destinataire."""
        template = self._load(template_service, template_id)
        self._require_share_manager(template, current_user)
        if not self._shares.delete(template.id, user_id):
            raise TemplateShareNotFoundError(
                f"Partage introuvable: {template.id}/{user_id}"
            )

    def copy_template(
        self,
        template_service: TemplateService,
        template_id: str,
        current_user: Mapping[str, object],
    ) -> Tuple[Template, List[str]]:
        """Clone en custom owned par l'acteur (snapshot, plus de lien live)."""
        template = self.require_readable(
            self._load(template_service, template_id),
            current_user,
        )
        payload: Dict[str, Any] = {
            "name": self._copy_name(template.name),
            "description": template.description,
            "category": template.category,
            "icon": template.icon,
            "configuration": template.configuration.model_dump(mode="json"),
            "owner_id": self._actor_id(current_user) or None,
        }
        copied, warnings = template_service.create_template(payload)
        return self.annotate(copied, current_user), warnings

    def delete_shares_for_template(self, template_id: str) -> None:
        """Cascade applicative à la suppression du JSON."""
        self._shares.delete_for_template(template_id)

    def _require_share_manager(
        self,
        template: Template,
        current_user: Mapping[str, object],
    ) -> None:
        """Refuse le partage d'un legacy / pré-built et d'un non-owner."""
        if self._owner_id(template) is None:
            raise TemplateShareValidationError(
                "Les templates publics hérités ne sont pas partageables"
            )
        if not self.can_manage_shares(template, current_user):
            raise TemplateShareForbiddenError(
                f"Gestion des partages refusée pour {template.id}"
            )

    @staticmethod
    def _copy_name(name: str) -> str:
        """Suffixe `` (copie)`` sans dépasser ``TEMPLATE_NAME_MAX_LENGTH``."""
        suffix = " (copie)"
        if len(name) + len(suffix) <= TEMPLATE_NAME_MAX_LENGTH:
            return f"{name}{suffix}"
        trimmed = name[: TEMPLATE_NAME_MAX_LENGTH - len(suffix)].rstrip()
        return f"{trimmed}{suffix}"

    @staticmethod
    def _to_view(entry: TemplateShareEntry) -> TemplateShareView:
        """Normalise une entrée repository pour l'API."""
        return TemplateShareView(
            template_id=entry.template_id,
            user_id=entry.user_id,
            username=entry.username or entry.user_id,
            created_at=entry.created_at,
            can_edit=entry.can_edit,
        )
