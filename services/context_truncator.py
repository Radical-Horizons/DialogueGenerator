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


NON_SPEAKER_CONTEXT_SHARE = 0.4
"""Part maximale du budget de contexte réservée aux fiches autres que le locuteur.

Elle n'est prise que si ces fiches en ont besoin : un PJ en extrait, un lieu et une
espèce tiennent d'ordinaire bien en dessous, et le reste revient au locuteur.
"""

_GDD_CATEGORY_MARKER = re.compile(r"^--- [A-Z_]+ ---$")
"""Ligne d'en-tête de catégorie (``--- LOCATIONS ---``) : toujours en capitales."""

_TRUNCATION_MARKER_TOKENS = 8


def _split_entity_segments(
    text: str, entity_names: Sequence[str]
) -> tuple[str, list[tuple[str, str]]]:
    """Découpe le contexte sérialisé en préambule et en une tranche par fiche.

    Une tranche commence au marqueur ``--- Nom ---`` de sa fiche, ou à l'en-tête de
    catégorie qui le précède immédiatement : couper une tranche ne doit pas emporter
    l'en-tête de la catégorie suivante.

    Args:
        text: Contexte sérialisé.
        entity_names: Noms des fiches présentes, toutes catégories confondues.

    Returns:
        Le préambule et la liste ordonnée ``(nom, tranche)``.
    """
    starts: list[tuple[int, str]] = []
    for name in dict.fromkeys(n for n in entity_names if n):
        match = re.search(rf"^--- {re.escape(name)} ---$", text, re.M)
        if not match:
            continue
        start = match.start()
        previous_line_start = text.rfind("\n", 0, max(0, start - 1)) + 1
        previous_line = text[previous_line_start : max(0, start - 1)]
        if _GDD_CATEGORY_MARKER.match(previous_line):
            start = previous_line_start
        starts.append((start, name))
    starts.sort()
    if not starts:
        return text, []
    segments = [
        (name, text[start : (starts[i + 1][0] if i + 1 < len(starts) else len(text))].rstrip())
        for i, (start, name) in enumerate(starts)
    ]
    return text[: starts[0][0]], segments


def _fair_shares(needs: Sequence[int], budget: int) -> list[int]:
    """Répartit un budget entre des besoins, sans qu'aucun n'écrase les autres.

    Chacun reçoit au plus son besoin ; ce qu'un petit besoin laisse revient aux plus
    gros, à parts égales.

    Args:
        needs: Besoin en tokens de chaque tranche.
        budget: Budget à répartir.

    Returns:
        La part accordée à chaque tranche, dans l'ordre d'entrée.
    """
    shares = [0] * len(needs)
    remaining = max(0, budget)
    order = sorted(range(len(needs)), key=lambda i: needs[i])
    for rank, index in enumerate(order):
        share = remaining // (len(order) - rank)
        shares[index] = min(needs[index], share)
        remaining -= shares[index]
    return shares


def cap_context_text_preserving_entities(
    text: str,
    max_tokens: int,
    protect_entity_names: Sequence[str],
    *,
    all_entity_names: Optional[Sequence[str]] = None,
) -> Optional[str]:
    """Tronque le contexte GDD sans qu'une fiche en évince une autre.

    Le locuteur passe en premier, mais pas au point d'évincer tout le reste. Quand sa
    fiche dépassait à elle seule le budget, le texte entier était coupé par la tête :
    la fiche du PNJ, tronquée, puis plus rien — ni PJ, ni lieu, ni espèce. Constaté
    sur quatre cas de benchmark sur huit en octobre 2026. Une part du budget est donc
    réservée aux autres fiches, partagée équitablement entre elles ; chaque fiche est
    coupée par sa fin, que l'organisateur réserve à ce qui compte le moins.

    Args:
        text: Contexte sérialisé (format ``--- … ---``).
        max_tokens: Plafond de tokens.
        protect_entity_names: Fiches prioritaires (le locuteur).
        all_entity_names: Noms de **toutes** les fiches présentes, toutes catégories
            confondues — c'est par eux que le texte est découpé.

    Returns:
        Texte tronqué, ou ``None`` si aucune fiche protégée n'est repérable.
    """
    if not text or max_tokens <= 0 or not protect_entity_names:
        return None

    truncator = get_shared_truncator()
    if truncator.count_tokens(text) <= max_tokens:
        return text

    names = list(all_entity_names or []) + [n for n in protect_entity_names if n]
    prefix, segments = _split_entity_segments(text, names)
    protected = [i for i, (name, _) in enumerate(segments) if name in protect_entity_names]
    if not protected:
        return None

    needs = [truncator.count_tokens(segment) for _, segment in segments]
    # Chaque tranche coupée reçoit un marqueur de troncature : le compter d'avance
    # garde le total sous le plafond.
    available = max(
        0, max_tokens - truncator.count_tokens(prefix) - _TRUNCATION_MARKER_TOKENS * len(segments)
    )
    others = [i for i in range(len(segments)) if i not in protected]
    reserve = min(sum(needs[i] for i in others), int(available * NON_SPEAKER_CONTEXT_SHARE))

    budgets = [0] * len(segments)
    for index, share in zip(protected, _fair_shares([needs[i] for i in protected], available - reserve)):
        budgets[index] = share
    left = available - sum(budgets[i] for i in protected)
    for index, share in zip(others, _fair_shares([needs[i] for i in others], left)):
        budgets[index] = share

    parts = [prefix.rstrip()]
    for (_, segment), need, budget in zip(segments, needs, budgets):
        if budget >= need:
            parts.append(segment)
        elif budget > 0:
            parts.append(truncator.truncate_context(segment, budget))
    return "\n\n".join(part for part in parts if part)


def entity_names_from_structured(
    structured_context: Any, category_type: Optional[str] = None
) -> list[str]:
    """Liste, dans l'ordre du contexte, les noms des fiches présentes.

    L'ordre compte : le locuteur est placé en tête par la composition de scène, et
    c'est lui que la troncature privilégie.

    Args:
        structured_context: ``PromptStructure`` produit par ``build_context_json``.
        category_type: Restreint à une catégorie (``characters``…) ; toutes sinon.

    Returns:
        Les noms non vides des fiches.
    """
    names: list[str] = []
    for section in getattr(structured_context, "sections", None) or []:
        for category in getattr(section, "categories", None) or []:
            if category_type and getattr(category, "type", "") != category_type:
                continue
            for item in getattr(category, "items", []) or []:
                name = (getattr(item, "name", None) or "").strip()
                if name:
                    names.append(name)
    return names


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
