"""Tests d'intégration pour le flux complet de génération Unity Dialogue.

Ces tests vérifient que le flux complet fonctionne :
prompt → LLM → validation → JSON Unity → export/import

Marqueurs : p0 (flux critique), p1 (export/import, erreurs), p3 (skip documenté).
"""
import pytest
import json
from unittest.mock import MagicMock, AsyncMock, patch
from fastapi.testclient import TestClient

from api.main import app
from services.unity_dialogue_generation_service import UnityDialogueGenerationService
from services.json_renderer.unity_json_renderer import UnityJsonRenderer
from services.graph_conversion_service import GraphConversionService
from models.dialogue_structure.unity_dialogue_node import (
    UnityDialogueGenerationResponse,
    UnityDialogueNodeContent,
    UnityDialogueChoiceContent
)


@pytest.fixture
def mock_llm_client():
    """Mock LLM client pour tests."""
    client = MagicMock()
    return client


@pytest.fixture
def unity_service():
    """Fixture pour créer un UnityDialogueGenerationService."""
    return UnityDialogueGenerationService()


@pytest.fixture
def renderer():
    """Fixture pour créer un UnityJsonRenderer."""
    return UnityJsonRenderer()


class TestFullGenerationFlow:
    """Tests pour le flux complet de génération Unity Dialogue."""

    @pytest.mark.integration
    @pytest.mark.p0
    @pytest.mark.asyncio
    async def test_full_flow_prompt_to_valid_json(
        self,
        unity_service: UnityDialogueGenerationService,
        renderer: UnityJsonRenderer,
        mock_llm_client
    ):
        """TEST INTÉGRATION : Flux complet prompt → LLM → validation → JSON Unity.
        
        Teste que le flux complet produit un JSON Unity valide.
        """
        # GIVEN: Mock LLM qui retourne une réponse structurée valide
        mock_response = UnityDialogueGenerationResponse(
            title="Dialogue de test",
            node=UnityDialogueNodeContent(
                speaker="TEST_NPC",
                line="Bonjour, comment allez-vous ?",
                choices=[
                    UnityDialogueChoiceContent(text="Bien, merci"),
                    UnityDialogueChoiceContent(text="Pas mal"),
                    UnityDialogueChoiceContent(text="Plutôt bien")
                ]
            )
        )
        
        mock_llm_client.generate_variants = AsyncMock(return_value=[mock_response])
        
        # WHEN: Génération du nœud
        response = await unity_service.generate_dialogue_node(
            llm_client=mock_llm_client,
            prompt="Test prompt pour générer un dialogue",
            max_choices=None  # Mode libre
        )
        
        # WHEN: Enrichissement avec IDs
        enriched_nodes = unity_service.enrich_with_ids(response, start_id="START")
        
        # WHEN: Validation Unity
        is_valid, errors = renderer.validate_nodes(enriched_nodes)
        
        # WHEN: Rendu JSON
        json_output = renderer.render_unity_nodes(enriched_nodes)
        
        # THEN: Validation doit réussir
        assert is_valid is True, f"Erreurs de validation: {errors}"
        
        # THEN: JSON doit être valide et parsable
        parsed_json = json.loads(json_output)
        assert isinstance(parsed_json, list)
        assert len(parsed_json) == 1
        assert parsed_json[0]["id"] == "START"
        assert parsed_json[0]["speaker"] == "TEST_NPC"
        assert len(parsed_json[0]["choices"]) == 3

    @pytest.mark.integration
    @pytest.mark.p0
    def test_full_export_import_cycle_with_real_data(self, renderer: UnityJsonRenderer):
        """TEST INTÉGRATION : Cycle export/import complet avec données réelles.
        
        Teste que le cycle export/import préserve toutes les données.
        """
        # GIVEN: JSON Unity complexe avec plusieurs nœuds et choix
        unity_json_str = """[
            {
                "id": "START",
                "speaker": "PNJ_TEST",
                "line": "Bonjour, que puis-je faire pour vous ?",
                "choices": [
                    {
                        "text": "Acheter quelque chose",
                        "targetNode": "SHOP"
                    },
                    {
                        "text": "Poser une question",
                        "targetNode": "QUESTIONS"
                    },
                    {
                        "text": "Partir",
                        "targetNode": "END"
                    }
                ]
            },
            {
                "id": "SHOP",
                "speaker": "PNJ_TEST",
                "line": "Voici ce que je vends...",
                "choices": [
                    {
                        "text": "Merci, je vais regarder",
                        "targetNode": "END"
                    }
                ]
            },
            {
                "id": "QUESTIONS",
                "speaker": "PNJ_TEST",
                "line": "Que voulez-vous savoir ?",
                "choices": [
                    {
                        "text": "Où se trouve...",
                        "targetNode": "END"
                    }
                ]
            }
        ]"""
        
        # WHEN: Conversion vers ReactFlow
        nodes, edges = GraphConversionService.unity_json_to_graph(unity_json_str)
        
        # THEN: Tous les nœuds doivent être présents
        assert len(nodes) == 3
        node_ids = [node["id"] for node in nodes]
        assert "START" in node_ids
        assert "SHOP" in node_ids
        assert "QUESTIONS" in node_ids
        
        # WHEN: Reconversion vers JSON Unity
        converted_json = GraphConversionService.graph_to_unity_json(nodes, edges)
        doc = json.loads(converted_json)
        converted_nodes = doc["nodes"] if isinstance(doc, dict) and "nodes" in doc else doc

        # WHEN: Validation finale
        is_valid, errors = renderer.validate_nodes(converted_nodes)
        
        # THEN: Validation doit réussir
        assert is_valid is True, f"Erreurs de validation après cycle: {errors}"
        
        # THEN: Tous les nœuds doivent être présents dans le JSON reconverti
        converted_ids = [node["id"] for node in converted_nodes]
        assert set(converted_ids) == {"START", "SHOP", "QUESTIONS"}
        
        # THEN: Les choix doivent être préservés
        start_node = next(node for node in converted_nodes if node["id"] == "START")
        assert len(start_node["choices"]) == 3

    @pytest.mark.integration
    @pytest.mark.p1
    def test_export_import_cycle_with_test_results(self, renderer: UnityJsonRenderer):
        """TEST INTÉGRATION : Cycle export/import avec 4 résultats de test.
        
        Teste que le cycle préserve les 4 résultats de test.
        """
        # GIVEN: JSON Unity avec choix contenant test et 4 résultats
        unity_json_str = """[
            {
                "id": "START",
                "speaker": "PNJ",
                "line": "Tentez de me convaincre",
                "choices": [
                    {
                        "text": "Je vous demande poliment",
                        "test": "Raison+Diplomatie:8",
                        "testCriticalFailureNode": "NODE_CF",
                        "testFailureNode": "NODE_F",
                        "testSuccessNode": "NODE_S",
                        "testCriticalSuccessNode": "NODE_CS"
                    }
                ]
            },
            {"id": "NODE_CF", "speaker": "PNJ", "line": "Échec critique"},
            {"id": "NODE_F", "speaker": "PNJ", "line": "Échec"},
            {"id": "NODE_S", "speaker": "PNJ", "line": "Réussite"},
            {"id": "NODE_CS", "speaker": "PNJ", "line": "Réussite critique"}
        ]"""
        
        # WHEN: Conversion vers ReactFlow
        nodes, edges = GraphConversionService.unity_json_to_graph(unity_json_str)
        
        # THEN: TestNode doit être créé automatiquement
        test_nodes = [node for node in nodes if node["type"] == "testNode"]
        assert len(test_nodes) == 1
        
        # WHEN: Reconversion vers JSON Unity
        converted_json = GraphConversionService.graph_to_unity_json(nodes, edges)
        doc = json.loads(converted_json)
        converted_nodes = doc["nodes"] if isinstance(doc, dict) and "nodes" in doc else doc

        # WHEN: Validation
        is_valid, errors = renderer.validate_nodes(converted_nodes)
        
        # THEN: Validation doit réussir
        assert is_valid is True, f"Erreurs: {errors}"
        
        # THEN: Les 4 résultats de test doivent être préservés
        start_node = next(node for node in converted_nodes if node["id"] == "START")
        choice = start_node["choices"][0]
        assert choice["test"] == "Raison+Diplomatie:8"
        assert choice["testCriticalFailureNode"] == "NODE_CF"
        assert choice["testFailureNode"] == "NODE_F"
        assert choice["testSuccessNode"] == "NODE_S"
        assert choice["testCriticalSuccessNode"] == "NODE_CS"

    @pytest.mark.integration
    @pytest.mark.p1
    def test_normalization_preserves_required_structure(self, renderer: UnityJsonRenderer):
        """TEST INTÉGRATION : La normalisation préserve la structure requise Unity.
        
        Teste que la normalisation ne casse pas la structure Unity requise.
        """
        # GIVEN: Nœud avec structure complète
        nodes = [
            {
                "id": "START",
                "speaker": "PNJ",
                "line": "Test",
                "choices": [
                    {
                        "text": "Choix 1",
                        "targetNode": "END"
                    }
                ],
                "nextNode": None,
                "empty_string": "",
                "false_bool": False
            }
        ]
        
        # WHEN: Normalisation
        normalized_nodes = [renderer._normalize_node(node) for node in nodes]
        
        # WHEN: Validation après normalisation
        is_valid, errors = renderer.validate_nodes(normalized_nodes)
        
        # THEN: Validation doit toujours réussir
        assert is_valid is True, f"Erreurs après normalisation: {errors}"
        
        # THEN: Champs obligatoires doivent être présents
        normalized = normalized_nodes[0]
        assert "id" in normalized
        assert "speaker" in normalized
        assert "line" in normalized
        assert "choices" in normalized
        
        # THEN: Champs vides doivent être supprimés
        assert "empty_string" not in normalized
        assert "false_bool" not in normalized
        assert normalized.get("nextNode") is None  # None est supprimé aussi


class TestErrorHandlingAndFallback:
    """Tests pour la gestion d'erreurs et le fallback multi-provider."""

    @pytest.mark.integration
    @pytest.mark.p1
    @pytest.mark.asyncio
    async def test_llm_error_handling(self, unity_service: UnityDialogueGenerationService):
        """TEST INTÉGRATION : Gestion d'erreurs LLM doit retourner erreur claire.
        
        Bug potentiel : Erreurs LLM masquées → utilisateur confus.
        """
        mock_llm_client = MagicMock()
        
        # GIVEN: LLM qui retourne une erreur
        mock_llm_client.generate_variants = AsyncMock(side_effect=Exception("API Error"))
        
        # WHEN: Génération
        # THEN: Exception doit être propagée (pas masquée)
        with pytest.raises(Exception, match="API Error"):
            await unity_service.generate_dialogue_node(
                llm_client=mock_llm_client,
                prompt="Test prompt"
            )

    @pytest.mark.integration
    @pytest.mark.p1
    @pytest.mark.asyncio
    async def test_structured_output_fallback(self, unity_service: UnityDialogueGenerationService):
        """TEST INTÉGRATION : Erreur claire si structured output échoue.
        
        Bug potentiel : Si le LLM ne retourne pas de structured output, erreur doit être claire.
        """
        mock_llm_client = MagicMock()
        
        # GIVEN: LLM qui retourne du texte au lieu de structured output
        mock_llm_client.generate_variants = AsyncMock(return_value=["Texte libre au lieu de JSON structuré"])
        
        # WHEN: Génération
        # THEN: ValueError doit être levé avec message clair
        with pytest.raises(ValueError, match="structured output"):
            await unity_service.generate_dialogue_node(
                llm_client=mock_llm_client,
                prompt="Test prompt"
            )

    @pytest.mark.integration
    @pytest.mark.p1
    def test_validation_error_messages_clear(self, renderer: UnityJsonRenderer):
        """TEST INTÉGRATION : Messages d'erreur de validation doivent être clairs.
        
        Bug potentiel : Messages d'erreur cryptiques → difficile de corriger.
        """
        # GIVEN: Nœuds avec erreurs multiples
        invalid_nodes = [
            {"id": "START"},  # Pas de speaker ni line (OK, mais test autres erreurs)
            {"speaker": "PNJ", "line": "Test"},  # Pas d'ID
            {
                "id": "NODE1",
                "speaker": "PNJ",
                "line": "Test",
                "choices": [{"text": "Choix", "targetNode": "INVALID"}]
            }
        ]
        
        # WHEN: Validation
        is_valid, errors = renderer.validate_nodes(invalid_nodes)
        
        # THEN: Validation doit échouer
        assert is_valid is False
        
        # THEN: Messages d'erreur doivent être clairs et spécifiques
        error_messages = " ".join(errors).lower()
        assert "id" in error_messages or "manquant" in error_messages
        assert any("targetNode" in err or "référence" in err.lower() for err in errors)

    @pytest.mark.integration
    @pytest.mark.p3
    @pytest.mark.skip(reason="Fallback multi-provider pas encore implémenté (Epic 1 Story 1.16)")
    def test_llm_provider_fallback(self):
        """TEST INTÉGRATION : Fallback automatique entre providers LLM (à implémenter).
        
        Feature Epic 1 Story 1.16 : Fallback OpenAI → Mistral si OpenAI échoue.
        Ce test documente ce qui devrait être testé quand la feature sera implémentée.
        
        Scénarios à tester:
        - OpenAI échoue (500/timeout) → bascule vers Mistral
        - Les deux providers échouent → erreur claire
        - Fallback réussi → résultat normal
        - Logs indiquent le fallback
        """
        pass  # Test documentaire pour feature future
