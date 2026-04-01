"""Service de gestion des tokens et troncature de contexte."""
import logging
import re
from typing import Optional

# Import tiktoken avec gestion d'erreur
try:
    import tiktoken
    TIKTOKEN_AVAILABLE = True
except ImportError:
    tiktoken = None
    TIKTOKEN_AVAILABLE = False

logger = logging.getLogger(__name__)


class ContextTruncator:
    """Gère le comptage de tokens et la troncature de contexte.
    
    Utilise tiktoken pour un comptage précis des tokens, avec fallback
    sur un comptage naïf basé sur les mots si tiktoken n'est pas disponible.
    """
    
    def __init__(self, tokenizer=None):
        """Initialise le tronqueur avec un tokenizer optionnel.
        
        Args:
            tokenizer: Tokenizer tiktoken (si None, sera créé automatiquement si disponible).
        """
        if tokenizer is not None:
            self.tokenizer = tokenizer
        elif TIKTOKEN_AVAILABLE and tiktoken:
            try:
                self.tokenizer = tiktoken.get_encoding("cl100k_base")
            except Exception:
                self.tokenizer = None
                logger.warning("tiktoken n'est pas disponible. La gestion précise du nombre de tokens sera désactivée.")
        else:
            self.tokenizer = None
            logger.warning("tiktoken n'est pas installé. La gestion précise du nombre de tokens sera désactivée.")
    
    def estimate_tokens(self, text: str) -> int:
        """Estimation rapide du nombre de tokens sans appeler tiktoken.
        
        Utilisé dans les boucles (par élément) pour éviter N encodages coûteux.
        Approximation typique : ~4 caractères par token (cl100k_base).
        
        Args:
            text: Texte à estimer.
            
        Returns:
            Estimation du nombre de tokens.
        """
        if not text:
            return 0
        return max(1, len(text) // 4)

    def count_tokens(self, text: str) -> int:
        """Compte le nombre de tokens dans un texte.
        
        Args:
            text: Texte à analyser.
            
        Returns:
            Nombre de tokens (ou nombre de mots si tiktoken non disponible).
        """
        if self.tokenizer:
            return len(self.tokenizer.encode(text))
        else:
            return len(text.split())
    
    def truncate_context(self, context: str, max_tokens: int) -> str:
        """Tronque un contexte pour respecter une limite de tokens.
        
        Args:
            context: Contexte à tronquer.
            max_tokens: Nombre maximum de tokens autorisés.
            
        Returns:
            Contexte tronqué avec indicateur si nécessaire.
        """
        tokens = self.count_tokens(context)
        
        if tokens <= max_tokens:
            return context
        
        logger.warning(f"ContextTruncator: Limite de tokens ({max_tokens}) atteinte. Troncature du contexte ({tokens} tokens).")
        
        # Tronquer en utilisant tiktoken si disponible
        if self.tokenizer:
            try:
                encoded = self.tokenizer.encode(context)
                truncated_encoded = encoded[:max_tokens]
                truncated_text = self.tokenizer.decode(truncated_encoded)
                return truncated_text + "\n... (contexte tronqué)"
            except Exception as e:
                logger.warning(f"Erreur lors de la troncature avec tiktoken: {e}, utilisation du fallback")
        
        # Fallback naïf : découpe sur les mots
        words = context.split()
        truncated_words = words[:max_tokens]
        return " ".join(truncated_words) + "\n... (contexte tronqué)"
    
    def format_previous_dialogue(self, previous_dialogue: str, max_tokens: int) -> str:
        """Formate et tronque un dialogue précédent pour l'inclure dans le contexte.
        
        Le texte est déjà formaté, on vérifie juste les tokens et tronque si nécessaire.
        La troncature garde les dernières lignes pour préserver la fin du dialogue.
        
        Args:
            previous_dialogue: Texte formaté du dialogue précédent.
            max_tokens: Nombre maximum de tokens autorisés.
            
        Returns:
            Dialogue formaté et tronqué si nécessaire.
        """
        if not previous_dialogue:
            return ""
        
        tokens = self.count_tokens(previous_dialogue)
        
        if tokens <= max_tokens:
            return previous_dialogue
        
        # Tronquer si nécessaire (garder les dernières lignes pour préserver la fin du dialogue)
        logger.warning(f"ContextTruncator: Limite de tokens ({max_tokens}) atteinte. Troncature du dialogue précédent ({tokens} tokens).")
        lines = previous_dialogue.split('\n')
        truncated_lines = []
        current_tokens = 0
        
        # Commencer par la fin pour garder les dernières répliques
        for line in reversed(lines):
            line_tokens = self.count_tokens(line + '\n')
            if current_tokens + line_tokens <= max_tokens:
                truncated_lines.insert(0, line)
                current_tokens += line_tokens
            else:
                break
        
        if not truncated_lines:
            logger.warning("ContextTruncator: Impossible de tronquer le dialogue précédent, retour vide.")
            return ""
        
        return '\n'.join(truncated_lines)


def cap_context_text_to_budget(text: str, max_tokens: int) -> str:
    """Tronque un texte de contexte sérialisé s'il dépasse ``max_tokens``.

    Politique alignée sur la génération Unity (orchestrateur + endpoints dialogue) :
    comptage via ``ContextTruncator.count_tokens`` puis ``truncate_context`` si besoin.

    Args:
        text: Contexte après ``serialize_context_to_text`` (ou équivalent).
        max_tokens: Plafond demandé par la requête (ex. ``max_context_tokens``).

    Returns:
        Texte inchangé si sous le plafond, sinon tronqué avec marqueur de troncature.
    """
    if not text or max_tokens <= 0:
        return text
    truncator = ContextTruncator()
    if truncator.count_tokens(text) <= max_tokens:
        return text
    return truncator.truncate_context(text, max_tokens)


def count_tokens_in_prompt_context_element(raw_xml: str) -> int:
    """Compte les tokens du contenu interne de la première balise ``<context>`` du prompt.

    Utilisé pour aligner ``context_tokens`` (API estimate) sur ce que le LLM reçoit réellement
    dans la section contexte du XML assemblé par ``PromptEngine``.

    Args:
        raw_xml: Document XML du prompt (ex. ``BuiltPrompt.raw_prompt``).

    Returns:
        Nombre de tokens (``ContextTruncator``) du fragment interne à ``<context>``, ou 0 si absent.
    """
    if not raw_xml:
        return 0
    match = re.search(r"<context(?:\s[^>]*)?>([\s\S]*?)</context>", raw_xml)
    if not match:
        return 0
    inner = match.group(1).strip()
    if not inner:
        return 0
    return ContextTruncator().count_tokens(inner)
