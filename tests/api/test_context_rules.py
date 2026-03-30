"""Tests pour les endpoints CRUD des règles de contexte (Story 3.4)."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch

from api.schemas.context_rules import ContextRule, RuleCondition


SAMPLE_RULE_PAYLOAD = {
    "name": "Lieu → personnage",
    "conditions": [{"entity_type": "location"}],
    "suggested_types": ["character"],
}


@pytest.fixture
def rules_client(tmp_path, monkeypatch):
    """Client de test avec ContextRuleService pointant sur un fichier temporaire."""
    from api.main import app
    from services.context_rule_service import ContextRuleService
    from api.dependencies import get_context_rule_service

    service = ContextRuleService(storage_file=tmp_path / "rules.json")
    app.dependency_overrides[get_context_rule_service] = lambda: service

    yield TestClient(app)

    app.dependency_overrides.pop(get_context_rule_service, None)


class TestContextRulesCRUD:
    """Tests CRUD des endpoints /api/v1/context/rules."""

    def test_list_rules_empty(self, rules_client: TestClient) -> None:
        """GET /rules retourne une liste vide initialement."""
        response = rules_client.get("/api/v1/context/rules")
        assert response.status_code == 200
        data = response.json()
        assert data["rules"] == []
        assert data["total"] == 0

    def test_create_rule_returns_201(self, rules_client: TestClient) -> None:
        """POST /rules avec un corps valide retourne 201 et la règle créée."""
        response = rules_client.post("/api/v1/context/rules", json=SAMPLE_RULE_PAYLOAD)
        assert response.status_code == 201
        data = response.json()
        assert "id" in data
        assert data["name"] == SAMPLE_RULE_PAYLOAD["name"]
        assert data["enabled"] is True

    def test_create_rule_then_list(self, rules_client: TestClient) -> None:
        """Après création, GET /rules retourne la règle."""
        rules_client.post("/api/v1/context/rules", json=SAMPLE_RULE_PAYLOAD)
        response = rules_client.get("/api/v1/context/rules")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["rules"][0]["name"] == SAMPLE_RULE_PAYLOAD["name"]

    def test_update_rule_enabled_false(self, rules_client: TestClient) -> None:
        """PUT /rules/{id} avec enabled=false désactive la règle."""
        create_resp = rules_client.post("/api/v1/context/rules", json=SAMPLE_RULE_PAYLOAD)
        rule_id = create_resp.json()["id"]

        update_resp = rules_client.put(
            f"/api/v1/context/rules/{rule_id}",
            json={"enabled": False}
        )
        assert update_resp.status_code == 200
        assert update_resp.json()["enabled"] is False
        assert update_resp.json()["name"] == SAMPLE_RULE_PAYLOAD["name"]

    def test_update_rule_not_found(self, rules_client: TestClient) -> None:
        """PUT /rules/{id} avec un id inconnu retourne 404."""
        response = rules_client.put(
            "/api/v1/context/rules/unknown-id",
            json={"enabled": False}
        )
        assert response.status_code == 404

    def test_delete_rule_returns_204(self, rules_client: TestClient) -> None:
        """DELETE /rules/{id} retourne 204 et supprime la règle."""
        create_resp = rules_client.post("/api/v1/context/rules", json=SAMPLE_RULE_PAYLOAD)
        rule_id = create_resp.json()["id"]

        delete_resp = rules_client.delete(f"/api/v1/context/rules/{rule_id}")
        assert delete_resp.status_code == 204

        list_resp = rules_client.get("/api/v1/context/rules")
        assert list_resp.json()["total"] == 0

    def test_delete_rule_not_found(self, rules_client: TestClient) -> None:
        """DELETE /rules/{id} avec un id inconnu retourne 404."""
        response = rules_client.delete("/api/v1/context/rules/unknown-id")
        assert response.status_code == 404

    def test_create_rule_invalid_no_conditions(self, rules_client: TestClient) -> None:
        """POST /rules sans conditions retourne 422."""
        response = rules_client.post("/api/v1/context/rules", json={
            "name": "Bad rule",
            "conditions": [],
            "suggested_types": ["character"],
        })
        assert response.status_code == 422

    def test_create_rule_invalid_no_suggested_types(self, rules_client: TestClient) -> None:
        """POST /rules sans suggested_types retourne 422."""
        response = rules_client.post("/api/v1/context/rules", json={
            "name": "Bad rule",
            "conditions": [{"entity_type": "location"}],
            "suggested_types": [],
        })
        assert response.status_code == 422

    def test_full_crud_lifecycle(self, rules_client: TestClient) -> None:
        """Cycle complet : créer → lister → modifier → supprimer."""
        # Créer
        rule_id = rules_client.post("/api/v1/context/rules", json=SAMPLE_RULE_PAYLOAD).json()["id"]
        # Modifier
        rules_client.put(f"/api/v1/context/rules/{rule_id}", json={"name": "Modifié"})
        # Vérifier
        rules = rules_client.get("/api/v1/context/rules").json()["rules"]
        assert rules[0]["name"] == "Modifié"
        # Supprimer
        rules_client.delete(f"/api/v1/context/rules/{rule_id}")
        assert rules_client.get("/api/v1/context/rules").json()["total"] == 0

    def test_rules_by_dialogue_type_fallback_then_specific(self, rules_client: TestClient) -> None:
        """GET by-dialogue-type fallback global, puis spécifique après PUT."""
        # Règle globale
        rules_client.post("/api/v1/context/rules", json=SAMPLE_RULE_PAYLOAD)

        fallback = rules_client.get("/api/v1/context/rules/by-dialogue-type/salutation")
        assert fallback.status_code == 200
        assert fallback.json()["source"] == "fallback_global"
        assert len(fallback.json()["rules"]) == 1

        # Règles spécifiques salutation
        put_resp = rules_client.put(
            "/api/v1/context/rules/by-dialogue-type/salutation",
            json=[{
                "name": "Salut -> personnage",
                "conditions": [{"entity_type": "location"}],
                "suggested_types": ["character"],
            }],
        )
        assert put_resp.status_code == 200
        assert put_resp.json()["source"] == "specific"
        assert put_resp.json()["dialogue_type"] == "salutation"
        assert len(put_resp.json()["rules"]) == 1
        assert put_resp.json()["rules"][0]["dialogue_type"] == "salutation"

        # Un autre type reste en fallback global
        other = rules_client.get("/api/v1/context/rules/by-dialogue-type/confrontation")
        assert other.status_code == 200
        assert other.json()["source"] == "fallback_global"


class TestSuggestionsWithRules:
    """Tests d'intégration : règles actives filtrent les suggestions (Task 2)."""

    @pytest.fixture
    def suggestions_client_with_mocks(self, tmp_path):
        """Client de test avec ContextRuleService + ContextBuilder mockés."""
        from api.main import app
        from services.context_rule_service import ContextRuleService
        from api.dependencies import get_context_rule_service, get_context_builder
        from core.context.context_builder import ContextBuilder

        service = ContextRuleService(storage_file=tmp_path / "rules.json")

        mock_builder = MagicMock(spec=ContextBuilder)
        mock_builder.get_linked_elements = MagicMock(return_value={
            "characters": {"Bob"},
            "locations": {"Forest"},
            "items": {"Sword"},
            "species": set(),
            "communities": set(),
        })

        app.dependency_overrides[get_context_rule_service] = lambda: service
        app.dependency_overrides[get_context_builder] = lambda: mock_builder

        yield TestClient(app), service

        app.dependency_overrides.pop(get_context_rule_service, None)
        app.dependency_overrides.pop(get_context_builder, None)

    def _empty_already_selected(self):
        return {
            "characters_full": [], "characters_excerpt": [],
            "locations_full": [], "locations_excerpt": [],
            "items_full": [], "items_excerpt": [],
            "species_full": [], "species_excerpt": [],
            "communities_full": [], "communities_excerpt": [],
            "dialogues_examples": [],
        }

    def test_no_rules_returns_all_linked_entities(self, suggestions_client_with_mocks) -> None:
        """Sans règles actives, comportement Story 3.3 préservé (toutes entités liées)."""
        client, _ = suggestions_client_with_mocks
        response = client.post("/api/v1/context/suggestions", json={
            "trigger_type": "location",
            "trigger_name": "Nef Centrale",
            "already_selected": self._empty_already_selected(),
        })
        assert response.status_code == 200
        types = {s["type"] for s in response.json()["suggestions"]}
        # Toutes les catégories avec des entités sont présentes (comportement 3.3)
        assert "character" in types
        assert "location" in types
        assert "item" in types

    def test_active_rule_filters_suggestions_to_allowed_types(
        self, suggestions_client_with_mocks
    ) -> None:
        """Règle active 'location → character' : seuls les characters GDD liés sont suggérés."""
        client, service = suggestions_client_with_mocks
        from api.schemas.context_rules import CreateRuleRequest, RuleCondition
        service.create_rule(CreateRuleRequest(
            name="Lieu → personnage",
            conditions=[RuleCondition(entity_type="location")],
            suggested_types=["character"],
        ))

        response = client.post("/api/v1/context/suggestions", json={
            "trigger_type": "location",
            "trigger_name": "Nef Centrale",
            "already_selected": self._empty_already_selected(),
        })
        assert response.status_code == 200
        types = {s["type"] for s in response.json()["suggestions"]}
        assert types == {"character"}
        # location et item ne sont PAS suggérés (filtrés par la règle)
        assert "location" not in types
        assert "item" not in types

    def test_suggestions_apply_dialogue_type_specific_rules(self, suggestions_client_with_mocks) -> None:
        """Avec dialogue_type=confrontation, seules les règles de ce type s'appliquent."""
        client, service = suggestions_client_with_mocks
        from api.schemas.context_rules import CreateRuleRequest, RuleCondition

        service.create_rule(CreateRuleRequest(
            name="Global location -> character",
            conditions=[RuleCondition(entity_type="location")],
            suggested_types=["character"],
        ))
        service.create_rule(CreateRuleRequest(
            name="Confrontation location -> item",
            conditions=[RuleCondition(entity_type="location")],
            suggested_types=["item"],
            dialogue_type="confrontation",
        ))

        response = client.post("/api/v1/context/suggestions", json={
            "trigger_type": "location",
            "trigger_name": "Nef Centrale",
            "dialogue_type": "confrontation",
            "already_selected": self._empty_already_selected(),
        })
        assert response.status_code == 200
        types = {s["type"] for s in response.json()["suggestions"]}
        assert types == {"item"}

    def test_disabled_rule_falls_back_to_default(self, suggestions_client_with_mocks) -> None:
        """Règle désactivée → comportement Story 3.3 préservé."""
        client, service = suggestions_client_with_mocks
        from api.schemas.context_rules import CreateRuleRequest, RuleCondition, UpdateRuleRequest
        created = service.create_rule(CreateRuleRequest(
            name="Lieu → personnage",
            conditions=[RuleCondition(entity_type="location")],
            suggested_types=["character"],
        ))
        service.update_rule(created.id, UpdateRuleRequest(enabled=False))

        response = client.post("/api/v1/context/suggestions", json={
            "trigger_type": "location",
            "trigger_name": "Nef Centrale",
            "already_selected": self._empty_already_selected(),
        })
        assert response.status_code == 200
        types = {s["type"] for s in response.json()["suggestions"]}
        # Comportement 3.3 : toutes les entités liées
        assert "character" in types
        assert "location" in types
