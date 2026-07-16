"""Tests unitaires pour OpenAIResponseParser."""

import pytest
from unittest.mock import MagicMock
from pydantic import BaseModel, Field, ValidationError
from core.llm.openai.response_parser import OpenAIResponseParser


class TestParserModel(BaseModel):
    """Modèle de test pour structured output."""
    title: str = Field(description="Titre")
    content: str = Field(description="Contenu")


class TestOpenAIResponseParser:
    """Tests pour OpenAIResponseParser."""

    def test_extract_structured_output_success(self):
        """Test extraction structured output avec succès."""
        mock_item = MagicMock()
        mock_item.type = "function_call"
        mock_item.name = "generate_interaction"
        mock_item.arguments = '{"title": "Test", "content": "Content"}'
        
        output_items = [mock_item]
        parsed, error, success = OpenAIResponseParser.extract_structured_output(
            output_items, TestParserModel, "gpt-5.6-terra", variant_index=1
        )
        
        assert success is True
        assert parsed is not None
        assert isinstance(parsed, TestParserModel)
        assert parsed.title == "Test"
        assert error is None

    def test_extract_structured_output_validation_error(self):
        """Test extraction structured output avec erreur de validation."""
        mock_item = MagicMock()
        mock_item.type = "function_call"
        mock_item.name = "generate_interaction"
        mock_item.arguments = '{"invalid": "data"}'  # Manque title et content
        
        output_items = [mock_item]
        parsed, error, success = OpenAIResponseParser.extract_structured_output(
            output_items, TestParserModel, "gpt-5.6-terra", variant_index=1
        )
        
        assert success is False
        assert parsed is None
        assert error is not None
        assert "Validation error" in error

    def test_extract_structured_output_no_function_call(self):
        """Test extraction quand aucun function call trouvé."""
        mock_item = MagicMock()
        mock_item.type = "text"
        
        output_items = [mock_item]
        parsed, error, success = OpenAIResponseParser.extract_structured_output(
            output_items, TestParserModel, "gpt-5.6-terra", variant_index=1
        )
        
        assert success is False
        assert parsed is None
        assert error is not None

    def test_extract_text_output_success(self):
        """Test extraction texte simple avec succès."""
        mock_item = MagicMock()
        mock_item.type = "text"
        mock_item.text = "Hello world"
        
        output_items = [mock_item]
        text, error, success = OpenAIResponseParser.extract_text_output(
            output_items, variant_index=1
        )
        
        assert success is True
        assert text == "Hello world"
        assert error is None

    def test_extract_text_output_no_text_item(self):
        """Test extraction texte quand aucun item text."""
        mock_item = MagicMock()
        mock_item.type = "function_call"
        
        output_items = [mock_item]
        text, error, success = OpenAIResponseParser.extract_text_output(
            output_items, variant_index=1
        )
        
        assert success is False
        assert text is None
        assert error is not None

    def test_parse_response_with_model(self):
        """Test parsing avec response_model."""
        mock_response = MagicMock()
        mock_item = MagicMock()
        mock_item.type = "function_call"
        mock_item.name = "generate_interaction"
        mock_item.arguments = '{"title": "Test", "content": "Content"}'
        mock_response.output = [mock_item]
        
        parsed, error, success = OpenAIResponseParser.parse_response(
            mock_response, TestParserModel, "gpt-5.6-terra", variant_index=1
        )
        
        assert success is True
        assert parsed is not None
        assert isinstance(parsed, TestParserModel)

    def test_parse_response_without_model(self):
        """Test parsing sans response_model (texte simple)."""
        mock_response = MagicMock()
        mock_item = MagicMock()
        mock_item.type = "text"
        mock_item.text = "Hello"
        mock_response.output = [mock_item]
        
        parsed, error, success = OpenAIResponseParser.parse_response(
            mock_response, None, "gpt-5.6-terra", variant_index=1
        )
        
        assert success is True
        assert parsed == "Hello"
