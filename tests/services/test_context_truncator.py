"""Tests pour le service ContextTruncator."""
import pytest
from services.context_truncator import ContextTruncator, cap_context_text_to_budget


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


class TestCapContextTextToBudget:
    """Tests pour cap_context_text_to_budget (plafond post-sérialisation)."""

    def test_under_budget_unchanged(self):
        """Texte déjà sous le plafond : inchangé."""
        t = ContextTruncator(tokenizer=None)
        short = "one two three"
        assert cap_context_text_to_budget(short, t.count_tokens(short) + 10) == short

    def test_over_budget_truncates(self):
        """Texte au-delà du plafond : troncature avec marqueur."""
        words = " ".join([f"w{i}" for i in range(200)])
        out = cap_context_text_to_budget(words, 5)
        assert len(out) < len(words)
        assert "tronqué" in out
