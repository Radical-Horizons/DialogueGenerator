#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Search and peek Cursor agent transcript JSONL files (local Cursor data, not in git).

Typical transcript root (Windows)::

    %USERPROFILE%\\.cursor\\projects\\<workspace-slug>\\agent-transcripts

Use ``list`` to see recent sessions, ``search`` to grep across all .jsonl, ``peek`` to
read one logical line without loading the whole file into editor tools.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Iterator


def discover_transcript_roots(*, project_substring: str) -> list[Path]:
    """Return ``agent-transcripts`` directories under ``~/.cursor/projects`` matching the filter.

    Args:
        project_substring: Case-sensitive substring of the project folder name (e.g. ``DialogueGenerator``).

    Returns:
        Sorted list of existing ``agent-transcripts`` directory paths.
    """
    home = Path.home()
    projects = home / ".cursor" / "projects"
    if not projects.is_dir():
        return []
    roots: list[Path] = []
    for child in sorted(projects.iterdir()):
        if not child.is_dir():
            continue
        if project_substring and project_substring not in child.name:
            continue
        at = child / "agent-transcripts"
        if at.is_dir():
            roots.append(at)
    return roots


def iter_jsonl_files(root: Path) -> Iterator[Path]:
    """Yield all ``*.jsonl`` files under root (recursive)."""
    yield from sorted(root.rglob("*.jsonl"))


def extract_text_chunks(record: dict[str, Any]) -> list[str]:
    """Pull plain text parts from a Cursor transcript JSON object (best-effort)."""
    out: list[str] = []
    msg = record.get("message")
    if not isinstance(msg, dict):
        return out
    content = msg.get("content")
    if not isinstance(content, list):
        return out
    for block in content:
        if not isinstance(block, dict):
            continue
        if block.get("type") != "text":
            continue
        t = block.get("text")
        if isinstance(t, str) and t:
            out.append(t)
    return out


def cmd_list(roots: list[Path], *, limit: int) -> int:
    """Print the most recently modified transcript files across all roots."""
    found: list[tuple[float, Path]] = []
    for root in roots:
        for p in iter_jsonl_files(root):
            try:
                mtime = p.stat().st_mtime
            except OSError:
                continue
            found.append((mtime, p))
    found.sort(key=lambda x: x[0], reverse=True)
    for mtime, p in found[:limit]:
        print(f"{mtime:.0f}\t{p}")
    return 0


def cmd_search(roots: list[Path], pattern: str, *, max_matches: int, preview: int) -> int:
    """Search each JSONL line for a regex; print path, line number, truncated preview."""
    try:
        rx = re.compile(pattern, re.IGNORECASE | re.DOTALL)
    except re.error as e:
        print(f"[erreur] regex invalide: {e}", file=sys.stderr)
        return 2
    matches = 0
    for root in roots:
        for path in iter_jsonl_files(root):
            try:
                with path.open(encoding="utf-8", errors="replace") as handle:
                    for lineno, line in enumerate(handle, 1):
                        if not line.strip():
                            continue
                        m = rx.search(line)
                        if not m:
                            continue
                        start = max(0, m.start() - 24)
                        end = min(len(line), m.end() + preview)
                        snippet = line[start:end].replace("\n", "\\n")
                        if len(line) > end or start > 0:
                            snippet += "…"
                        print(f"{path}:{lineno}:{snippet}")
                        matches += 1
                        if matches >= max_matches:
                            return 0
            except OSError as e:
                print(f"[avertissement] {path}: {e}", file=sys.stderr)
    return 0


def cmd_peek(
    path: Path,
    *,
    line_1based: int,
    max_chars: int,
    raw: bool,
) -> int:
    """Print one line from a JSONL file, optionally decoded to transcript text only."""
    if not path.is_file():
        print(f"[erreur] fichier introuvable: {path}", file=sys.stderr)
        return 2
    if line_1based < 1:
        print("[erreur] --line doit être >= 1", file=sys.stderr)
        return 2
    with path.open(encoding="utf-8", errors="replace") as handle:
        for i, line in enumerate(handle, 1):
            if i != line_1based:
                continue
            line = line.rstrip("\n")
            if raw:
                body = line
            else:
                try:
                    record = json.loads(line)
                except json.JSONDecodeError as e:
                    print(f"[erreur] JSON ligne {line_1based}: {e}", file=sys.stderr)
                    return 2
                chunks = extract_text_chunks(record)
                body = "\n---\n".join(chunks) if chunks else line
            if len(body) <= max_chars:
                print(body)
            else:
                print(body[:max_chars])
                print("\n… [tronqué]", file=sys.stderr)
            return 0
    print(f"[erreur] pas de ligne {line_1based} dans {path}", file=sys.stderr)
    return 2


def resolve_roots(args: argparse.Namespace) -> list[Path]:
    """Return transcript roots from ``--root`` or auto-discovery."""
    if args.root is not None:
        r = args.root.expanduser().resolve()
        if not r.is_dir():
            print(f"[erreur] --root n'est pas un dossier: {r}", file=sys.stderr)
            sys.exit(2)
        return [r]
    roots = discover_transcript_roots(project_substring=args.project_substring)
    if not roots:
        print(
            "[erreur] Aucun dossier agent-transcripts trouvé sous "
            f"{Path.home() / '.cursor' / 'projects'} "
            f"(filtre nom projet: {args.project_substring!r}). "
            "Passez --root explicitement.",
            file=sys.stderr,
        )
        sys.exit(2)
    if len(roots) > 1:
        print(
            "[info] Plusieurs racines trouvées ; toutes seront utilisées :",
            *[f"  - {x}" for x in roots],
            sep="\n",
        )
    return roots


def build_parser() -> argparse.ArgumentParser:
    """Construct the CLI argument parser."""
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument(
        "--root",
        type=Path,
        default=None,
        help="Dossier agent-transcripts (sinon auto-découverte sous ~/.cursor/projects).",
    )
    common.add_argument(
        "--project-substring",
        default="DialogueGenerator",
        help="Filtre sur le nom du dossier projet Cursor (auto-découverte). Vide = tous les projets.",
    )

    parser = argparse.ArgumentParser(
        description="Recherche et extrait des lignes dans les transcripts Cursor (.jsonl).",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_list = sub.add_parser("list", parents=[common], help="Lister les fichiers .jsonl récents.")
    p_list.add_argument("--limit", type=int, default=40, help="Nombre max de fichiers à afficher.")

    p_search = sub.add_parser("search", parents=[common], help="Rechercher une regex dans toutes les lignes.")
    p_search.add_argument("pattern", help="Expression régulière Python (DOTALL activé).")
    p_search.add_argument("--max-matches", type=int, default=80, help="Arrêt après N correspondances.")
    p_search.add_argument(
        "--preview",
        type=int,
        default=200,
        help="Caractères max après la correspondance dans l'aperçu.",
    )

    p_peek = sub.add_parser("peek", parents=[common], help="Afficher une ligne (texte extrait par défaut).")
    p_peek.add_argument("file", type=Path, help="Chemin vers un fichier .jsonl.")
    p_peek.add_argument("--line", type=int, required=True, help="Numéro de ligne (base 1).")
    p_peek.add_argument("--max-chars", type=int, default=16_000, help="Tronquer la sortie après N caractères.")
    p_peek.add_argument(
        "--raw",
        action="store_true",
        help="Afficher la ligne brute JSON au lieu du texte extrait.",
    )

    return parser


def main(argv: list[str] | None = None) -> int:
    """CLI entry point."""
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command == "peek":
        return cmd_peek(
            args.file.expanduser().resolve(),
            line_1based=args.line,
            max_chars=args.max_chars,
            raw=args.raw,
        )

    roots = resolve_roots(args)
    if args.command == "list":
        return cmd_list(roots, limit=args.limit)
    if args.command == "search":
        return cmd_search(roots, args.pattern, max_matches=args.max_matches, preview=args.preview)
    raise RuntimeError(f"commande inattendue: {args.command}")


if __name__ == "__main__":
    raise SystemExit(main())
