"""Tests API sync GDD Notion (FR18)."""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.dependencies import get_gdd_notion_sync_service
from api.main import app
from services.gdd_notion_sync_config_store import GddNotionSyncConfigStore
from services.gdd_notion_sync_service import GddNotionSyncService


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _build_service(tmp_path: Path) -> GddNotionSyncService:
    store = GddNotionSyncConfigStore(
        tmp_path / "settings.json",
        tmp_path / "token.secret",
    )
    gdd = tmp_path / "gdd"
    gdd.mkdir(parents=True, exist_ok=True)
    return GddNotionSyncService(
        config_store=store,
        manifest_path=tmp_path / "manifest.json",
        gdd_categories_path=gdd,
        status_path=tmp_path / "status.json",
    )


def test_get_config_no_secret_in_response(client: TestClient, tmp_path: Path) -> None:
    svc = _build_service(tmp_path)
    app.dependency_overrides[get_gdd_notion_sync_service] = lambda: svc
    try:
        r = client.get("/api/v1/gdd-notion-sync/config")
        assert r.status_code == 200
        body = r.json()
        assert "config" in body
        assert "notion_token" not in str(body)
        assert "token_configured" in body["config"]
    finally:
        app.dependency_overrides.pop(get_gdd_notion_sync_service, None)


def test_preview_database_row_ok(client: TestClient, tmp_path: Path) -> None:
    """Prévisualisation : première ligne mappée (client Notion mock)."""

    class FakeClient:
        async def _retrieve_database_for_data_sources(self, database_id: str) -> dict:
            return {
                "data_sources": [{"id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "name": "Main"}],
                "title": [],
            }

        async def query_database(self, database_id: str, **_kw) -> list:
            return [
                {
                    "id": "1886e4d2-1b45-8039-b51b-eb3826fce1b5",
                    "properties": {
                        "Name": {
                            "type": "title",
                            "title": [{"plain_text": "L1"}],
                        },
                    },
                }
            ]

        async def get_page(self, page_id: str) -> dict:
            return {
                "id": page_id,
                "properties": {
                    "Name": {
                        "type": "title",
                        "title": [{"plain_text": "L1"}],
                    },
                    "Col": {
                        "type": "rich_text",
                        "rich_text": [{"plain_text": "val"}],
                    },
                },
            }

        async def get_page_content(self, page_id: str) -> str:
            return "corps"

    store = GddNotionSyncConfigStore(tmp_path / "settings.json", tmp_path / "token.secret")
    store.write_token("dummy-token")
    store.save_settings(
        {
            "schema_version": 1,
            "sync_interval_minutes": 60,
            "auto_sync_enabled": False,
            "sources": [
                {
                    "kind": "database",
                    "notion_id": "2766e4d2-1b45-8073-b9e3-fa39ae137938",
                    "category_file": "Dialogues.json",
                },
            ],
            "included_categories": [],
        }
    )
    svc = _build_service(tmp_path)
    svc._client_factory = lambda _t: FakeClient()  # type: ignore[method-assign]
    app.dependency_overrides[get_gdd_notion_sync_service] = lambda: svc
    try:
        r = client.post(
            "/api/v1/gdd-notion-sync/preview-database-row",
            json={"category_file": "Dialogues.json"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is True
        assert data["query_total_rows"] == 1
        assert data["mapped_record"]["Nom"] == "L1"
        assert data["mapped_record"]["values"] == {"Col": "val"}
        assert data["data_sources_count"] == 1
    finally:
        app.dependency_overrides.pop(get_gdd_notion_sync_service, None)


def test_test_connection_no_token(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("NOTION_API_KEY", raising=False)
    svc = _build_service(tmp_path)
    app.dependency_overrides[get_gdd_notion_sync_service] = lambda: svc
    try:
        r = client.post("/api/v1/gdd-notion-sync/test-connection")
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is False
        assert len(data["message"]) > 0
    finally:
        app.dependency_overrides.pop(get_gdd_notion_sync_service, None)


def test_post_sync_and_get_status(client: TestClient, tmp_path: Path) -> None:
    pid = "1886e4d2-1b45-8039-b51b-eb3826fce1b5"

    class FakeClient:
        async def verify_credentials(self) -> dict:
            return {}

        async def get_page(self, page_id: str) -> dict:
            return {
                "id": page_id,
                "last_edited_time": "2025-03-01T00:00:00.000Z",
                "properties": {
                    "Name": {
                        "type": "title",
                        "title": [{"plain_text": "API"}],
                    },
                },
            }

        async def get_page_content(self, page_id: str) -> str:
            return "intro"

        async def query_database(self, database_id: str, **_kw) -> list:
            return []

    store = GddNotionSyncConfigStore(tmp_path / "settings.json", tmp_path / "token.secret")
    store.write_token("dummy-token")
    store.save_settings(
        {
            "schema_version": 1,
            "sync_interval_minutes": 60,
            "auto_sync_enabled": False,
            "sources": [
                {
                    "kind": "page",
                    "notion_id": pid,
                    "category_file": "api_cat.json",
                }
            ],
            "included_categories": [],
        }
    )
    gdd_dir = tmp_path / "gdd"
    gdd_dir.mkdir()
    svc = GddNotionSyncService(
        config_store=store,
        manifest_path=tmp_path / "manifest.json",
        gdd_categories_path=gdd_dir,
        status_path=tmp_path / "status.json",
        client_factory=lambda _k: FakeClient(),
    )
    app.dependency_overrides[get_gdd_notion_sync_service] = lambda: svc
    try:
        r = client.post("/api/v1/gdd-notion-sync/sync")
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is True
        assert body["updated_entities"] >= 1
        st = client.get("/api/v1/gdd-notion-sync/status")
        assert st.status_code == 200
        assert st.json().get("last_finished_at")
    finally:
        app.dependency_overrides.pop(get_gdd_notion_sync_service, None)


def test_post_sync_full_query_param(client: TestClient, tmp_path: Path) -> None:
    pid = "1886e4d2-1b45-8039-b51b-eb3826fce1b5"

    class FakeClient:
        async def verify_credentials(self) -> dict:
            return {}

        async def get_page(self, page_id: str) -> dict:
            return {
                "id": page_id,
                "last_edited_time": "2025-03-02T00:00:00.000Z",
                "properties": {
                    "Name": {
                        "type": "title",
                        "title": [{"plain_text": "Full"}],
                    },
                },
            }

        async def get_page_content(self, page_id: str) -> str:
            return "c"

        async def query_database(self, database_id: str, **_kw) -> list:
            return []

    store = GddNotionSyncConfigStore(tmp_path / "settings.json", tmp_path / "token.secret")
    store.write_token("dummy-token")
    store.save_settings(
        {
            "schema_version": 1,
            "sync_interval_minutes": 60,
            "auto_sync_enabled": False,
            "sources": [
                {
                    "kind": "page",
                    "notion_id": pid,
                    "category_file": "full_cat.json",
                }
            ],
            "included_categories": [],
        }
    )
    gdd_dir = tmp_path / "gdd"
    gdd_dir.mkdir()
    svc = GddNotionSyncService(
        config_store=store,
        manifest_path=tmp_path / "manifest.json",
        gdd_categories_path=gdd_dir,
        status_path=tmp_path / "status.json",
        client_factory=lambda _k: FakeClient(),
    )
    app.dependency_overrides[get_gdd_notion_sync_service] = lambda: svc
    try:
        r = client.post("/api/v1/gdd-notion-sync/sync?full=true")
        assert r.status_code == 200
        man = json.loads((tmp_path / "manifest.json").read_text(encoding="utf-8"))
        assert man.get("last_full_sync_at")
    finally:
        app.dependency_overrides.pop(get_gdd_notion_sync_service, None)


def test_put_config_invalid_source(client: TestClient, tmp_path: Path) -> None:
    svc = _build_service(tmp_path)
    app.dependency_overrides[get_gdd_notion_sync_service] = lambda: svc
    try:
        r = client.put(
            "/api/v1/gdd-notion-sync/config",
            json={
                "sources": [
                    {
                        "notion_id": "1886e4d2-1b45-8039-b51b-eb3826fce1b5",
                        "kind": "invalid",
                        "category_file": "x.json",
                    }
                ]
            },
        )
        assert r.status_code == 422
    finally:
        app.dependency_overrides.pop(get_gdd_notion_sync_service, None)


def test_post_sync_mirror_rebuild_without_full_is_ignored(client: TestClient, tmp_path: Path) -> None:
    """mirror_rebuild est déprécié : sans full=true, sync incrémentale (pas 400)."""
    svc = _build_service(tmp_path)
    app.dependency_overrides[get_gdd_notion_sync_service] = lambda: svc
    try:
        r = client.post("/api/v1/gdd-notion-sync/sync?mirror_rebuild=true")
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is False
        assert "aucune" in body["message"].lower()
    finally:
        app.dependency_overrides.pop(get_gdd_notion_sync_service, None)


def test_get_archives_empty(client: TestClient, tmp_path: Path) -> None:
    svc = _build_service(tmp_path)
    app.dependency_overrides[get_gdd_notion_sync_service] = lambda: svc
    try:
        r = client.get("/api/v1/gdd-notion-sync/archives")
        assert r.status_code == 200
        assert r.json() == {"archives": []}
    finally:
        app.dependency_overrides.pop(get_gdd_notion_sync_service, None)


def test_get_archives_lists_snapshots(client: TestClient, tmp_path: Path) -> None:
    gdd = tmp_path / "gdd"
    arch = gdd / ".archive" / "20260102T030405Z_a1b2c3d4"
    arch.mkdir(parents=True)
    (arch / "note.txt").write_text("x", encoding="utf-8")
    (arch / "fiche.json").write_text('{"Nom":"Test"}', encoding="utf-8")
    store = GddNotionSyncConfigStore(tmp_path / "settings.json", tmp_path / "token.secret")
    svc = GddNotionSyncService(
        config_store=store,
        manifest_path=tmp_path / "manifest.json",
        gdd_categories_path=gdd,
        status_path=tmp_path / "status.json",
    )
    app.dependency_overrides[get_gdd_notion_sync_service] = lambda: svc
    try:
        r = client.get("/api/v1/gdd-notion-sync/archives?limit=5")
        assert r.status_code == 200
        data = r.json()["archives"]
        assert len(data) == 1
        assert data[0]["id"] == "20260102T030405Z_a1b2c3d4"
        assert "2026" in data[0]["created_at"]
        assert data[0]["size_bytes"] > len("x".encode("utf-8"))
        assert data[0]["fiche_count"] == 1
    finally:
        app.dependency_overrides.pop(get_gdd_notion_sync_service, None)


def test_post_restore_archive_invalid_id(client: TestClient, tmp_path: Path) -> None:
    svc = _build_service(tmp_path)
    app.dependency_overrides[get_gdd_notion_sync_service] = lambda: svc
    try:
        r = client.post(
            "/api/v1/gdd-notion-sync/archives/not_a_valid_archive_id/restore",
            json={"backup_current": False},
        )
        assert r.status_code == 400
    finally:
        app.dependency_overrides.pop(get_gdd_notion_sync_service, None)


def test_post_restore_archive_happy_path(client: TestClient, tmp_path: Path) -> None:
    from services.gdd_notion_sync_mirror import archive_gdd_snapshot

    gdd = tmp_path / "gdd"
    gdd.mkdir()
    (gdd / "live.json").write_text('{"v":2}', encoding="utf-8")
    snap_dir = archive_gdd_snapshot(gdd)
    (gdd / "live.json").write_text('{"v":3}', encoding="utf-8")

    store = GddNotionSyncConfigStore(tmp_path / "settings.json", tmp_path / "token.secret")
    store.save_settings({**store.load_settings(), "archive_retention_count": 10})
    (tmp_path / "manifest.json").write_text(
        '{"schema_version":1,"entries":{"x":"y"},"last_full_sync_at":"2020-01-01T00:00:00Z"}',
        encoding="utf-8",
    )
    svc = GddNotionSyncService(
        config_store=store,
        manifest_path=tmp_path / "manifest.json",
        gdd_categories_path=gdd,
        status_path=tmp_path / "status.json",
    )
    app.dependency_overrides[get_gdd_notion_sync_service] = lambda: svc
    try:
        aid = snap_dir.name
        r = client.post(
            f"/api/v1/gdd-notion-sync/archives/{aid}/restore",
            json={"backup_current": False},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert (gdd / "live.json").read_text(encoding="utf-8") == '{"v":2}'
        man = json.loads((tmp_path / "manifest.json").read_text(encoding="utf-8"))
        assert man.get("entries") == {}
        assert man.get("last_full_sync_at") is None
    finally:
        app.dependency_overrides.pop(get_gdd_notion_sync_service, None)


def test_get_sync_progress_idle(client: TestClient, tmp_path: Path) -> None:
    svc = _build_service(tmp_path)
    app.dependency_overrides[get_gdd_notion_sync_service] = lambda: svc
    try:
        r = client.get("/api/v1/gdd-notion-sync/sync-progress")
        assert r.status_code == 200
        body = r.json()
        assert body.get("active") is False
        assert body.get("phase") == "idle"
        assert body.get("paused") is False
    finally:
        app.dependency_overrides.pop(get_gdd_notion_sync_service, None)


def test_sync_resume_requires_full(client: TestClient, tmp_path: Path) -> None:
    svc = _build_service(tmp_path)
    app.dependency_overrides[get_gdd_notion_sync_service] = lambda: svc
    try:
        r = client.post("/api/v1/gdd-notion-sync/sync", params={"resume": True})
        assert r.status_code == 400
    finally:
        app.dependency_overrides.pop(get_gdd_notion_sync_service, None)


def test_sync_resume_and_fresh_exclusive(client: TestClient, tmp_path: Path) -> None:
    svc = _build_service(tmp_path)
    app.dependency_overrides[get_gdd_notion_sync_service] = lambda: svc
    try:
        r = client.post(
            "/api/v1/gdd-notion-sync/sync",
            params={"full": True, "resume": True, "fresh": True},
        )
        assert r.status_code == 400
    finally:
        app.dependency_overrides.pop(get_gdd_notion_sync_service, None)


def test_get_full_sync_checkpoint(client: TestClient, tmp_path: Path) -> None:
    svc = _build_service(tmp_path)
    app.dependency_overrides[get_gdd_notion_sync_service] = lambda: svc
    try:
        r = client.get("/api/v1/gdd-notion-sync/full-sync-checkpoint")
        assert r.status_code == 200
        data = r.json()
        assert data.get("resumable") is False
        assert data.get("checkpoint_status") == "none"
        assert "sources_total" in data
        assert "orphan_staging_runs" in data
        assert "checkpoint_file_present" in data
    finally:
        app.dependency_overrides.pop(get_gdd_notion_sync_service, None)


def test_delete_full_sync_checkpoint(client: TestClient, tmp_path: Path) -> None:
    svc = _build_service(tmp_path)
    app.dependency_overrides[get_gdd_notion_sync_service] = lambda: svc
    try:
        r = client.delete("/api/v1/gdd-notion-sync/full-sync-checkpoint")
        assert r.status_code == 200
        assert r.json().get("ok") is True
    finally:
        app.dependency_overrides.pop(get_gdd_notion_sync_service, None)


def test_pause_when_no_active_sync(client: TestClient, tmp_path: Path) -> None:
    svc = _build_service(tmp_path)
    app.dependency_overrides[get_gdd_notion_sync_service] = lambda: svc
    try:
        r = client.post("/api/v1/gdd-notion-sync/full-sync/pause")
        assert r.status_code == 200
        assert r.json().get("ok") is False
    finally:
        app.dependency_overrides.pop(get_gdd_notion_sync_service, None)
