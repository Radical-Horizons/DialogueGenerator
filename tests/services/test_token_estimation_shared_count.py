"""Tests du comptage partagé prompt / modèle."""
from services.token_estimation_service import count_prompt_tokens_for_model


def test_count_prompt_tokens_mistral_uses_char_heuristic() -> None:
    """Mistral utilise l'approximation caractères/4."""
    text = "x" * 40
    n = count_prompt_tokens_for_model(text, "mistral-small-latest")
    assert n == 10


def test_count_prompt_tokens_openai_family_uses_truncator() -> None:
    """Modèles non-Mistral passent par ContextTruncator (cl100k si tiktoken)."""
    text = "Hello world test"
    n = count_prompt_tokens_for_model(text, "gpt-5.6-luna")
    assert n >= 1
