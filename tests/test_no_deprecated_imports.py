"""Test de non-régression : aucun import déprécié (racine) dans le code Python.

Vérifie qu'aucun fichier .py n'utilise les anciens chemins d'import racine
(context_builder, prompt_engine, llm_client) pour éviter la réintroduction
de dette technique et préparer la suppression des wrappers en v2.0.
"""
from pathlib import Path
import re

import pytest


# Répertoire racine du projet (DialogueGenerator)
PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Imports dépréciés : patterns à détecter (ligne entière ou dans une ligne)
DEPRECATED_PATTERNS = [
    (re.compile(r"from\s+context_builder\s+import"), "from context_builder import"),
    (re.compile(r"from\s+prompt_engine\s+import"), "from prompt_engine import"),
    (re.compile(r"from\s+llm_client\s+import"), "from llm_client import"),
    (re.compile(r"import\s+context_builder\b"), "import context_builder"),
    (re.compile(r"import\s+prompt_engine\b"), "import prompt_engine"),
    (re.compile(r"import\s+llm_client\b"), "import llm_client"),
]

# Fichiers ou dossiers exclus (wrappers de compatibilité, docs, ce test)
EXCLUDED_PATHS = {
    "context_builder.py",       # wrapper racine
    "config_manager.py",        # wrapper racine
    "prompt_engine.py",         # wrapper racine si présent
    "llm_client.py",            # wrapper racine si présent
    "test_no_deprecated_imports.py",  # contient les patterns à détecter
}
EXCLUDED_DIRS = {
    ".git",
    ".venv",
    "venv",
    "__pycache__",
    ".pytest_cache",
    "node_modules",
    "_bmad",
    "_bmad-output",
    ".cursor",
    "docs",  # exemples dans la doc
}


def _is_excluded_file(path: Path) -> bool:
    """Retourne True si le fichier doit être exclu du scan."""
    if path.name in EXCLUDED_PATHS:
        return True
    for part in path.parts:
        if part in EXCLUDED_DIRS:
            return True
    return False


def _collect_python_files() -> list[Path]:
    """Collecte tous les fichiers .py sous PROJECT_ROOT (hors exclus)."""
    collected: list[Path] = []
    for path in PROJECT_ROOT.rglob("*.py"):
        try:
            rel = path.relative_to(PROJECT_ROOT)
        except ValueError:
            continue
        if _is_excluded_file(path):
            continue
        collected.append(path)
    return sorted(collected)


def _check_file(path: Path) -> list[tuple[int, str, str]]:
    """Vérifie un fichier pour la présence d'imports dépréciés. Retourne liste (ligne, pattern_desc, ligne_raw)."""
    violations: list[tuple[int, str, str]] = []
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return violations
    for i, line in enumerate(text.splitlines(), start=1):
        # Ignorer les lignes purement commentées (commentaire en début de ligne)
        stripped = line.strip()
        if stripped.startswith("#"):
            continue
        for pattern, desc in DEPRECATED_PATTERNS:
            if pattern.search(line):
                violations.append((i, desc, line.strip()))
                break
    return violations


@pytest.mark.unit
def test_no_deprecated_root_imports():
    """Aucun fichier Python ne doit importer depuis les modules racine dépréciés.

    Imports attendus à la place :
    - from core.context.context_builder import ...
    - from core.prompt.prompt_engine import ...
    - from core.llm.llm_client import ...
    """
    all_violations: list[tuple[Path, int, str, str]] = []
    for path in _collect_python_files():
        for line_no, pattern_desc, line_content in _check_file(path):
            all_violations.append((path, line_no, pattern_desc, line_content))

    if not all_violations:
        return

    rel_paths = [str(p.relative_to(PROJECT_ROOT)) for p, _, _, _ in all_violations]
    lines_msg = "\n".join(
        f"  {p.relative_to(PROJECT_ROOT)}:{ln}: {desc} -> {content!r}"
        for p, ln, desc, content in all_violations
    )
    pytest.fail(
        f"Imports dépréciés (racine) détectés dans {len(all_violations)} endroit(s).\n"
        f"Utiliser les chemins core.* à la place.\n\n{lines_msg}"
    )
