"""Tests API empreinte GDD + historique entité (Story 3.9)."""
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.dependencies import get_context_builder


@pytest.fixture
def client_with_mock_builder():
    mock_cb = MagicMock()
    mock_cb.build_context_json.return_value = {"stub": True}

    app.dependency_overrides[get_context_builder] = lambda: mock_cb
    yield TestClient(app), mock_cb
    app.dependency_overrides.clear()


def test_post_gdd_content_fingerprint(client_with_mock_builder) -> None:
    from services.gdd_context_fingerprint import clear_gdd_content_fingerprint_cache

    clear_gdd_content_fingerprint_cache()
    client, mock_cb = client_with_mock_builder
    r = client.post(
        "/api/v1/context/gdd-content-fingerprint",
        json={"context_selections": {"characters": ["X"]}},
    )
    assert r.status_code == 200
    body = r.json()
    assert "fingerprint" in body
    assert len(body["fingerprint"]) == 64
    mock_cb.load_gdd_files.assert_called()
    mock_cb.build_context_json.assert_called()


def test_get_gdd_entity_history_unknown_entity_404(tmp_path, monkeypatch) -> None:
    import core.context.context_builder as cb_mod

    monkeypatch.setattr(cb_mod, "PROJECT_ROOT_DIR", tmp_path)
    (tmp_path / "data" / "GDD_categories").mkdir(parents=True)

    client = TestClient(app)
    r = client.get(
        "/api/v1/context/gdd-entity-history",
        params={"category": "personnages", "name": "Inconnu"},
    )
    assert r.status_code == 404


def test_get_gdd_entity_history_empty_timeline_when_entity_exists(tmp_path, monkeypatch) -> None:
    import core.context.context_builder as cb_mod

    monkeypatch.setattr(cb_mod, "PROJECT_ROOT_DIR", tmp_path)
    gdd = tmp_path / "data" / "GDD_categories"
    gdd.mkdir(parents=True)
    (gdd / "personnages.json").write_text(
        '{"personnages": [{"Nom": "Héros Test", "sections": {}}]}',
        encoding="utf-8",
    )

    client = TestClient(app)
    r = client.get(
        "/api/v1/context/gdd-entity-history",
        params={"category": "personnages", "name": "Héros Test"},
    )
    assert r.status_code == 200
    assert r.json()["events"] == []


def test_get_gdd_entity_history_with_events(tmp_path, monkeypatch) -> None:
    import core.context.context_builder as cb_mod
    from services.gdd_entity_history import record_entity_change

    monkeypatch.setattr(cb_mod, "PROJECT_ROOT_DIR", tmp_path)
    record_entity_change(
        tmp_path,
        "lieux",
        "Lieu A",
        {"Nom": "Lieu A", "v": 1},
        source="notion_sync",
        recorded_at="2026-01-01T00:00:00+00:00",
    )
    record_entity_change(
        tmp_path,
        "lieux",
        "Lieu A",
        {"Nom": "Lieu A", "v": 2},
        source="notion_sync",
        recorded_at="2026-01-02T00:00:00+00:00",
    )

    client = TestClient(app)
    r = client.get(
        "/api/v1/context/gdd-entity-history",
        params={"category": "lieux", "name": "Lieu A"},
    )
    assert r.status_code == 200
    data = r.json()
    assert len(data["events"]) == 2
    assert data["diff_hint"] is not None
    assert "@@" in data["diff_hint"] or "+" in data["diff_hint"]


def test_get_gdd_entity_history_include_snapshots(tmp_path, monkeypatch) -> None:
    import core.context.context_builder as cb_mod
    from services.gdd_entity_history import record_entity_change

    monkeypatch.setattr(cb_mod, "PROJECT_ROOT_DIR", tmp_path)
    record_entity_change(
        tmp_path,
        "lieux",
        "Lieu A",
        {"Nom": "Lieu A", "v": 1},
        source="notion_sync",
        recorded_at="2026-01-01T00:00:00+00:00",
    )
    record_entity_change(
        tmp_path,
        "lieux",
        "Lieu A",
        {"Nom": "Lieu A", "v": 2},
        source="notion_sync",
        recorded_at="2026-01-02T00:00:00+00:00",
    )

    client = TestClient(app)
    r = client.get(
        "/api/v1/context/gdd-entity-history",
        params={"category": "lieux", "name": "Lieu A", "include_snapshots": True},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["events"][0]["snapshot"] == {"Nom": "Lieu A", "v": 1}
    assert body["events"][1]["snapshot"] == {"Nom": "Lieu A", "v": 2}
    assert body["events"][0]["diff_from_previous"] is None
    assert body["events"][1]["diff_from_previous"] is not None
