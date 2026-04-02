"""Isolation documents vs fichiers GDD (Story 3.9 AC1)."""
import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

from fastapi.testclient import TestClient

from api.main import app
from api.dependencies import get_config_service, get_context_builder, get_llm_client
from core.llm.llm_client import ILLMClient


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


def test_document_get_and_gdd_fingerprint_paths_do_not_invoke_llm(tmp_path: Path) -> None:
    """Aucun endpoint « lecture / empreinte » ne doit appeler le client LLM (FR19)."""
    from services.configuration_service import ConfigurationService
    from services.gdd_context_fingerprint import clear_gdd_content_fingerprint_cache

    clear_gdd_content_fingerprint_cache()

    mock_llm = MagicMock(spec=ILLMClient)
    mock_llm.generate_variants = AsyncMock(return_value=[])
    mock_llm.get_max_tokens = MagicMock(return_value=8192)

    mock_config = MagicMock(spec=ConfigurationService)
    doc_id = "iso-doc-llm"
    doc = {"schemaVersion": "1.1.0", "nodes": [{"id": "A", "line": "x"}]}
    (tmp_path / f"{doc_id}.json").write_text(json.dumps(doc), encoding="utf-8")
    mock_config.get_unity_dialogues_path.return_value = tmp_path

    mock_cb = MagicMock()
    mock_cb.build_context_json.return_value = {"stub": True}

    app.dependency_overrides[get_llm_client] = lambda: mock_llm
    app.dependency_overrides[get_config_service] = lambda: mock_config
    app.dependency_overrides[get_context_builder] = lambda: mock_cb

    client = TestClient(app)
    dr = client.get(f"/api/v1/documents/{doc_id}")
    fr = client.post(
        "/api/v1/context/gdd-content-fingerprint",
        json={"context_selections": {"characters": ["X"]}},
    )
    app.dependency_overrides.clear()

    assert dr.status_code == 200
    assert fr.status_code == 200
    mock_llm.generate_variants.assert_not_called()
    clear_gdd_content_fingerprint_cache()
