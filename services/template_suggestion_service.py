"""Suggestions de templates selon le scénario (Story 6.9)."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, List, Mapping, Optional, Sequence

from api.schemas.template import (
    MarketplaceListing,
    PrebuiltTemplate,
    Template,
    TemplateSuggestionItem,
)
from api.utils.job_ownership import template_owner_key
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
    has_first_meeting_flag,
    has_rencontre_initiale_text,
    score_candidate,
    suggestion_context_key,
)

logger = logging.getLogger(__name__)
_GDD_FLAGS_PATH = (
    Path(__file__).resolve().parent.parent / "data" / "GDD_categories" / "Flags.json"
)
FlagNamesLoader = Callable[[], Sequence[str]]


_FLAG_NOMS_CACHE: list[str] | None = None


def load_gdd_flag_noms(path: Path | None = None) -> list[str]:
    """Lit les ``Nom`` de ``Flags.json`` (catalogue GDD, pas le CSV Unity)."""
    global _FLAG_NOMS_CACHE
    if path is None and _FLAG_NOMS_CACHE is not None:
        return _FLAG_NOMS_CACHE
    flags_path = path or _GDD_FLAGS_PATH
    try:
        payload = json.loads(flags_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Flags.json illisible (%s): %s", flags_path, exc)
        return []
    if not isinstance(payload, list):
        return []
    names: list[str] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        nom = item.get("Nom")
        if isinstance(nom, str) and nom.strip():
            names.append(nom.strip())
    if path is None:
        _FLAG_NOMS_CACHE = names
    return names


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
        flag_names_loader: FlagNamesLoader | None = None,
    ) -> None:
        """Injecte usage SQLite, ACL 6.8 et marketplace."""
        self._usage = usage_repository
        self._sharing = sharing_service
        self._marketplace = marketplace_service
        self._flag_names_loader = flag_names_loader or load_gdd_flag_noms

    @staticmethod
    def _actor_id(current_user: Mapping[str, object]) -> str:
        """Identifiant owner (UUID writer, ``guest:{sid}`` pour un invité)."""
        return template_owner_key(current_user)

    def record_used(
        self,
        current_user: Mapping[str, object],
        source: str,
        candidate_id: str,
        *,
        scene_type: str = "",
        characters: Sequence[str] | None = None,
    ) -> int:
        """Incrémente le compteur perso (et le compteur de scénario).

        Raises:
            TemplateSuggestionValidationError: Source inconnue ou id vide.
        """
        cleaned_source = (source or "").strip()
        cleaned_id = (candidate_id or "").strip()
        if cleaned_source not in VALID_SOURCES or not cleaned_id:
            raise TemplateSuggestionValidationError("source ou id invalide")
        actor = self._actor_id(current_user)
        count = self._usage.increment(
            user_id=actor,
            source=cleaned_source,
            candidate_id=cleaned_id,
        )
        context_key = suggestion_context_key(scene_type, characters or ())
        self._usage.increment_context(
            user_id=actor,
            source=cleaned_source,
            candidate_id=cleaned_id,
            context_key=context_key,
        )
        logger.info(
            "Suggestion usage ++: user=%s source=%s id=%s count=%s",
            actor,
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
            has_rencontre_initiale=(
                has_rencontre_initiale_text(rencontre_initiale_by_character)
                or has_first_meeting_flag(characters or (), self._flag_names_loader())
            ),
        )
        if not _has_suggestion_signals(query):
            return []
        actor = self._actor_id(current_user)
        usage_map = self._usage.list_for_user(actor)
        context_map = self._usage.list_context_for_user(
            actor, suggestion_context_key(scene_type, characters or ())
        )
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
                context_map.get(("custom", template.id), 0),
            )
            if ranked is not None:
                pending.append(ranked)

        for prebuilt in template_service.list_prebuilt_templates():
            ranked = self._score_prebuilt(
                prebuilt,
                query,
                usage_map.get(("prebuilt", prebuilt.id), 0),
                context_map.get(("prebuilt", prebuilt.id), 0),
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
                context_map.get(("marketplace", listing.id), 0),
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
        context_use_count: int = 0,
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
            context_use_count=context_use_count,
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
        context_use_count: int = 0,
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
            context_use_count=context_use_count,
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
        context_use_count: int = 0,
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
            context_use_count=context_use_count,
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
