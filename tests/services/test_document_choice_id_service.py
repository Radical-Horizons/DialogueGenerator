"""Tests pour ensure_document_choice_ids."""
from __future__ import annotations

from services.document_choice_id_service import ensure_document_choice_ids, stable_choice_id


def test_stable_choice_id_format() -> None:
    assert stable_choice_id("START", 0) == "choice_START_0"


def test_ensure_preserves_schema_version_1_2() -> None:
    doc = {
        "schemaVersion": "1.2.0",
        "nodes": [
            {
                "id": "START",
                "choices": [{"text": "A", "targetNode": "N1"}],
            }
        ],
    }
    out = ensure_document_choice_ids(doc)
    assert out["schemaVersion"] == "1.2.0"
    assert out["nodes"][0]["choices"][0]["choiceId"] == "choice_START_0"


def test_ensure_idempotent() -> None:
    doc = {
        "schemaVersion": "1.2.0",
        "nodes": [
            {
                "id": "N1",
                "choices": [
                    {"choiceId": "existing", "text": "X"},
                    {"text": "Y"},
                ],
            }
        ],
    }
    out = ensure_document_choice_ids(doc)
    assert out["nodes"][0]["choices"][0]["choiceId"] == "existing"
    assert out["nodes"][0]["choices"][1]["choiceId"] == "choice_N1_1"
