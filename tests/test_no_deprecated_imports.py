"""Test de non-régression : aucun import déprécié (racine) dans le code Python.

Vérifie qu'aucun fichier .py n'utilise les anciens chemins d'import racine
(context_builder, prompt_engine, llm_client) pour éviter la réintroduction
de dette technique et préparer la suppression des wrappers en v2.0.
"""
from pathlib import Path
import os
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

# Wrappers de compatibilité **à la racine** : ce sont eux qui portent légitimement
# les anciens noms. L'exclusion est ancrée sur le chemin relatif, pas sur le nom de
# fichier : sinon `core/context/context_builder.py`, `core/llm/llm_client.py`,
# `core/prompt/prompt_engine.py` et `services/config_manager.py` — les vrais modules —
# échappaient eux aussi au scan.
EXCLUDED_ROOT_FILES = {
    "context_builder.py",       # wrapper racine
    "config_manager.py",        # wrapper racine
    "prompt_engine.py",         # wrapper racine si présent
    "llm_client.py",            # wrapper racine si présent
}
# Exclu où qu'il soit : ce fichier contient les patterns recherchés.
EXCLUDED_ANY_DEPTH = {
    "test_no_deprecated_imports.py",
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
    ".claude",  # worktrees git : copies complètes du dépôt, avec leurs propres venv
    "tmp",
    "docs",  # exemples dans la doc
}


def _is_excluded_file(path: Path) -> bool:
    """Retourne True si le fichier doit être exclu du scan.

    Args:
        path: Chemin absolu du fichier candidat.

    Returns:
        True si le fichier est un wrapper racine, ce test lui-même, ou vit dans un
        répertoire exclu.
    """
    if path.name in EXCLUDED_ANY_DEPTH:
        return True
    try:
        rel = path.relative_to(PROJECT_ROOT)
    except ValueError:
        return True
    # `len(rel.parts) == 1` ⇒ le fichier est à la racine du projet.
    if len(rel.parts) == 1 and path.name in EXCLUDED_ROOT_FILES:
        return True
    for part in rel.parts:
        if part in EXCLUDED_DIRS:
            return True
    return False


def _collect_python_files() -> list[Path]:
    """Collecte tous les fichiers .py sous PROJECT_ROOT (hors exclus).

    ``os.walk`` et non ``rglob`` : ``rglob`` **descend** dans les répertoires exclus
    avant de filtrer. Sur ce dépôt cela signifiait parcourir ``.venv`` (4 300 .py) et
    ``.claude/worktrees`` (7 300 .py répartis sur trois copies complètes du dépôt,
    chacune avec son propre venv et ses node_modules) — le test dépassait dix minutes
    et bloquait la gate T2. Élaguer ``dirnames`` en place empêche la descente.
    """
    collected: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(PROJECT_ROOT):
        # Élagage en place : os.walk ne descendra pas dans ce qu'on retire ici.
        dirnames[:] = [d for d in dirnames if d not in EXCLUDED_DIRS]
        for filename in filenames:
            if not filename.endswith(".py"):
                continue
            path = Path(dirpath) / filename
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


@pytest.mark.unit
def test_scan_ignore_venv_worktrees_et_node_modules():
    """Le scan ne descend pas dans les arbres tiers.

    Régression : ``rglob`` descendait dans ``.venv`` (4 300 .py) et
    ``.claude/worktrees`` (3 copies complètes du dépôt) avant de filtrer — le test
    dépassait dix minutes et bloquait la gate T2.
    """
    rel_paths = [p.relative_to(PROJECT_ROOT).as_posix() for p in _collect_python_files()]

    for interdit in (".venv/", ".claude/", "node_modules/", "_bmad/", "docs/"):
        fuites = [r for r in rel_paths if r.startswith(interdit)]
        assert not fuites, f"{len(fuites)} fichier(s) scanné(s) sous {interdit}"


@pytest.mark.unit
def test_scan_couvre_le_vrai_code_applicatif():
    """Un scan rapide ne doit pas être un scan vide.

    Régression : l'exclusion des wrappers se faisait sur le **nom de fichier**, ce qui
    masquait aussi ``core/context/context_builder.py``, ``core/llm/llm_client.py``,
    ``core/prompt/prompt_engine.py`` et ``services/config_manager.py``.
    """
    rel_paths = {p.relative_to(PROJECT_ROOT).as_posix() for p in _collect_python_files()}

    attendus = {
        "api/main.py",
        "services/unity_dialogue_orchestrator.py",
        "core/context/context_builder.py",
        "core/llm/llm_client.py",
        "core/prompt/prompt_engine.py",
        "services/config_manager.py",
    }
    manquants = {chemin for chemin in attendus if chemin not in rel_paths}
    assert not manquants, f"modules réels absents du scan : {sorted(manquants)}"

    # Les wrappers **racine**, eux, restent exclus : ils portent les anciens noms.
    assert "context_builder.py" not in rel_paths
    assert "config_manager.py" not in rel_paths
