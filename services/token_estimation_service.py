"""Token Estimation Service for calculating prompt and completion token counts."""
from __future__ import annotations

import logging
from typing import Optional, Tuple

from services.context_truncator import ContextTruncator

logger = logging.getLogger(__name__)

# Estimation typique de tokens pour un nœud de dialogue généré (réponse LLM).
DEFAULT_COMPLETION_TOKENS_PER_NODE = 350


def count_prompt_tokens_for_model(
    text: str,
    model_id: str,
    truncator: Optional[ContextTruncator] = None,
) -> int:
    """Compte les tokens d'un prompt brut pour un identifiant de modèle (chemin partagé UI / PromptEngine).

    Mistral : approximation caractères/4 (tokenizer SP hors tiktoken). Autres modèles : ``ContextTruncator``
    (cl100k_base si tiktoken disponible).

    Args:
        text: Texte complet du prompt.
        model_id: Identifiant API du modèle.
        truncator: Tronqueur réutilisable (optionnel).

    Returns:
        Nombre de tokens estimé (0 si texte vide).
    """
    if not text or not str(text).strip():
        return 0
    stripped = str(text).strip()
    mid = (model_id or "").lower()
    if "mistral" in mid:
        return max(1, len(stripped) // 4)
    t = truncator or ContextTruncator()
    return max(1, t.count_tokens(stripped))


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

        Pour les modèles OpenAI, utilise tiktoken (cl100k_base) si disponible.
        Pour les modèles Mistral, tiktoken n'est pas compatible ; on utilise l'approximation
        caractères/4 (précision ±10–15%, suffisante pour une estimation de coût avant génération).

        Args:
            prompt_text: Texte du prompt (contexte + instructions).
            model_id: Identifiant du modèle (détermine la méthode de comptage).

        Returns:
            (prompt_tokens, completion_tokens) estimés.
        """
        if not prompt_text or not prompt_text.strip():
            return (0, self._default_completion_tokens)

        text = prompt_text.strip()
        prompt_tokens = count_prompt_tokens_for_model(text, model_id, self._truncator)
        return (prompt_tokens, self._default_completion_tokens)
