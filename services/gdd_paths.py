"""Chemins canoniques vers les données GDD sur disque (Windows-first, pathlib)."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional


def resolve_gdd_categories_path(project_root: Optional[Path] = None) -> Path:
    """Retourne le répertoire des catégories GDD (env ``GDD_CATEGORIES_PATH`` ou ``data/GDD_categories``).

    Args:
        project_root: Racine du dépôt DialogueGenerator. Si None, parent du package ``services``.

    Returns:
        Chemin absolu vers les catégories GDD.
    """
    env = os.getenv("GDD_CATEGORIES_PATH", "").strip()
    if env:
        return Path(env)
    root = project_root or Path(__file__).resolve().parent.parent
    return root / "data" / "GDD_categories"
