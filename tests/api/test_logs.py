"""Tests pour les endpoints de logs."""
import json
import pytest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Iterator
from fastapi.testclient import TestClient
from api.main import app
from api.services.log_service import LogService


@pytest.fixture
def client():
    """Crée un client de test FastAPI."""
    return TestClient(app)


@pytest.fixture
def sample_logs(tmp_path):
    """Crée des fichiers de logs d'exemple."""
    log_dir = tmp_path / "logs"
    log_dir.mkdir()
    
    # Créer des logs pour différentes dates
    today = date.today()
    yesterday = today - timedelta(days=1)
    
    # Logs d'aujourd'hui
    today_file = log_dir / f"logs_{today.isoformat()}.json"
    today_logs = [
        {
            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
            "level": "INFO",
            "logger": "api.middleware",
            "message": "Request: GET /api/test",
            "request_id": "req1",
            "endpoint": "/api/test",
            "method": "GET",
            "status_code": 200
        },
        {
            "timestamp": (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat() + "Z",
            "level": "ERROR",
            "logger": "api.routers",
            "message": "Error in endpoint",
            "request_id": "req2",
            "endpoint": "/api/error",
            "method": "POST"
        }
    ]
    with open(today_file, 'w', encoding='utf-8') as f:
        json.dump(today_logs, f)
    
    # Logs d'hier
    yesterday_file = log_dir / f"logs_{yesterday.isoformat()}.json"
    yesterday_logs = [
        {
            "timestamp": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat() + "Z",
            "level": "WARNING",
            "logger": "api.middleware",
            "message": "Slow request",
            "request_id": "req3",
            "endpoint": "/api/slow",
            "method": "GET",
            "duration_ms": 5000
        }
    ]
    with open(yesterday_file, 'w', encoding='utf-8') as f:
        json.dump(yesterday_logs, f)

    return log_dir


@pytest.fixture
def sample_log_service(sample_logs: Path) -> Iterator[None]:
    """Branche l'API de logs sur ``sample_logs``.

    Via ``dependency_overrides`` : réassigner ``logs.get_log_service`` ne change rien,
    ``Depends`` a capturé la fonction à la déclaration de la route. C'était le cas ici,
    et ces tests lisaient en silence les vrais logs de ``data/logs/``.
    """
    from api.routers import logs

    app.dependency_overrides[logs.get_log_service] = lambda: LogService(log_dir=str(sample_logs))
    yield
    app.dependency_overrides.pop(logs.get_log_service, None)


def test_search_logs_all(client, sample_log_service):
    """Teste la recherche de logs sans filtres."""
    response = client.get("/api/v1/logs")
    assert response.status_code == 200
    data = response.json()
    assert "logs" in data
    assert "total" in data
    assert data["total"] == 3


def test_search_logs_by_level(client, sample_log_service):
    """Teste la recherche de logs par niveau."""
    response = client.get("/api/v1/logs?level=ERROR")
    assert response.status_code == 200
    data = response.json()
    assert len(data["logs"]) == 1
    assert all(log["level"] == "ERROR" for log in data["logs"])


def test_search_logs_by_request_id(client, sample_log_service):
    """Teste la recherche de logs par request_id."""
    response = client.get("/api/v1/logs?request_id=req1")
    assert response.status_code == 200
    data = response.json()
    assert len(data["logs"]) == 1
    assert all(log.get("request_id") == "req1" for log in data["logs"])


def test_get_log_statistics(client, sample_log_service):
    """Teste l'endpoint de statistiques."""
    response = client.get("/api/v1/logs/stats")
    assert response.status_code == 200
    data = response.json()
    assert "total_logs" in data
    assert "by_level" in data
    assert "by_day" in data
    assert "by_logger" in data
    assert data["total_logs"] == 3


def test_list_log_files(client, sample_log_service):
    """Teste l'endpoint de liste des fichiers."""
    response = client.get("/api/v1/logs/files")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 2
    assert "filename" in data[0]
    assert "date" in data[0]
    assert "size_bytes" in data[0]


def test_receive_frontend_log(client, sample_log_service):
    """Teste l'endpoint de réception de logs frontend."""
    response = client.post(
        "/api/v1/logs/frontend",
        json={
            "level": "ERROR",
            "message": "Frontend error",
            "logger": "frontend.component",
            "error": {
                "name": "TypeError",
                "message": "Cannot read property"
            },
            "context": {
                "url": "/test",
                "userAgent": "Mozilla/5.0"
            }
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


def test_search_logs_pagination(client, sample_log_service):
    """Teste la pagination des résultats."""
    # Première page
    response1 = client.get("/api/v1/logs?limit=1&offset=0")
    assert response1.status_code == 200
    data1 = response1.json()
    assert len(data1["logs"]) == 1
    assert data1["total"] > 1

    # Deuxième page
    response2 = client.get("/api/v1/logs?limit=1&offset=1")
    assert response2.status_code == 200
    data2 = response2.json()
    assert len(data2["logs"]) == 1
    # Les logs doivent être différents
    assert data1["logs"][0]["timestamp"] != data2["logs"][0]["timestamp"]


