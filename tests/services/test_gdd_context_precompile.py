"""Tests du cache de précompilation des fiches GDD."""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from models.prompt_structure import PromptMetadata, PromptStructure
from services.gdd_context_precompile import (
    PrecompiledFicheVariant,
    compute_content_hash,
    load_variant,
    precompile_root,
    resolve_fields_profile_id,
    save_variant,
    variant_cache_key,
    write_manifest,
)


@pytest.fixture
def repo_root(tmp_path: Path) -> Path:
    return tmp_path


@pytest.fixture
def sample_record() -> dict:
    return {
        "Nom": "Alice Test",
        "Introduction": {"Résumé de la fiche": "Une aventurière."},
    }


def test_compute_content_hash_stable(sample_record: dict) -> None:
    """Hash identique pour le même record."""
    h1 = compute_content_hash(sample_record)
    h2 = compute_content_hash(dict(sample_record))
    assert h1 == h2
    assert len(h1) == 64


def test_resolve_fields_profile_id_standard() -> None:
    assert resolve_fields_profile_id(None) == "standard"
    assert resolve_fields_profile_id({}) == "standard"


def test_resolve_fields_profile_id_custom() -> None:
    profile = resolve_fields_profile_id({"character": ["Nom", "Bio"]})
    assert profile.startswith("custom:")


def test_save_and_load_variant_round_trip(
    repo_root: Path,
    sample_record: dict,
) -> None:
    """Round-trip save/load avec content_hash."""
    variant = PrecompiledFicheVariant(
        context_item={"id": "PNJ_1", "name": "Alice Test", "sections": []},
        serialized_item_text="--- Alice Test ---",
        token_count=12,
        fields_used=["Nom"],
        compiled_at="2026-01-01T00:00:00+00:00",
    )
    save_variant(
        repo_root,
        "personnages",
        "Alice Test",
        sample_record,
        "narrative",
        "full",
        "standard",
        variant,
    )
    loaded = load_variant(
        repo_root,
        "personnages",
        "Alice Test",
        "narrative",
        "full",
        "standard",
        expected_content_hash=compute_content_hash(sample_record),
    )
    assert loaded is not None
    assert loaded.token_count == 12
    assert loaded.context_item["name"] == "Alice Test"


def test_load_variant_stale_hash_returns_none(
    repo_root: Path,
    sample_record: dict,
) -> None:
    variant = PrecompiledFicheVariant(
        context_item={"id": "PNJ_1", "name": "Alice Test", "sections": []},
        serialized_item_text="",
        token_count=1,
        fields_used=[],
        compiled_at="2026-01-01T00:00:00+00:00",
    )
    save_variant(
        repo_root,
        "personnages",
        "Alice Test",
        sample_record,
        "narrative",
        "full",
        "standard",
        variant,
    )
    stale = load_variant(
        repo_root,
        "personnages",
        "Alice Test",
        "narrative",
        "full",
        "standard",
        expected_content_hash="deadbeef",
    )
    assert stale is None


def test_write_manifest(repo_root: Path) -> None:
    write_manifest(repo_root, entity_count=3)
    manifest_path = precompile_root(repo_root) / "manifest.json"
    assert manifest_path.is_file()
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert data["entity_count"] == 3
    assert data["schema_version"] == 2


def test_variant_cache_key_format() -> None:
    key = variant_cache_key("narrative", "full", "standard")
    assert key == "narrative:full:standard"


def test_precompile_entity_unknown_category_returns_zero_no_warning(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Une catégorie absente de STEM_TO_CATEGORY_KEY retourne 0 sans WARNING."""
    import logging

    from services.gdd_context_precompile import precompile_entity

    mock_cb = MagicMock()
    record = {"Nom": "Fondation de la Jungle Vivarcade"}

    with caplog.at_level(logging.WARNING, logger="services.gdd_context_precompile"):
        result = precompile_entity(mock_cb, category_stem="Chronologie_d'Escelion", record=record)

    assert result == 0
    assert not any(r.levelno >= logging.WARNING for r in caplog.records), (
        f"Un WARNING inattendu a été émis : {[r.message for r in caplog.records]}"
    )


def test_append_entity_history_triggers_precompile(tmp_path: Path) -> None:
    """Sync : _append_entity_history appelle precompile_entity."""
    from services.gdd_notion_sync_service import GddNotionSyncService

    record = {"Nom": "Bob", "Introduction": {"Résumé de la fiche": "Test"}}
    with patch("services.gdd_context_precompile.precompile_entity") as mock_pre:
        GddNotionSyncService._append_entity_history(
            "personnages",
            None,
            False,
            [("page-id", record)],
        )
        mock_pre.assert_called_once()
        assert mock_pre.call_args.kwargs["category_stem"] == "personnages"
        assert mock_pre.call_args.kwargs["record"]["Nom"] == "Bob"
