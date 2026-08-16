"""Suggestions de templates selon le scénario (Story 6.9)."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import List, Mapping, Optional

from api.schemas.template import (
    MarketplaceListing,
    PrebuiltTemplate,
    Template,
    TemplateSuggestionItem,
)
from services.template_marketplace_service import TemplateMarketplaceService
from services.template_service import TemplateService
from services.template_sharing_service import TemplateSharingService
from services.repositories.sqlite.template_suggestion_usage_repository import (
    VALID_SOURCES,
    TemplateSuggestionUsageRepository,
)
from services.template_suggestion_score import (
    MAX_SUGGESTIONS,
    SuggestionCandidateFeatures,
    SuggestionQuery,
    SuggestionScore,
    has_rencontre_initiale_text,
    score_candidate,
)

logger = logging.getLogger(__name__)


def _normalize_scene_type(scene_type: str) -> str:
    """Ignore le placeholder ``Generic`` du formulaire (non branché)."""
    cleaned = (scene_type or "").strip()
    if not cleaned or cleaned.casefold() == "generic":
        return ""
    return cleaned


def _has_suggestion_signals(query: SuggestionQuery) -> bool:
    """True s'il existe au moins un signal de scénario (état vide sinon)."""
    if (query.instructions or "").strip():
        return True
    if (query.scene_type or "").strip():
        return True
    if any(str(item).strip() for item in query.characters):
        return True
    if any(str(item).strip() for item in query.locations):
        return True
    return query.has_rencontre_initiale


class TemplateSuggestionValidationError(ValueError):
    """Source ou identifiant de compteur invalide."""


@dataclass(frozen=True)
class _RankedItem:
    """Candidat scoré en attente de tri."""

    score: SuggestionScore
    item: TemplateSuggestionItem


class TemplateSuggestionService:
    """Assemble les candidats lisibles, score, enregistre l'usage perso."""

    def __init__(
        self,
        *,
        usage_repository: TemplateSuggestionUsageRepository,
        sharing_service: TemplateSharingService,
        marketplace_service: TemplateMarketplaceService,
    ) -> None:
        """Injecte usage SQLite, ACL 6.8 et marketplace."""
        self._usage = usage_repository
        self._sharing = sharing_service
        self._marketplace = marketplace_service

    @staticmethod
    def _actor_id(current_user: Mapping[str, object]) -> str:
        """Identifiant JWT (guest = ``guest``)."""
        return str(current_user.get("id") or "").strip() or "guest"

    def record_used(
        self,
        current_user: Mapping[str, object],
        source: str,
        candidate_id: str,
    ) -> int:
        """Incrémente le compteur perso.

        Raises:
            TemplateSuggestionValidationError: Source inconnue ou id vide.
        """
        cleaned_source = (source or "").strip()
        cleaned_id = (candidate_id or "").strip()
        if cleaned_source not in VALID_SOURCES or not cleaned_id:
            raise TemplateSuggestionValidationError("source ou id invalide")
        count = self._usage.increment(
            user_id=self._actor_id(current_user),
            source=cleaned_source,
            candidate_id=cleaned_id,
        )
        logger.info(
            "Suggestion usage ++: user=%s source=%s id=%s count=%s",
            self._actor_id(current_user),
            cleaned_source,
            cleaned_id,
            count,
        )
        return count

    def suggest(
        self,
        *,
        current_user: Mapping[str, object],
        template_service: TemplateService,
        instructions: str,
        scene_type: str,
        characters: List[str],
        locations: List[str],
        rencontre_initiale_by_character: dict[str, str],
    ) -> List[TemplateSuggestionItem]:
        """Classe les templates lisibles (ACL + pré-built + marketplace, dédup)."""
        query = SuggestionQuery(
            instructions=instructions or "",
            scene_type=_normalize_scene_type(scene_type),
            characters=tuple(characters or ()),
            locations=tuple(locations or ()),
            has_rencontre_initiale=has_rencontre_initiale_text(
                rencontre_initiale_by_character
            ),
        )
        if not _has_suggestion_signals(query):
            return []
        actor = self._actor_id(current_user)
        usage_map = self._usage.list_for_user(actor)
        visible = self._sharing.list_visible(
            template_service.list_templates(),
            current_user,
        )
        visible_ids = {item.id for item in visible}
        listings = self._marketplace.browse_templates()
        market_by_source: dict[str, int] = {}
        for listing in listings:
            previous = market_by_source.get(listing.sourceTemplateId, 0)
            market_by_source[listing.sourceTemplateId] = max(
                previous, listing.usageCount
            )

        pending: list[_RankedItem] = []
        for template in visible:
            ranked = self._score_custom(
                template,
                query,
                usage_map.get(("custom", template.id), 0),
                market_by_source.get(template.id, 0),
            )
            if ranked is not None:
                pending.append(ranked)

        for prebuilt in template_service.list_prebuilt_templates():
            ranked = self._score_prebuilt(
                prebuilt,
                query,
                usage_map.get(("prebuilt", prebuilt.id), 0),
            )
            if ranked is not None:
                pending.append(ranked)

        for listing in listings:
            if listing.sourceTemplateId in visible_ids:
                continue
            ranked = self._score_marketplace(
                listing,
                query,
                usage_map.get(("marketplace", listing.id), 0),
            )
            if ranked is not None:
                pending.append(ranked)

        pending.sort(
            key=lambda entry: (-entry.score.score, entry.item.name.casefold(), entry.item.id)
        )
        result = [entry.item for entry in pending[:MAX_SUGGESTIONS]]
        logger.info("Suggestions templates: %s résultats (user=%s)", len(result), actor)
        return result

    def _score_custom(
        self,
        template: Template,
        query: SuggestionQuery,
        use_count: int,
        market_usage: int,
    ) -> Optional[_RankedItem]:
        """Score un custom visible."""
        features = SuggestionCandidateFeatures(
            name=template.name,
            description=template.description,
            category=template.category,
            scene_type_hint="",
            scene_type=template.configuration.sceneType,
            instructions=template.configuration.instructions,
            characters=tuple(template.configuration.characters),
            locations=tuple(template.configuration.locations),
            use_count=use_count,
            market_usage_count=market_usage,
        )
        scored = score_candidate(features, query)
        if scored.score <= 0:
            return None
        item = TemplateSuggestionItem(
            source="custom",
            id=template.id,
            name=template.name,
            description=template.description,
            category=template.category,
            icon=template.icon,
            score=scored.score,
            reasons=list(scored.reasons),
            configuration=template.configuration,
            visibility=template.visibility,
        )
        return _RankedItem(score=scored, item=item)

    def _score_prebuilt(
        self,
        prebuilt: PrebuiltTemplate,
        query: SuggestionQuery,
        use_count: int,
    ) -> Optional[_RankedItem]:
        """Score une fiche pré-built."""
        features = SuggestionCandidateFeatures(
            name=prebuilt.name,
            description=prebuilt.description,
            category=prebuilt.category,
            scene_type_hint=prebuilt.sceneTypeHint,
            scene_type=prebuilt.configuration.sceneType,
            instructions=prebuilt.configuration.instructions,
            characters=tuple(prebuilt.configuration.characters),
            locations=tuple(prebuilt.configuration.locations),
            use_count=use_count,
            market_usage_count=0,
        )
        scored = score_candidate(features, query)
        if scored.score <= 0:
            return None
        item = TemplateSuggestionItem(
            source="prebuilt",
            id=prebuilt.id,
            name=prebuilt.name,
            description=prebuilt.description,
            category=prebuilt.category,
            icon=prebuilt.icon,
            score=scored.score,
            reasons=list(scored.reasons),
            configuration=prebuilt.configuration,
            sceneTypeHint=prebuilt.sceneTypeHint,
            gddSystem=prebuilt.gddSystem,
            objectif=prebuilt.objectif,
            casUsage=prebuilt.casUsage,
            examples=list(prebuilt.examples),
            addedAt=prebuilt.addedAt,
        )
        return _RankedItem(score=scored, item=item)

    def _score_marketplace(
        self,
        listing: MarketplaceListing,
        query: SuggestionQuery,
        use_count: int,
    ) -> Optional[_RankedItem]:
        """Score un listing marketplace (hors dédup live)."""
        features = SuggestionCandidateFeatures(
            name=listing.name,
            description=listing.description,
            category=listing.category,
            scene_type_hint="",
            scene_type=listing.configuration.sceneType,
            instructions=listing.configuration.instructions,
            characters=tuple(listing.configuration.characters),
            locations=tuple(listing.configuration.locations),
            use_count=use_count,
            market_usage_count=listing.usageCount,
        )
        scored = score_candidate(features, query)
        if scored.score <= 0:
            return None
        item = TemplateSuggestionItem(
            source="marketplace",
            id=listing.id,
            name=listing.name,
            description=listing.description,
            category=listing.category,
            icon=listing.icon,
            score=scored.score,
            reasons=list(scored.reasons),
            configuration=listing.configuration,
        )
        return _RankedItem(score=scored, item=item)
