"""Régression : champs LLM optionnels du preset alignés avec le frontend."""

from api.schemas.preset import PresetConfiguration


def test_preset_configuration_accepts_llm_optional_fields() -> None:
    """Les paramètres LLM du preset ne doivent plus être stripés par Pydantic."""
    cfg = PresetConfiguration(
        region="R",
        sceneType="S",
        topP=0.95,
        reasoningEffort="low",
        maxCompletionTokens=2048,
        maxChoices=3,
        llmModel="gpt-4o-mini",
    )
    dumped = cfg.model_dump()
    assert dumped["topP"] == 0.95
    assert dumped["reasoningEffort"] == "low"
    assert dumped["maxCompletionTokens"] == 2048
    assert dumped["maxChoices"] == 3
    assert dumped["llmModel"] == "gpt-4o-mini"
