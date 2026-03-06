"""Token Estimation Service for calculating prompt and completion token counts."""
from __future__ import annotations

import logging
from typing import Optional, Tuple

from services.context_truncator import ContextTruncator

logger = logging.getLogger(__name__)

# Estimation typique de tokens pour un nœud de dialogue généré (réponse LLM).
DEFAULT_COMPLETION_TOKENS_PER_NODE = 350


class TokenEstimationService:
    """Estime les tokens (prompt + completion) sans appeler le LLM.

    Réutilise la logique tiktoken / ContextTruncator pour le prompt.
    La completion est estimée par nœud (constante par défaut).
    """

    def __init__(
        self,
        truncator: Optional[ContextTruncator] = None,
        default_completion_tokens: int = DEFAULT_COMPLETION_TOKENS_PER_NODE,
    ) -> None:
        """Initialise le service.

        Args:
            truncator: Tronqueur pour compter les tokens (créé si None).
            default_completion_tokens: Nombre de tokens estimés pour la réponse (un nœud).
        """
        self._truncator = truncator or ContextTruncator()
        self._default_completion_tokens = max(1, default_completion_tokens)

    def estimate_tokens(self, prompt_text: str, model_id: str) -> Tuple[int, int]:
        """Estime les tokens pour un prompt sans appel LLM.

        Args:
            prompt_text: Texte du prompt (contexte + instructions).
            model_id: Identifiant du modèle (pour cohérence API ; encodage cl100k_base utilisé si tiktoken).

        Returns:
            (prompt_tokens, completion_tokens) estimés.
        """
        if not prompt_text or not prompt_text.strip():
            return (0, self._default_completion_tokens)

        prompt_tokens = self._truncator.count_tokens(prompt_text.strip())
        if prompt_tokens < 1:
            prompt_tokens = 1
        return (prompt_tokens, self._default_completion_tokens)
