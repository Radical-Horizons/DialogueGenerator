"""Tests utilitaires sync GDD Notion."""
import pytest

from services.gdd_notion_sync_utils import (
    category_file_matches_included,
    mask_secret,
    normalize_notion_id,
    redact_notion_token_from_text,
)


def test_normalize_notion_id_accepts_dashes() -> None:
    u = "1886e4d2-1b45-8039-b51b-eb3826fce1b5"
    assert normalize_notion_id(u) == "1886e4d2-1b45-8039-b51b-eb3826fce1b5"


def test_normalize_notion_id_no_dashes() -> None:
    u = "1886e4d21b458039b51beb3826fce1b5"
    assert normalize_notion_id(u) == "1886e4d2-1b45-8039-b51b-eb3826fce1b5"


def test_normalize_notion_id_invalid() -> None:
    with pytest.raises(ValueError):
        normalize_notion_id("not-a-uuid")


def test_mask_secret() -> None:
    assert mask_secret("secret_abc123xyz") == "****3xyz"
    assert mask_secret("") == ""
    assert mask_secret("ab") == "****"


def test_category_file_matches_included_empty_means_all() -> None:
    assert category_file_matches_included("lieux.json", []) is True
    assert category_file_matches_included("lieux.json", ["", "  "]) is True


def test_category_file_matches_included_by_stem_or_name() -> None:
    assert category_file_matches_included("lieux.json", ["lieux"]) is True
    assert category_file_matches_included("lieux.json", ["lieux.json"]) is True
    assert category_file_matches_included("lieux.json", ["personnages"]) is False


def test_redact_notion_token_from_text() -> None:
    t = redact_notion_token_from_text("Bearer secret_abcdefghijklmnopqrstuvwxyz")
    assert "secret_" not in t
    assert "[REDACTED]" in t or "REDACTED" in t
