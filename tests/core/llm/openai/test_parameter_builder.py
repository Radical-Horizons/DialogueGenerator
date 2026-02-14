"""Tests unitaires pour OpenAIParameterBuilder."""

import pytest
from unittest.mock import MagicMock
from pydantic import BaseModel, Field
from core.llm.openai.parameter_builder import OpenAIParameterBuilder


class TestParameterModel(BaseModel):
    """Modèle de test pour structured output."""
    title: str = Field(description="Titre de l'interaction")
    content: str = Field(description="Contenu")
    
    class Config:
        """Configuration Pydantic."""
        pass
    
    def __init__(self, **data):
        """Initialise le modèle de test."""
        super().__init__(**data)


class TestOpenAIParameterBuilder:
    """Tests pour OpenAIParameterBuilder."""

    def test_build_tool_definition_with_model(self):
        """Test construction tool_definition avec response_model."""
        tool_def = OpenAIParameterBuilder.build_tool_definition(TestParameterModel)
        
        assert tool_def is not None
        assert tool_def["type"] == "function"
        assert tool_def["name"] == "generate_interaction"
        assert "parameters" in tool_def
        assert tool_def["parameters"]["type"] == "object"
        assert "title" in tool_def["parameters"]["properties"]
        assert "content" in tool_def["parameters"]["properties"]

    def test_build_tool_definition_without_model(self):
        """Test construction tool_definition sans response_model."""
        tool_def = OpenAIParameterBuilder.build_tool_definition(None)
        
        assert tool_def is None

    def test_build_tool_choice(self):
        """Test construction tool_choice."""
        tool_choice = OpenAIParameterBuilder.build_tool_choice()
        
        assert tool_choice["type"] == "allowed_tools"
        assert tool_choice["mode"] == "required"
        assert len(tool_choice["tools"]) == 1
        assert tool_choice["tools"][0]["name"] == "generate_interaction"

    def test_build_reasoning_config_none_effort(self):
        """Test construction reasoning config avec effort=None."""
        config = OpenAIParameterBuilder.build_reasoning_config(
            "gpt-5.2", None, None
        )
        
        assert config == {}

    def test_build_reasoning_config_medium_effort(self):
        """Test construction reasoning config avec effort=medium."""
        config = OpenAIParameterBuilder.build_reasoning_config(
            "gpt-5.2", "medium", None
        )
        
        assert config["effort"] == "medium"
        assert config["summary"] == "auto"  # "auto" est utilisé par défaut

    def test_build_reasoning_config_mini_nano_none_effort(self):
        """Test que mini/nano convertit 'none' en 'minimal'."""
        config = OpenAIParameterBuilder.build_reasoning_config(
            "gpt-5-mini", "none", None
        )
        
        assert config["effort"] == "minimal"

    def test_build_reasoning_config_mini_nano_xhigh_effort(self):
        """Test que mini/nano convertit 'xhigh' en 'high'."""
        config = OpenAIParameterBuilder.build_reasoning_config(
            "gpt-5-nano", "xhigh", None
        )
        
        assert config["effort"] == "high"

    def test_should_include_temperature_with_none_effort(self):
        """Test que temperature est incluse si effort=None."""
        reasoning_config = {}
        should_include = OpenAIParameterBuilder.should_include_temperature(
            "gpt-5.2", reasoning_config, None
        )
        
        assert should_include is True

    def test_should_include_temperature_with_none_effort_value(self):
        """Test que temperature est incluse si effort='none'."""
        reasoning_config = {"effort": "none"}
        should_include = OpenAIParameterBuilder.should_include_temperature(
            "gpt-5.2", reasoning_config, "none"
        )
        
        assert should_include is True

    def test_should_include_temperature_with_medium_effort(self):
        """Test que temperature n'est pas incluse si effort=medium."""
        reasoning_config = {"effort": "medium"}
        should_include = OpenAIParameterBuilder.should_include_temperature(
            "gpt-5.2", reasoning_config, "medium"
        )
        
        assert should_include is False

    def test_should_include_temperature_mini_nano(self):
        """Test que mini/nano n'incluent jamais temperature."""
        reasoning_config = {}
        should_include = OpenAIParameterBuilder.should_include_temperature(
            "gpt-5-mini", reasoning_config, None
        )
        
        assert should_include is False

    def test_build_responses_params_basic(self):
        """Test construction paramètres de base."""
        messages = [{"role": "user", "content": "Test"}]
        params = OpenAIParameterBuilder.build_responses_params(
            model_name="gpt-5.2",
            messages=messages,
            response_model=None,
            max_tokens=1500,
            temperature=0.7,
            reasoning_effort=None,
            reasoning_summary=None,
        )
        
        assert params["model"] == "gpt-5.2"
        assert params["input"] == messages
        assert params["max_output_tokens"] == 1500
        assert params["temperature"] == 0.7
    
    def test_build_responses_params_with_instructions(self):
        """Test construction paramètres avec instructions séparé."""
        messages = [{"role": "user", "content": "Test"}]
        instructions = "Tu es un assistant expert."
        params = OpenAIParameterBuilder.build_responses_params(
            model_name="gpt-5.2",
            messages=messages,
            response_model=None,
            max_tokens=1500,
            temperature=0.7,
            reasoning_effort=None,
            reasoning_summary=None,
            instructions=instructions,
        )
        
        assert params["model"] == "gpt-5.2"
        assert params["input"] == messages
        assert params["instructions"] == instructions
        assert params["max_output_tokens"] == 1500
    
    def test_build_responses_params_with_top_p(self):
        """Test construction paramètres avec top_p."""
        messages = [{"role": "user", "content": "Test"}]
        params = OpenAIParameterBuilder.build_responses_params(
            model_name="gpt-5.2",
            messages=messages,
            response_model=None,
            max_tokens=1500,
            temperature=0.7,
            reasoning_effort=None,
            reasoning_summary=None,
            top_p=0.9,
        )
        
        assert params["top_p"] == 0.9
        # top_p et temperature peuvent coexister
        assert params["temperature"] == 0.7
    
    def test_build_responses_params_with_streaming(self):
        """Test construction paramètres avec streaming."""
        messages = [{"role": "user", "content": "Test"}]
        params = OpenAIParameterBuilder.build_responses_params(
            model_name="gpt-5.2",
            messages=messages,
            response_model=None,
            max_tokens=1500,
            temperature=0.7,
            reasoning_effort=None,
            reasoning_summary=None,
            stream=True,
        )
        
        assert params["stream"] is True
        assert "stream_options" not in params  # Responses API n'utilise pas stream_options
    
    def test_build_responses_params_top_p_validation(self):
        """Test que top_p hors limites est ignoré."""
        messages = [{"role": "user", "content": "Test"}]
        params = OpenAIParameterBuilder.build_responses_params(
            model_name="gpt-5.2",
            messages=messages,
            response_model=None,
            max_tokens=1500,
            temperature=0.7,
            reasoning_effort=None,
            reasoning_summary=None,
            top_p=1.5,  # Hors limites
        )
        
        # top_p hors limites ne doit pas être inclus
        assert "top_p" not in params

    def test_build_responses_params_with_structured_output(self):
        """Test construction paramètres avec structured output."""
        messages = [{"role": "user", "content": "Test"}]
        params = OpenAIParameterBuilder.build_responses_params(
            model_name="gpt-5.2",
            messages=messages,
            response_model=TestParameterModel,
            max_tokens=1500,
            temperature=0.7,
            reasoning_effort=None,
            reasoning_summary=None,
        )
        
        assert params["model"] == "gpt-5.2"
        assert "tools" in params
        assert len(params["tools"]) == 1
        assert "tool_choice" in params

    def test_build_responses_params_with_reasoning(self):
        """Test construction paramètres avec reasoning."""
        messages = [{"role": "user", "content": "Test"}]
        params = OpenAIParameterBuilder.build_responses_params(
            model_name="gpt-5.2",
            messages=messages,
            response_model=None,
            max_tokens=1500,
            temperature=0.7,
            reasoning_effort="medium",
            reasoning_summary="auto",
        )
        
        assert "reasoning" in params
        assert params["reasoning"]["effort"] == "medium"
        assert params["reasoning"]["summary"] == "auto"
        # Temperature ne doit pas être incluse car reasoning.effort != "none"
        assert "temperature" not in params
    
    def test_build_responses_params_with_instructions(self):
        """Test construction paramètres avec instructions séparé."""
        messages = [{"role": "user", "content": "Test"}]
        instructions = "Tu es un assistant expert."
        params = OpenAIParameterBuilder.build_responses_params(
            model_name="gpt-5.2",
            messages=messages,
            response_model=None,
            max_tokens=1500,
            temperature=0.7,
            reasoning_effort=None,
            reasoning_summary=None,
            instructions=instructions,
        )
        
        assert params["model"] == "gpt-5.2"
        assert params["input"] == messages
        assert params["instructions"] == instructions
        assert params["max_output_tokens"] == 1500
    
    def test_build_responses_params_with_top_p(self):
        """Test construction paramètres avec top_p."""
        messages = [{"role": "user", "content": "Test"}]
        params = OpenAIParameterBuilder.build_responses_params(
            model_name="gpt-5.2",
            messages=messages,
            response_model=None,
            max_tokens=1500,
            temperature=0.7,
            reasoning_effort=None,
            reasoning_summary=None,
            top_p=0.9,
        )
        
        assert params["top_p"] == 0.9
        # top_p et temperature peuvent coexister
        assert params["temperature"] == 0.7
    
    def test_build_responses_params_with_streaming(self):
        """Test construction paramètres avec streaming."""
        messages = [{"role": "user", "content": "Test"}]
        params = OpenAIParameterBuilder.build_responses_params(
            model_name="gpt-5.2",
            messages=messages,
            response_model=None,
            max_tokens=1500,
            temperature=0.7,
            reasoning_effort=None,
            reasoning_summary=None,
            stream=True,
        )
        
        assert params["stream"] is True
        assert "stream_options" not in params  # Responses API n'utilise pas stream_options
    
    def test_build_responses_params_top_p_validation(self):
        """Test que top_p hors limites est ignoré."""
        messages = [{"role": "user", "content": "Test"}]
        params = OpenAIParameterBuilder.build_responses_params(
            model_name="gpt-5.2",
            messages=messages,
            response_model=None,
            max_tokens=1500,
            temperature=0.7,
            reasoning_effort=None,
            reasoning_summary=None,
            top_p=1.5,  # Hors limites
        )
        
        # top_p hors limites ne doit pas être inclus
        assert "top_p" not in params