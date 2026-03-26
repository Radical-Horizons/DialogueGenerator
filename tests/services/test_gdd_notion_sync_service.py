"""Tests service sync GDD Notion (mocks client)."""
import json
from pathlib import Path

import pytest

from services.gdd_notion_sync_config_store import GddNotionSyncConfigStore
from services.gdd_notion_sync_service import GddNotionSyncService


@pytest.mark.asyncio
async def test_run_sync_list_category_writes_shard_files(tmp_path: Path) -> None:
    """Les catégories liste (ex. personnages) sont écrites en shards + notion_page_id."""
    pid = "1886e4d2-1b45-8039-b51b-eb3826fce1b5"

    class FakeClient:
        async def verify_credentials(self) -> dict:
            return {"id": "bot", "type": "bot"}

        async def get_page(self, page_id: str) -> dict:
            return {
                "id": page_id,
                "last_edited_time": "2025-01-01T00:00:00.000Z",
                "properties": {
                    "Name": {
                        "type": "title",
                        "title": [{"plain_text": "Héros"}],
                    },
                },
            }

        async def get_page_content(self, page_id: str) -> str:
            return "Corps."

        async def query_database(self, database_id: str) -> list:
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
                    "category_file": "Personnages.json",
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
    res = await svc.run_sync(force_full=True, request_id="unit-shards")
    assert res.updated_entities == 1
    assert res.success
    shard = gdd_dir / "personnages" / f"{pid}.json"
    assert shard.is_file()
    out = json.loads(shard.read_text(encoding="utf-8"))
    assert out["Nom"] == "Héros"
    assert out["notion_page_id"] == pid
    assert out["sections"]["_general"] == "Corps."


@pytest.mark.asyncio
async def test_run_sync_page_source_writes_gdd(tmp_path: Path) -> None:
    pid = "1886e4d2-1b45-8039-b51b-eb3826fce1b5"

    class FakeClient:
        async def verify_credentials(self) -> dict:
            return {"id": "bot", "type": "bot"}

        async def get_page(self, page_id: str) -> dict:
            return {
                "id": page_id,
                "last_edited_time": "2025-01-01T00:00:00.000Z",
                "properties": {
                    "Name": {
                        "type": "title",
                        "title": [{"plain_text": "Héros"}],
                    },
                },
            }

        async def get_page_content(self, page_id: str) -> str:
            return "Introduction\n\nTexte."

        async def query_database(self, database_id: str) -> list:
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
                    "category_file": "test_cat.json",
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
    res = await svc.run_sync(force_full=True, request_id="unit")
    assert res.updated_entities == 1
    assert res.success
    out = json.loads((gdd_dir / "test_cat.json").read_text(encoding="utf-8"))
    assert out[0]["Nom"] == "Héros"
    assert out[0]["sections"]["_general"] == "Introduction\n\nTexte."
    manifest = json.loads((tmp_path / "manifest.json").read_text(encoding="utf-8"))
    assert manifest.get("last_full_sync_at")


@pytest.mark.asyncio
async def test_run_sync_skips_when_manifest_current(tmp_path: Path) -> None:
    pid = "1886e4d2-1b45-8039-b51b-eb3826fce1b5"

    class FakeClient:
        get_page_calls = 0

        async def verify_credentials(self) -> dict:
            return {}

        async def get_page(self, page_id: str) -> dict:
            FakeClient.get_page_calls += 1
            return {
                "id": page_id,
                "last_edited_time": "2025-01-01T00:00:00.000Z",
                "properties": {
                    "Name": {
                        "type": "title",
                        "title": [{"plain_text": "Héros"}],
                    },
                },
            }

        async def get_page_content(self, page_id: str) -> str:
            raise AssertionError("get_page_content ne doit pas être appelé si rien n'est stale")

        async def query_database(self, database_id: str) -> list:
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
                    "category_file": "test_cat.json",
                }
            ],
            "included_categories": [],
        }
    )
    gdd_dir = tmp_path / "gdd"
    gdd_dir.mkdir()
    (gdd_dir / "test_cat.json").write_text(
        json.dumps(
            [
                {
                    "Nom": "Héros",
                    "sections": {"_general": "cached"},
                }
            ],
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    manifest = {
        "schema_version": 1,
        "entries": {pid: "2025-01-01T00:00:00.000Z"},
        "last_full_sync_at": None,
    }
    (tmp_path / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False),
        encoding="utf-8",
    )
    svc = GddNotionSyncService(
        config_store=store,
        manifest_path=tmp_path / "manifest.json",
        gdd_categories_path=gdd_dir,
        status_path=tmp_path / "status.json",
        client_factory=lambda _k: FakeClient(),
    )
    res = await svc.run_sync(force_full=False, request_id="unit2")
    assert res.updated_entities == 0
    assert FakeClient.get_page_calls == 1


@pytest.mark.asyncio
async def test_database_vocab_skips_blocks_uses_columns(tmp_path: Path) -> None:
    """Vocabulaire / chronologie : pas d’appel get_page_content, contenu depuis colonnes."""
    db_id = "2d16e4d2-1b45-8016-ba74-ccb4fbd92b72"
    row_id = "1886e4d2-1b45-8039-b51b-eb3826fce1b5"

    class FakeClient:
        content_calls = 0

        async def verify_credentials(self) -> dict:
            return {}

        async def get_page(self, page_id: str) -> dict:
            return {
                "id": page_id,
                "properties": {
                    "Terme": {
                        "type": "title",
                        "title": [{"plain_text": "MotClé"}],
                    },
                    "Sens": {
                        "type": "rich_text",
                        "rich_text": [{"plain_text": "Définition courte"}],
                    },
                },
            }

        async def get_page_content(self, page_id: str) -> str:
            FakeClient.content_calls += 1
            return "NE_DOIT_PAS_S_IMPORTER"

        async def query_database(self, database_id: str) -> list:
            return [
                {
                    "id": row_id,
                    "last_edited_time": "2025-06-01T00:00:00.000Z",
                }
            ]

    FakeClient.content_calls = 0
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
                    "notion_id": db_id,
                    "category_file": "vocab_test.json",
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
    res = await svc.run_sync(force_full=True, request_id="vocab-db")
    assert res.updated_entities == 1
    assert FakeClient.content_calls == 0
    out = json.loads((gdd_dir / "vocab_test.json").read_text(encoding="utf-8"))
    assert out[0]["Nom"] == "MotClé"
    assert out[0]["values"]["Sens"] == "Définition courte"
    assert "sections" not in out[0]


@pytest.mark.asyncio
async def test_included_categories_skips_non_matching_sources(tmp_path: Path) -> None:
    pid_a = "1886e4d2-1b45-8039-b51b-eb3826fce1b5"
    pid_b = "1886e4d2-1b45-8039-b51b-eb3826fce1b6"

    class FakeClient:
        fetched: list[str] = []

        async def verify_credentials(self) -> dict:
            return {}

        async def get_page(self, page_id: str) -> dict:
            FakeClient.fetched.append(page_id)
            return {
                "id": page_id,
                "last_edited_time": "2025-02-01T00:00:00.000Z",
                "properties": {
                    "Name": {
                        "type": "title",
                        "title": [{"plain_text": "X"}],
                    },
                },
            }

        async def get_page_content(self, page_id: str) -> str:
            return "body"

        async def query_database(self, database_id: str) -> list:
            return []

    FakeClient.fetched.clear()
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
                    "notion_id": pid_a,
                    "category_file": "keep.json",
                },
                {
                    "kind": "page",
                    "notion_id": pid_b,
                    "category_file": "skip.json",
                },
            ],
            "included_categories": ["keep"],
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
    res = await svc.run_sync(force_full=True, request_id="unit-filter")
    assert res.updated_entities == 1
    assert FakeClient.fetched.count(pid_a) >= 1
    assert pid_b not in FakeClient.fetched
    assert (gdd_dir / "skip.json").exists() is False


@pytest.mark.asyncio
async def test_included_categories_no_match_returns_error(tmp_path: Path) -> None:
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
                    "notion_id": "1886e4d2-1b45-8039-b51b-eb3826fce1b5",
                    "category_file": "a.json",
                },
            ],
            "included_categories": ["zzz"],
        }
    )
    def _client_should_not_run(_k: str):
        raise AssertionError("client_factory ne doit pas être invoqué")

    svc = GddNotionSyncService(
        config_store=store,
        manifest_path=tmp_path / "manifest.json",
        gdd_categories_path=tmp_path / "gdd",
        status_path=tmp_path / "status.json",
        client_factory=_client_should_not_run,
    )
    res = await svc.run_sync(force_full=False, request_id="unit-nomatch")
    assert res.success is False
    assert "included_categories" in res.message


@pytest.mark.asyncio
async def test_run_sync_mirror_rebuild_promotes_and_drops_orphan_shard(
    tmp_path: Path,
) -> None:
    """Miroir : archive, staging, promote — orphelin dans personnages/ supprimé."""
    pid = "1886e4d2-1b45-8039-b51b-eb3826fce1b5"
    orphan = "1996e4d2-1b45-8039-b51b-eb3826fce1b5"

    class FakeClient:
        async def verify_credentials(self) -> dict:
            return {}

        async def get_page(self, page_id: str) -> dict:
            return {
                "id": page_id,
                "last_edited_time": "2025-04-01T00:00:00.000Z",
                "properties": {
                    "Name": {
                        "type": "title",
                        "title": [{"plain_text": "Héros"}],
                    },
                },
            }

        async def get_page_content(self, page_id: str) -> str:
            return "Corps."

        async def query_database(self, database_id: str) -> list:
            return []

    store = GddNotionSyncConfigStore(tmp_path / "settings.json", tmp_path / "token.secret")
    store.write_token("dummy-token")
    store.save_settings(
        {
            "schema_version": 1,
            "sync_interval_minutes": 60,
            "auto_sync_enabled": False,
            "mirror_rebuild_on_full_sync": True,
            "archive_retention_count": 10,
            "sources": [
                {
                    "kind": "page",
                    "notion_id": pid,
                    "category_file": "Personnages.json",
                }
            ],
            "included_categories": [],
        }
    )
    gdd_dir = tmp_path / "gdd"
    gdd_dir.mkdir()
    pd = gdd_dir / "personnages"
    pd.mkdir()
    (pd / f"{orphan}.json").write_text('{"Nom":"Orphelin"}', encoding="utf-8")

    svc = GddNotionSyncService(
        config_store=store,
        manifest_path=tmp_path / "manifest.json",
        gdd_categories_path=gdd_dir,
        status_path=tmp_path / "status.json",
        client_factory=lambda _k: FakeClient(),
    )
    res = await svc.run_sync(
        force_full=True,
        request_id="mirror-ok",
    )
    assert res.success
    assert res.mirror_rebuild_used
    assert (gdd_dir / ".archive").is_dir()
    hero = gdd_dir / "personnages" / f"{pid}.json"
    assert hero.is_file()
    assert not (gdd_dir / "personnages" / f"{orphan}.json").exists()


@pytest.mark.asyncio
async def test_run_sync_mirror_rebuild_rollback_on_fetch_error(tmp_path: Path) -> None:
    """Échec fetch : pas de promote, live inchangé."""
    pid = "1886e4d2-1b45-8039-b51b-eb3826fce1b5"
    orphan = "1996e4d2-1b45-8039-b51b-eb3826fce1b5"

    class FakeClient:
        async def verify_credentials(self) -> dict:
            return {}

        async def get_page(self, page_id: str) -> dict:
            raise OSError("simulated fetch failure")

        async def get_page_content(self, page_id: str) -> str:
            return ""

        async def query_database(self, database_id: str) -> list:
            return []

    store = GddNotionSyncConfigStore(tmp_path / "settings.json", tmp_path / "token.secret")
    store.write_token("dummy-token")
    store.save_settings(
        {
            "schema_version": 1,
            "sync_interval_minutes": 60,
            "auto_sync_enabled": False,
            "mirror_rebuild_on_full_sync": True,
            "archive_retention_count": 10,
            "sources": [
                {
                    "kind": "page",
                    "notion_id": pid,
                    "category_file": "Personnages.json",
                }
            ],
            "included_categories": [],
        }
    )
    gdd_dir = tmp_path / "gdd"
    gdd_dir.mkdir()
    pd = gdd_dir / "personnages"
    pd.mkdir()
    orphan_path = pd / f"{orphan}.json"
    orphan_path.write_text('{"Nom":"Orphelin"}', encoding="utf-8")

    svc = GddNotionSyncService(
        config_store=store,
        manifest_path=tmp_path / "manifest.json",
        gdd_categories_path=gdd_dir,
        status_path=tmp_path / "status.json",
        client_factory=lambda _k: FakeClient(),
    )
    res = await svc.run_sync(
        force_full=True,
        request_id="mirror-fail",
    )
    assert res.success is False
    assert res.mirror_rebuild_used
    assert orphan_path.is_file()


@pytest.mark.asyncio
async def test_test_connection_without_token(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("NOTION_API_KEY", raising=False)
    store = GddNotionSyncConfigStore(tmp_path / "settings.json", tmp_path / "token.secret")
    svc = GddNotionSyncService(
        config_store=store,
        manifest_path=tmp_path / "manifest.json",
        gdd_categories_path=tmp_path / "gdd",
        status_path=tmp_path / "status.json",
    )
    r = await svc.test_connection()
    assert r["ok"] is False
    assert "Token" in r["message"] or "token" in r["message"].lower()
