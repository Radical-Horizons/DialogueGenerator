"""Accès aux templates custom.

Toute la logique de visibilité vit dans `OwnedItemAccessService`, partagée avec les
profils d'auteur. Ce module n'ajoute que ce qui est propre aux templates : la copie
sous la propriété de l'acteur.
"""

from __future__ import annotations

from typing import Mapping
from uuid import UUID

from api.schemas.template import Template
from services.owned_item_access import (
    ItemAccessForbiddenError,
    ItemAccessNotFoundError,
    ItemAccessValidationError,
    OwnedItemAccessService,
)
from services.template_service import TemplateService

# Noms historiques conservés : les appelants (routeur, tests) les importent d'ici.
TemplateAccessNotFoundError = ItemAccessNotFoundError
TemplateAccessForbiddenError = ItemAccessForbiddenError
TemplateAccessValidationError = ItemAccessValidationError


class TemplateAccessService(OwnedItemAccessService):
    """Accès aux templates : le modèle générique, plus la copie."""

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
