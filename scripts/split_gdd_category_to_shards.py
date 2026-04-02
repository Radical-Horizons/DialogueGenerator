#!/usr/bin/env python3
"""CLI : découpe un JSON monolithique GDD (liste) en fichiers un par fiche (shards).

Voir :func:`services.gdd_category_shard_split.split_category_to_shards`.

Usage:
    python scripts/split_gdd_category_to_shards.py --category personnages
    python scripts/split_gdd_category_to_shards.py --category lieux --dry-run
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from services.gdd_category_shard_split import split_category_to_shards  # noqa: E402

logger = logging.getLogger(__name__)


def main() -> int:
    """Point d'entrée CLI."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--categories-path",
        type=Path,
        default=None,
        help="Répertoire GDD_categories (défaut: env GDD_CATEGORIES_PATH ou data/GDD_categories)",
    )
    parser.add_argument(
        "--category",
        required=True,
        help="Clé catégorie (ex. personnages, lieux)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="N'écrire aucun fichier, journaliser seulement",
    )
    args = parser.parse_args()
    cat_path = args.categories_path
    if cat_path is None:
        env = os.getenv("GDD_CATEGORIES_PATH")
        cat_path = Path(env) if env else _PROJECT_ROOT / "data" / "GDD_categories"
    cat_path = cat_path.resolve()
    try:
        n = split_category_to_shards(
            cat_path,
            args.category.strip().lower(),
            dry_run=bool(args.dry_run),
        )
    except (FileNotFoundError, ValueError) as e:
        logger.error("%s", e)
        return 1
    print(f"OK — {n} fichier(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
