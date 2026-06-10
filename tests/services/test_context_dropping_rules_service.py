"""Tests unitaires ContextDroppingRulesService (Story 4.10 — données génériques)."""
from __future__ import annotations

import json
import pytest
from pathlib import Path

from services.context_dropping_rules_service import (
    ContextDroppingRulesService,
    DEFAULT_RULES,
    ContextDroppingRulesData,
)


@pytest.fixture()
def rules_file(tmp_path: Path) -> Path:
    """Chemin vers un fichier de règles temporaire."""
    return tmp_path / "validation-rules" / "context-dropping.json"


@pytest.fixture()
def svc(rules_file: Path) -> ContextDroppingRulesService:
    """Service avec stockage isolé."""
    return ContextDroppingRulesService(storage_file=rules_file)


# ── Lecture sans fichier ──────────────────────────────────────────────────────

def test_get_rules_returns_defaults_when_no_file(svc: ContextDroppingRulesService):
    rules = svc.get_rules()
    assert isinstance(rules, ContextDroppingRulesData)
    assert rules.rules_profile == DEFAULT_RULES.rules_profile
    assert isinstance(rules.mandatory_info, list)
    assert isinstance(rules.dialogue_type_overrides, dict)


def test_get_rules_creates_parent_directory(tmp_path: Path):
    deep = tmp_path / "a" / "b" / "c" / "rules.json"
    svc = ContextDroppingRulesService(storage_file=deep)
    rules = svc.get_rules()
    assert isinstance(rules, ContextDroppingRulesData)


# ── Écriture + relecture ──────────────────────────────────────────────────────

def test_put_then_get_round_trip(svc: ContextDroppingRulesService):
    payload = ContextDroppingRulesData(
        rules_profile="light",
        tolerance=0.4,
        mandatory_info=["info-fictive-1", "info-fictive-2"],
        dialogue_type_overrides={"combat": {"rules_profile": "strict"}},
    )
    svc.save_rules(payload)
    result = svc.get_rules()
    assert result.rules_profile == "light"
    assert result.tolerance == pytest.approx(0.4)
    assert "info-fictive-1" in result.mandatory_info
    assert "combat" in result.dialogue_type_overrides


# ── JSON corrompu ─────────────────────────────────────────────────────────────

def test_get_rules_corrupted_json_raises_value_error(rules_file: Path):
    rules_file.parent.mkdir(parents=True, exist_ok=True)
    rules_file.write_text("{invalid json}", encoding="utf-8")
    svc = ContextDroppingRulesService(storage_file=rules_file)
    with pytest.raises(ValueError, match="JSON"):
        svc.get_rules()


# ── Validation schéma ─────────────────────────────────────────────────────────

def test_save_rules_invalid_profile_raises(svc: ContextDroppingRulesService):
    """Pydantic valide à la construction — profil invalide → ValidationError immédiat."""
    with pytest.raises(Exception):
        ContextDroppingRulesData(rules_profile="unknown")  # type: ignore[arg-type]


def test_default_rules_are_valid():
    assert DEFAULT_RULES.rules_profile in ("strict", "light")
    assert isinstance(DEFAULT_RULES.mandatory_info, list)
