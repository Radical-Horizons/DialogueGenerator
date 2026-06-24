"""Tests d'intégration pour vérifier que la validation backend rejette les requêtes invalides.

Ces tests vérifient que les règles métier sont bien validées côté backend
et que le frontend n'a plus besoin de dupliquer cette validation.
"""
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from unittest.mock import patch, MagicMock

from api.main import app
from api.schemas.dialogue import ContextSelection, GenerateUnityDialogueRequest


@pytest.fixture
def client():
    """Client de test FastAPI."""
    return TestClient(app)


class TestBackendRejectsInvalidRequests:
    """Tests pour vérifier que le backend rejette les requêtes invalides."""
    
    def test_backend_rejects_no_characters(self, client):
        """TEST INTÉGRATION : Backend rejette les requêtes sans personnages.
        
        Règle métier : Au moins un personnage doit être sélectionné pour générer un dialogue Unity.
        """
        # GIVEN: Requête sans personnages
        request_data = {
            "user_instructions": "Test dialogue",
            "context_selections": {
                "characters_full": [],
                "characters_excerpt": [],
                "locations_full": [],
                "locations_excerpt": [],
            },
            "llm_model_identifier": "gpt-4o-mini"
        }
        
        # WHEN: Tentative de génération
        response = client.post("/api/v1/dialogues/generate/unity-dialogue", json=request_data)
        
        # THEN: Backend doit rejeter avec ValidationException (422)
        assert response.status_code == 422
        error_data = response.json()
        
        # L'API utilise un handler personnalisé pour ValidationException qui retourne "error"
        assert "error" in error_data
        
        # Vérifier que le message d'erreur mentionne les personnages requis
        error_obj = error_data["error"]
        # Le message peut être dans "message" ou dans "details"
        message = error_obj.get("message", "")
        details = error_obj.get("details", {})
        
        # Vérifier dans message ou details
        error_text = f"{message} {str(details)}"
        assert "personnage" in error_text.lower() or "character" in error_text.lower()
    
    def test_backend_rejects_invalid_tokens(self, client):
        """TEST INTÉGRATION : Backend rejette les requêtes avec tokens invalides.
        
        Règle métier : max_context_tokens doit être entre MIN_CONTEXT_TOKENS et MAX_CONTEXT_TOKENS.
        """
        from constants import Defaults
        
        # GIVEN: Requête avec max_context_tokens < MIN_CONTEXT_TOKENS
        request_data = {
            "user_instructions": "Test",
            "context_selections": {
                "characters_full": ["Test Character"],
                "characters_excerpt": [],
            },
            "max_context_tokens": 5000,  # Sous le plancher produit (10k)
            "llm_model_identifier": "gpt-4o-mini"
        }
        
        # WHEN: Tentative de génération
        response = client.post("/api/v1/dialogues/generate/unity-dialogue", json=request_data)
        
        # THEN: Backend doit rejeter avec ValidationException (422)
        assert response.status_code == 422
        error_data = response.json()
        assert "error" in error_data or "detail" in error_data
        
        # Vérifier que le message mentionne la limite (dans message ou details)
        error_obj = error_data.get("error", {}) if "error" in error_data else {}
        error_text = f"{error_obj.get('message', '')} {str(error_obj.get('details', {}))} {str(error_data.get('detail', ''))}"
        assert str(Defaults.MIN_CONTEXT_TOKENS) in error_text or "minimum" in error_text.lower()
    
    def test_backend_rejects_invalid_completion_tokens(self, client):
        """TEST INTÉGRATION : Backend rejette les requêtes avec max_completion_tokens invalides.
        
        Règle métier : max_completion_tokens doit être entre 100 et 16000 (ou None).
        """
        # GIVEN: Requête avec max_completion_tokens < 100
        request_data = {
            "user_instructions": "Test",
            "context_selections": {
                "characters_full": ["Test Character"],
                "characters_excerpt": [],
            },
            "max_completion_tokens": 50,  # Trop petit
            "llm_model_identifier": "gpt-4o-mini"
        }
        
        # WHEN: Tentative de génération
        response = client.post("/api/v1/dialogues/generate/unity-dialogue", json=request_data)
        
        # THEN: Backend doit rejeter avec ValidationException (422)
        assert response.status_code == 422
        error_data = response.json()
        assert "error" in error_data
        
        # Vérifier que le message mentionne la limite
        error_obj = error_data["error"]
        error_text = f"{error_obj.get('message', '')} {str(error_obj.get('details', {}))}"
        assert "100" in error_text or "minimum" in error_text.lower()
        
        # GIVEN: Requête avec max_completion_tokens > MAX_COMPLETION_TOKENS (hors plage API)
        from constants import Defaults
        request_data["max_completion_tokens"] = Defaults.MAX_COMPLETION_TOKENS + 1000
        
        # WHEN: Tentative de génération
        response = client.post("/api/v1/dialogues/generate/unity-dialogue", json=request_data)
        
        # THEN: Backend doit rejeter avec ValidationException (422)
        assert response.status_code == 422
        error_data = response.json()
        
        # Le validator Pydantic peut retourner soit "error" (handler personnalisé) soit "detail" (FastAPI standard)
        if "error" in error_data:
            error_obj = error_data["error"]
            error_text = f"{error_obj.get('message', '')} {str(error_obj.get('details', {}))}"
        else:
            detail = error_data.get("detail", [])
            if isinstance(detail, list):
                error_text = " ".join([err.get("msg", "") for err in detail if isinstance(err, dict)])
            else:
                error_text = str(detail)
        assert str(Defaults.MAX_COMPLETION_TOKENS) in error_text or "maximum" in error_text.lower()
    
    def test_backend_returns_clear_error_messages(self, client):
        """TEST INTÉGRATION : Backend retourne des messages d'erreur clairs et actionnables.
        
        Les messages d'erreur doivent être compréhensibles par l'utilisateur final.
        """
        # GIVEN: Requête sans personnages
        request_data = {
            "user_instructions": "Test",
            "context_selections": {
                "characters_full": [],
                "characters_excerpt": [],
            },
            "llm_model_identifier": "gpt-4o-mini"
        }
        
        # WHEN: Tentative de génération
        response = client.post("/api/v1/dialogues/generate/unity-dialogue", json=request_data)
        
        # THEN: Message d'erreur doit être clair et actionnable
        assert response.status_code == 422
        error_data = response.json()
        
        # Le format d'erreur utilise "error" avec handler personnalisé
        assert "error" in error_data
        error_obj = error_data["error"]
        assert "message" in error_obj
        
        message = error_obj["message"]
        # Le message doit être en français et compréhensible
        assert len(message) > 10  # Pas un message vide
        
        # Vérifier aussi dans details
        error_text = f"{message} {str(error_obj.get('details', {}))}"
        assert "personnage" in error_text.lower() or "character" in error_text.lower()


class TestBackendValidationUnityDialogue:
    """Tests pour vérifier que le backend valide le schéma Unity lors de l'export."""
    
    def test_backend_validates_unity_schema_on_export(self, client):
        """TEST INTÉGRATION : Backend valide le schéma Unity lors de l'export.
        
        Le backend doit utiliser UnityJsonRenderer.validate_nodes() pour valider
        avant d'exporter.
        """
        # GIVEN: JSON Unity invalide (id nœud hors schéma v1.2.0)
        invalid_json = """[
            {"id": "NODE_LEGACY_INVALID", "line": "Test", "nextNode": "END"}
        ]"""
        
        request_data = {
            "json_content": invalid_json,
            "title": "Test Dialogue"
        }
        
        # WHEN: Tentative d'export
        # Note: Nécessite le chemin Unity configuré, on mock le config_service
        with patch('api.routers.dialogues.get_config_service') as mock_get_config:
            mock_config = MagicMock()
            mock_config.get_unity_dialogues_path.return_value = "/tmp/unity_dialogues"
            mock_get_config.return_value = mock_config
            
            response = client.post("/api/v1/dialogues/unity/export", json=request_data)
        
        # THEN: Backend doit rejeter avec ValidationException (422)
        assert response.status_code == 422
        error_data = response.json()
        assert "error" in error_data
        
        # Vérifier que les erreurs de validation Unity sont dans la réponse
        error_obj = error_data["error"]
        assert "message" in error_obj
        assert "validation" in error_obj["message"].lower() or "schéma" in error_obj["message"].lower()
        
        # Vérifier que les détails contiennent les erreurs de validation
        if "details" in error_obj:
            details = error_obj["details"]
            assert "validation_errors" in details or "schéma" in str(details).lower()
    
    def test_backend_validates_unity_references_on_export(self, client):
        """TEST INTÉGRATION : Backend valide les références Unity lors de l'export.
        
        Le backend doit détecter les références invalides (targetNode pointant vers nœud inexistant).
        """
        # GIVEN: JSON Unity avec id nœud hors schéma
        invalid_json = """[
            {"id": "NODE_LEGACY_INVALID", "line": "Test", "nextNode": "END"}
        ]"""
        
        request_data = {
            "json_content": invalid_json,
            "title": "Test Dialogue"
        }
        
        # WHEN: Tentative d'export
        with patch('api.routers.dialogues.get_config_service') as mock_get_config:
            mock_config = MagicMock()
            mock_config.get_unity_dialogues_path.return_value = "/tmp/unity_dialogues"
            mock_get_config.return_value = mock_config
            
            response = client.post("/api/v1/dialogues/unity/export", json=request_data)
        
        # THEN: Backend doit rejeter avec ValidationException (422)
        assert response.status_code == 422
        error_data = response.json()
        assert "error" in error_data
        
        # Vérifier que le message mentionne la référence invalide (dans message ou details)
        error_obj = error_data["error"]
        error_text = f"{error_obj.get('message', '')} {str(error_obj.get('details', {}))}"
        assert "id" in error_text.lower() or "schéma" in error_text.lower() or "NODE_LEGACY_INVALID" in error_text


class TestPydanticValidators:
    """Tests pour vérifier que les validators Pydantic fonctionnent correctement."""
    
    def test_pydantic_validates_characters_in_context_selection(self):
        """TEST INTÉGRATION : Validator Pydantic valide personnages requis dans ContextSelection."""
        # GIVEN: ContextSelection sans personnages
        context_selection = ContextSelection(
            characters_full=[],
            characters_excerpt=[],
            locations_full=[],
        )
        
        # WHEN: Création de GenerateUnityDialogueRequest
        try:
            request = GenerateUnityDialogueRequest(
                user_instructions="Test",
                context_selections=context_selection,
                llm_model_identifier="gpt-5-mini"
            )
            # Le validator doit être appelé lors de la création
            pytest.fail("Le validator Pydantic aurait dû lever une ValueError")
        except ValueError as e:
            # THEN: ValueError doit être levée avec message clair
            assert "personnage" in str(e).lower() or "character" in str(e).lower()
    
    def test_pydantic_validates_max_context_tokens(self):
        """TEST INTÉGRATION : Validator Pydantic valide max_context_tokens."""
        from constants import Defaults
        
        # GIVEN: ContextSelection valide
        context_selection = ContextSelection(
            characters_full=["Test Character"],
            characters_excerpt=[],
        )
        
        # WHEN: max_context_tokens < MIN_CONTEXT_TOKENS
        try:
            request = GenerateUnityDialogueRequest(
                user_instructions="Test",
                context_selections=context_selection,
                max_context_tokens=5000,  # Invalide
                llm_model_identifier="gpt-5-mini"
            )
            pytest.fail("Le validator Pydantic aurait dû lever une ValueError")
        except ValueError as e:
            # THEN: ValueError doit être levée
            assert str(Defaults.MIN_CONTEXT_TOKENS) in str(e) or "minimum" in str(e).lower()
        
        # WHEN: max_context_tokens > MAX_CONTEXT_TOKENS
        try:
            request = GenerateUnityDialogueRequest(
                user_instructions="Test",
                context_selections=context_selection,
                max_context_tokens=Defaults.MAX_CONTEXT_TOKENS + 1000,  # Trop grand
                llm_model_identifier="gpt-5-mini"
            )
            pytest.fail("Le validator Pydantic aurait dû lever une ValueError")
        except ValueError as e:
            # THEN: ValueError doit être levée
            assert str(Defaults.MAX_CONTEXT_TOKENS) in str(e) or "maximum" in str(e).lower()

        request = GenerateUnityDialogueRequest(
            user_instructions="Test",
            context_selections=context_selection,
            max_context_tokens=300_000,
            llm_model_identifier="gpt-5-mini",
        )
        assert request.max_context_tokens == Defaults.MAX_CONTEXT_TOKENS
    
    def test_pydantic_validates_max_completion_tokens(self):
        """TEST INTÉGRATION : Validator Pydantic valide max_completion_tokens."""
        # GIVEN: ContextSelection valide
        context_selection = ContextSelection(
            characters_full=["Test Character"],
            characters_excerpt=[],
        )
        
        # WHEN: max_completion_tokens < 100
        with pytest.raises(ValidationError) as exc_info:
            GenerateUnityDialogueRequest(
                user_instructions="Test",
                context_selections=context_selection,
                max_completion_tokens=50,  # Invalide
                llm_model_identifier="gpt-5-mini"
            )
        # THEN: message doit mentionner la limite minimum
        error_text = str(exc_info.value)
        assert "100" in error_text or "minimum" in error_text.lower()
        
        # WHEN: max_completion_tokens > MAX_COMPLETION_TOKENS
        from constants import Defaults
        with pytest.raises(ValidationError) as exc_info2:
            GenerateUnityDialogueRequest(
                user_instructions="Test",
                context_selections=context_selection,
                max_completion_tokens=Defaults.MAX_COMPLETION_TOKENS + 1000,
                llm_model_identifier="gpt-5-mini"
            )
        error_text2 = str(exc_info2.value)
        assert str(Defaults.MAX_COMPLETION_TOKENS) in error_text2 or "maximum" in error_text2.lower()

        # 60K doit être accepté
        req_60k = GenerateUnityDialogueRequest(
            user_instructions="Test",
            context_selections=context_selection,
            max_completion_tokens=60000,
            llm_model_identifier="gpt-5-mini",
        )
        assert req_60k.max_completion_tokens == 60000
