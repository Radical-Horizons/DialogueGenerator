"""Bootstrap manuel : précompile toutes les fiches GDD en cache disque."""
from __future__ import annotations

import argparse
import logging
import sys

from core.context.context_builder import ContextBuilder
from services.gdd_context_precompile import (
    clear_precompile_context_builder,
    precompile_all_entities,
)

logger = logging.getLogger(__name__)


def main(argv: list[str] | None = None) -> int:
    """Point d'entrée CLI."""
    parser = argparse.ArgumentParser(
        description="Précompile les fiches de contexte GDD (tokens + ContextItem JSON)."
    )
    parser.add_argument(
        "--category",
        help="Limiter à un stem de catégorie (ex. personnages, lieux).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Compte les entités sans écrire le cache.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Invalide le cache existant par entité avant recompilation.",
    )
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    clear_precompile_context_builder()
    context_builder = ContextBuilder()
    context_builder.load_gdd_files()
    gdd_data = context_builder._gdd_data
    if gdd_data is None:
        logger.error("GDD non chargé — abandon.")
        return 1

    count = precompile_all_entities(
        context_builder,
        gdd_data,
        category_filter=args.category,
        dry_run=args.dry_run,
        force=args.force,
    )
    logger.info("Terminé : %d entités", count)
    return 0


if __name__ == "__main__":
    sys.exit(main())
