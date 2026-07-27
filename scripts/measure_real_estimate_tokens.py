"""Mesure réaliste estimate-tokens : TestClient HTTP + field_configs UI + breakdown."""
from __future__ import annotations

import json
import time
from typing import Any, Dict, List, Tuple

from fastapi.testclient import TestClient

from api.container import ServiceContainer
from api.main import app
from api.routers.context_build import _build_lightweight_prompt_structure
from api.schemas.dialogue import ContextSelection, EstimateTokensRequest
from constants import Defaults
from core.context.context_builder import ContextBuilder
from services.context_token_budget import compute_context_selection_token_metrics
from services.context_truncator import cap_context_text_to_budget


def _field_configs_all_paths_from_config(cb: ContextBuilder) -> Dict[str, List[str]]:
    """Simule un utilisateur ayant coché tous les champs du context_config.json."""
    out: Dict[str, List[str]] = {}
    cfg = cb.context_config or {}
    for etype in ("character", "location", "item", "species", "community"):
        paths: List[str] = []
        type_cfg = cfg.get(etype, {})
        if isinstance(type_cfg, dict):
            for _prio, fields in type_cfg.items():
                if not isinstance(fields, list):
                    continue
                for fc in fields:
                    if isinstance(fc, dict) and fc.get("path"):
                        paths.append(str(fc["path"]))
        out[etype] = list(dict.fromkeys(paths))
    return out


def _field_configs_empty_ui() -> Dict[str, List[str]]:
    """Store Zustand par défaut : listes vides (+ essential côté front)."""
    return {k: [] for k in ("character", "location", "item", "species", "community")}


def _selection_body(
    cb: ContextBuilder,
    *,
    n_chars: int,
    n_locs: int,
    n_species: int,
    n_communities: int,
    field_configs: Dict[str, List[str]] | None,
    organization_mode: str = "narrative",
) -> Dict[str, Any]:
    return {
        "user_instructions": " ",
        "context_selections": {
            "characters_full": cb.get_characters_names()[:n_chars],
            "characters_excerpt": [],
            "locations_full": cb.get_locations_names()[:n_locs],
            "locations_excerpt": [],
            "items_full": [],
            "items_excerpt": [],
            "species_full": cb.get_species_names()[:n_species],
            "species_excerpt": [],
            "communities_full": cb.get_communities_names()[:n_communities],
            "communities_excerpt": [],
            "dialogues_examples": [],
        },
        "organization_mode": organization_mode,
        "max_context_tokens": 200_000,
        "include_narrative_guides": True,
        "choices_mode": "free",
        "field_configs": field_configs,
    }


def _count_fiches(body: Dict[str, Any]) -> int:
    cs = body["context_selections"]
    return sum(
        len(cs.get(k) or [])
        for k in (
            "characters_full",
            "locations_full",
            "species_full",
            "communities_full",
            "items_full",
        )
    )


def _internal_breakdown(body: Dict[str, Any], container: ServiceContainer) -> Dict[str, float]:
    cb = container.get_context_builder()
    req = EstimateTokensRequest.model_validate(body)
    sd = req.context_selections.to_service_dict()
    timings: Dict[str, float] = {}

    t0 = time.perf_counter()
    structured = cb.build_context_json(
        selected_elements=sd,
        scene_instruction=req.user_instructions,
        field_configs=req.field_configs,
        organization_mode=req.organization_mode or "narrative",
        max_tokens=Defaults.MAX_CONTEXT_TOKENS,
        element_modes=sd.get("_element_modes"),
    )
    timings["build_context_json"] = (time.perf_counter() - t0) * 1000

    t0 = time.perf_counter()
    met = compute_context_selection_token_metrics(
        cb,
        full_selection=req.context_selections,
        user_instructions=req.user_instructions,
        field_configs=req.field_configs,
        organization_mode=req.organization_mode or "narrative",
        measurement_max_tokens=Defaults.MAX_CONTEXT_TOKENS,
        user_budget_max_tokens=req.max_context_tokens,
        prebuilt_structure=structured,
    )
    timings["metrics"] = (time.perf_counter() - t0) * 1000

    t0 = time.perf_counter()
    ctx_text = cap_context_text_to_budget(
        met.serialized_text or cb.serialize_context_to_text(structured),
        req.max_context_tokens,
    )
    timings["cap_budget"] = (time.perf_counter() - t0) * 1000

    t0 = time.perf_counter()
    overhead, sp = _build_lightweight_prompt_structure(
        req,
        container.get_prompt_engine(),
        container.get_skill_catalog_service(),
        container.get_trait_catalog_service(),
        structured_context=structured,
        context_text=ctx_text,
    )
    timings["lightweight_prompt"] = (time.perf_counter() - t0) * 1000

    t0 = time.perf_counter()
    payload = EstimateTokensRequest.model_validate(body)  # noqa: F841 — warm pydantic
    from api.schemas.dialogue import EstimateTokensResponse

    resp = EstimateTokensResponse(
        context_tokens=met.context_tokens,
        selection_tokens=met.selection_tokens,
        context_token_breakdown=met.breakdown,
        context_breakdown_note=met.breakdown_note,
        token_count=met.context_tokens + overhead,
        total_estimated_tokens=met.context_tokens + overhead,
        raw_prompt="",
        prompt_hash="x",
        structured_prompt=sp.model_dump(),
    )
    raw = json.dumps(resp.model_dump(), ensure_ascii=False).encode("utf-8")
    timings["pydantic_json_serialize"] = (time.perf_counter() - t0) * 1000
    timings["payload_kb"] = len(raw) / 1024
    return timings


def _heavy_characters(cb: ContextBuilder, n: int = 2) -> List[str]:
    scored: List[Tuple[str, int]] = []
    for name in cb.get_characters_names():
        data = cb.get_character_details_by_name(name)
        if not data:
            continue
        tokens = int(cb._count_tokens(json.dumps(data, ensure_ascii=False)))
        if tokens >= 3000:
            scored.append((name, tokens))
    scored.sort(key=lambda x: x[1], reverse=True)
    return [n for n, _ in scored[:n]]


def _http_testclient(client: TestClient, body: Dict[str, Any]) -> Tuple[float, int]:
    t0 = time.perf_counter()
    r = client.post("/api/v1/context/estimate-tokens", json=body)
    ms = (time.perf_counter() - t0) * 1000
    if r.status_code != 200:
        raise RuntimeError(f"HTTP {r.status_code}: {r.text[:500]}")
    return ms, len(r.content)


def _http_live(port: int, body: Dict[str, Any]) -> Tuple[float, int] | None:
    """POST vers serveur dev déjà lancé (stack réseau + uvicorn)."""
    import urllib.error
    import urllib.request

    url = f"http://127.0.0.1:{port}/api/v1/context/estimate-tokens"
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        t0 = time.perf_counter()
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read()
        return (time.perf_counter() - t0) * 1000, len(raw)
    except (urllib.error.URLError, TimeoutError):
        return None


def main() -> None:
    from api.dependencies import get_context_builder

    container = ServiceContainer()
    cb = container.get_context_builder()
    app.state.container = container
    app.dependency_overrides[get_context_builder] = lambda: cb
    client = TestClient(app)

    all_fields = _field_configs_all_paths_from_config(cb)
    empty_fields = _field_configs_empty_ui()

    heavy = _heavy_characters(cb, 2)
    heavy_body = {
        "user_instructions": "Scène de dialogue entre protagonistes.",
        "context_selections": {
            "characters_full": heavy,
            "locations_full": cb.get_locations_names()[:2],
        },
        "organization_mode": "narrative",
        "max_context_tokens": 50_000,
        "include_narrative_guides": True,
        "choices_mode": "free",
        "field_configs": all_fields,
    }

    scenarios = [
        ("2 gros persos + 2 lieux | field_configs=None (test perf repo)", heavy_body | {"field_configs": None}),
        ("2 gros persos + 2 lieux | tous champs UI", heavy_body),
        ("4 fiches ordre GDD | field_configs vide", _selection_body(cb, n_chars=2, n_locs=1, n_species=1, n_communities=0, field_configs=empty_fields)),
        ("4 fiches ordre GDD | tous champs UI", _selection_body(cb, n_chars=2, n_locs=1, n_species=1, n_communities=0, field_configs=all_fields)),
        ("12 fiches | tous champs", _selection_body(cb, n_chars=3, n_locs=3, n_species=3, n_communities=3, field_configs=all_fields)),
    ]

    print("=== Mesure HTTP TestClient (chemin FastAPI complet) ===\n")
    for label, body in scenarios:
        if isinstance(body, dict) and "context_selections" not in body:
            continue
        nf = _count_fiches(body) if _count_fiches(body) else len(body.get("context_selections", {}).get("characters_full", [])) + len(body.get("context_selections", {}).get("locations_full", []))
        _http_testclient(client, body)  # warm
        http_ms, nbytes = _http_testclient(client, body)
        http_ms2, _ = _http_testclient(client, body)
        internal = _internal_breakdown(body, container)
        live = _http_live(4243, body)
        live_str = f"  live_uvicorn={live[0]:.0f} ms {live[1]/1024:.0f} KB" if live else "  live_uvicorn=indisponible"
        print(f"{label}")
        print(f"  fiches≈{nf}  TestClient(warm)={http_ms2:.0f} ms  size={nbytes/1024:.0f} KB{live_str}")
        print(
            f"  breakdown: build={internal['build_context_json']:.0f} ms"
            f" metrics={internal['metrics']:.0f} ms"
            f" lightweight={internal['lightweight_prompt']:.0f} ms"
            f" json={internal['pydantic_json_serialize']:.0f} ms"
        )
        print(f"  field_paths: char={len(all_fields.get('character',[]))} loc={len(all_fields.get('location',[]))}")
        print()

    # Cible utilisateur : ~300-430 KB
    print("=== Recherche payload ~300-430 KB (tous champs) ===\n")
    for total in range(4, 40, 4):
        per = max(1, total // 4)
        body = _selection_body(
            cb,
            n_chars=per,
            n_locs=per,
            n_species=per,
            n_communities=per,
            field_configs=all_fields,
        )
        http_ms, nbytes = _http_testclient(client, body)
        kb = nbytes / 1024
        print(f"  ~{total} fiches -> HTTP {http_ms:.0f} ms, {kb:.0f} KB")
        if kb >= 280:
            internal = _internal_breakdown(body, container)
            print(f"    build={internal['build_context_json']:.0f} ms (dominant)")
            if kb >= 400:
                break


if __name__ == "__main__":
    main()
