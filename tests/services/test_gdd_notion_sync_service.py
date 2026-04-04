"""Tests service sync GDD Notion (mocks client)."""
import json
from pathlib import Path

import httpx
import pytest

from services.gdd_notion_full_sync_checkpoint import checkpoint_json_path
from services.gdd_notion_sync_config_store import GddNotionSyncConfigStore
from services.gdd_notion_sync_service import GddNotionSyncService


def _http_status_error(status: int) -> httpx.HTTPStatusError:
    req = httpx.Request("GET", "https://api.notion.com/v1/x")
    resp = httpx.Response(status, request=req)
    return httpx.HTTPStatusError("err", request=req, response=resp)


async def _instant_backoff_sleep(_self: object, _attempt_index: int) -> None:
    return None


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
    assert out["sections"]["preamble"] == "Corps."
    assert out["section_titles"]["preamble"] == "Préambule"
    assert "_general" not in out["sections"]


@pytest.mark.asyncio
async def test_run_sync_systemes_de_jeu_writes_shard_dir(tmp_path: Path) -> None:
    """Systèmes de jeu : même mode shards que Personnages (dossier systemes_de_jeu)."""
    pid = "2be6e4d2-1b45-807c-bb2b-ee22e7209042"

    class FakeClient:
        async def verify_credentials(self) -> dict:
            return {"id": "bot", "type": "bot"}

        async def get_page(self, page_id: str) -> dict:
            return {
                "id": page_id,
                "last_edited_time": "2025-01-02T00:00:00.000Z",
                "properties": {
                    "Name": {
                        "type": "title",
                        "title": [{"plain_text": "Système test"}],
                    },
                },
            }

        async def get_page_content(self, page_id: str) -> str:
            return "Règles."

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
                    "category_file": "Systèmes_de_jeu.json",
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
    res = await svc.run_sync(force_full=True, request_id="unit-systemes-shards")
    assert res.updated_entities == 1
    assert res.success
    shard = gdd_dir / "systemes_de_jeu" / f"{pid}.json"
    assert shard.is_file()
    out = json.loads(shard.read_text(encoding="utf-8"))
    assert out["Nom"] == "Système test"
    assert out["notion_page_id"] == pid


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
    assert out[0]["sections"]["preamble"] == "Introduction\n\nTexte."
    assert out[0]["section_titles"]["preamble"] == "Préambule"
    assert "_general" not in out[0]["sections"]
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

        async def query_database(self, database_id: str, **_kw) -> list:
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
    assert out[0]["sections"] == {}
    assert "Sens" not in str(out[0].get("sections"))


@pytest.mark.asyncio
async def test_run_sync_database_non_compact_splits_body_columns_in_values(
    tmp_path: Path,
) -> None:
    """Base hors liste compacte : ``values`` = colonnes, corps découpé (pas dans ``_general``)."""
    db_id = "1886e4d2-1b45-8039-b51b-eb3826fce199"
    row_id = "2886e4d2-1b45-8039-b51b-eb3826fce1b5"

    class FakeClient:
        async def verify_credentials(self) -> dict:
            return {}

        async def get_page(self, page_id: str) -> dict:
            return {
                "id": page_id,
                "properties": {
                    "Name": {
                        "type": "title",
                        "title": [{"plain_text": "Quête"}],
                    },
                    "Difficulté": {
                        "type": "select",
                        "select": {"name": "Hard"},
                    },
                },
            }

        async def get_page_content(self, page_id: str) -> str:
            return "## Objectifs\nTuer le dragon\n## Récompense\nOr"

        async def query_database(self, database_id: str, **_kw) -> list:
            return [
                {
                    "id": row_id,
                    "last_edited_time": "2025-06-01T00:00:00.000Z",
                }
            ]

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
                    "category_file": "mix_db_test.json",
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
    res = await svc.run_sync(force_full=True, request_id="mix-db")
    assert res.updated_entities == 1
    out = json.loads((gdd_dir / "mix_db_test.json").read_text(encoding="utf-8"))
    assert out[0]["Nom"] == "Quête"
    assert out[0]["values"]["Difficulté"] == "Hard"
    assert "_general" not in out[0].get("sections", {})
    assert "objectifs" in out[0]["sections"]
    assert "dragon" in out[0]["sections"]["objectifs"]
    assert "re_compense" in out[0]["sections"]
    joined = "\n".join(out[0]["sections"].values())
    assert "Hard" not in joined


@pytest.mark.asyncio
async def test_included_categories_skips_non_matching_sources(tmp_path: Path) -> None:
    """Filtre included_categories : uniquement les bases ; une base exclue n'est pas interrogée."""
    db_keep = "1886e4d2-1b45-8039-b51b-eb3826fce1b5"
    db_skip = "1886e4d2-1b45-8039-b51b-eb3826fce1b6"
    row_id = "2886e4d2-1b45-8039-b51b-eb3826fce1b7"

    class FakeClient:
        queried: list[str] = []

        async def verify_credentials(self) -> dict:
            return {}

        async def get_page(self, page_id: str) -> dict:
            return {
                "id": page_id,
                "last_edited_time": "2025-02-01T00:00:00.000Z",
                "properties": {
                    "Name": {
                        "type": "title",
                        "title": [{"plain_text": "Ligne"}],
                    },
                },
            }

        async def get_page_content(self, page_id: str) -> str:
            return "body"

        async def query_database(self, database_id: str, **_kw) -> list:
            FakeClient.queried.append(database_id)
            return [{"id": row_id, "last_edited_time": "2025-02-01T00:00:00.000Z"}]

    FakeClient.queried.clear()
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
                    "notion_id": db_keep,
                    "category_file": "keep.json",
                },
                {
                    "kind": "database",
                    "notion_id": db_skip,
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
    assert db_keep in FakeClient.queried
    assert db_skip not in FakeClient.queried
    assert (gdd_dir / "keep.json").is_file()
    assert (gdd_dir / "skip.json").exists() is False


@pytest.mark.asyncio
async def test_included_categories_skips_pages_when_filter_set(tmp_path: Path) -> None:
    """Périmètre restreint : pas de sync des fiches (page), seulement les bases filtrées."""
    pid_page = "1886e4d2-1b45-8039-b51b-eb3826fce1b5"
    db_id = "1886e4d2-1b45-8039-b51b-eb3826fce1b6"
    row_id = "2886e4d2-1b45-8039-b51b-eb3826fce1b7"

    class FakeClient:
        page_root_fetches: list[str] = []

        async def verify_credentials(self) -> dict:
            return {}

        async def get_page(self, page_id: str) -> dict:
            if page_id == pid_page:
                FakeClient.page_root_fetches.append(page_id)
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

        async def query_database(self, database_id: str, **_kw) -> list:
            assert database_id == db_id
            return [{"id": row_id, "last_edited_time": "2025-02-01T00:00:00.000Z"}]

    FakeClient.page_root_fetches.clear()
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
                    "notion_id": pid_page,
                    "category_file": "hub_page.json",
                },
                {
                    "kind": "database",
                    "notion_id": db_id,
                    "category_file": "keep.json",
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
    res = await svc.run_sync(force_full=True, request_id="unit-filter-pages-skip")
    assert res.updated_entities >= 1
    assert pid_page not in FakeClient.page_root_fetches
    assert (gdd_dir / "keep.json").is_file()
    assert (gdd_dir / "hub_page.json").exists() is False


@pytest.mark.asyncio
async def test_included_categories_no_match_returns_error(tmp_path: Path) -> None:
    """Filtre incompatible : aucune base ne correspond (pages seules → filtre ignoré)."""
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

        async def query_database(self, database_id: str, **_kw) -> list:
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

        async def query_database(self, database_id: str, **_kw) -> list:
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
    staging_root = gdd_dir / ".staging"
    assert not staging_root.is_dir() or next(staging_root.iterdir(), None) is None


@pytest.mark.asyncio
async def test_run_sync_mirror_retries_transient_502_on_page_content(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """502 transitoires sur get_page_content : retries puis succès et promotion miroir."""
    monkeypatch.setattr(
        "services.gdd_notion_sync_retry.SyncBackoffPolicy.sleep_before_retry",
        _instant_backoff_sleep,
    )
    pid = "1886e4d2-1b45-8039-b51b-eb3826fce1b5"

    class FlakyContentClient:
        _n = 0

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
            FlakyContentClient._n += 1
            if FlakyContentClient._n < 3:
                raise _http_status_error(502)
            return "Corps."

        async def query_database(self, database_id: str, **_kw) -> list:
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
    svc = GddNotionSyncService(
        config_store=store,
        manifest_path=tmp_path / "manifest.json",
        gdd_categories_path=gdd_dir,
        status_path=tmp_path / "status.json",
        client_factory=lambda _k: FlakyContentClient(),
    )
    res = await svc.run_sync(force_full=True, request_id="mirror-retry-ok")
    assert res.success
    assert FlakyContentClient._n == 3
    assert (gdd_dir / "personnages" / f"{pid}.json").is_file()


@pytest.mark.asyncio
async def test_run_sync_mirror_preserves_staging_on_persistent_502(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """502 après épuisement des retries : staging + checkpoint conservés (reprise)."""
    monkeypatch.setattr(
        "services.gdd_notion_sync_retry.SyncBackoffPolicy.sleep_before_retry",
        _instant_backoff_sleep,
    )
    pid = "1886e4d2-1b45-8039-b51b-eb3826fce1b5"

    class Always502ContentClient:
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
            raise _http_status_error(502)

        async def query_database(self, database_id: str, **_kw) -> list:
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
    status_path = tmp_path / "status.json"
    svc = GddNotionSyncService(
        config_store=store,
        manifest_path=tmp_path / "manifest.json",
        gdd_categories_path=gdd_dir,
        status_path=status_path,
        client_factory=lambda _k: Always502ContentClient(),
    )
    res = await svc.run_sync(force_full=True, request_id="mirror-preserve-502")
    assert res.success is False
    assert "Reprise possible" in res.message
    assert res.partial_errors
    staging_root = gdd_dir / ".staging"
    assert staging_root.is_dir()
    assert any(staging_root.iterdir())
    assert checkpoint_json_path(status_path.parent).is_file()


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


@pytest.mark.asyncio
async def test_full_sync_resume_skips_completed_source(tmp_path: Path) -> None:
    """Reprise : les sources déjà dans le checkpoint ne rappellent pas Notion."""
    from services.gdd_notion_full_sync_checkpoint import (
        FullSyncCheckpointState,
        compute_sources_fingerprint,
        save_checkpoint,
    )

    pid_a = "1886e4d2-1b45-8039-b51b-eb3826fce1b5"
    pid_b = "1886e4d2-1b45-8039-b51b-eb3826fce1b6"

    class FakeClient:
        get_page_ids: list[str] = []

        async def verify_credentials(self) -> dict:
            return {}

        async def get_page(self, page_id: str) -> dict:
            FakeClient.get_page_ids.append(page_id)
            title = "A" if page_id == pid_a else "B"
            return {
                "id": page_id,
                "last_edited_time": "2025-01-01T00:00:00.000Z",
                "properties": {
                    "Name": {
                        "type": "title",
                        "title": [{"plain_text": title}],
                    },
                },
            }

        async def get_page_content(self, page_id: str) -> str:
            return f"body-{page_id}"

        async def query_database(self, database_id: str, **_kw) -> list:
            return []

    settings = {
        "schema_version": 1,
        "sync_interval_minutes": 60,
        "auto_sync_enabled": False,
        "sources": [
            {"kind": "page", "notion_id": pid_a, "category_file": "a.json"},
            {"kind": "page", "notion_id": pid_b, "category_file": "b.json"},
        ],
        "included_categories": [],
    }
    store = GddNotionSyncConfigStore(tmp_path / "settings.json", tmp_path / "token.secret")
    store.write_token("dummy-token")
    store.save_settings(settings)
    fp = compute_sources_fingerprint(settings["sources"], [])

    gdd_dir = tmp_path / "gdd"
    gdd_dir.mkdir()
    sync_dir = tmp_path / "sync"
    sync_dir.mkdir()
    status_path = sync_dir / "status.json"

    run_name = "20260101T120000Z_deadbeef"
    staging = gdd_dir / ".staging" / run_name
    staging.mkdir(parents=True)
    (staging / "a.json").write_text(
        json.dumps([{"Nom": "A", "sections": {"_general": "x"}}], ensure_ascii=False),
        encoding="utf-8",
    )

    from services.gdd_notion_manifest import GddNotionManifest

    man = GddNotionManifest()
    man.set_edited(pid_a, "2025-01-01T00:00:00.000Z")
    st = FullSyncCheckpointState(
        staging_run_name=run_name,
        archive_rel=".archive/fake",
        eligible_category_files=["a.json", "b.json"],
        completed_category_files=["a.json"],
        sources_fingerprint=fp,
        updated_entities=1,
    )
    save_checkpoint(sync_dir, st, man)

    svc = GddNotionSyncService(
        config_store=store,
        manifest_path=tmp_path / "manifest.json",
        gdd_categories_path=gdd_dir,
        status_path=status_path,
        client_factory=lambda _k: FakeClient(),
    )
    FakeClient.get_page_ids.clear()
    res = await svc.run_sync(force_full=True, resume=True, request_id="resume-test")
    assert res.success
    assert pid_a not in FakeClient.get_page_ids
    assert all(x == pid_b for x in FakeClient.get_page_ids)
    assert len(FakeClient.get_page_ids) >= 1
    assert (gdd_dir / "b.json").is_file()
    ck_after = (sync_dir / "full_sync_checkpoint.json")
    assert not ck_after.exists()


def test_clear_gdd_file_cache_and_notify_context_invokes_hook(tmp_path: Path) -> None:
    """Hook ``after_gdd_disk_mutation`` appelé après vidage cache (Story 3.9)."""
    calls: list[str] = []

    def hook() -> None:
        calls.append("ok")

    store = GddNotionSyncConfigStore(tmp_path / "settings.json", tmp_path / "token.secret")
    store.save_settings(
        {
            "schema_version": 1,
            "sync_interval_minutes": 60,
            "auto_sync_enabled": False,
            "sources": [],
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
        after_gdd_disk_mutation=hook,
    )
    svc._clear_gdd_file_cache_and_notify_context()
    assert calls == ["ok"]


def test_clear_gdd_file_cache_hook_failure_does_not_propagate(tmp_path: Path) -> None:
    """Une erreur dans le hook est journalisée ; pas de propagation (sync déjà persistée)."""

    def bad_hook() -> None:
        raise RuntimeError("reload simulated failure")

    store = GddNotionSyncConfigStore(tmp_path / "settings.json", tmp_path / "token.secret")
    store.save_settings(
        {
            "schema_version": 1,
            "sync_interval_minutes": 60,
            "auto_sync_enabled": False,
            "sources": [],
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
        after_gdd_disk_mutation=bad_hook,
    )
    svc._clear_gdd_file_cache_and_notify_context()
