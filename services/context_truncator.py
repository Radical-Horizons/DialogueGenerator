"""Service de gestion des tokens et troncature de contexte."""
import json
import logging
import re
from typing import Any, Optional, Sequence, Union

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

    def count_tokens(self, text: Union[str, Any]) -> int:
        """Compte le nombre de tokens dans un texte.
        
        Args:
            text: Texte à analyser.
            
        Returns:
            Nombre de tokens (ou nombre de mots si tiktoken non disponible).
        """
        if not isinstance(text, str):
            if isinstance(text, (dict, list)):
                text = json.dumps(text, ensure_ascii=False)
            else:
                text = str(text)
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


_GDD_CATEGORY_MARKERS: tuple[str, ...] = (
    "--- LOCATIONS ---",
    "--- ITEMS ---",
    "--- SPECIES ---",
    "--- COMMUNITIES ---",
    "--- QUESTS ---",
    "--- NARRATIVE_STRUCTURES ---",
    "--- CHAPTERS ---",
    "--- SCENES ---",
)


def _extract_gdd_entity_block(section_text: str, entity_name: str, entity_names: Sequence[str]) -> str:
    """Extrait le bloc texte d'une fiche GDD (marqueur ``--- Nom ---``)."""
    start_marker = f"--- {entity_name} ---"
    start_idx = section_text.find(start_marker)
    if start_idx < 0:
        return ""
    end_idx = len(section_text)
    search_from = start_idx + len(start_marker)
    for other in entity_names:
        if other == entity_name:
            continue
        marker = f"\n--- {other} ---"
        pos = section_text.find(marker, search_from)
        if pos >= 0:
            end_idx = min(end_idx, pos)
    for cat_marker in _GDD_CATEGORY_MARKERS:
        pos = section_text.find(f"\n{cat_marker}", search_from)
        if pos >= 0:
            end_idx = min(end_idx, pos)
    return section_text[start_idx:end_idx].strip()


def cap_context_text_preserving_entities(
    text: str,
    max_tokens: int,
    protect_entity_names: Sequence[str],
    *,
    all_entity_names: Optional[Sequence[str]] = None,
) -> Optional[str]:
    """Tronque le contexte GDD en préservant les fiches ``protect_entity_names``.

    Les entités protégées sont conservées intégralement ; le reste est tronqué
    depuis la fin pour respecter ``max_tokens``.

    Args:
        text: Contexte sérialisé (format ``--- … ---``).
        max_tokens: Plafond de tokens.
        protect_entity_names: Noms de fiches à ne jamais couper.
        all_entity_names: Tous les noms de fiches présents (délimitation des blocs).

    Returns:
        Texte tronqué, ou None si la section CHARACTERS est absente.
    """
    if not text or max_tokens <= 0 or not protect_entity_names:
        return None

    truncator = get_shared_truncator()
    if truncator.count_tokens(text) <= max_tokens:
        return text

    char_match = re.search(r"\n--- CHARACTERS ---\n", text)
    if not char_match:
        return None

    prefix = text[: char_match.end()]
    characters_body = text[char_match.end() :]
    names = list(dict.fromkeys(n for n in (all_entity_names or protect_entity_names) if n))

    protected_blocks: list[str] = []
    for name in protect_entity_names:
        block = _extract_gdd_entity_block(characters_body, name, names)
        if block:
            protected_blocks.append(block)

    if not protected_blocks:
        return None

    protected_text = "\n\n".join(protected_blocks)
    assembled = f"{prefix}{protected_text}"
    if truncator.count_tokens(assembled) > max_tokens:
        return truncator.truncate_context(text, max_tokens)

    remainder_budget = max_tokens - truncator.count_tokens(assembled)
    if remainder_budget <= 0:
        return assembled + "\n... (contexte tronqué)"

    other_blocks: list[str] = []
    for name in names:
        if name in protect_entity_names:
            continue
        block = _extract_gdd_entity_block(characters_body, name, names)
        if block:
            other_blocks.append(block)

    categories_tail = ""
    for marker in _GDD_CATEGORY_MARKERS:
        pos = text.find(marker, char_match.end())
        if pos >= 0:
            categories_tail = text[pos:].strip()
            break

    remainder_parts = list(other_blocks)
    if categories_tail:
        remainder_parts.append(categories_tail)
    remainder_text = "\n\n".join(p for p in remainder_parts if p)
    if not remainder_text:
        return assembled

    capped_tail = truncator.truncate_context(remainder_text, remainder_budget)
    return f"{assembled}\n\n{capped_tail}"


_SHARED_TRUNCATOR: Optional["ContextTruncator"] = None


def get_shared_truncator() -> "ContextTruncator":
    """Retourne une instance ``ContextTruncator`` partagée (tokenizer tiktoken réutilisé).

    Évite de recréer un tokenizer à chaque appel des helpers de comptage/troncature
    (chemin chaud estimate-tokens). Le ``ContextTruncator`` est sans état mutable entre
    appels, donc le partage est sûr.

    Returns:
        Instance singleton de ``ContextTruncator``.
    """
    global _SHARED_TRUNCATOR
    if _SHARED_TRUNCATOR is None:
        _SHARED_TRUNCATOR = ContextTruncator()
    return _SHARED_TRUNCATOR


def cap_context_text_to_budget(
    text: Union[str, Any, None],
    max_tokens: int,
    *,
    protect_entity_names: Optional[Sequence[str]] = None,
    all_entity_names: Optional[Sequence[str]] = None,
) -> str:
    """Tronque un texte de contexte sérialisé s'il dépasse ``max_tokens``.

    Politique alignée sur la génération Unity (orchestrateur + endpoints dialogue) :
    comptage via ``ContextTruncator.count_tokens`` puis ``truncate_context`` si besoin.
    Si ``protect_entity_names`` est fourni, les fiches correspondantes sont préservées.

    Args:
        text: Contexte après ``serialize_context_to_text`` (ou équivalent).
        max_tokens: Plafond demandé par la requête (ex. ``max_context_tokens``).
        protect_entity_names: Noms de fiches GDD à ne pas sacrifier à la troncature.
        all_entity_names: Noms de toutes les fiches (délimitation des blocs).

    Returns:
        Texte inchangé si sous le plafond, sinon tronqué avec marqueur de troncature.
    """
    if text is None:
        return ""
    if max_tokens <= 0:
        return "" if not text else (text if isinstance(text, str) else json.dumps(text, ensure_ascii=False))
    if not text:
        return text if isinstance(text, str) else ""
    if not isinstance(text, str):
        text = json.dumps(text, ensure_ascii=False) if isinstance(text, (dict, list)) else str(text)
    truncator = get_shared_truncator()
    if truncator.count_tokens(text) <= max_tokens:
        return text
    if protect_entity_names:
        preserved = cap_context_text_preserving_entities(
            text,
            max_tokens,
            protect_entity_names,
            all_entity_names=all_entity_names,
        )
        if preserved is not None:
            return preserved
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
    return get_shared_truncator().count_tokens(inner)
