"""Tests API GET/POST /api/v1/templates (Story 6.1.1 — matrice I/O)."""
import json
from pathlib import Path
from typing import Any, Dict, Iterator
from unittest.mock import Mock
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from api.config.security_config import get_security_config
from api.dependencies import get_template_service
from api.main import app
from api.schemas.preset import PresetValidationResult
from api.schemas.template import TEMPLATE_NAME_MAX_LENGTH
from services.preset_service import PresetService
from services.template_service import TemplateService


def _sample_create_payload(**overrides: Any) -> Dict[str, Any]:
    """Payload POST générique (IDs fixtures, pas de noms GDD réels)."""
    payload: Dict[str, Any] = {
        "name": "Template API",
        "description": "Desc API",
        "category": "Confrontation",
        "icon": "⚔️",
        "configuration": {
            "characters": ["char-alpha"],
            "locations": ["loc-alpha"],
            "region": "loc-alpha",
            "sceneType": "Generic",
            "instructions": "Brief de test",
            "llmModel": "gpt-5.6-terra",
        },
    }
    payload.update(overrides)
    return payload


@pytest.fixture
def mock_context_builder() -> Mock:
    """ContextBuilder mocké avec IDs génériques."""
    from services.element_repository import ElementRepository
    from services.gdd_loader import GDDData

    gdd_data = GDDData(
        characters=[{"Nom": "char-alpha", "id": "char-001"}],
        locations=[{"Nom": "loc-alpha", "id": "loc-001"}],
    )
    repo = ElementRepository(gdd_data)
    builder = Mock()
    builder._gdd_data = gdd_data
    builder._element_repository = repo
    builder.get_characters_names.return_value = ["char-alpha"]
    builder.get_locations_names.return_value = ["loc-alpha"]
    builder.load_gdd_files = Mock()
    return builder


@pytest.fixture
def template_service(tmp_path: Path, mock_context_builder: Mock) -> TemplateService:
    """TemplateService réel sur tmp_path (disque isolé)."""
    preset_service = PresetService(
        config_service=Mock(),
        context_builder=mock_context_builder,
        presets_dir=tmp_path / "presets",
    )
    return TemplateService(
        preset_service=preset_service,
        templates_dir=tmp_path / "templates" / "custom",
    )


@pytest.fixture
def client(template_service: TemplateService) -> Iterator[TestClient]:
    """Client API avec TemplateService injecté (tmp_path)."""
    app.dependency_overrides[get_template_service] = lambda: template_service
    yield TestClient(app)
    app.dependency_overrides.pop(get_template_service, None)


class TestTemplatesCreateHappy:
    """POST happy path — 201, fichier UUID, visible au GET."""

    @pytest.mark.p0
    def test_create_template_201_writes_uuid_json_and_appears_in_get(
        self,
        client: TestClient,
        template_service: TemplateService,
    ) -> None:
        """Given un POST valide, when sauvegarde, then 201 + UUID.json + item dans GET."""
        response = client.post("/api/v1/templates", json=_sample_create_payload())

        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Template API"
        assert data["category"] == "Confrontation"
        assert data["warnings"] == []
        assert UUID(data["id"])
        assert data["configuration"]["characters"] == ["char-alpha"]
        assert data["configuration"]["llmModel"] == "gpt-5.6-terra"
        assert data["history"][0]["action"] == "created"

        template_file = template_service.templates_dir / f"{data['id']}.json"
        assert template_file.exists()

        listed = client.get("/api/v1/templates")
        assert listed.status_code == 200
        names = [item["name"] for item in listed.json()]
        assert "Template API" in names


class TestTemplatesValidation:
    """Validation Pydantic et GDD lazy."""

    def test_create_template_empty_name_422(self, client: TestClient) -> None:
        """Given name vide, when POST, then 422."""
        response = client.post("/api/v1/templates", json=_sample_create_payload(name=""))

        assert response.status_code == 422

    def test_create_template_whitespace_name_422(self, client: TestClient) -> None:
        """Given name = espaces, when POST, then 422."""
        response = client.post("/api/v1/templates", json=_sample_create_payload(name="   "))

        assert response.status_code == 422

    def test_create_template_name_too_long_422(self, client: TestClient) -> None:
        """Given un nom trop long, when POST, then 422."""
        response = client.post(
            "/api/v1/templates",
            json=_sample_create_payload(name="x" * (TEMPLATE_NAME_MAX_LENGTH + 1)),
        )

        assert response.status_code == 422

    def test_create_template_obsolete_gdd_201_with_warnings(
        self,
        client: TestClient,
    ) -> None:
        """Given des IDs GDD inconnus, when POST, then 201 + warnings (pas 4xx)."""
        payload = _sample_create_payload()
        payload["configuration"]["characters"] = ["char-obsolete"]
        payload["configuration"]["locations"] = ["loc-obsolete"]
        payload["configuration"]["region"] = "loc-obsolete"

        response = client.post("/api/v1/templates", json=payload)

        assert response.status_code == 201
        data = response.json()
        assert isinstance(data["warnings"], list)
        assert len(data["warnings"]) >= 1


class TestTemplatesList:
    """GET collection."""

    def test_list_templates_empty(self, client: TestClient) -> None:
        """Given aucun fichier, when GET, then []."""
        response = client.get("/api/v1/templates")

        assert response.status_code == 200
        assert response.json() == []

    def test_list_templates_multiple_categories(self, client: TestClient) -> None:
        """Given 3 templates / 2 catégories, when GET, then tous sont retournés."""
        client.post(
            "/api/v1/templates",
            json=_sample_create_payload(name="T1", category="Salutation"),
        )
        client.post(
            "/api/v1/templates",
            json=_sample_create_payload(name="T2", category="Confrontation"),
        )
        client.post(
            "/api/v1/templates",
            json=_sample_create_payload(name="T3", category="Salutation"),
        )

        response = client.get("/api/v1/templates")

        assert response.status_code == 200
        items = response.json()
        assert len(items) == 3
        categories = {item["category"] for item in items}
        assert categories == {"Salutation", "Confrontation"}
        assert "warnings" not in items[0]

    def test_list_templates_non_object_json_does_not_500(
        self,
        client: TestClient,
        template_service: TemplateService,
    ) -> None:
        """Given un JSON liste sur disque, when GET, then 200 (fichier ignoré)."""
        array_file = template_service.templates_dir / "array.json"
        array_file.write_text('["not-an-object"]', encoding="utf-8")

        response = client.get("/api/v1/templates")

        assert response.status_code == 200
        assert response.json() == []


class TestTemplatesAuth:
    """Auth guest JWT OK ; sans JWT → 401 si auth active."""

    def test_create_template_guest_jwt_201(self, client: TestClient) -> None:
        """Given un token guest, when POST, then 201."""
        guest = client.post("/api/v1/auth/guest")
        assert guest.status_code == 200
        token = guest.json()["access_token"]

        response = client.post(
            "/api/v1/templates",
            json=_sample_create_payload(name="Guest template"),
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 201
        assert response.json()["name"] == "Guest template"
        assert "warnings" in response.json()

    def test_create_template_without_auth_401(
        self,
        client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Given disable_auth=False et pas de JWT, when POST, then 401."""
        monkeypatch.setattr(get_security_config(), "disable_auth", False)

        response = client.post("/api/v1/templates", json=_sample_create_payload())

        assert response.status_code == 401


class TestTemplatesCreateWarningsFromService:
    """Le corps 201 expose toujours ``warnings`` même si le service les fournit."""

    def test_create_returns_service_warnings(
        self,
        tmp_path: Path,
    ) -> None:
        """Given des warnings service, when POST, then le body les inclut."""
        mock_preset = Mock(spec=PresetService)
        mock_preset.validate_preset_references.return_value = PresetValidationResult(
            valid=False,
            warnings=["Character 'char-obsolete' not found in GDD"],
            obsoleteRefs=["char-obsolete"],
            resolvedRefs={},
        )
        service = TemplateService(mock_preset, tmp_path / "templates")
        app.dependency_overrides[get_template_service] = lambda: service
        try:
            test_client = TestClient(app)
            payload = _sample_create_payload()
            payload["configuration"]["characters"] = ["char-obsolete"]
            response = test_client.post("/api/v1/templates", json=payload)
            assert response.status_code == 201
            assert response.json()["warnings"] == [
                "Character 'char-obsolete' not found in GDD"
            ]
        finally:
            app.dependency_overrides.pop(get_template_service, None)


class TestTemplatesGetPutDelete:
    """GET/PUT/DELETE par id — matrice I/O 6.2."""

    def test_get_template_200(self, client: TestClient) -> None:
        """Given un UUID existant, when GET, then 200."""
        created = client.post("/api/v1/templates", json=_sample_create_payload()).json()
        response = client.get(f"/api/v1/templates/{created['id']}")
        assert response.status_code == 200
        assert response.json()["id"] == created["id"]
        assert "warnings" not in response.json()

    def test_get_template_404(self, client: TestClient) -> None:
        """Given un UUID absent, when GET, then 404."""
        response = client.get("/api/v1/templates/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
        assert response.status_code == 404

    @pytest.mark.p0
    def test_put_updates_same_id_and_appends_history(
        self,
        client: TestClient,
        template_service: TemplateService,
    ) -> None:
        """Given un PUT nom+desc, when sauvegarde, then même UUID + history updated."""
        created = client.post("/api/v1/templates", json=_sample_create_payload()).json()
        response = client.put(
            f"/api/v1/templates/{created['id']}",
            json={"name": "Renommé", "description": "MAJ"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == created["id"]
        assert data["name"] == "Renommé"
        assert data["description"] == "MAJ"
        assert data["history"][-1]["action"] == "updated"
        assert data["metadata"]["modified"] != created["metadata"]["created"]
        assert data["warnings"] == []
        assert (template_service.templates_dir / f"{created['id']}.json").exists()
        files = list(template_service.templates_dir.glob("*.json"))
        assert len(files) == 1

    def test_put_template_404(self, client: TestClient) -> None:
        """Given un UUID absent, when PUT, then 404."""
        response = client.put(
            "/api/v1/templates/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            json={"name": "Fantôme"},
        )
        assert response.status_code == 404

    def test_put_whitespace_name_422(self, client: TestClient) -> None:
        """Given name = espaces, when PUT, then 422."""
        created = client.post("/api/v1/templates", json=_sample_create_payload()).json()
        response = client.put(
            f"/api/v1/templates/{created['id']}",
            json={"name": "   "},
        )
        assert response.status_code == 422

    def test_put_obsolete_gdd_200_with_warnings(self, client: TestClient) -> None:
        """Given des IDs GDD inconnus, when PUT, then 200 + warnings."""
        created = client.post("/api/v1/templates", json=_sample_create_payload()).json()
        config = created["configuration"]
        config["characters"] = ["char-obsolete"]
        config["locations"] = ["loc-obsolete"]
        config["region"] = "loc-obsolete"
        response = client.put(
            f"/api/v1/templates/{created['id']}",
            json={"configuration": config},
        )
        assert response.status_code == 200
        assert len(response.json()["warnings"]) >= 1

    @pytest.mark.p0
    def test_delete_204_and_gone_from_list(
        self,
        client: TestClient,
        template_service: TemplateService,
    ) -> None:
        """Given un UUID existant, when DELETE, then 204 et plus dans GET."""
        created = client.post("/api/v1/templates", json=_sample_create_payload()).json()
        response = client.delete(f"/api/v1/templates/{created['id']}")
        assert response.status_code == 204
        assert not (template_service.templates_dir / f"{created['id']}.json").exists()
        listed = client.get("/api/v1/templates")
        assert listed.json() == []

    def test_delete_404(self, client: TestClient) -> None:
        """Given un UUID absent, when DELETE, then 404."""
        response = client.delete("/api/v1/templates/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
        assert response.status_code == 404

    def test_put_delete_guest_jwt_ok(self, client: TestClient) -> None:
        """Given un token guest, when PUT puis DELETE, then 200 puis 204."""
        guest = client.post("/api/v1/auth/guest")
        token = guest.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        created = client.post(
            "/api/v1/templates",
            json=_sample_create_payload(name="Guest edit"),
            headers=headers,
        ).json()
        updated = client.put(
            f"/api/v1/templates/{created['id']}",
            json={"name": "Guest renamed"},
            headers=headers,
        )
        assert updated.status_code == 200
        deleted = client.delete(f"/api/v1/templates/{created['id']}", headers=headers)
        assert deleted.status_code == 204


class TestTemplatesValidate:
    """GET /{id}/validate — matrice I/O 6.3."""

    def test_validate_200(self, client: TestClient) -> None:
        """Given un template GDD OK, when GET validate, then 200 valid."""
        created = client.post("/api/v1/templates", json=_sample_create_payload()).json()
        response = client.get(f"/api/v1/templates/{created['id']}/validate")
        assert response.status_code == 200
        body = response.json()
        assert body["valid"] is True
        assert body["obsoleteRefs"] == []

    def test_validate_404(self, client: TestClient) -> None:
        """Given un UUID absent, when GET validate, then 404."""
        response = client.get(
            "/api/v1/templates/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/validate"
        )
        assert response.status_code == 404

    def test_validate_obsolete_200_does_not_mutate(
        self,
        client: TestClient,
        template_service: TemplateService,
    ) -> None:
        """Given des IDs inconnus sur disque, when validate, then 200 invalide sans muter."""
        created = client.post("/api/v1/templates", json=_sample_create_payload()).json()
        path = template_service.templates_dir / f"{created['id']}.json"
        payload = json.loads(path.read_text(encoding="utf-8"))
        payload["configuration"]["characters"] = ["char-ghost"]
        path.write_text(json.dumps(payload), encoding="utf-8")

        response = client.get(f"/api/v1/templates/{created['id']}/validate")
        assert response.status_code == 200
        body = response.json()
        assert body["valid"] is False
        assert "char-ghost" in body["obsoleteRefs"]

        reloaded = json.loads(path.read_text(encoding="utf-8"))
        assert reloaded["configuration"]["characters"] == ["char-ghost"]

    def test_validate_guest_jwt_ok(self, client: TestClient) -> None:
        """Given un token guest, when GET validate, then 200."""
        guest = client.post("/api/v1/auth/guest")
        token = guest.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        created = client.post(
            "/api/v1/templates",
            json=_sample_create_payload(name="Guest validate"),
            headers=headers,
        ).json()
        response = client.get(
            f"/api/v1/templates/{created['id']}/validate",
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["valid"] is True


class TestTemplatesPrebuilt:
    """GET /prebuilt — matrice I/O 6.4."""

    def test_list_prebuilt_returns_full_catalog(self, client: TestClient) -> None:
        """Given le catalogue versionné, when GET /prebuilt, then les 10 fiches.

        Les trois registres de ton (conversation, scène d'action, moment intime)
        ont rejoint les pré-built : le catalogue de départ est unique.
        """
        response = client.get("/api/v1/templates/prebuilt")
        assert response.status_code == 200
        body = response.json()
        assert len(body) == 10
        slugs = {item["id"] for item in body}
        assert slugs == {
            "salutation",
            "confrontation",
            "revelation",
            "negociation",
            "recrutement",
            "cutscene",
            "test-caracteristique",
            "conversation",
            "scene-action",
            "moment-intime",
        }
        confrontation = next(item for item in body if item["id"] == "confrontation")
        assert confrontation["gddSystem"]
        assert confrontation["configuration"]["characters"] == []

    def test_get_prebuilt_by_slug(self, client: TestClient) -> None:
        """Given un slug connu, when GET, then 200."""
        response = client.get("/api/v1/templates/prebuilt/confrontation")
        assert response.status_code == 200
        assert response.json()["name"] == "Confrontation"

    def test_get_prebuilt_unknown_404(self, client: TestClient) -> None:
        """Given un slug absent, when GET, then 404."""
        response = client.get("/api/v1/templates/prebuilt/inconnu")
        assert response.status_code == 404

    def test_put_delete_prebuilt_slug_404(self, client: TestClient) -> None:
        """Given un slug pré-built, when PUT/DELETE sur /templates/{id}, then 404."""
        updated = client.put(
            "/api/v1/templates/confrontation",
            json={"name": "Hack"},
        )
        assert updated.status_code == 404
        deleted = client.delete("/api/v1/templates/confrontation")
        assert deleted.status_code == 404

    def test_copy_via_post_custom(self, client: TestClient) -> None:
        """Given une fiche pré-built, when POST custom (copie), then 201."""
        source = client.get("/api/v1/templates/prebuilt/confrontation").json()
        response = client.post(
            "/api/v1/templates",
            json={
                "name": "Confrontation (copie)",
                "description": source["description"],
                "category": source["category"],
                "icon": source["icon"],
                "configuration": source["configuration"],
            },
        )
        assert response.status_code == 201
        assert response.json()["name"] == "Confrontation (copie)"

    def test_list_prebuilt_guest_jwt_ok(self, client: TestClient) -> None:
        """Given un token guest, when GET /prebuilt, then 200."""
        guest = client.post("/api/v1/auth/guest")
        token = guest.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        response = client.get("/api/v1/templates/prebuilt", headers=headers)
        assert response.status_code == 200
        assert len(response.json()) == 10


class TestTemplatesContextDropping:
    """Champ optionnel contextDroppingRules (Story 6.5)."""

    def test_create_with_rules_persists_copy(self, client: TestClient) -> None:
        """Given des règles 4.10, when POST, then 201 et copie persistée."""
        payload = _sample_create_payload()
        payload["configuration"]["contextDroppingRules"] = {
            "rules_profile": "light",
            "tolerance": None,
            "mandatory_info": ["label-a"],
            "dialogue_type_overrides": {},
            "schema_version": "1.0",
        }
        response = client.post("/api/v1/templates", json=payload)
        assert response.status_code == 201
        rules = response.json()["configuration"]["contextDroppingRules"]
        assert rules["rules_profile"] == "light"
        assert rules["mandatory_info"] == ["label-a"]

    def test_create_invalid_profile_422(self, client: TestClient) -> None:
        """Given un profil inconnu, when POST, then 422."""
        payload = _sample_create_payload()
        payload["configuration"]["contextDroppingRules"] = {"rules_profile": "inexistant"}
        response = client.post("/api/v1/templates", json=payload)
        assert response.status_code == 422

    def test_legacy_without_key_ok(self, client: TestClient) -> None:
        """Given un template sans clé, when POST, then 201 et pas de règles imposées."""
        response = client.post("/api/v1/templates", json=_sample_create_payload())
        assert response.status_code == 201
        assert response.json()["configuration"].get("contextDroppingRules") is None

    def test_prebuilt_confrontation_strict_revelation_light(self, client: TestClient) -> None:
        """Given le catalogue tamponné, when GET, then Confrontation strict et Révélation light."""
        confrontation = client.get("/api/v1/templates/prebuilt/confrontation").json()
        revelation = client.get("/api/v1/templates/prebuilt/revelation").json()
        assert confrontation["configuration"]["contextDroppingRules"]["rules_profile"] == "strict"
        assert revelation["configuration"]["contextDroppingRules"]["rules_profile"] == "light"

    def test_copy_confrontation_keeps_strict(self, client: TestClient) -> None:
        """Given Confrontation, when POST copie, then le custom garde strict."""
        source = client.get("/api/v1/templates/prebuilt/confrontation").json()
        response = client.post(
            "/api/v1/templates",
            json={
                "name": "Confrontation (copie règles)",
                "description": source["description"],
                "category": source["category"],
                "icon": source["icon"],
                "configuration": source["configuration"],
            },
        )
        assert response.status_code == 201
        assert (
            response.json()["configuration"]["contextDroppingRules"]["rules_profile"] == "strict"
        )


def test_template_versions_archive_and_restore(client: TestClient) -> None:
    """PUT archive un snapshot ; restore réécrit le nom."""
    created = client.post("/api/v1/templates", json=_sample_create_payload(name="Avant"))
    assert created.status_code == 201
    template_id = created.json()["id"]
    updated = client.put(
        f"/api/v1/templates/{template_id}",
        json={"name": "Après"},
    )
    assert updated.status_code == 200
    versions = client.get(f"/api/v1/templates/{template_id}/versions")
    assert versions.status_code == 200
    items = versions.json()
    assert len(items) >= 1
    restored = client.post(
        f"/api/v1/templates/{template_id}/versions/{items[0]['id']}/restore",
    )
    assert restored.status_code == 200
    assert restored.json()["name"] == "Avant"
    assert restored.json()["history"][-1]["action"] == "restored"

