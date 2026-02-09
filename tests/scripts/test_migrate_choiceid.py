"""Tests unitaires pour le script de migration choiceId (Story 16.5, AC1, Task 1)."""
import json
import pytest
from pathlib import Path

# Import sera valide après création de scripts/migrate_choiceid.py
pytest.importorskip("scripts.migrate_choiceid", reason="scripts.migrate_choiceid non créé")


def _doc_without_choice_id() -> dict:
    """Document v1.1.0 avec choices sans choiceId (pour migration)."""
    return {
        "schemaVersion": "1.1.0",
        "nodes": [
            {
                "id": "START",
                "line": "Hello",
                "choices": [
                    {"text": "OK", "targetNode": "END"},
                    {"text": "Cancel", "targetNode": "START"},
                ],
            },
        ],
    }


def _doc_with_partial_choice_id() -> dict:
    """Document avec un choice ayant choiceId et un sans (idempotence)."""
    return {
        "schemaVersion": "1.1.0",
        "nodes": [
            {
                "id": "NODE_A",
                "choices": [
                    {"choiceId": "existing_id", "text": "Yes", "targetNode": "END"},
                    {"text": "No", "targetNode": "NODE_A"},
                ],
            },
        ],
    }


class TestMigrateDocument:
    """Tests de la logique de migration d'un document (migrate_document)."""

    def test_adds_choice_id_to_choices_without(self):
        """Chaque choice sans choiceId reçoit un choiceId stable."""
        from scripts.migrate_choiceid import migrate_document

        doc = _doc_without_choice_id()
        out = migrate_document(doc)
        nodes = out.get("nodes", [])
        assert len(nodes) == 1
        choices = nodes[0].get("choices", [])
        assert len(choices) == 2
        for c in choices:
            assert "choiceId" in c
            assert isinstance(c["choiceId"], str)
            assert len(c["choiceId"]) > 0

    def test_output_has_schema_version_1_1_0(self):
        """Le document en sortie a schemaVersion 1.1.0."""
        from scripts.migrate_choiceid import migrate_document

        doc = _doc_without_choice_id()
        out = migrate_document(doc)
        assert out.get("schemaVersion") == "1.1.0"

    def test_idempotent_does_not_modify_existing_choice_ids(self):
        """Ré-exécution ne modifie pas les choiceId déjà présents."""
        from scripts.migrate_choiceid import migrate_document

        doc = _doc_with_partial_choice_id()
        out1 = migrate_document(doc)
        out2 = migrate_document(out1)
        choices1 = out1["nodes"][0]["choices"]
        choices2 = out2["nodes"][0]["choices"]
        assert choices1[0]["choiceId"] == "existing_id"
        assert choices2[0]["choiceId"] == "existing_id"
        assert choices1[1]["choiceId"] == choices2[1]["choiceId"]

    def test_legacy_list_normalized_to_document(self):
        """Entrée liste (legacy) normalisée en document avec schemaVersion 1.1.0."""
        from scripts.migrate_choiceid import migrate_document

        legacy = [
            {"id": "START", "choices": [{"text": "Go", "targetNode": "END"}]},
        ]
        out = migrate_document(legacy)
        assert "schemaVersion" in out
        assert out["schemaVersion"] == "1.1.0"
        assert "nodes" in out
        assert len(out["nodes"]) == 1
        assert out["nodes"][0]["choices"][0].get("choiceId")
