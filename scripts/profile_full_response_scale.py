"""Full pipeline timing pour reproduire ~430 KB / ~3 s."""
from __future__ import annotations

import json
import time

from api.container import ServiceContainer
from api.routers.context import _build_lightweight_prompt_structure
from api.schemas.dialogue import ContextSelection, EstimateTokensRequest
from constants import Defaults
from services.context_token_budget import compute_context_selection_token_metrics
from services.context_truncator import cap_context_text_to_budget


def full_estimate_ms(sel: ContextSelection) -> tuple[float, float]:
    container = ServiceContainer()
    cb = container.get_context_builder()
    req = EstimateTokensRequest(
        context_selections=sel,
        user_instructions=" ",
        organization_mode="narrative",
        max_context_tokens=200_000,
    )
    sd = req.context_selections.to_service_dict()
    t0 = time.perf_counter()
    structured = cb.build_context_json(
        selected_elements=sd,
        scene_instruction=" ",
        organization_mode="narrative",
        max_tokens=Defaults.MAX_CONTEXT_TOKENS,
        element_modes=sd.get("_element_modes"),
    )
    met = compute_context_selection_token_metrics(
        cb,
        full_selection=req.context_selections,
        user_instructions=" ",
        field_configs=None,
        organization_mode="narrative",
        measurement_max_tokens=Defaults.MAX_CONTEXT_TOKENS,
        user_budget_max_tokens=200_000,
        prebuilt_structure=structured,
    )
    ctx_text = cap_context_text_to_budget(
        met.serialized_text or cb.serialize_context_to_text(structured),
        200_000,
    )
    overhead, sp = _build_lightweight_prompt_structure(
        req,
        container.get_prompt_engine(),
        container.get_skill_catalog_service(),
        container.get_trait_catalog_service(),
        structured_context=structured,
        context_text=ctx_text,
    )
    payload = {
        "context_tokens": met.context_tokens,
        "selection_tokens": met.selection_tokens,
        "token_count": met.context_tokens + overhead,
        "structured_prompt": sp.model_dump(),
        "context_token_breakdown": [r.model_dump() for r in met.breakdown],
    }
    raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    ms = (time.perf_counter() - t0) * 1000
    return ms, len(raw) / 1024


def main() -> None:
    container = ServiceContainer()
    cb = container.get_context_builder()
    for n in (4, 12, 24, 36, 48, 64):
        per = max(1, n // 4)
        sel = ContextSelection(
            characters_full=cb.get_characters_names()[:per],
            locations_full=cb.get_locations_names()[:per],
            species_full=cb.get_species_names()[:per],
            communities_full=cb.get_communities_names()[:per],
        )
        nf = (
            len(sel.characters_full or [])
            + len(sel.locations_full or [])
            + len(sel.species_full or [])
            + len(sel.communities_full or [])
        )
        ms, kb = full_estimate_ms(sel)
        print(f"{nf:2d} fiches -> {ms:7.0f} ms  {kb:6.0f} KB response")


if __name__ == "__main__":
    main()
