"""Tests du magasin de suites de benchmark."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict

import pytest
from pydantic import ValidationError

from api.schemas.benchmark import BenchmarkCase, BenchmarkSuite
from services.benchmark_suite_store import (
    BenchmarkSuiteInvalidError,
    BenchmarkSuiteNotFoundError,
    BenchmarkSuiteStore,
    suite_fingerprint,
)

MODEL_ID = "gpt-5.6-luna"


def _request_payload() -> Dict[str, Any]:
    """Requête de génération minimale acceptée par le schéma Unity."""
    return {
        "llm_model_identifier": MODEL_ID,
        "user_instructions": "Le marchand refuse de baisser son prix.",
        "context_selections": {"characters_full": ["Uresaïr"]},
    }


def _case(case_id: str = "marchandage-01") -> BenchmarkCase:
    """Cas de benchmark minimal."""
    return BenchmarkCase.model_validate(
        {
            "case_id": case_id,
            "title": "Marchandage tendu",
            "categories": {"ton": "grave", "fonction": "marchandage"},
            "request": _request_payload(),
        }
    )


@pytest.fixture
def store(tmp_path: Path) -> BenchmarkSuiteStore:
    """Magasin isolé dans un répertoire temporaire."""
    return BenchmarkSuiteStore(suites_dir=tmp_path / "suites")


def test_empty_suite_is_rejected_by_schema() -> None:
    """Une suite sans cas est refusée à la construction, pas au lancement du run."""
    with pytest.raises(ValidationError):
        BenchmarkSuite(suite_id="vide", cases=[])


def test_duplicate_case_ids_are_rejected() -> None:
    """Deux cas de même identifiant rendraient l'appariement ambigu."""
    with pytest.raises(ValidationError):
        BenchmarkSuite(suite_id="doublons", cases=[_case(), _case()])


def test_save_then_get_roundtrip(store: BenchmarkSuiteStore) -> None:
    """Une suite écrite est relue à l'identique."""
    saved = store.save_suite(BenchmarkSuite(suite_id="smoke", name="Fumée", cases=[_case()]))
    loaded = store.get_suite("smoke")
    assert loaded.suite_id == "smoke"
    assert loaded.version == saved.version
    assert [case.case_id for case in loaded.cases] == ["marchandage-01"]


def test_save_bumps_version(store: BenchmarkSuiteStore) -> None:
    """Chaque écriture incrémente la version, base de la comparabilité des runs."""
    first = store.save_suite(BenchmarkSuite(suite_id="smoke", cases=[_case()]))
    second = store.save_suite(BenchmarkSuite(suite_id="smoke", cases=[_case("autre-cas")]))
    assert first.version == 1
    assert second.version == 2


def test_get_with_wrong_version_is_rejected(store: BenchmarkSuiteStore) -> None:
    """Demander une version absente échoue explicitement."""
    store.save_suite(BenchmarkSuite(suite_id="smoke", cases=[_case()]))
    with pytest.raises(BenchmarkSuiteInvalidError):
        store.get_suite("smoke", version=99)


def test_missing_suite_raises_not_found(store: BenchmarkSuiteStore) -> None:
    """Une suite absente ne retourne pas une suite vide silencieuse."""
    with pytest.raises(BenchmarkSuiteNotFoundError):
        store.get_suite("inconnue")


def test_path_traversal_suite_id_is_rejected(store: BenchmarkSuiteStore) -> None:
    """Un identifiant de suite ne peut pas sortir du répertoire de stockage."""
    with pytest.raises(BenchmarkSuiteInvalidError):
        store.get_suite("../../etc/passwd")


def test_list_suites_returns_summaries(store: BenchmarkSuiteStore) -> None:
    """Le listage expose le nombre de cas sans charger les requêtes."""
    store.save_suite(BenchmarkSuite(suite_id="smoke", name="Fumée", cases=[_case()]))
    summaries = store.list_suites()
    assert len(summaries) == 1
    assert summaries[0].case_count == 1
    assert summaries[0].name == "Fumée"


def test_delete_suite(store: BenchmarkSuiteStore) -> None:
    """La suppression est effective et idempotente en retour booléen."""
    store.save_suite(BenchmarkSuite(suite_id="smoke", cases=[_case()]))
    assert store.delete_suite("smoke") is True
    assert store.delete_suite("smoke") is False


def test_import_suite_validates_payload(store: BenchmarkSuiteStore) -> None:
    """Un import invalide échoue avec un message, jamais en silence."""
    with pytest.raises(BenchmarkSuiteInvalidError):
        store.import_suite({"suite_id": "cassee", "cases": []})


def test_fingerprint_ignores_timestamp_but_tracks_cases(store: BenchmarkSuiteStore) -> None:
    """L'empreinte suit le contenu des cas, pas l'horodatage d'écriture."""
    suite = BenchmarkSuite(suite_id="smoke", version=1, cases=[_case()])
    same_content = suite.model_copy(update={"updated_at": "2026-01-01T00:00:00+00:00"})
    changed = suite.model_copy(update={"cases": [_case("autre-cas")]})
    assert suite_fingerprint(suite) == suite_fingerprint(same_content)
    assert suite_fingerprint(suite) != suite_fingerprint(changed)
