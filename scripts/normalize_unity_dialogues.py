#!/usr/bin/env python3
"""Normalise les dialogues Unity JSON sur disque (Epic 5 retro T2).

Usage:
    python scripts/normalize_unity_dialogues.py [--apply] [--path Assets/Dialogue]

Par défaut dry-run : affiche validité avant/après sans écrire.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from services.unity_export_normalizer import prepare_unity_export_document
from services.unity_export_validation_service import validate_unity_export_document


def _process_file(path: Path, *, apply: bool) -> tuple[bool, bool]:
    """Traite un fichier JSON. Retourne (valid_before, valid_after)."""
    raw = json.loads(path.read_text(encoding="utf-8"))
    before = validate_unity_export_document(raw)
    prepared = prepare_unity_export_document(raw)
    after = validate_unity_export_document(prepared)
    if apply and not after.is_valid:
        print(f"  SKIP write (still invalid): {path.name} — {after.errors[:2]}")
    elif apply:
        path.write_text(
            json.dumps(prepared, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    return before.is_valid, after.is_valid


def main() -> int:
    """Point d'entrée CLI."""
    parser = argparse.ArgumentParser(description="Normalise les JSON Unity pour export.")
    parser.add_argument(
        "--path",
        type=Path,
        default=ROOT / "Assets" / "Dialogue",
        help="Répertoire contenant des *.json",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Écrit les fichiers normalisés (sinon dry-run)",
    )
    args = parser.parse_args()
    dialogue_dir: Path = args.path
    if not dialogue_dir.is_dir():
        print(f"Répertoire introuvable: {dialogue_dir}", file=sys.stderr)
        return 1

    files = sorted(dialogue_dir.glob("*.json"))
    if not files:
        print(f"Aucun JSON dans {dialogue_dir}")
        return 0

    fixed = 0
    for file_path in files:
        valid_before, valid_after = _process_file(file_path, apply=args.apply)
        status = "OK" if valid_after else "INVALID"
        delta = "" if valid_before == valid_after else (" → fixed" if valid_after else " → still invalid")
        print(f"{status:7} {file_path.name}{delta}")
        if not valid_before and valid_after:
            fixed += 1

    mode = "apply" if args.apply else "dry-run"
    print(f"\n{mode}: {len(files)} fichier(s), {fixed} corrigé(s) par normalisation")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
