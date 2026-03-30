"""Tests manifeste incrémental GDD Notion."""
from services.gdd_notion_manifest import (
    GddNotionManifest,
    filter_stale_page_ids,
)


def test_filter_stale_unknown_page() -> None:
    m = GddNotionManifest()
    pages = [
        {"id": "p1", "last_edited_time": "2024-01-02T00:00:00.000Z"},
    ]
    ids, stale = filter_stale_page_ids(pages, m, force_full=False)
    assert stale == pages


def test_filter_stale_up_to_date() -> None:
    m = GddNotionManifest()
    m.set_edited("p1", "2024-01-02T00:00:00.000Z")
    pages = [
        {"id": "p1", "last_edited_time": "2024-01-02T00:00:00.000Z"},
    ]
    _, stale = filter_stale_page_ids(pages, m, force_full=False)
    assert stale == []


def test_filter_stale_newer_on_notion() -> None:
    m = GddNotionManifest()
    m.set_edited("p1", "2024-01-01T00:00:00.000Z")
    pages = [
        {"id": "p1", "last_edited_time": "2024-01-03T00:00:00.000Z"},
    ]
    _, stale = filter_stale_page_ids(pages, m, force_full=False)
    assert len(stale) == 1


def test_force_full_all_stale() -> None:
    m = GddNotionManifest()
    m.set_edited("p1", "2099-01-01T00:00:00.000Z")
    pages = [{"id": "p1", "last_edited_time": "2024-01-01T00:00:00.000Z"}]
    _, stale = filter_stale_page_ids(pages, m, force_full=True)
    assert len(stale) == 1
