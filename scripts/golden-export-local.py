#!/usr/bin/env python3
"""Contrôle local de l'export Unity sur les dialogues réels (Story 20.1, hors CI).

Passe chaque dialogue de ``Assets/Dialogue/`` par le chemin ``python-lot`` du golden
(``export_persisted_document``), avec le rendu et la comparaison de
``tests/services/test_unity_export_golden.py``. Les autres chemins ne s'y prêtent pas :
``python-graphe`` lit le corps figé par Vitest, et les chemins front tournent sous Vitest.

Usage (racine du dépôt) :
    .venv/Scripts/python.exe scripts/golden-export-local.py --snapshot
    .venv/Scripts/python.exe scripts/golden-export-local.py --check

``--snapshot`` écrit les sorties dans ``tmp/golden-local/python-lot/`` et la source dans
``tmp/golden-local/source.txt`` (avant un
changement) ; ``--check`` les recompare (après) et liste les écarts, code de sortie 1
s'il y en a. ``--source`` change le dossier lu ; par défaut ``Assets/Dialogue/`` du
dépôt principal (même depuis un worktree), sinon celui du dépôt courant.
"""
from __future__ import annotations

import argparse
import logging
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import List, Optional

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tests.services.test_unity_export_golden import (  # noqa: E402
    compare_with_golden,
    read_input,
    render,
)

PATH_NAME = "python-lot"
SNAPSHOT_DIR = ROOT / "tmp" / "golden-local"
SOURCE_FILE = SNAPSHOT_DIR / "source.txt"
EXTENSIONS = (".json", ".error.txt")


def default_source_dir() -> Optional[Path]:
    """Dossier ``Assets/Dialogue`` du dépôt principal, sinon celui de ``ROOT``.

    Depuis un worktree, le dépôt principal passe d'abord : le dossier du worktree ne
    contient que les restes des e2e, pas les dialogues de l'auteur.

    Returns:
        Le premier dossier existant qui contient des ``*.json``, ou ``None``.
    """
    candidates: List[Path] = []
    try:
        common = subprocess.run(
            ["git", "-C", str(ROOT), "rev-parse", "--path-format=absolute", "--git-common-dir"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
        candidates.append(Path(common).parent / "Assets" / "Dialogue")
    except (OSError, subprocess.CalledProcessError) as exc:
        logging.getLogger(__name__).debug("git indisponible pour trouver le dépôt principal: %s", exc)
    candidates.append(ROOT / "Assets" / "Dialogue")
    for candidate in candidates:
        if candidate.is_dir() and any(candidate.glob("*.json")):
            return candidate
    return None


def _has_snapshot(snapshot_dir: Path, dialogue: str) -> bool:
    """True si l'instantané contient une sortie (``.json`` ou ``.error.txt``) pour ce dialogue."""
    return any((snapshot_dir / PATH_NAME / f"{dialogue}{ext}").exists() for ext in EXTENSIONS)


def run(source: Path, snapshot_dir: Path, update: bool) -> List[str]:
    """Rend chaque dialogue par le chemin lot ; écrit ou compare selon ``update``.

    Args:
        source: Dossier des dialogues ``*.json``.
        snapshot_dir: Racine des sorties de référence locales.
        update: ``True`` pour écrire l'instantané, ``False`` pour comparer.

    Returns:
        Les messages d'écart (vide si aucun, ou en mode instantané).
    """
    problems: List[str] = []
    dialogues = sorted(p.stem for p in source.glob("*.json"))
    with tempfile.TemporaryDirectory(prefix="golden-local-") as work:
        for index, dialogue in enumerate(dialogues):
            if not update and not _has_snapshot(snapshot_dir, dialogue):
                problems.append(
                    f"golden {dialogue} / {PATH_NAME} : dialogue nouveau, absent de "
                    f"l'instantané — relancer --snapshot"
                )
                continue
            raw = read_input(dialogue, source)
            extension, text = render(PATH_NAME, raw, dialogue, Path(work) / str(index))
            message = compare_with_golden(
                PATH_NAME,
                dialogue,
                extension,
                text,
                expected_dir=snapshot_dir,
                update=update,
            )
            if message:
                problems.append(message)
    if not update:
        known = set(dialogues)
        for stale in sorted((snapshot_dir / PATH_NAME).glob("*")):
            stem = stale.name.removesuffix(".error.txt").removesuffix(".json")
            if stem not in known:
                problems.append(f"golden {stem} / {PATH_NAME} : dialogue retiré de {source}")
    print(f"{len(dialogues)} dialogues par le chemin {PATH_NAME} depuis {source}")
    return problems


def main(argv: Optional[List[str]] = None) -> int:
    """Point d'entrée CLI.

    Args:
        argv: Arguments (``sys.argv[1:]`` par défaut).

    Returns:
        0 si aucun écart, 1 si écarts, 2 si source introuvable, instantané absent ou pris
        depuis une autre source.
    """
    parser = argparse.ArgumentParser(description=(__doc__ or "").strip().split("\n")[0])
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--snapshot", action="store_true", help="écrit tmp/golden-local/")
    mode.add_argument("--check", action="store_true", help="compare à tmp/golden-local/")
    parser.add_argument("--source", type=Path, default=None, help="dossier des dialogues")
    args = parser.parse_args(argv)
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            reconfigure(encoding="utf-8")

    # Le chemin journalise ses erreurs avec la pile ; elles sont déjà figées dans les
    # .error.txt, inutile de les répéter sur la console.
    logging.getLogger().addHandler(logging.NullHandler())

    source = args.source or default_source_dir()
    if source is None or not source.is_dir():
        print("Dossier Assets/Dialogue introuvable ; préciser --source.", file=sys.stderr)
        return 2
    resolved = str(source.resolve())
    if args.check:
        if not (SNAPSHOT_DIR / PATH_NAME).is_dir():
            print(f"Aucun instantané dans {SNAPSHOT_DIR} : lancer d'abord --snapshot.", file=sys.stderr)
            return 2
        recorded = SOURCE_FILE.read_text(encoding="utf-8").strip() if SOURCE_FILE.exists() else None
        if recorded != resolved:
            print(
                f"Instantané pris depuis {recorded or 'une source inconnue'}, pas depuis "
                f"{resolved} : relancer --snapshot ou préciser --source.",
                file=sys.stderr,
            )
            return 2

    if args.snapshot and SNAPSHOT_DIR.exists():
        shutil.rmtree(SNAPSHOT_DIR)
    problems = run(source, SNAPSHOT_DIR, update=args.snapshot)
    if args.snapshot:
        SOURCE_FILE.write_text(resolved + "\n", encoding="utf-8")
        print(f"Instantané écrit dans {SNAPSHOT_DIR}")
        return 0
    for message in problems:
        print(message)
    print(f"{len(problems)} écart(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
