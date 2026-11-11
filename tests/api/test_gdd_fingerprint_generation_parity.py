"""Un nœud fraîchement généré ne doit jamais être signalé « GDD modifié ».

Le badge GDD↑ compare l'empreinte reçue à la génération à celle recalculée depuis le snapshot
de sélection du nœud. Régression recette : les deux calculs ne partageaient ni la sélection
(fiche extrait tirée au sort à la génération), ni ``field_configs``, ni le mode d'organisation,
donc le badge s'affichait sur tous les nœuds neufs.
"""
from typing import Any, Dict, Iterator, List, Optional, Tuple
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from api.dependencies import (
    get_config_service,
    get_context_builder,
    get_graph_node_orchestrator,
)
from api.main import app
from services.gdd_context_fingerprint import clear_gdd_content_fingerprint_cache

SELECTIONS: Dict[str, Any] = {
    "characters_full": ["Aria"],
    "characters_excerpt": [],
    "scene_protagonists": {"personnage_a": "Aria", "personnage_b": "Borin"},
}


class FakeGddBuilder:
    """Catalogue GDD minimal : assez de fiches pour que le tirage aléatoire varie."""

    def __init__(self) -> None:
        names = ["Aria", "Borin", "Cassius", "Dorn", "Elian", "Fenn", "Gaia", "Hugo"]
        self.sheets: Dict[Tuple[str, str], Dict[str, Any]] = {
            ("characters", name): {"Nom": name, "sections": [f"Fiche de {name}"]}
            for name in names
        }
        self._names = names

    def load_gdd_files(self) -> None:
        """Rechargement sans effet : les fiches vivent en mémoire."""

    def get_characters_names(self) -> List[str]:
        """Noms proposés au tirage de la fiche extrait."""
        return list(self._names)

    def get_locations_names(self) -> List[str]:
        """Aucun lieu dans ce catalogue."""
        return []

    def get_element_record(self, category_key: str, name: str) -> Optional[Dict[str, Any]]:
        """Fiche brute d'un élément."""
        return self.sheets.get((category_key, name))


@pytest.fixture
def fake_builder() -> FakeGddBuilder:
    """Builder partagé entre génération et contrôle."""
    return FakeGddBuilder()


@pytest.fixture
def client(fake_builder: FakeGddBuilder) -> Iterator[TestClient]:
    """Client API avec orchestrateur et GDD factices."""
    result = MagicMock()
    result.nodes = [{"id": "gen-1", "speaker": "PNJ", "line": "Ligne"}]
    result.suggested_connections = []
    result.parent_node_id = "parent-1"
    result.batch_count = None
    result.generated_choices_count = None
    result.connected_choices_count = None
    result.failed_choices_count = None
    result.total_choices_count = None
    orchestrator = MagicMock()
    orchestrator.generate = AsyncMock(return_value=result)

    config = MagicMock()
    config.get_llm_config.return_value = {}
    config.get_available_llm_models.return_value = []
    config.get_llm_fallback_chain.return_value = []

    app.dependency_overrides[get_graph_node_orchestrator] = lambda: orchestrator
    app.dependency_overrides[get_config_service] = lambda: config
    app.dependency_overrides[get_context_builder] = lambda: fake_builder
    clear_gdd_content_fingerprint_cache()
    with patch("factories.llm_factory.LLMClientFactory") as factory:
        factory.create_client.return_value = MagicMock()
        yield TestClient(app)
    app.dependency_overrides.clear()
    clear_gdd_content_fingerprint_cache()


def _check_fingerprint(client: TestClient, selections: Dict[str, Any]) -> str:
    """Rejoue le contrôle du badge : snapshot brut, réglages d'affichage du front."""
    response = client.post(
        "/api/v1/context/gdd-content-fingerprint",
        json={
            "context_selections": selections,
            "field_configs": {"character": ["Nom"]},
            "organization_mode": "default",
        },
    )
    assert response.status_code == 200
    return response.json()["fingerprint"]


def _generate(client: TestClient) -> str:
    """Génère un nœud et renvoie l'empreinte stockée sur celui-ci."""
    response = client.post(
        "/api/v1/unity-dialogues/graph/generate-node",
        json={
            "parent_node_id": "parent-1",
            "parent_node_content": {"id": "parent-1", "speaker": "PNJ", "line": "Parent"},
            "user_instructions": "Suite",
            "context_selections": SELECTIONS,
        },
    )
    assert response.status_code == 200
    fingerprint = response.json()["context_gdd_content_fingerprint"]
    assert fingerprint
    return fingerprint


def _regenerate(client: TestClient) -> str:
    """Régénère un nœud et renvoie son empreinte."""
    with patch("api.routers.graph_node_history._validate_dialogue_exists"):
        response = client.post(
            "/api/v1/unity-dialogues/graph/nodes/gen-1/regenerate",
            json={
                "dialogue_id": "current",
                "new_instructions": "Plus sombre",
                "preserve_connections": True,
                "parent_node_id": "parent-1",
                "parent_node_content": {"id": "parent-1", "speaker": "PNJ", "line": "Parent"},
                "context_selections": SELECTIONS,
            },
        )
    assert response.status_code == 200
    fingerprint = response.json()["context_gdd_content_fingerprint"]
    assert fingerprint
    return fingerprint


@pytest.mark.parametrize("produce", [_generate, _regenerate], ids=["generate", "regenerate"])
def test_fresh_node_is_not_stale(client: TestClient, produce: Any) -> None:
    """L'empreinte d'un nœud neuf est celle que recalcule le contrôle du badge."""
    assert produce(client) == _check_fingerprint(client, SELECTIONS)


@pytest.mark.parametrize("produce", [_generate, _regenerate], ids=["generate", "regenerate"])
def test_node_is_stale_after_selected_sheet_changes(
    client: TestClient, fake_builder: FakeGddBuilder, produce: Any
) -> None:
    """Modifier une fiche sélectionnée change l'empreinte : le badge reste utile."""
    stored = produce(client)
    fake_builder.sheets[("characters", "Aria")]["sections"] = ["Fiche réécrite"]
    clear_gdd_content_fingerprint_cache()

    assert stored != _check_fingerprint(client, SELECTIONS)


def test_node_stays_fresh_when_unselected_sheet_changes(
    client: TestClient, fake_builder: FakeGddBuilder
) -> None:
    """Une fiche hors sélection, même tirée au sort à la génération, ne déclenche pas le badge."""
    stored = _generate(client)
    fake_builder.sheets[("characters", "Dorn")]["sections"] = ["Fiche réécrite"]
    clear_gdd_content_fingerprint_cache()

    assert stored == _check_fingerprint(client, SELECTIONS)
