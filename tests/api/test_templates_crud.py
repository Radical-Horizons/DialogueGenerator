"""Tests API GET/POST /api/v1/templates (Story 6.1.1 — matrice I/O)."""
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
