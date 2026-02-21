"""Tests pour le service ContextTruncator."""
import pytest
from services.context_truncator import ContextTruncator


class TestContextTruncatorEstimateTokens:
    """Tests pour estimate_tokens (estimation rapide sans tiktoken)."""

    def test_estimate_tokens_empty(self):
        """Chaîne vide retourne 0."""
        truncator = ContextTruncator(tokenizer=None)
        assert truncator.estimate_tokens("") == 0

    def test_estimate_tokens_short_text(self):
        """Texte court : au moins 1 token."""
        truncator = ContextTruncator(tokenizer=None)
        assert truncator.estimate_tokens("x") == 1
        assert truncator.estimate_tokens("ab") == 1

    def test_estimate_tokens_approx_four_chars_per_token(self):
        """Approximation ~4 caractères par token."""
        truncator = ContextTruncator(tokenizer=None)
        assert truncator.estimate_tokens("a" * 4) == 1
        assert truncator.estimate_tokens("a" * 8) == 2
        assert truncator.estimate_tokens("hello world") == 2  # 11 // 4
