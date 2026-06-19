"""Profile 4 plus grosses fiches precompilees + sans cache."""
from __future__ import annotations

import json
import time
from pathlib import Path
from unittest.mock import patch

from api.container import ServiceContainer
from api.schemas.dialogue import ContextSelection, EstimateTokensRequest
from constants import Defaults
from services.gdd_context_precompile import STEM_TO_CATEGORY_KEY


def _top4_names() -> dict[str, list[str]]:
    root = Path("data/.gdd_context_precompile")
    by_cat: dict[str, list[tuple[int, str]]] = {}
    for p in root.rglob("*.json"):
        if p.name == "manifest.json":
            continue
        stem = p.parent.name
        cat = STEM_TO_CATEGORY_KEY.get(stem, stem)
        data = json.loads(p.read_text(encoding="utf-8"))
        nom = str(data.get("nom") or p.stem)
        by_cat.setdefault(cat, []).append((p.stat().st_size, nom))
    out: dict[str, list[str]] = {}
    picked: list[tuple[int, str, str]] = []
    for stem, items in by_cat.items():
        for sz, nom in items:
            picked.append((sz, stem, nom))
    picked.sort(reverse=True)
    for sz, stem, nom in picked[:4]:
        cat = STEM_TO_CATEGORY_KEY.get(stem, stem)
        out.setdefault(cat, []).append(nom)
        print(f"  pick {sz//1024}KB {stem}/{nom}")
    return out


def _run(label: str, sel_map: dict, use_cache: bool) -> None:
    container = ServiceContainer()
    cb = container.get_context_builder()
    cs = ContextSelection(
        characters_full=sel_map.get("characters", []),
        locations_full=sel_map.get("locations", []),
        species_full=sel_map.get("species", []),
        communities_full=sel_map.get("communities", []),
        items_full=sel_map.get("items", []),
    )
    sd = cs.to_service_dict()

    ctx = patch("services.gdd_context_precompile.try_load_cached_context_item", return_value=None) if not use_cache else patch.dict({})
    print(f"\n=== {label} ===")
    t0 = time.perf_counter()
    if use_cache:
        structured = cb.build_context_json(
            selected_elements=sd,
            scene_instruction=" ",
            organization_mode="narrative",
            max_tokens=Defaults.MAX_CONTEXT_TOKENS,
        )
    else:
        with patch("services.gdd_context_precompile.try_load_cached_context_item", return_value=None):
            structured = cb.build_context_json(
                selected_elements=sd,
                scene_instruction=" ",
                organization_mode="narrative",
                max_tokens=Defaults.MAX_CONTEXT_TOKENS,
            )
    build_ms = (time.perf_counter() - t0) * 1000
    dump = json.dumps(structured.model_dump(), ensure_ascii=False)
    print(f"  build_context_json: {build_ms:.0f} ms")
    print(f"  structured JSON: {len(dump.encode())/1024:.0f} KB")
    print(f"  totalTokens: {structured.metadata.totalTokens}")


if __name__ == "__main__":
    print("4 plus grosses fiches:")
    heavy = _top4_names()
    _run("4 grosses fiches AVEC cache", heavy, True)
    _run("4 grosses fiches SANS cache", heavy, False)
