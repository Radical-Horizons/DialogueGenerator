#!/usr/bin/env python3
"""CLI agent : génération autonome d'un dialogue complet par expansion BFS.

Appelle POST /api/v1/unity-dialogues/graph/expand-tree sur l'API locale.
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from constants import ModelNames, PlayableCharacters
from services.configuration_service import ConfigurationService
from services.scene_dramatis import resolve_canonical_name_from_catalog
from services.scene_instruction_loader import build_scene_user_instructions


def _base_url() -> str:
    return os.environ.get("API_URL", "http://localhost:4243").rstrip("/")


def _login(base_url: str, username: str, password: str) -> str:
    """Authentification JWT ; retourne le token."""
    body = json.dumps({"username": username, "password": password}).encode("utf-8")
    req = urllib.request.Request(
        f"{base_url}/api/v1/auth/login",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    token = data.get("access_token") or data.get("token")
    if not token:
        raise RuntimeError("Login OK mais token absent dans la réponse.")
    return str(token)


def _api_post(
    base_url: str,
    path: str,
    payload: dict[str, Any],
    token: str | None,
) -> dict[str, Any]:
    """POST JSON vers l'API."""
    headers = {"Content-Type": "application/json; charset=utf-8"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(
        f"{base_url}{path}",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=7200) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _empty_context_lists() -> dict[str, list]:
    return {
        "characters_excerpt": [],
        "locations_full": [],
        "locations_excerpt": [],
        "items_full": [],
        "items_excerpt": [],
        "species_full": [],
        "species_excerpt": [],
        "communities_full": [],
        "communities_excerpt": [],
        "dialogues_examples": [],
    }


def _resolve_cli_names(
    *,
    player: str | None,
    npc: str | None,
    characters: list[str],
) -> tuple[str | None, str | None, list[str]]:
    """Résout les noms vers les libellés GDD canoniques (accents, apostrophes)."""
    try:
        from api.container import ServiceContainer

        cb = ServiceContainer().get_context_builder()
        catalog = cb.get_characters_names()
    except Exception:
        catalog = []

    resolved_player = player
    resolved_npc = npc
    if catalog:
        if resolved_player:
            resolved_player = resolve_canonical_name_from_catalog(resolved_player, catalog)
        if resolved_npc:
            resolved_npc = resolve_canonical_name_from_catalog(resolved_npc, catalog)
        resolved_chars = [
            resolve_canonical_name_from_catalog(name, catalog) for name in characters
        ]
    else:
        resolved_chars = list(characters)

    for name in (resolved_player, resolved_npc):
        if name and name not in resolved_chars:
            resolved_chars.append(name)

    return resolved_player, resolved_npc, list(dict.fromkeys(resolved_chars))


def _default_user_instructions(
    scene_type: str,
    *,
    npc: str | None,
) -> str:
    """Charge les instructions UI (template + ancrage rencontre_initiale)."""
    config = ConfigurationService()
    context_builder = None
    npc_canon = npc
    try:
        from api.container import ServiceContainer

        context_builder = ServiceContainer().get_context_builder()
        if npc:
            npc_canon = resolve_canonical_name_from_catalog(
                npc,
                context_builder.get_characters_names(),
            )
    except Exception:
        pass
    return build_scene_user_instructions(
        config,
        scene_type,
        npc_speaker_id=npc_canon,
        context_builder=context_builder,
    )


def _build_context_selections(args: argparse.Namespace) -> dict[str, Any]:
    """Construit context_selections depuis les arguments CLI."""
    player, npc, characters = _resolve_cli_names(
        player=args.player,
        npc=args.npc,
        characters=list(args.characters),
    )

    context: dict[str, Any] = {
        "characters_full": characters,
        **_empty_context_lists(),
    }

    locations = list(args.locations) if args.locations else []
    if args.scene_region and args.scene_region not in locations:
        locations.append(args.scene_region)
    if locations:
        context["locations_full"] = locations

    protagonists: dict[str, str] = {}
    if player:
        protagonists["personnage_a"] = player
    if npc:
        protagonists["personnage_b"] = npc
    if protagonists:
        context["scene_protagonists"] = protagonists

    if args.scene_region or args.sub_location:
        scene_location: dict[str, str] = {}
        if args.scene_region:
            scene_location["lieu"] = args.scene_region
        if args.sub_location:
            scene_location["sous_lieu"] = args.sub_location
        context["scene_location"] = scene_location

    return context


def pick_path(nodes: list[dict[str, Any]], choice_index: int = 0) -> list[dict[str, Any]]:
    """Suit le même index de choix à chaque nœud jusqu'à une feuille."""
    by_id = {n["id"]: n for n in nodes}
    path: list[dict[str, Any]] = []
    current_id = "START"
    visited: set[str] = set()
    while current_id in by_id and current_id not in visited:
        visited.add(current_id)
        node = by_id[current_id]
        path.append(node)
        choices = node.get("choices") or []
        if not choices:
            break
        idx = min(choice_index, len(choices) - 1)
        target = choices[idx].get("targetNode")
        if not target or target == "END" or target not in by_id:
            break
        current_id = target
    return path


def pick_random_path(
    nodes: list[dict[str, Any]],
    *,
    rng: random.Random | None = None,
) -> tuple[list[dict[str, Any]], list[int]]:
    """Suit un index de choix tiré au hasard à chaque nœud jusqu'à une feuille."""
    by_id = {n["id"]: n for n in nodes}
    path: list[dict[str, Any]] = []
    choices_taken: list[int] = []
    current_id = "START"
    visited: set[str] = set()
    r = rng or random.Random()
    while current_id in by_id and current_id not in visited:
        visited.add(current_id)
        node = by_id[current_id]
        path.append(node)
        choices = node.get("choices") or []
        if not choices:
            break
        idx = r.randrange(len(choices))
        choices_taken.append(idx)
        target = choices[idx].get("targetNode")
        if not target or target == "END" or target not in by_id:
            break
        current_id = target
    return path, choices_taken


def format_path(path: list[dict[str, Any]], *, player_label: str = "PJ") -> str:
    """Formate un chemin START -> feuille pour relecture console."""
    lines: list[str] = []
    for i, node in enumerate(path):
        speaker = node.get("speaker", "PNJ")
        line = str(node.get("line", "")).strip()
        lines.append(f"--- Nœud {i + 1} ({node.get('id')}) ---")
        lines.append(f"{speaker}: {line}")
        choices = node.get("choices") or []
        if choices and i < len(path) - 1:
            next_id = path[i + 1]["id"]
            taken = next((c for c in choices if c.get("targetNode") == next_id), None)
            if taken:
                choice_text = str(taken.get("text", "")).strip()
                lines.append(f"=> {player_label} (choix): {choice_text}")
        lines.append("")
    return "\n".join(lines)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Génère un dialogue complet (expansion BFS) via l'API DialogueGenerator.",
    )
    parser.add_argument("--depth", type=int, default=4, help="Rounds de choix PJ après START (défaut: 4)")
    parser.add_argument("--choices", type=int, default=3, help="Choix PJ par nœud intermédiaire (défaut: 3)")
    parser.add_argument(
        "--characters",
        nargs="+",
        default=[PlayableCharacters.URESAIR],
        help="Personnages GDD (fiches contexte ; défaut: Uresaïr)",
    )
    parser.add_argument(
        "--player",
        default=PlayableCharacters.URESAIR,
        help="PJ jouable (player_character_id, voix des choices ; défaut: Uresaïr)",
    )
    parser.add_argument("--npc", default=None, help="PNJ interlocuteur (npc_speaker_id, speaker des line)")
    parser.add_argument(
        "--locations",
        nargs="*",
        default=[],
        help="Lieux GDD (locations_full) ; --scene-region est ajouté automatiquement si absent",
    )
    parser.add_argument(
        "--scene-region",
        default=None,
        help="Région/lieu principal (scene_location.lieu + locations_full si besoin)",
    )
    parser.add_argument(
        "--sub-location",
        default=None,
        help="Sous-lieu narratif (scene_location.sous_lieu, ex. atelier)",
    )
    parser.add_argument("--title", default="Dialogue auto", help="Titre du dialogue")
    parser.add_argument("--document-id", default=None, help="ID document (auto-généré si absent)")
    parser.add_argument(
        "--scene-type",
        default="first_meeting",
        choices=[
            "first_meeting",
            "conversation",
            "action_scene",
            "intimate_moment",
            "revelation",
            "confrontation",
        ],
        help="Type de scène (défaut: first_meeting = première rencontre in-game)",
    )
    parser.add_argument(
        "--instructions",
        default=None,
        help="Consignes scène (défaut: template UI selon --scene-type)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Estimation coût sans génération LLM")
    parser.add_argument("--no-persist", action="store_true", help="Ne pas persister le document")
    parser.add_argument(
        "--print-path",
        action="store_true",
        help="Afficher aussi un chemin fixe (--path-choice) en plus de l'échantillon aléatoire",
    )
    parser.add_argument(
        "--path-choice",
        type=int,
        default=0,
        help="Index du choix pour --print-path (défaut: 0)",
    )
    parser.add_argument(
        "--no-sample-path",
        action="store_true",
        help="Ne pas afficher ni sauver le chemin aléatoire (désactive l'échantillon par défaut)",
    )
    parser.add_argument(
        "--save-json",
        default=None,
        metavar="PATH",
        help="Sauvegarder le document JSON localement (ex. data/test_dialogues/mon_dialogue.json)",
    )
    parser.add_argument("--username", default=os.environ.get("API_USERNAME", "admin"))
    parser.add_argument("--password", default=os.environ.get("API_PASSWORD", "admin123"))
    parser.add_argument(
        "--model",
        default=ModelNames.GPT_5_6_LUNA,
        help=f"Modèle LLM (expand-tree : {ModelNames.GPT_5_6_LUNA} uniquement)",
    )
    parser.add_argument(
        "--choices-mode",
        choices=("free", "capped"),
        default="capped",
        help="Mode choix LLM (aligné UI ; défaut capped pour branching explicite)",
    )
    parser.add_argument(
        "--allow-partial",
        action="store_true",
        help="Continuer l'expansion si un parent échoue (statut partial)",
    )
    return parser.parse_args()


def main() -> int:
    """Point d'entrée CLI."""
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    args = _parse_args()
    base_url = _base_url()
    context = _build_context_selections(args)

    _, resolved_npc, _ = _resolve_cli_names(
        player=args.player,
        npc=args.npc,
        characters=list(args.characters),
    )
    user_instructions = args.instructions
    if not user_instructions:
        user_instructions = _default_user_instructions(args.scene_type, npc=resolved_npc or args.npc)
    if not user_instructions.strip():
        user_instructions = " "

    payload: dict[str, Any] = {
        "user_instructions": user_instructions,
        "context_selections": context,
        "max_depth": args.depth,
        "max_choices": args.choices,
        "title": args.title,
        "persist": not args.no_persist,
        "dry_run": args.dry_run,
        "llm_model_identifier": args.model,
        "scene_type": args.scene_type,
        "include_narrative_guides": True,
        "organization_mode": "narrative",
        "choices_mode": args.choices_mode,
        "allow_partial": args.allow_partial,
    }
    if args.document_id:
        payload["document_id"] = args.document_id
    if args.player:
        payload["player_character_id"] = args.player
    if args.npc:
        payload["npc_speaker_id"] = args.npc

    token = os.environ.get("API_TOKEN") or None
    if not token:
        try:
            health_req = urllib.request.Request(f"{base_url}/health", method="GET")
            urllib.request.urlopen(health_req, timeout=10)
        except urllib.error.URLError as exc:
            print(f"API inaccessible ({base_url}): {exc}", file=sys.stderr)
            return 1
        try:
            token = _login(base_url, args.username, args.password)
        except Exception as exc:
            print(f"Auth échouée (continuer sans token si DISABLE_AUTH): {exc}", file=sys.stderr)
            token = None

    dramatis_bits = []
    if args.player:
        dramatis_bits.append(f"PJ={args.player}")
    if args.npc:
        dramatis_bits.append(f"PNJ={args.npc}")
    if args.scene_region or args.sub_location:
        loc = args.scene_region or "?"
        if args.sub_location:
            loc = f"{loc} / {args.sub_location}"
        dramatis_bits.append(f"lieu={loc}")
    if dramatis_bits:
        print("Scène:", ", ".join(dramatis_bits))

    print(
        f"POST expand-tree model={args.model} scene_type={args.scene_type} "
        f"depth={args.depth} choices={args.choices} dry_run={args.dry_run}..."
    )
    try:
        result = _api_post(
            base_url,
            "/api/v1/unity-dialogues/graph/expand-tree",
            payload,
            token,
        )
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        print(f"Erreur HTTP {exc.code}: {body}", file=sys.stderr)
        return 1
    except urllib.error.URLError as exc:
        print(f"Erreur réseau: {exc}", file=sys.stderr)
        return 1

    print(json.dumps(
        {
            "document_id": result.get("document_id"),
            "node_count": result.get("node_count"),
            "llm_calls_estimated": result.get("llm_calls_estimated"),
            "levels_expanded": result.get("levels_expanded"),
            "expansion_status": result.get("expansion_status"),
            "failed_parents": result.get("failed_parents"),
            "failed_parent_details": result.get("failed_parent_details"),
            "cost_usd": result.get("cost_usd"),
            "llm_model_identifier": result.get("llm_model_identifier"),
        },
        ensure_ascii=False,
        indent=2,
    ))

    failed = result.get("failed_parents") or []
    expansion_status = result.get("expansion_status") or "complete"
    if expansion_status == "partial" and failed:
        print(f"Expansion partielle: {len(failed)} parent(s) en échec", file=sys.stderr)

    total_nodes = result.get("node_count") or 0
    if args.allow_partial and total_nodes > 0 and len(failed) > max(1, total_nodes // 10):
        print(f"Trop d'échecs parents: {len(failed)}", file=sys.stderr)
        return 2

    if args.dry_run:
        return 0

    doc = result.get("document") or {}
    nodes = doc.get("nodes") or []

    if args.save_json and doc:
        out = Path(args.save_json)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"JSON local: {out} ({len(nodes)} nœuds)")

    doc_id = result.get("document_id") or args.document_id
    player_label = args.player or "PJ"
    path_out_dir = _ROOT / "data" / "test_dialogues"
    path_out_dir.mkdir(parents=True, exist_ok=True)

    def _emit_path(path: list[dict[str, Any]], header: str, suffix: str) -> None:
        text = format_path(path, player_label=player_label)
        print("\n" + "=" * 60)
        print(header)
        print("=" * 60 + "\n")
        print(text)
        if doc_id:
            path_file = path_out_dir / f"{doc_id}.{suffix}.txt"
            path_file.write_text(text, encoding="utf-8")
            print(f"Chemin sauvé: {path_file}")

    if nodes and not args.no_sample_path:
        sample_path, sample_choices = pick_random_path(nodes)
        _emit_path(
            sample_path,
            f"CHEMIN ÉCHANTILLON (choix aléatoires: {sample_choices})",
            "sample_path",
        )

    if args.print_path and nodes:
        fixed_path = pick_path(nodes, args.path_choice)
        _emit_path(
            fixed_path,
            f"CHEMIN FIXE (choix {args.path_choice} à chaque étape)",
            f"path{args.path_choice}",
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
