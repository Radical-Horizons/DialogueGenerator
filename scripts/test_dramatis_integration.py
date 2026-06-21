#!/usr/bin/env python3
"""Test intégration PJ/PNJ/lieu via API locale (preuve runtime)."""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from constants import PlayableCharacters

BASE = os.environ.get("API_URL", "http://localhost:4243").rstrip("/")
PLAYER = PlayableCharacters.ETHEEREE
NPC = PlayableCharacters.URESAIR
LOCATION = "Escelion"
OUT_DIR = _ROOT / "data" / "test_dialogues"


def _login() -> str | None:
    body = json.dumps({"username": "admin", "password": "admin123"}).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE}/api/v1/auth/login",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return data.get("access_token") or data.get("token")
    except Exception:
        return None


def _post(path: str, payload: dict[str, Any], token: str | None) -> dict[str, Any]:
    headers = {"Content-Type": "application/json; charset=utf-8"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=600) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _empty_context_lists() -> dict[str, list]:
    return {
        "characters_excerpt": [],
        "locations_excerpt": [],
        "items_full": [],
        "items_excerpt": [],
        "species_full": [],
        "species_excerpt": [],
        "communities_full": [],
        "communities_excerpt": [],
        "dialogues_examples": [],
    }


def _base_context() -> dict[str, Any]:
    return {
        "characters_full": [NPC, PLAYER],
        **_empty_context_lists(),
        "locations_full": [LOCATION],
        "scene_protagonists": {"personnage_a": PLAYER, "personnage_b": NPC},
        "scene_location": {"lieu": LOCATION},
    }


def check_preview(token: str | None) -> list[str]:
    """Vérifie le prompt système via preview-prompt."""
    payload = {
        "user_instructions": (
            "Courte rencontre : l'Éthérée questionne Uresaïr sur les Murmurateurs, "
            "registre vouvoiement, 2 à 4 répliques."
        ),
        "context_selections": _base_context(),
        "player_character_id": PLAYER,
        "npc_speaker_id": NPC,
        "max_context_tokens": 10000,
        "choices_mode": "free",
    }
    data = _post("/api/v1/dialogues/preview-prompt", payload, token)
    raw = data.get("raw_prompt") or ""
    checks: list[str] = []
    if f"voix du PJ {PLAYER}" in raw:
        checks.append("OK prompt: voix PJ = L'Éthérée")
    else:
        checks.append("FAIL prompt: voix PJ incorrecte")
    if f"Speaker (répliques `line`) : {NPC}" in raw:
        checks.append("OK prompt: speaker PNJ = Uresaïr")
    else:
        checks.append("FAIL prompt: speaker PNJ incorrect")
    if "L'Éthérée ne doit jamais apparaître comme speaker" in raw:
        checks.append("OK prompt: garde-fou Éthérée speaker")
    if LOCATION in raw or "Escelion" in raw:
        checks.append("OK prompt: lieu présent")
    else:
        checks.append("WARN prompt: lieu non visible dans extrait (peut être dans contexte)")
    return checks


def check_expand_tree(token: str | None) -> tuple[list[str], Path | None]:
    """Génère un mini arbre depth=1 et inspecte le START."""
    payload = {
        "user_instructions": (
            "Rencontre initiale entre l'Éthérée et Uresaïr à Escelion. "
            "Uresaïr parle en vouvoiement. Choix = voix de l'Éthérée."
        ),
        "context_selections": _base_context(),
        "player_character_id": PLAYER,
        "npc_speaker_id": NPC,
        "max_depth": 1,
        "max_choices": 2,
        "title": "Test_dramatis_etheree_uresair",
        "document_id": "test_dramatis_etheree_uresair_20260621",
        "persist": True,
        "dry_run": False,
        "llm_model_identifier": "gpt-5-mini",
    }
    data = _post("/api/v1/unity-dialogues/graph/expand-tree", payload, token)
    doc = data.get("document") or {}
    nodes = doc.get("nodes") or []
    out_path: Path | None = None
    checks: list[str] = []
    checks.append(f"expand-tree: node_count={data.get('node_count')} levels={data.get('levels_expanded')}")

    start = next((n for n in nodes if n.get("id") == "START"), nodes[0] if nodes else None)
    if not start:
        checks.append("FAIL expand: aucun nœud START")
        return checks, out_path

    speaker = str(start.get("speaker") or "")
    line = str(start.get("line") or "")
    choices = start.get("choices") or []
    checks.append(f"START speaker={speaker!r} line_len={len(line)} choices={len(choices)}")

    npc_key = NPC.lower().replace("ï", "i")
    speaker_key = speaker.lower().replace("ï", "i")
    if npc_key in speaker_key or speaker == NPC:
        checks.append("OK START: speaker = PNJ (Uresaïr)")
    elif speaker.upper() == "PNJ":
        checks.append("WARN START: speaker générique PNJ (acceptable si prompt OK)")
    else:
        checks.append(f"FAIL START: speaker inattendu ({speaker})")

    if PLAYER.lower() in speaker.lower():
        checks.append("FAIL START: L'Éthérée ne doit pas être speaker")
    else:
        checks.append("OK START: L'Éthérée absente du speaker")

    if choices:
        sample = str(choices[0].get("text", ""))[:80].encode("ascii", "replace").decode("ascii")
        checks.append(f"OK START: {len(choices)} choix PJ generes")
        checks.append(f"  choix[0]: {sample!r}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / "test_dramatis_etheree_uresair_20260621.json"
    out_path.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    checks.append(f"JSON écrit: {out_path}")
    return checks, out_path


def main() -> int:
    print(f"API: {BASE}")
    token = _login()
    print("Auth:", "OK" if token else "sans token (DISABLE_AUTH?)")

    print("\n=== preview-prompt ===")
    preview_checks = check_preview(token)
    for line in preview_checks:
        print(" ", line)

    print("\n=== expand-tree depth=1 ===")
    try:
        expand_checks, out_path = check_expand_tree(token)
        for line in expand_checks:
            print(" ", line)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        print(f" HTTP {exc.code}: {body[:2000]}", file=sys.stderr)
        return 1

    if any(c.startswith("FAIL") for c in preview_checks + expand_checks):
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
