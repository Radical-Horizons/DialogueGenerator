"""Profile détaillé du chemin estimate-tokens (sélection ~4 fiches)."""
from __future__ import annotations

import cProfile
import io
import json
import pstats
import time
from typing import Any, Dict, List

from api.schemas.dialogue import ContextSelection, EstimateTokensRequest
from constants import Defaults
from core.context.context_builder import ContextBuilder


def _pick_sample_names(builder: ContextBuilder) -> Dict[str, List[str]]:
    """Sélection réaliste ~4 fiches (personnages + lieux + espèce)."""
    chars = builder.get_characters_names()[:2]
    locs = builder.get_locations_names()[:1]
    species = builder.get_species_names()[:1]
    return {
        "characters": chars,
        "locations": locs,
        "species": species,
    }


def _timed(label: str, fn: Any) -> Any:
    t0 = time.perf_counter()
    out = fn()
    ms = (time.perf_counter() - t0) * 1000
    print(f"  {label}: {ms:.1f} ms")
    return out, ms


def _large_selection(builder: ContextBuilder, n: int) -> Dict[str, List[str]]:
    """Sélection volumineuse pour reproduire payload ~400 KB."""
    per_cat = max(1, n // 4)
    return {
        "characters": builder.get_characters_names()[:per_cat],
        "locations": builder.get_locations_names()[:per_cat],
        "species": builder.get_species_names()[:per_cat],
        "communities": builder.get_communities_names()[:per_cat],
    }


def _run_pipeline(
    label: str,
    context_builder: ContextBuilder,
    container: Any,
    request_data: EstimateTokensRequest,
    service_dict: Dict[str, Any],
) -> Dict[str, float]:
    from api.routers.context_build import _build_lightweight_prompt_structure
    from services.context_token_budget import compute_context_selection_token_metrics
    from services.context_truncator import cap_context_text_to_budget

    timings: Dict[str, float] = {}
    print(f"\n=== {label} ===")

    def build_json() -> Any:
        return context_builder.build_context_json(
            selected_elements=service_dict,
            scene_instruction=request_data.user_instructions,
            field_configs=request_data.field_configs,
            organization_mode="narrative",
            max_tokens=Defaults.MAX_CONTEXT_TOKENS,
            include_dialogue_type=True,
            element_modes=service_dict.get("_element_modes"),
        )

    structured, timings["build_context_json"] = _timed("1. build_context_json", build_json)

    def metrics() -> Any:
        return compute_context_selection_token_metrics(
            context_builder,
            full_selection=request_data.context_selections,
            user_instructions=request_data.user_instructions,
            field_configs=request_data.field_configs,
            organization_mode="narrative",
            measurement_max_tokens=Defaults.MAX_CONTEXT_TOKENS,
            user_budget_max_tokens=request_data.max_context_tokens,
            prebuilt_structure=structured,
        )

    met, timings["metrics"] = _timed("2. metrics", metrics)

    def cap_budget() -> str:
        text = met.serialized_text or context_builder.serialize_context_to_text(structured)
        return cap_context_text_to_budget(text, request_data.max_context_tokens)

    ctx_text, timings["cap_budget"] = _timed("3. cap_budget", cap_budget)

    prompt_engine = container.get_prompt_engine()
    skill_service = container.get_skill_catalog_service()
    trait_service = container.get_trait_catalog_service()

    def lightweight() -> Any:
        return _build_lightweight_prompt_structure(
            request_data,
            prompt_engine,
            skill_service,
            trait_service,
            structured_context=structured,
            context_text=ctx_text,
        )

    (overhead, structured_prompt), timings["lightweight"] = _timed(
        "4. lightweight_prompt", lightweight
    )

    def dump_response() -> int:
        payload = {
            "context_tokens": met.context_tokens,
            "selection_tokens": met.selection_tokens,
            "token_count": met.context_tokens + overhead,
            "structured_prompt": structured_prompt.model_dump(),
        }
        return len(json.dumps(payload, ensure_ascii=False).encode("utf-8"))

    nbytes, timings["json_serialize"] = _timed("5. json_serialize", dump_response)
    timings["payload_kb"] = nbytes / 1024
    print(f"  payload ~{timings['payload_kb']:.0f} KB")
    timings["total_ms"] = sum(
        timings[k] for k in ("build_context_json", "metrics", "cap_budget", "lightweight", "json_serialize")
    )
    print(f"  TOTAL backend: {timings['total_ms']:.1f} ms")
    return timings


def profile_pipeline() -> None:
    from api.container import ServiceContainer

    print("=== Chargement ContextBuilder ===")
    t_load0 = time.perf_counter()
    container = ServiceContainer()
    context_builder = container.get_context_builder()
    print(f"  get_context_builder: {(time.perf_counter() - t_load0) * 1000:.1f} ms")

    small_map = _pick_sample_names(context_builder)
    print(f"Petite selection (4 fiches): {json.dumps(small_map, ensure_ascii=False)}")

    cs_small = ContextSelection(
        characters_full=small_map.get("characters", []),
        locations_full=small_map.get("locations", []),
        species_full=small_map.get("species", []),
    )
    req_small = EstimateTokensRequest(
        context_selections=cs_small,
        user_instructions=" ",
        organization_mode="narrative",
        max_context_tokens=200_000,
    )
    _run_pipeline("4 fiches (warm)", context_builder, container, req_small, req_small.context_selections.to_service_dict())

    # Trouver taille qui approche 400 KB payload
    for n in (8, 16, 24, 32, 48):
        big_map = _large_selection(context_builder, n)
        total_fiches = sum(len(v) for v in big_map.values())
        cs_big = ContextSelection(
            characters_full=big_map.get("characters", []),
            locations_full=big_map.get("locations", []),
            species_full=big_map.get("species", []),
            communities_full=big_map.get("communities", []),
        )
        req_big = EstimateTokensRequest(
            context_selections=cs_big,
            user_instructions=" ",
            organization_mode="narrative",
            max_context_tokens=200_000,
        )
        t = _run_pipeline(f"{total_fiches} fiches (n={n})", context_builder, container, req_big, req_big.context_selections.to_service_dict())
        if t.get("payload_kb", 0) >= 350:
            break

    print("\n=== cProfile build_context_json (petite selection) ===")
    pr = cProfile.Profile()
    pr.enable()
    context_builder.build_context_json(
        selected_elements=req_small.context_selections.to_service_dict(),
        scene_instruction=" ",
        organization_mode="narrative",
        max_tokens=Defaults.MAX_CONTEXT_TOKENS,
        include_dialogue_type=True,
        element_modes=req_small.context_selections.to_service_dict().get("_element_modes"),
    )
    pr.disable()
    stream = io.StringIO()
    pstats.Stats(pr, stream=stream).sort_stats("cumulative").print_stats(20)
    print(stream.getvalue())


def http_benchmark() -> None:
    """Mesure HTTP end-to-end (comme le navigateur)."""
    import urllib.error
    import urllib.request

    from api.container import ServiceContainer

    container = ServiceContainer()
    cb = container.get_context_builder()
    small = _pick_sample_names(cb)
    body = {
        "context_selections": {
            "characters_full": small.get("characters", []),
            "characters_excerpt": [],
            "locations_full": small.get("locations", []),
            "locations_excerpt": [],
            "items_full": [],
            "items_excerpt": [],
            "species_full": small.get("species", []),
            "species_excerpt": [],
            "communities_full": [],
            "communities_excerpt": [],
            "dialogues_examples": [],
        },
        "user_instructions": " ",
        "organization_mode": "narrative",
        "max_context_tokens": 200000,
    }
    data = json.dumps(body).encode("utf-8")
    url = "http://localhost:4243/api/v1/context/estimate-tokens"
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    try:
        t0 = time.perf_counter()
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read()
        ms = (time.perf_counter() - t0) * 1000
        print(f"\n=== HTTP estimate-tokens (4 fiches) ===")
        print(f"  total: {ms:.0f} ms, response: {len(raw) / 1024:.0f} KB")
    except urllib.error.URLError as exc:
        print(f"\nHTTP skip: {exc}")


if __name__ == "__main__":
    profile_pipeline()
    http_benchmark()
