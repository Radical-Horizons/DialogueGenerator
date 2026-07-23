"""Tests whitelist Unity pour modèles OpenRouter."""

from __future__ import annotations

import json
from pathlib import Path

from constants import ModelNames
from core.llm.unity_allowed_models import get_unity_structured_output_allowed_models


def test_unity_allowed_includes_gpt56_and_openrouter(tmp_path: Path) -> None:
    """Les modèles openrouter du catalogue rejoignent la whitelist GPT-5.6."""
    config_path = tmp_path / "llm_config.json"
    config_path.write_text(
        json.dumps(
            {
                "available_models": [
                    {
                        "api_identifier": "aion-labs/aion-2.0",
                        "display_name": "Aion 2.0",
                        "client_type": "openrouter",
                    },
                    {
                        "api_identifier": "gpt-5.6-terra",
                        "client_type": "openai",
                    },
                ]
            }
        ),
        encoding="utf-8",
    )
    allowed = get_unity_structured_output_allowed_models(config_path)
    assert ModelNames.GPT_5_6_SOL in allowed
    assert ModelNames.GPT_5_6_TERRA in allowed
    assert ModelNames.GPT_5_6_LUNA in allowed
    assert "aion-labs/aion-2.0" in allowed


def test_unity_allowed_seed_config_includes_aion() -> None:
    """Le llm_config projet seedé autorise Aion 2.0."""
    allowed = get_unity_structured_output_allowed_models()
    assert "aion-labs/aion-2.0" in allowed
