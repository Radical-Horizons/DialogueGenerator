"""Tests API du catalogue d'intégration systèmes de jeu (Story 9.6 Task 1)."""

from fastapi.testclient import TestClient


def test_get_systems_integration_catalog_non_blocking_runtime_absent(client: TestClient) -> None:
    """Expose les familles FR94 et un warning non bloquant quand la source runtime est absente."""
    response = client.get("/api/v1/mechanics/systems/integration")

    assert response.status_code == 200
    payload = response.json()
    family_labels = [family["label"] for family in payload["families"]]

    assert family_labels == [
        "Caractéristiques & Compétences",
        "Gestion de l'Effort",
        "Réputation",
    ]
    assert payload["runtime_source"]["status"] == "disconnected"
    assert payload["runtime_source"]["label"] == "Source runtime externe (Unity/API/fichier config)"
    assert payload["runtime_source"]["editing_blocked"] is False
    assert "preview simulée" in payload["runtime_source"]["message"]
