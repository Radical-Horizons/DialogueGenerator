"""Service métier du marketplace de templates (Story 6.6)."""

from __future__ import annotations

import json
import logging
import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from pydantic import ValidationError

from api.schemas.template import (
    TEMPLATE_NAME_MAX_LENGTH,
    MarketplaceCommentResponse,
    MarketplaceListing,
    TemplateConfiguration,
    TemplateCreateResponse,
)
from services.repositories.sqlite.shared_templates_repository import (
    SharedTemplateRow,
    SharedTemplatesRepository,
)
from services.template_service import TemplateService

logger = logging.getLogger(__name__)


class OwnListingRatingError(ValueError):
    """Un auteur ne peut pas noter sa propre fiche."""


class MarketplaceForbiddenError(PermissionError):
    """Action marketplace refusée (guest, autre writer, auteur absent)."""


class TemplateMarketplaceService:
    """Parcours, publication, copie, notation et retrait des fiches partagées."""

    def __init__(
        self,
        repository: SharedTemplatesRepository,
        template_service: TemplateService,
    ) -> None:
        """Initialise le service.

        Args:
            repository: Accès SQLite aux listings et notes.
            template_service: CRUD JSON custom (copie via ``create_template``).
        """
        self._repository = repository
        self._template_service = template_service

    def browse_templates(
        self, viewer: Optional[Dict[str, Any]] = None
    ) -> List[MarketplaceListing]:
        """Liste les fiches publiées (ignore un snapshot JSON/schéma invalide)."""
        listings: List[MarketplaceListing] = []
        for row in self._repository.list_listings():
            try:
                listings.append(self._to_listing(row, viewer=viewer))
            except (json.JSONDecodeError, ValidationError, TypeError, ValueError):
                logger.warning("Snapshot marketplace invalide ignoré: %s", row.id)
        return listings

    def get_listing(
        self,
        listing_id: str,
        viewer: Optional[Dict[str, Any]] = None,
    ) -> MarketplaceListing:
        """Charge une fiche.

        Raises:
            FileNotFoundError: Listing absent.
        """
        row = self._repository.get_by_id(listing_id)
        if row is None:
            raise FileNotFoundError(f"Marketplace listing {listing_id} not found")
        return self._to_listing(row, viewer=viewer)

    def share_template(
        self,
        template_id: str,
        current_user: Dict[str, Any],
        *,
        anonymous: bool = False,
    ) -> MarketplaceListing:
        """Publie un custom (upsert si déjà publié par le même auteur).

        Raises:
            FileNotFoundError: Custom absent.
            MarketplaceForbiddenError: Auteur hors table ``users``.
        """
        author_id = str(current_user["id"])
        if not self._repository.user_exists(author_id):
            raise MarketplaceForbiddenError("Auteur introuvable dans users")
        template = self._template_service.get_template(template_id)
        snapshot = json.dumps(
            {
                "name": template.name,
                "description": template.description,
                "category": template.category,
                "icon": template.icon,
                "configuration": template.configuration.model_dump(mode="json"),
            },
            ensure_ascii=False,
        )
        now = datetime.now(timezone.utc).isoformat()
        existing = self._repository.get_by_source_and_author(template_id, author_id)
        if existing is not None:
            row = self._repository.update_snapshot(existing.id, snapshot, now)
            row = self._repository.set_listing_flags(
                row.id, is_anonymous=anonymous
            )
            logger.info("Marketplace listing mis à jour: %s", row.id)
            return self._to_listing(row, viewer=current_user)
        try:
            row = self._repository.insert(
                listing_id=str(uuid4()),
                source_template_id=template_id,
                author_id=author_id,
                snapshot=snapshot,
                created_at=now,
                updated_at=now,
            )
        except sqlite3.IntegrityError:
            raced = self._repository.get_by_source_and_author(template_id, author_id)
            if raced is None:
                raise
            row = self._repository.update_snapshot(raced.id, snapshot, now)
        row = self._repository.set_listing_flags(row.id, is_anonymous=anonymous)
        logger.info("Marketplace listing créé: %s (auteur %s)", row.id, author_id)
        return self._to_listing(row, viewer=current_user)

    def use_listing(
        self,
        listing_id: str,
        owner_id: Optional[str] = None,
    ) -> TemplateCreateResponse:
        """Copie une fiche vers Mes templates et incrémente ``usage_count``.

        Raises:
            FileNotFoundError: Listing absent.
        """
        listing = self.get_listing(listing_id)
        copied, warnings = self._template_service.create_template(
            {
                "name": self._copy_name(listing.name),
                "description": listing.description,
                "category": listing.category,
                "icon": listing.icon,
                "configuration": listing.configuration.model_dump(mode="json"),
                "owner_id": owner_id,
            }
        )
        self._repository.increment_usage(listing_id)
        logger.info("Marketplace listing utilisé: %s → custom %s", listing_id, copied.id)
        return TemplateCreateResponse(**copied.model_dump(), warnings=warnings)

    def rate_listing(
        self,
        listing_id: str,
        stars: int,
        current_user: Dict[str, Any],
    ) -> MarketplaceListing:
        """Enregistre une note 1–5 (upsert).

        Raises:
            FileNotFoundError: Listing absent.
            OwnListingRatingError: Auto-notation.
            MarketplaceForbiddenError: Compte hors ``users``.
        """
        user_id = str(current_user["id"])
        if not self._repository.user_exists(user_id):
            raise MarketplaceForbiddenError("Compte introuvable dans users")
        listing = self.get_listing(listing_id)
        if listing.authorId == user_id:
            raise OwnListingRatingError("cannot_rate_own")
        now = datetime.now(timezone.utc).isoformat()
        try:
            self._repository.upsert_rating(
                listing_id=listing_id,
                user_id=user_id,
                stars=stars,
                created_at=now,
                updated_at=now,
            )
        except sqlite3.IntegrityError as exc:
            raise FileNotFoundError(f"Marketplace listing {listing_id} not found") from exc
        return self.get_listing(listing_id, viewer=current_user)

    def unpublish_listing(
        self,
        listing_id: str,
        current_user: Dict[str, Any],
    ) -> None:
        """Retire une fiche (auteur ou admin).

        Raises:
            FileNotFoundError: Listing absent.
            MarketplaceForbiddenError: Autre writer.
        """
        listing = self.get_listing(listing_id)
        role = str(current_user.get("role") or "")
        user_id = str(current_user.get("id") or "")
        if role != "admin" and listing.authorId != user_id:
            raise MarketplaceForbiddenError("Seul l'auteur ou un admin peut retirer")
        deleted = self._repository.delete(listing_id)
        if not deleted:
            raise FileNotFoundError(f"Marketplace listing {listing_id} not found")
        logger.info("Marketplace listing retiré: %s", listing_id)

    def set_official(
        self,
        listing_id: str,
        current_user: Dict[str, Any],
        is_official: bool,
    ) -> MarketplaceListing:
        """Marque une fiche officielle (admin seulement)."""
        if str(current_user.get("role") or "") != "admin":
            raise MarketplaceForbiddenError("Seul un admin peut marquer officiel")
        listing = self.get_listing(listing_id)
        row = self._repository.set_listing_flags(listing.id, is_official=is_official)
        return self._to_listing(row, viewer=current_user)

    def list_comments(self, listing_id: str) -> List[MarketplaceCommentResponse]:
        """Liste les commentaires d'une fiche."""
        self.get_listing(listing_id)
        return [
            MarketplaceCommentResponse(
                id=row.id,
                listingId=row.listing_id,
                authorUsername=row.author_username,
                body=row.body,
                createdAt=row.created_at,
            )
            for row in self._repository.list_comments(listing_id)
        ]

    def add_comment(
        self,
        listing_id: str,
        current_user: Dict[str, Any],
        body: str,
    ) -> MarketplaceCommentResponse:
        """Ajoute un commentaire (writer en table users)."""
        self.get_listing(listing_id)
        user_id = str(current_user.get("id") or "")
        if not self._repository.user_exists(user_id):
            raise MarketplaceForbiddenError("Auteur introuvable dans users")
        row = self._repository.insert_comment(
            comment_id=str(uuid4()),
            listing_id=listing_id,
            user_id=user_id,
            body=body,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        return MarketplaceCommentResponse(
            id=row.id,
            listingId=row.listing_id,
            authorUsername=row.author_username,
            body=row.body,
            createdAt=row.created_at,
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
    def _to_listing(
        row: SharedTemplateRow,
        viewer: Optional[Dict[str, Any]] = None,
    ) -> MarketplaceListing:
        """Parse le snapshot JSON vers le DTO API."""
        payload = json.loads(row.snapshot)
        configuration = TemplateConfiguration(**payload.get("configuration") or {})
        username = row.author_username
        if row.is_anonymous:
            viewer_id = str((viewer or {}).get("id") or "")
            viewer_role = str((viewer or {}).get("role") or "")
            if viewer_role != "admin" and viewer_id != row.author_id:
                username = "Anonyme"
        return MarketplaceListing(
            id=row.id,
            sourceTemplateId=row.source_template_id,
            authorId=row.author_id,
            authorUsername=username,
            name=str(payload.get("name") or ""),
            description=str(payload.get("description") or ""),
            category=str(payload.get("category") or "Général"),
            icon=str(payload.get("icon") or "📋"),
            configuration=configuration,
            createdAt=row.created_at,
            usageCount=row.usage_count,
            ratingAverage=row.rating_average,
            ratingCount=row.rating_count,
            isAnonymous=row.is_anonymous,
            isOfficial=row.is_official,
        )
