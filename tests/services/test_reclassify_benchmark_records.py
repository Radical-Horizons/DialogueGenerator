"""Tests du script de reclassement des générations mal étiquetées.

L'outil réécrit des enregistrements de mesure : il doit être **narrow** (ne
toucher qu'aux échecs imputables au modèle), **idempotent** (relançable sans
dégât) et **non destructif** (le message d'origine survit).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

from reclassify_benchmark_records import reclassify_file  # noqa: E402


def _write(path: Path, **overrides: object) -> Path:
    """Écrit un enregistrement de génération minimal."""
    record = {
        "run_id": "run-1",
        "case_id": "voknir",
        "model_id": "mistralai/mistral-medium-3-5",
        "repetition": 0,
        "status": "config_error",
        "gate_failures": [],
        "error_message": "Le modèle n'a pas retourné de structured output exploitable.",
    }
    record.update(overrides)
    path.write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")
    return path


def test_model_output_failure_becomes_invalid(tmp_path: Path) -> None:
    """Le modèle a répondu quelque chose d'inexploitable : il a été mesuré."""
    path = _write(tmp_path / "g.json")
    assert reclassify_file(path, apply=True) is not None

    record = json.loads(path.read_text(encoding="utf-8"))
    assert record["status"] == "invalid"
    assert [entry["gate"] for entry in record["gate_failures"]] == ["schema"]
    # La trace de ce qui s'est passé ne doit pas disparaître avec l'étiquette.
    assert "structured output exploitable" in record["error_message"]


@pytest.mark.parametrize(
    "message",
    [
        "Clé API absente pour ce modèle",
        "ConnectionError: API injoignable",
        "Plafond budgétaire atteint",
    ],
)
def test_environment_failures_are_left_alone(tmp_path: Path, message: str) -> None:
    """Une panne d'environnement reste `config_error` : elle n'est pas du modèle."""
    path = _write(tmp_path / "g.json", error_message=message)
    assert reclassify_file(path, apply=True) is None
    assert json.loads(path.read_text(encoding="utf-8"))["status"] == "config_error"


def test_valid_records_are_never_touched(tmp_path: Path) -> None:
    """Une génération valide n'a rien à voir avec ce script."""
    path = _write(tmp_path / "g.json", status="valid", error_message=None)
    assert reclassify_file(path, apply=True) is None
    assert json.loads(path.read_text(encoding="utf-8"))["status"] == "valid"


def test_dry_run_writes_nothing(tmp_path: Path) -> None:
    """L'aperçu doit rester un aperçu : par défaut, aucun octet n'est écrit."""
    path = _write(tmp_path / "g.json")
    before = path.read_text(encoding="utf-8")

    assert reclassify_file(path, apply=False) is not None
    assert path.read_text(encoding="utf-8") == before


def test_second_pass_changes_nothing(tmp_path: Path) -> None:
    """Idempotence : relancer ne doit pas empiler une seconde porte."""
    path = _write(tmp_path / "g.json")
    reclassify_file(path, apply=True)
    after_first = path.read_text(encoding="utf-8")

    assert reclassify_file(path, apply=True) is None
    assert path.read_text(encoding="utf-8") == after_first
