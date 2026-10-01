"""Où vivent les données de benchmark — et pourquoi pas dans le worktree.

Le 2026-10-01, la suppression d'un worktree a emporté seize runs de septembre,
dont trois mesures complètes facturées. `data/benchmarks/` est en `.gitignore`
(rien ne le suit) et était résolu depuis la racine du **code courant**, c'est-à-dire
le worktree. Un banc dont la raison d'être est de comparer des runs dans le temps
ne peut pas stocker ses résultats dans un répertoire jetable.
"""

from __future__ import annotations

from pathlib import Path

import pytest

import constants
from constants import resolve_benchmarks_dir


def test_an_explicit_override_wins(monkeypatch: pytest.MonkeyPatch) -> None:
    """`BENCHMARK_DATA_DIR` décide, sans discussion.

    C'est la porte de sortie pour un déploiement, un disque dédié ou un test.
    """
    monkeypatch.setenv("BENCHMARK_DATA_DIR", "/ailleurs/bench")

    assert resolve_benchmarks_dir() == Path("/ailleurs/bench")


def test_blank_override_is_ignored(monkeypatch: pytest.MonkeyPatch) -> None:
    """Une variable vide ou blanche ne doit pas faire écrire à la racine."""
    monkeypatch.setenv("BENCHMARK_DATA_DIR", "   ")

    assert resolve_benchmarks_dir() != Path("")
    assert resolve_benchmarks_dir().name == "benchmarks"


def test_a_worktree_writes_into_the_main_checkout(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Depuis un worktree, les données vont au dépôt principal.

    Dans un worktree, `.git` est un **fichier** pointant vers
    `<principal>/.git/worktrees/<nom>`. C'est de là qu'on remonte, sans
    sous-processus git.
    """
    monkeypatch.delenv("BENCHMARK_DATA_DIR", raising=False)
    principal = tmp_path / "depot"
    (principal / ".git" / "worktrees" / "essai").mkdir(parents=True)
    worktree = tmp_path / "wt"
    worktree.mkdir()
    (worktree / ".git").write_text(
        "gitdir: " + str(principal / ".git" / "worktrees" / "essai"),
        encoding="utf-8",
    )
    monkeypatch.setattr(constants, "_REPO_ROOT", worktree)

    assert resolve_benchmarks_dir() == principal / "data" / "benchmarks"


def test_an_ordinary_checkout_stays_where_it_is(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Hors worktree, `.git` est un répertoire : rien à remonter."""
    monkeypatch.delenv("BENCHMARK_DATA_DIR", raising=False)
    (tmp_path / ".git").mkdir()
    monkeypatch.setattr(constants, "_REPO_ROOT", tmp_path)

    assert resolve_benchmarks_dir() == tmp_path / "data" / "benchmarks"


def test_an_unreadable_git_marker_does_not_raise(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Un `.git` illisible ou inattendu retombe sur la racine courante.

    Une archive téléchargée, un `.git` tronqué : le banc doit démarrer quand même.
    """
    monkeypatch.delenv("BENCHMARK_DATA_DIR", raising=False)
    (tmp_path / ".git").write_text("ceci n'est pas un pointeur", encoding="utf-8")
    monkeypatch.setattr(constants, "_REPO_ROOT", tmp_path)

    assert resolve_benchmarks_dir() == tmp_path / "data" / "benchmarks"
