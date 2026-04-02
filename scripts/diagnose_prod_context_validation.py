#!/usr/bin/env python3
"""Reproduit la validation GDD / context_config comme en ENVIRONMENT=production.

En développement, `npm run dev` ne fait qu'avertir si des champs sont invalides.
En production, la moindre erreur critique fait échouer le startup (voir api.main lifespan).

Usage (depuis la racine du repo) :
  npm run diagnose:prod-context
  .venv\\Scripts\\python scripts/diagnose_prod_context_validation.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
os.chdir(_ROOT)
sys.path.insert(0, str(_ROOT))

os.environ["ENVIRONMENT"] = "production"

if "pytest" not in sys.modules:
    from dotenv import load_dotenv

    load_dotenv()

os.environ["ENVIRONMENT"] = "production"

from api.container import ServiceContainer  # noqa: E402
from services.context_field_validator import ContextFieldValidator  # noqa: E402


def main() -> int:
    container = ServiceContainer()
    context_builder = container.get_context_builder()
    context_config = container.get_config_service().get_context_config()
    if not context_config:
        print("Aucun context_config — rien à valider.")
        return 0
    validator = ContextFieldValidator(context_builder)
    results = validator.validate_all_configs(context_config)
    total_errors = sum(1 for r in results.values() if r.has_errors())
    total_warnings = sum(1 for r in results.values() if r.has_warnings())
    print(
        f"Types avec erreurs (severite error): {total_errors} | avec avertissements: {total_warnings}. "
        "Les chemins GDD manquants sont des warnings — le startup prod ne bloque pas dessus."
    )
    if total_errors or total_warnings:
        print(validator.get_validation_report(context_config))
    if total_errors:
        print("\n=> Au moins un type a encore des issues severity=error (hors chemins GDD manquants).")
        return 1
    if total_warnings:
        print("\n=> OK pour le demarrage API : uniquement des avertissements (chemins filtres a l'execution).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
