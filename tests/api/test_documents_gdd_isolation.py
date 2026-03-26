"""Isolation documents vs fichiers GDD (Story 3.9 AC1)."""
import json
from pathlib import Path
from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from api.main import app
from api.dependencies import get_config_service


def test_get_document_unchanged_when_separate_gdd_file_touched(tmp_path: Path) -> None:
    """Le GET document ne lit pas le répertoire GDD ; blob document stable."""
    from services.configuration_service import ConfigurationService

    mock = MagicMock(spec=ConfigurationService)
    doc_id = "iso-doc"
    doc = {"schemaVersion": "1.1.0", "nodes": [{"id": "A", "line": "x"}]}
    (tmp_path / f"{doc_id}.json").write_text(json.dumps(doc), encoding="utf-8")
    mock.get_unity_dialogues_path.return_value = tmp_path

    gdd_dir = tmp_path / "GDD_categories"
    gdd_dir.mkdir()
    (gdd_dir / "dummy.json").write_text("[]", encoding="utf-8")

    app.dependency_overrides[get_config_service] = lambda: mock
    client = TestClient(app)
    r1 = client.get(f"/api/v1/documents/{doc_id}")
    (gdd_dir / "dummy.json").write_text('[{"Nom":"Z"}]', encoding="utf-8")
    r2 = client.get(f"/api/v1/documents/{doc_id}")
    app.dependency_overrides.clear()

    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json()["document"] == r2.json()["document"] == doc
