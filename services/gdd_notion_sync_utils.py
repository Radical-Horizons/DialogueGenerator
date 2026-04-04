"""Validation et normalisation pour la synchronisation GDD Notion (FR18)."""
from __future__ import annotations

import re
import unicodedata
import uuid
from pathlib import PurePath
from typing import Iterable, Optional

# Clés catégories GDD de type liste (aligné sur ``GDDLoader.CATEGORIES_CONFIG``).
_GDD_LIST_CATEGORY_KEYS: frozenset[str] = frozenset(
    {
        "personnages",
        "lieux",
        "objets",
        "especes",
        "communautes",
        "dialogues",
        "structure_narrative",
        "quetes",
        "systemes_de_jeu",
    }
)


def _fold_ascii_category_stem(stem: str) -> str:
    """Normalise un stem de fichier (accents → ASCII) en minuscules."""
    nk = unicodedata.normalize("NFKD", stem.strip())
    return "".join(c for c in nk if not unicodedata.combining(c)).lower()


def category_stem_to_list_category_key(stem: str) -> Optional[str]:
    """Associe le stem d'un ``category_file`` (ex. ``Personnages``) à la clé répertoire GDD.

    Utilisé pour l'écriture en shards (``data/GDD_categories/<clé>/*.json``).

    Args:
        stem: ``PurePath(category_file).stem``.

    Returns:
        Clé catégorie (ex. ``personnages``) si la catégorie est une liste GDD, sinon ``None``.
    """
    if not stem or not stem.strip():
        return None
    folded = _fold_ascii_category_stem(stem)
    if folded in _GDD_LIST_CATEGORY_KEYS:
        return folded
    return None


def normalize_notion_id(raw: str) -> str:
    """Normalise un identifiant Notion (page ou base) au format UUID avec tirets.

    Args:
        raw: Identifiant saisi (avec ou sans tirets, espaces).

    Returns:
        Chaîne UUID canonique.

    Raises:
        ValueError: Si la valeur ne correspond pas à un UUID Notion valide.
    """
    s = raw.strip().replace("-", "").lower()
    if len(s) != 32 or not re.fullmatch(r"[0-9a-f]{32}", s):
        raise ValueError("Identifiant Notion invalide (attendu : UUID 32 hex)")
    return str(uuid.UUID(hex=s))


def mask_secret(value: Optional[str], visible_tail: int = 4) -> str:
    """Masque un secret pour les réponses API et journaux.

    Args:
        value: Secret brut ou None.
        visible_tail: Nombre de caractères visibles en fin de chaîne.

    Returns:
        Chaîne masquée ou chaîne vide si absent.
    """
    if not value or not value.strip():
        return ""
    v = value.strip()
    if len(v) <= visible_tail:
        return "****"
    return f"****{v[-visible_tail:]}"


def category_file_matches_included(
    category_file: str,
    included_categories: Iterable[str],
) -> bool:
    """Indique si une entrée ``sources[].category_file`` est dans le périmètre.

    Si ``included_categories`` est vide (ou uniquement des chaînes vides), toutes
    les sources sont incluses (rétrocompatibilité).

    Args:
        category_file: Nom ou chemin cible (ex. ``personnages.json``).
        included_categories: Filtres saisis par l'utilisateur (nom de fichier ou stem).

    Returns:
        True si la source doit être traitée.
    """
    normalized_filters = {
        x.strip().lower()
        for x in included_categories
        if isinstance(x, str) and x.strip()
    }
    if not normalized_filters:
        return True
    raw = (category_file or "").strip()
    if not raw:
        return False
    name = PurePath(raw).name.lower()
    stem = PurePath(raw).stem.lower()
    return name in normalized_filters or stem in normalized_filters


def redact_notion_token_from_text(text: str) -> str:
    """Remplace les motifs ressemblant à un token Notion dans un message libre.

    Args:
        text: Message potentiellement contenant un secret.

    Returns:
        Texte avec secrets neutralisés.
    """
    if not text:
        return text
    # Bearer token style
    out = re.sub(
        r"(Bearer\s+)([a-zA-Z0-9_\-]{20,})",
        r"\1[REDACTED]",
        text,
        flags=re.IGNORECASE,
    )
    # long alphanumeric runs (integration tokens)
    out = re.sub(r"secret_[a-zA-Z0-9_]{20,}", "[REDACTED]", out)
    return out
