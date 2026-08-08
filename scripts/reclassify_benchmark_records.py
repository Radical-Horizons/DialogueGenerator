"""Reclasse les générations mal étiquetées ``config_error`` en ``invalid``.

Les runs produits **avant** le correctif de classification rangeaient toute
erreur de l'orchestrateur en ``config_error`` — y compris les cas où le modèle
avait bel et bien répondu quelque chose d'inexploitable. Or ``config_error`` est
exclu du dénominateur du taux de validité : ces runs affichent donc des taux
flatteurs, et des modèles « sans aucune tentative » là où ils ont échoué.

Ce script ne touche qu'aux enregistrements dont le message d'erreur porte la
signature d'une sortie non conforme. Il ne réécrit **aucune note**, ne supprime
rien, et conserve le message d'origine : la trace de ce qui s'est passé reste
intacte, seule l'étiquette change.

Usage::

    python scripts/reclassify_benchmark_records.py            # aperçu seul
    python scripts/reclassify_benchmark_records.py --apply    # écrit
    python scripts/reclassify_benchmark_records.py --apply --run-id 2026...
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

MODEL_OUTPUT_SIGNATURES: Tuple[str, ...] = (
    "structured output exploitable",
    "non conforme",
    "Réponse vide ou inattendue",
    "aucune variante",
)
"""Marqueurs d'une sortie produite **par le modèle** et jugée inexploitable.

Volontairement restrictif : une panne d'environnement (clé absente, API
injoignable, budget épuisé) ne porte aucun de ces textes et doit rester
``config_error`` — l'imputer au modèle ferait chuter son taux pour une raison
sans rapport avec sa qualité.
"""


def _is_model_output_failure(message: Optional[str]) -> bool:
    """Indique si l'échec est imputable au modèle.

    Args:
        message: Message d'erreur enregistré.

    Returns:
        ``True`` si le modèle a répondu quelque chose d'inexploitable.
    """
    if not message:
        return False
    return any(signature in message for signature in MODEL_OUTPUT_SIGNATURES)


def reclassify_file(path: Path, *, apply: bool) -> Optional[Tuple[str, str]]:
    """Reclasse un enregistrement de génération si nécessaire.

    Args:
        path: Fichier d'enregistrement.
        apply: Écrit sur disque si ``True``, simule sinon.

    Returns:
        ``(model_id, case_id)`` si l'enregistrement est concerné, ``None`` sinon.
    """
    try:
        record = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        print(f"  ! illisible : {path.name} ({exc})", file=sys.stderr)
        return None
    if not isinstance(record, dict) or record.get("status") != "config_error":
        return None
    if not _is_model_output_failure(record.get("error_message")):
        return None

    record["status"] = "invalid"
    gates: List[Dict[str, str]] = list(record.get("gate_failures") or [])
    if not any(entry.get("gate") == "schema" for entry in gates):
        gates.append(
            {
                "gate": "schema",
                "message": record.get("error_message") or "Sortie non conforme au schéma",
            }
        )
    record["gate_failures"] = gates
    if apply:
        path.write_text(
            json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    return record.get("model_id", "?"), record.get("case_id", "?")


def main() -> int:
    """Point d'entrée.

    Returns:
        Code de sortie du processus.
    """
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="écrit réellement (défaut : aperçu)")
    parser.add_argument("--run-id", default=None, help="limite à un run")
    parser.add_argument(
        "--runs-dir",
        default="data/benchmarks/runs",
        help="répertoire des runs (défaut : data/benchmarks/runs)",
    )
    args = parser.parse_args()

    root = Path(args.runs_dir)
    if not root.is_dir():
        print(f"Répertoire introuvable : {root}", file=sys.stderr)
        return 1

    runs = [root / args.run_id] if args.run_id else sorted(p for p in root.iterdir() if p.is_dir())
    touched = 0
    for run_dir in runs:
        changed: List[Tuple[str, str]] = []
        for path in sorted(run_dir.rglob("*.json")):
            if path.name == "run.json":
                continue
            result = reclassify_file(path, apply=args.apply)
            if result:
                changed.append(result)
        if changed:
            touched += len(changed)
            print(f"{run_dir.name} : {len(changed)} enregistrement(s)")
            for model_id, case_id in changed:
                print(f"    {model_id} / {case_id}  config_error -> invalid (porte schema)")

    if not touched:
        print("Aucun enregistrement à reclasser.")
    elif not args.apply:
        print(f"\nAperçu seul — relancer avec --apply pour écrire ({touched} enregistrement(s)).")
    else:
        print(f"\n{touched} enregistrement(s) reclassé(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
