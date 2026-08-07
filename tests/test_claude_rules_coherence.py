"""Cohérence du harnais Claude : une règle qui se dit « toujours active » doit l'être.

Claude Code ne connaît pas `.claude/rules/` : ce dossier est une convention propre
au dépôt, héritée de Cursor. Seuls sont chargés automatiquement `CLAUDE.md` et les
fichiers qu'il importe via `@chemin`. Le frontmatter `alwaysApply: true` est un
vestige de Cursor — il est **documentaire et n'active rien**.

D'où un mode de panne silencieux, déjà rencontré : `branching.md` déclarait
`alwaysApply: true`, disait « toute PR cible dev, jamais main »… et n'était importée
nulle part. Elle n'a donc jamais été lue, et une PR a failli partir vers `main`.

Ce test rend l'écart bruyant : toute règle qui se déclare toujours active doit être
importée dans `CLAUDE.md`, sinon elle ment sur son propre statut.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CLAUDE_MD = PROJECT_ROOT / "CLAUDE.md"
RULES_DIR = PROJECT_ROOT / ".claude" / "rules"

#: `alwaysApply` n'a de sens que dans le frontmatter, en tête de fichier.
FRONTMATTER_PATTERN = re.compile(r"\A---\n(.*?)\n---", re.DOTALL)
IMPORT_PATTERN = re.compile(r"@\.claude/rules/([\w\-]+)\.md")
ROUTING_PATTERN = re.compile(r"`\.claude/rules/([\w\-]+)\.md`")


def _frontmatter(chemin: Path) -> str:
    """Retourne le bloc de frontmatter YAML d'un fichier, ou une chaîne vide."""
    match = FRONTMATTER_PATTERN.match(chemin.read_text(encoding="utf-8"))
    return match.group(1) if match else ""


def _regles_toujours_actives() -> list[str]:
    """Noms des règles dont le frontmatter déclare `alwaysApply: true`."""
    if not RULES_DIR.is_dir():
        return []
    return sorted(
        chemin.stem
        for chemin in RULES_DIR.glob("*.md")
        if "alwaysApply: true" in _frontmatter(chemin)
    )


@pytest.mark.p0
def test_toute_regle_toujours_active_est_importee_dans_claude_md() -> None:
    """Une règle `alwaysApply: true` non importée n'est jamais chargée."""
    contenu = CLAUDE_MD.read_text(encoding="utf-8")
    importees = set(IMPORT_PATTERN.findall(contenu))

    manquantes = [nom for nom in _regles_toujours_actives() if nom not in importees]

    assert not manquantes, (
        "Ces règles déclarent `alwaysApply: true` mais ne sont importées nulle part "
        "dans CLAUDE.md — elles ne seront donc jamais chargées :\n"
        + "\n".join(f"  - .claude/rules/{nom}.md" for nom in manquantes)
        + "\n\nAjoute `@.claude/rules/<nom>.md` dans CLAUDE.md, ou retire "
        "`alwaysApply: true` du frontmatter si la règle est conditionnelle."
    )


@pytest.mark.p0
def test_toute_regle_est_atteignable() -> None:
    """Une règle ni importée ni routée est invisible : personne ne la lira."""
    if not RULES_DIR.is_dir():
        pytest.skip("Pas de dossier .claude/rules dans ce dépôt")

    contenu = CLAUDE_MD.read_text(encoding="utf-8")
    atteignables = set(IMPORT_PATTERN.findall(contenu)) | set(
        ROUTING_PATTERN.findall(contenu)
    )

    orphelines = sorted(
        chemin.stem
        for chemin in RULES_DIR.glob("*.md")
        if chemin.stem not in atteignables
    )

    assert not orphelines, (
        "Ces règles ne sont ni importées ni citées dans la table de routage de "
        "CLAUDE.md — elles ne seront jamais lues :\n"
        + "\n".join(f"  - .claude/rules/{nom}.md" for nom in orphelines)
    )
