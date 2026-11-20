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


def _sdk_text_response(*texts_per_message: list[str]):
    """Vraie réponse SDK Responses : un item de raisonnement puis des messages ``output_text``."""
    from openai.types.responses import (
        Response,
        ResponseOutputMessage,
        ResponseOutputText,
        ResponseReasoningItem,
    )
    from openai.types.responses.response_reasoning_item import Summary

    output: list = [
        ResponseReasoningItem(
            id="rs_1",
            type="reasoning",
            summary=[Summary(type="summary_text", text="Je réfléchis.")],
        )
    ]
    for index, texts in enumerate(texts_per_message):
        output.append(
            ResponseOutputMessage(
                id=f"msg_{index}",
                type="message",
                role="assistant",
                status="completed",
                content=[ResponseOutputText(type="output_text", text=t, annotations=[]) for t in texts],
            )
        )
    return Response(
        id="resp_1",
        created_at=0.0,
        model="gpt-6.2-sol",
        object="response",
        parallel_tool_calls=True,
        tool_choice="auto",
        tools=[],
        output=output,
    )


def test_extract_text_output_reads_sdk_message_output_text() -> None:
    """Texte libre réel : items ``message`` / parties ``output_text`` joints (comme ``Response.output_text``)."""
    response = _sdk_text_response(["Bonjour ", "voyageur."], [" Suite."])

    text, error, success = OpenAIResponseParser.extract_text_output(response.output)

    assert success is True
    assert error is None
    assert text == response.output_text.strip() == "Bonjour voyageur. Suite."


def test_parse_response_without_model_on_sdk_response() -> None:
    """parse_response sans response_model sur une vraie réponse SDK rend le texte."""
    parsed, error, success = OpenAIResponseParser.parse_response(
        _sdk_text_response(["Réponse libre."]), None, "gpt-6.2-sol"
    )
    assert (parsed, error, success) == ("Réponse libre.", None, True)


def test_extract_text_output_only_reasoning_is_empty() -> None:
    """Raisonnement sans message : réponse vide (échec explicite, pas de texte inventé)."""
    text, error, success = OpenAIResponseParser.extract_text_output(_sdk_text_response().output)
    assert text is None
    assert success is False
    assert error is not None


def test_extract_text_output_reports_sdk_refusal() -> None:
    """Un message fait d'un seul refus (``refusal``) est un échec, avec le motif du modèle."""
    from openai.types.responses import ResponseOutputMessage, ResponseOutputRefusal

    refusal = ResponseOutputMessage(
        id="msg_r",
        type="message",
        role="assistant",
        status="completed",
        content=[ResponseOutputRefusal(type="refusal", refusal="Je ne peux pas aider.")],
    )

    text, error, success = OpenAIResponseParser.extract_text_output([refusal])

    assert (text, success) == (None, False)
    assert error is not None and "Je ne peux pas aider." in error


def test_parse_response_incomplete_is_failure_even_with_text() -> None:
    """``status == "incomplete"`` (max_output_tokens) : le texte coupé n'est pas une réponse."""
    from openai.types.responses.response import IncompleteDetails

    response = _sdk_text_response(["Début de réponse coup"])
    response.status = "incomplete"
    response.incomplete_details = IncompleteDetails(reason="max_output_tokens")

    parsed, error, success = OpenAIResponseParser.parse_response(response, None, "gpt-6.2-sol")

    assert (parsed, success) == (None, False)
    assert error is not None and "max_output_tokens" in error
