"""Tests unitaires pour les endpoints /api/v1/mechanics/flags."""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
from api.main import app


@pytest.fixture
def mock_flag_service():
    """Mock du FlagCatalogService pour tests unitaires."""
    mock_service = MagicMock()
    
    # Mock des définitions de test
    mock_definitions = [
        {
            "id": "PLAYER_KILLED_BOSS",
            "type": "bool",
            "category": "Event",
            "label": "Player killed boss",
            "description": "Player has defeated the final boss",
            "defaultValue": "false",
            "tags": ["quest", "main"],
            "isFavorite": True
        },
        {
            "id": "CURRENT_EFFORT",
            "type": "int",
            "category": "Stat",
            "label": "Current Effort",
            "description": "Current Effort stat",
            "defaultValue": "5",
            "tags": ["stat"],
            "isFavorite": True
        },
        {
            "id": "MINOR_FLAG",
            "type": "bool",
            "category": "Item",
            "label": "Minor Flag",
            "description": "A minor flag",
            "defaultValue": "false",
            "tags": ["item"],
            "isFavorite": False
        }
    ]
    
    mock_service.search = MagicMock(return_value=mock_definitions)
    mock_service.load_definitions = MagicMock(return_value=mock_definitions)
    mock_service.upsert_definition = MagicMock()
    mock_service.toggle_favorite = MagicMock()
    mock_service.reload = MagicMock()
    
    return mock_service


@pytest.fixture
def client(mock_flag_service):
    """Fixture pour créer un client de test avec mocks."""
    from api.routers.mechanics_flags import get_flag_catalog_service
    
    # Override la dépendance
    app.dependency_overrides[get_flag_catalog_service] = lambda: mock_flag_service
    
    yield TestClient(app)
    
    # Nettoyer après le test
    app.dependency_overrides.clear()


def test_list_flags_success(client, mock_flag_service):
    """Test de la liste des flags sans filtre."""
    response = client.get("/api/v1/mechanics/flags")
    
    assert response.status_code == 200
    data = response.json()
    assert "flags" in data
    assert "total" in data
    assert data["total"] == 3
    assert len(data["flags"]) == 3
    
    # Vérifier la structure d'un flag
    flag = data["flags"][0]
    assert "id" in flag
    assert "type" in flag
    assert "category" in flag
    assert "label" in flag


def test_list_flags_with_query(client, mock_flag_service):
    """Test de la liste avec recherche textuelle."""
    # Configurer le mock pour retourner un résultat filtré
    mock_flag_service.search = MagicMock(return_value=[
        {
            "id": "PLAYER_KILLED_BOSS",
            "type": "bool",
            "category": "Event",
            "label": "Player killed boss",
            "description": "Player has defeated the final boss",
            "defaultValue": "false",
            "tags": ["quest", "main"],
            "isFavorite": True
        }
    ])
    
    response = client.get("/api/v1/mechanics/flags?q=boss")
    
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    
    # Vérifier que search a été appelé avec les bons paramètres
    mock_flag_service.search.assert_called_once_with(
        query="boss",
        category=None,
        favorites_only=False,
        semantic_type=None,
        scope=None,
    )


def test_list_flags_with_category(client, mock_flag_service):
    """Test de la liste avec filtre par catégorie."""
    mock_flag_service.search = MagicMock(return_value=[
        {
            "id": "CURRENT_EFFORT",
            "type": "int",
            "category": "Stat",
            "label": "Current Effort",
            "description": "Current Effort stat",
            "defaultValue": "5",
            "tags": ["stat"],
            "isFavorite": True
        }
    ])
    
    response = client.get("/api/v1/mechanics/flags?category=Stat")
    
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    
    mock_flag_service.search.assert_called_once_with(
        query=None,
        category="Stat",
        favorites_only=False,
        semantic_type=None,
        scope=None,
    )


def test_list_flags_favorites_only(client, mock_flag_service):
    """Test de la liste avec filtre favoris."""
    mock_flag_service.search = MagicMock(return_value=[
        {
            "id": "PLAYER_KILLED_BOSS",
            "type": "bool",
            "category": "Event",
            "label": "Player killed boss",
            "description": "Player has defeated the final boss",
            "defaultValue": "false",
            "tags": ["quest", "main"],
            "isFavorite": True
        },
        {
            "id": "CURRENT_EFFORT",
            "type": "int",
            "category": "Stat",
            "label": "Current Effort",
            "description": "Current Effort stat",
            "defaultValue": "5",
            "tags": ["stat"],
            "isFavorite": True
        }
    ])
    
    response = client.get("/api/v1/mechanics/flags?favorites_only=true")
    
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2
    
    mock_flag_service.search.assert_called_once_with(
        query=None,
        category=None,
        favorites_only=True,
        semantic_type=None,
        scope=None,
    )


def test_upsert_flag_success(client, mock_flag_service):
    """Test de la création/mise à jour d'un flag."""
    # Configurer le mock pour retourner le flag créé
    mock_flag_service.search = MagicMock(return_value=[
        {
            "id": "NEW_FLAG",
            "type": "bool",
            "category": "Choice",
            "label": "New Flag",
            "description": "A new flag",
            "defaultValue": "false",
            "tags": ["new"],
            "isFavorite": False
        }
    ])
    
    request_data = {
        "id": "NEW_FLAG",
        "type": "bool",
        "category": "Choice",
        "label": "New Flag",
        "description": "A new flag",
        "defaultValue": "false",
        "tags": ["new"],
        "isFavorite": False
    }
    
    response = client.post("/api/v1/mechanics/flags", json=request_data)
    
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "flag" in data
    assert data["flag"]["id"] == "NEW_FLAG"
    
    # Vérifier que upsert_definition a été appelé
    mock_flag_service.upsert_definition.assert_called_once()


def test_upsert_flag_invalid(client, mock_flag_service):
    """Test de l'upsert avec données invalides."""
    # Manque le champ "label"
    request_data = {
        "id": "INVALID_FLAG",
        "type": "bool",
        "category": "Event",
        "defaultValue": "false",
        "tags": [],
        "isFavorite": False
    }
    
    response = client.post("/api/v1/mechanics/flags", json=request_data)
    
    # Validation Pydantic doit échouer (422)
    assert response.status_code == 422


def test_toggle_favorite_success(client, mock_flag_service):
    """Test du toggle du statut favori."""
    request_data = {
        "flag_id": "TEST_BOOL_FLAG",
        "is_favorite": True
    }
    
    response = client.post("/api/v1/mechanics/flags/toggle-favorite", json=request_data)
    
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["flag_id"] == "TEST_BOOL_FLAG"
    assert data["is_favorite"] is True
    
    # Vérifier que toggle_favorite a été appelé
    mock_flag_service.toggle_favorite.assert_called_once_with(
        flag_id="TEST_BOOL_FLAG",
        is_favorite=True
    )


def test_toggle_favorite_not_found(client, mock_flag_service):
    """Test du toggle d'un flag inexistant."""
    # Configurer le mock pour lever une ValueError
    mock_flag_service.toggle_favorite = MagicMock(side_effect=ValueError("Flag introuvable: NON_EXISTENT"))
    
    request_data = {
        "flag_id": "NON_EXISTENT",
        "is_favorite": True
    }
    
    response = client.post("/api/v1/mechanics/flags/toggle-favorite", json=request_data)
    
    assert response.status_code == 404


def test_import_snapshot_success(client, mock_flag_service):
    """Test de l'import d'un snapshot Unity."""
    import json
    
    # Configurer le mock pour retourner un catalogue
    mock_flag_service.load_definitions = MagicMock(return_value=[
        {
            "id": "PLAYER_KILLED_BOSS",
            "type": "bool",
            "category": "Event",
            "label": "Player killed boss",
            "description": "Player has defeated the final boss",
            "defaultValue": "false",
            "tags": ["quest", "main"],
            "isFavorite": True
        },
        {
            "id": "CURRENT_EFFORT",
            "type": "int",
            "category": "Stat",
            "label": "Current Effort",
            "description": "Current Effort stat",
            "defaultValue": "5",
            "tags": ["stat"],
            "isFavorite": True
        }
    ])
    
    # Créer un snapshot de test
    snapshot = {
        "version": "1.0",
        "timestamp": "2026-01-10T12:00:00Z",
        "flags": {
            "PLAYER_KILLED_BOSS": True,
            "CURRENT_EFFORT": 3,
            "UNKNOWN_FLAG": False  # Flag inconnu (devrait générer un warning)
        }
    }
    
    request_data = {
        "snapshot_json": json.dumps(snapshot)
    }
    
    response = client.post("/api/v1/mechanics/flags/import-snapshot", json=request_data)
    
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["imported_count"] == 2  # 2 flags valides (pas UNKNOWN_FLAG)
    assert len(data["warnings"]) == 1  # 1 warning pour UNKNOWN_FLAG
    assert "Flag inconnu ignoré: UNKNOWN_FLAG" in data["warnings"][0]
    assert "snapshot" in data


def test_import_snapshot_invalid_json(client, mock_flag_service):
    """Test de l'import avec JSON invalide."""
    request_data = {
        "snapshot_json": "invalid json {"
    }
    
    response = client.post("/api/v1/mechanics/flags/import-snapshot", json=request_data)
    
    assert response.status_code == 422  # ValidationException (Pydantic retourne 422)


def test_import_snapshot_invalid_format(client, mock_flag_service):
    """Test de l'import avec format snapshot invalide."""
    request_data = {
        "snapshot_json": '{"invalid": "format"}'
    }
    
    response = client.post("/api/v1/mechanics/flags/import-snapshot", json=request_data)
    
    assert response.status_code == 422  # ValidationException (Pydantic retourne 422)


def test_export_snapshot_success(client, mock_flag_service):
    """Test de l'export d'un snapshot."""
    from datetime import datetime, timezone
    
    # Pas besoin de configurer le mock car export_snapshot utilise la sélection du frontend
    # On teste juste que l'endpoint retourne un snapshot vide si pas de flags fournis
    request_data = {
        "flags": [
            {
                "id": "PLAYER_KILLED_BOSS",
                "value": True,
                "category": "Event",
                "timestamp": "2026-01-10T12:00:00Z"
            },
            {
                "id": "CURRENT_EFFORT",
                "value": 5,
                "category": "Stat",
                "timestamp": "2026-01-10T12:00:00Z"
            }
        ]
    }
    
    response = client.post("/api/v1/mechanics/flags/export-snapshot", json=request_data)
    
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "snapshot" in data
    snapshot = data["snapshot"]
    assert snapshot["version"] == "1.0"
    assert "timestamp" in snapshot
    assert "flags" in snapshot
    assert snapshot["flags"]["PLAYER_KILLED_BOSS"] is True
    assert snapshot["flags"]["CURRENT_EFFORT"] == 5


def test_export_snapshot_empty(client, mock_flag_service):
    """Test de l'export d'un snapshot vide (sans flags fournis)."""
    # Pas de flags dans la requête
    response = client.post("/api/v1/mechanics/flags/export-snapshot", json={})
    
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "snapshot" in data
    snapshot = data["snapshot"]
    assert snapshot["version"] == "1.0"
    assert "timestamp" in snapshot
    assert len(snapshot["flags"]) == 0  # Snapshot vide
