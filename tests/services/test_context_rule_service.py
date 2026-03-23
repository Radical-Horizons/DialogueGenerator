"""Tests unitaires pour ContextRuleService (Story 3.4)."""
from __future__ import annotations

import json
import pytest
from pathlib import Path

from api.schemas.context_rules import ContextRule, RuleCondition, CreateRuleRequest, UpdateRuleRequest
from services.context_rule_service import ContextRuleService


@pytest.fixture
def rule_service(tmp_path: Path) -> ContextRuleService:
    """Service avec fichier de règles temporaire."""
    return ContextRuleService(storage_file=tmp_path / "rules.json")


def _make_create_request(**kwargs) -> CreateRuleRequest:
    """Helper pour créer une requête de création avec des valeurs par défaut."""
    defaults = {
        "name": "Test rule",
        "conditions": [RuleCondition(entity_type="location")],
        "suggested_types": ["character"],
    }
    defaults.update(kwargs)
    return CreateRuleRequest(**defaults)


class TestContextRuleServiceCRUD:
    """Tests CRUD du ContextRuleService."""

    def test_list_rules_empty_initially(self, rule_service: ContextRuleService) -> None:
        """list_rules retourne une liste vide si aucune règle n'existe."""
        assert rule_service.list_rules() == []

    def test_create_rule_returns_rule_with_id(self, rule_service: ContextRuleService) -> None:
        """create_rule retourne une ContextRule avec un id généré."""
        req = _make_create_request()
        rule = rule_service.create_rule(req)
        assert isinstance(rule, ContextRule)
        assert rule.id != ""
        assert rule.name == "Test rule"
        assert rule.enabled is True
        assert rule.priority == 1

    def test_create_rule_persists_to_file(self, rule_service: ContextRuleService, tmp_path: Path) -> None:
        """La règle créée est persistée dans le fichier JSON."""
        rule_service.create_rule(_make_create_request())
        rules_file = tmp_path / "rules.json"
        assert rules_file.exists()
        data = json.loads(rules_file.read_text(encoding="utf-8"))
        assert len(data["rules"]) == 1

    def test_list_rules_returns_created_rule(self, rule_service: ContextRuleService) -> None:
        """list_rules retourne les règles créées."""
        rule_service.create_rule(_make_create_request(name="A"))
        rules = rule_service.list_rules()
        assert len(rules) == 1
        assert rules[0].name == "A"

    def test_list_rules_sorted_by_priority(self, rule_service: ContextRuleService) -> None:
        """list_rules trie les règles par priorité croissante."""
        rule_service.create_rule(_make_create_request(name="P2", priority=2))
        rule_service.create_rule(_make_create_request(name="P1", priority=1))
        rules = rule_service.list_rules()
        assert [r.name for r in rules] == ["P1", "P2"]

    def test_create_rule_auto_priority(self, rule_service: ContextRuleService) -> None:
        """Les priorités sont incrémentales si non spécifiées."""
        r1 = rule_service.create_rule(_make_create_request())
        r2 = rule_service.create_rule(_make_create_request())
        assert r2.priority == r1.priority + 1

    def test_get_rule_returns_rule(self, rule_service: ContextRuleService) -> None:
        """get_rule retourne la règle par son id."""
        created = rule_service.create_rule(_make_create_request())
        found = rule_service.get_rule(created.id)
        assert found is not None
        assert found.id == created.id

    def test_get_rule_unknown_returns_none(self, rule_service: ContextRuleService) -> None:
        """get_rule retourne None pour un id inconnu."""
        assert rule_service.get_rule("unknown-id") is None

    def test_update_rule_enabled(self, rule_service: ContextRuleService) -> None:
        """update_rule peut désactiver une règle."""
        created = rule_service.create_rule(_make_create_request())
        updated = rule_service.update_rule(created.id, UpdateRuleRequest(enabled=False))
        assert updated is not None
        assert updated.enabled is False
        assert updated.name == created.name  # champ non modifié préservé

    def test_update_rule_name(self, rule_service: ContextRuleService) -> None:
        """update_rule peut changer le nom."""
        created = rule_service.create_rule(_make_create_request(name="Old"))
        updated = rule_service.update_rule(created.id, UpdateRuleRequest(name="New"))
        assert updated is not None
        assert updated.name == "New"

    def test_update_rule_unknown_returns_none(self, rule_service: ContextRuleService) -> None:
        """update_rule retourne None pour un id inconnu."""
        assert rule_service.update_rule("unknown", UpdateRuleRequest(enabled=False)) is None

    def test_delete_rule_returns_true(self, rule_service: ContextRuleService) -> None:
        """delete_rule retourne True si la règle existait."""
        created = rule_service.create_rule(_make_create_request())
        assert rule_service.delete_rule(created.id) is True
        assert rule_service.list_rules() == []

    def test_delete_rule_unknown_returns_false(self, rule_service: ContextRuleService) -> None:
        """delete_rule retourne False pour un id inconnu."""
        assert rule_service.delete_rule("unknown") is False

    def test_delete_rule_persists(self, rule_service: ContextRuleService, tmp_path: Path) -> None:
        """La suppression est persistée dans le fichier."""
        created = rule_service.create_rule(_make_create_request())
        rule_service.delete_rule(created.id)
        data = json.loads((tmp_path / "rules.json").read_text(encoding="utf-8"))
        assert data["rules"] == []


class TestContextRuleServiceEvaluation:
    """Tests d'évaluation des règles (evaluate_rules)."""

    def test_evaluate_rules_no_rules_returns_none(self, rule_service: ContextRuleService) -> None:
        """evaluate_rules retourne None si aucune règle n'existe (→ fallback 3.3)."""
        result = rule_service.evaluate_rules("location", "Nef Centrale", {})
        assert result is None

    def test_evaluate_rules_disabled_rules_returns_none(self, rule_service: ContextRuleService) -> None:
        """evaluate_rules retourne None si toutes les règles sont désactivées."""
        created = rule_service.create_rule(_make_create_request())
        rule_service.update_rule(created.id, UpdateRuleRequest(enabled=False))
        result = rule_service.evaluate_rules("location", "Nef Centrale", {})
        assert result is None

    def test_evaluate_rules_or_location_trigger_matches(self, rule_service: ContextRuleService) -> None:
        """Règle OR avec condition location fire sur trigger location."""
        rule_service.create_rule(_make_create_request(
            conditions=[RuleCondition(entity_type="location")],
            suggested_types=["character"],
        ))
        result = rule_service.evaluate_rules("location", "Nef Centrale", {})
        assert result == {"character"}

    def test_evaluate_rules_or_character_trigger_no_match(self, rule_service: ContextRuleService) -> None:
        """Règle OR avec condition location ne fire PAS sur trigger character."""
        rule_service.create_rule(_make_create_request(
            conditions=[RuleCondition(entity_type="location")],
            suggested_types=["character"],
        ))
        result = rule_service.evaluate_rules("character", "Akthar", {})
        # Des règles existent mais aucune ne matche → set vide (pas None)
        assert result == set()

    def test_evaluate_rules_and_conditions_both_met(self, rule_service: ContextRuleService) -> None:
        """Règle AND fire si toutes les conditions sont dans la sélection."""
        rule_service.create_rule(_make_create_request(
            condition_operator="AND",
            conditions=[
                RuleCondition(entity_type="character"),
                RuleCondition(entity_type="location"),
            ],
            suggested_types=["community"],
        ))
        # trigger = character, already_selected inclut location
        result = rule_service.evaluate_rules(
            "character", "Akthar",
            {"location": {"Nef Centrale"}}
        )
        assert result == {"community"}

    def test_evaluate_rules_and_conditions_partial_no_match(self, rule_service: ContextRuleService) -> None:
        """Règle AND ne fire PAS si une condition manque."""
        rule_service.create_rule(_make_create_request(
            condition_operator="AND",
            conditions=[
                RuleCondition(entity_type="character"),
                RuleCondition(entity_type="location"),
            ],
            suggested_types=["community"],
        ))
        # trigger = character uniquement, pas de location
        result = rule_service.evaluate_rules("character", "Akthar", {})
        assert result == set()

    def test_evaluate_rules_specific_entity_name_matches(self, rule_service: ContextRuleService) -> None:
        """Condition avec entity_name spécifique ne matche que pour cette entité."""
        rule_service.create_rule(_make_create_request(
            conditions=[RuleCondition(entity_type="location", entity_name="Nef Centrale")],
            suggested_types=["character"],
        ))
        assert rule_service.evaluate_rules("location", "Nef Centrale", {}) == {"character"}
        # Autre lieu → pas de match
        result = rule_service.evaluate_rules("location", "Salle des Archives", {})
        assert result == set()

    def test_evaluate_rules_multiple_rules_union(self, rule_service: ContextRuleService) -> None:
        """Plusieurs règles matchantes : union des suggested_types."""
        rule_service.create_rule(_make_create_request(
            conditions=[RuleCondition(entity_type="location")],
            suggested_types=["character"],
        ))
        rule_service.create_rule(_make_create_request(
            conditions=[RuleCondition(entity_type="location")],
            suggested_types=["community"],
        ))
        result = rule_service.evaluate_rules("location", "Nef Centrale", {})
        assert result == {"character", "community"}
