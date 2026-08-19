"""Accès aux templates custom : propriété + statut de visibilité.

Remplace `TemplateSharingService`. Le partage nominatif et le marketplace ont été
retirés : la visibilité d'un template tient désormais à deux choses seulement — qui
le possède (`ownerId`) et ce qu'il déclare (`visibility: shared | private`).

`shared` veut dire visible de l'équipe, `private` est un brouillon. Il n'y a plus de
table d'ACL : la règle est dans le fichier du template.
"""

from __future__ import annotations

from typing import List, Mapping, Optional
from uuid import UUID

from api.schemas.template import Template
from api.utils.job_ownership import template_owner_key
from services.template_service import TemplateService


class TemplateAccessNotFoundError(LookupError):
    """Template absent, ou hors de la visibilité de l'acteur (404 métier)."""


class TemplateAccessForbiddenError(Exception):
    """Mutation refusée (403)."""


class TemplateAccessValidationError(ValueError):
    """Identifiant invalide (pré-built, slug non UUID)."""


class TemplateAccessService:
    """Décide qui voit et qui modifie un template, sans table d'ACL."""

    def __init__(self, *, user_repository: object | None = None) -> None:
        """Initialise le service.

        Args:
            user_repository: Conservé pour résoudre un nom d'affichage de propriétaire.
        """
        self._users = user_repository

    @staticmethod
    def _actor_id(current_user: Mapping[str, object]) -> str:
        """Identifiant propriétaire (UUID writer, ``guest:{sid}`` pour un invité)."""
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

    @staticmethod
    def _visibility(template: Template) -> str:
        """Statut déclaré, `shared` par défaut pour un fichier antérieur au champ."""
        return getattr(template, "visibility", "shared") or "shared"

    def relation(self, template: Template, current_user: Mapping[str, object]) -> Optional[str]:
        """``owned`` / ``team`` / ``legacy`` — ma relation au template, ou None si invisible.

        Args:
            template: Template évalué.
            current_user: Principal auth.

        Returns:
            La relation, ou None quand le template n'a pas à apparaître.
        """
        owner = self._owner_id(template)
        if owner is None:
            return "legacy"
        if owner == self._actor_id(current_user):
            return "owned"
        return "team" if self._visibility(template) == "shared" else None

    def can_read(self, template: Template, current_user: Mapping[str, object]) -> bool:
        """Lecture : visible en liste, ou admin."""
        if self._is_admin(current_user):
            return True
        return self.relation(template, current_user) is not None

    def can_write(self, template: Template, current_user: Mapping[str, object]) -> bool:
        """PUT : propriétaire ou admin.

        Un template sans ``ownerId`` (legacy) reste lisible mais n'est mutable que par
        un admin : personne ne revendique l'écriture sur un objet que nul ne possède.
        """
        if self._is_admin(current_user):
            return True
        owner = self._owner_id(template)
        if owner is None:
            return False
        return owner == self._actor_id(current_user)

    def can_delete(self, template: Template, current_user: Mapping[str, object]) -> bool:
        """DELETE : mêmes droits que l'écriture."""
        return self.can_write(template, current_user)

    def can_change_visibility(
        self, template: Template, current_user: Mapping[str, object]
    ) -> bool:
        """Statut privé/partagé : propriétaire ou admin."""
        return self.can_write(template, current_user)

    def annotate(self, template: Template, current_user: Mapping[str, object]) -> Template:
        """Ajoute la relation calculée (non persistée)."""
        return template.model_copy(update={"relation": self.relation(template, current_user)})

    def list_visible(
        self, templates: List[Template], current_user: Mapping[str, object]
    ) -> List[Template]:
        """Filtre la liste disque selon la propriété et le statut."""
        visible: List[Template] = []
        for template in templates:
            if self.relation(template, current_user) is None:
                continue
            visible.append(self.annotate(template, current_user))
        return visible

    def require_readable(
        self, template: Template, current_user: Mapping[str, object]
    ) -> Template:
        """404 métier si hors visibilité."""
        if not self.can_read(template, current_user):
            raise TemplateAccessNotFoundError(f"Template {template.id} introuvable")
        return self.annotate(template, current_user)

    def require_writable(
        self, template: Template, current_user: Mapping[str, object]
    ) -> Template:
        """403 si mutation interdite."""
        self.require_readable(template, current_user)
        if not self.can_write(template, current_user):
            raise TemplateAccessForbiddenError(f"Modification refusée pour {template.id}")
        return template

    def require_deletable(
        self, template: Template, current_user: Mapping[str, object]
    ) -> Template:
        """403 si suppression interdite."""
        self.require_readable(template, current_user)
        if not self.can_delete(template, current_user):
            raise TemplateAccessForbiddenError(f"Suppression refusée pour {template.id}")
        return template

    def copy_template(
        self,
        template_service: TemplateService,
        template_id: str,
        current_user: Mapping[str, object],
    ) -> Template:
        """Duplique un template visible sous la propriété de l'acteur.

        Args:
            template_service: Service de persistance.
            template_id: UUID du template source.
            current_user: Principal auth, futur propriétaire de la copie.

        Returns:
            La copie persistée.

        Raises:
            TemplateAccessValidationError: Identifiant non UUID (pré-built).
            TemplateAccessNotFoundError: Source absente ou invisible.
        """
        try:
            canonical = str(UUID(template_id))
        except ValueError as exc:
            raise TemplateAccessValidationError(
                "Les templates pré-built ne sont pas copiables par cette route"
            ) from exc
        try:
            source = template_service.get_template(canonical)
        except FileNotFoundError as exc:
            raise TemplateAccessNotFoundError(str(exc)) from exc
        self.require_readable(source, current_user)

        payload = source.model_dump(
            exclude={"id", "metadata", "history", "relation", "ownerUsername", "sharedByUsername"}
        )
        payload["name"] = f"{source.name} (copie)"[:120]
        payload["owner_id"] = self._actor_id(current_user)
        # Une copie n'hérite pas du statut de la source : elle démarre en brouillon.
        payload["visibility"] = "private"
        copied, _ = template_service.create_template(payload)
        return self.annotate(copied, current_user)
