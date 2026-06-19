"""Mesure les 4 fiches exactes de la capture utilisateur."""
from __future__ import annotations

import json
import time
from typing import Any, Dict, List

from fastapi.testclient import TestClient

from api.container import ServiceContainer
from api.dependencies import get_context_builder
from api.main import app


def _resolve_names(cb) -> Dict[str, List[str]]:
    chars = cb.get_characters_names()
    locs = cb.get_locations_names()

    def pick_char(needle: str) -> str:
        for c in chars:
            if needle.lower() in c.lower():
                return c
        raise KeyError(needle)

    def pick_loc(needle: str) -> str:
        for loc in locs:
            if needle.lower() in loc.lower():
                return loc
        raise KeyError(needle)

    return {
        "characters_full": [
            pick_char("Valkazer"),
            pick_char("Uresa"),
            pick_char("Akthar"),
        ],
        "locations_full": [pick_loc("ossements")],
    }


def _field_configs(cb) -> Dict[str, List[str]]:
    out: Dict[str, List[str]] = {}
    cfg = cb.context_config or {}
    for etype in ("character", "location", "item", "species", "community"):
        paths: List[str] = []
        type_cfg = cfg.get(etype, {})
        if isinstance(type_cfg, dict):
            for _prio, fields in type_cfg.items():
                if isinstance(fields, list):
                    for fc in fields:
                        if isinstance(fc, dict) and fc.get("path"):
                            paths.append(str(fc["path"]))
        out[etype] = list(dict.fromkeys(paths))
    return out


def main() -> None:
    container = ServiceContainer()
    cb = container.get_context_builder()
    app.state.container = container
    app.dependency_overrides[get_context_builder] = lambda: cb
    client = TestClient(app)

    names = _resolve_names(cb)
    fc = _field_configs(cb)
    body: Dict[str, Any] = {
        "user_instructions": " ",
        "context_selections": {
            **names,
            "characters_excerpt": [],
            "locations_excerpt": [],
            "items_full": [],
            "items_excerpt": [],
            "species_full": [],
            "species_excerpt": [],
            "communities_full": [],
            "communities_excerpt": [],
            "dialogues_examples": [],
        },
        "organization_mode": "narrative",
        "max_context_tokens": 200_000,
        "include_narrative_guides": True,
        "field_configs": fc,
    }

    print("RESOLVED", json.dumps(names, ensure_ascii=False))
    for _ in range(2):
        client.post("/api/v1/context/estimate-tokens", json=body)
    t0 = time.perf_counter()
    r = client.post("/api/v1/context/estimate-tokens", json=body)
    ms = (time.perf_counter() - t0) * 1000
    data = r.json()
    print(
        f"HTTP {ms:.0f} ms  size={len(r.content) / 1024:.0f} KB  "
        f"selection_tokens={data['selection_tokens']}  token_count={data['token_count']}"
    )

    sp = data.get("structured_prompt") or {}
    for sec in sp.get("sections") or []:
        if sec.get("type") != "context":
            continue
        for cat in sec.get("categories") or []:
            for it in cat.get("items") or []:
                title = it.get("name") or it.get("id")
                print(f"  item {cat.get('title')}: {title} -> {it.get('tokenCount')} tokens")


if __name__ == "__main__":
    main()
