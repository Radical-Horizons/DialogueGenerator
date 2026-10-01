"""Nettoyage des valeurs GDD avant leur entrée dans un prompt.

Les fiches arrivent de Notion avec leur balisage : identifiants de relation bruts,
mentions de page, bases incrustées, pièces jointes, images. Rien de cela n'est lisible
par un modèle, et tout est payé. Relevé sur les prompts de benchmark d'octobre 2026 :
80 à 180 UUID par prompt, des embeds PDF, des URL d'images signées — et surtout des
**mentions de page auto-fermantes** qui ne portent que l'URL. La phrase
« <mention X/> ignore son identité » arrivait au modèle **sans son sujet** : le nom
était dans la page citée, pas dans le texte.

Ce module rend au texte ce qu'il disait : une mention devient le nom de la page
citée, une relation devient la liste des noms liés. Ce qui ne se résout pas
disparaît plutôt que de rester en identifiant — un UUID n'apprend rien au modèle.
"""

from __future__ import annotations

import re
from typing import Any, Mapping, Optional

from services.gdd_notion_sync_utils import normalize_notion_id

_HEX_ID = r"[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}"

_UUID_TOKEN = re.compile(rf"^{_HEX_ID}$")
_TOKEN_SPLIT = re.compile(r"[,;]")

_MENTION_PAGE_PAIRED = re.compile(
    rf'<mention-page\b[^>]*?url="[^"]*?({_HEX_ID})[^"]*"[^>]*?(?<!/)>(.*?)</mention-page>',
    re.S,
)
_MENTION_PAGE_SELF_CLOSING = re.compile(
    rf'<mention-page\b[^>]*?url="[^"]*?({_HEX_ID})[^"]*"[^>]*/>'
)
_OTHER_MENTION_PAIRED = re.compile(r"<mention-[a-z]+\b[^>]*?(?<!/)>(.*?)</mention-[a-z]+>", re.S)
_OTHER_MENTION_SELF_CLOSING = re.compile(r"<mention-[a-z]+\b[^>]*/>")
_EMBED_TAGS = "database|file|pdf|video|audio|embed|image|bookmark"
_EMBED_PAIRED = re.compile(rf"<({_EMBED_TAGS})\b[^>]*?(?<!/)>.*?</\1>", re.S)
_EMBED_LONE = re.compile(rf"</?(?:{_EMBED_TAGS})\b[^>]*>")
_MARKDOWN_IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
_LINE_BREAK = re.compile(r"<br\s*/?>", re.I)
_EMPTY_BLOCK = re.compile(r"<empty-block\s*/>")
_BLANK_RUNS = re.compile(r"\n[ \t]*\n(?:[ \t]*\n)+")

EDITORIAL_FIELD_PATHS: frozenset[str] = frozenset(
    {
        "values.Date de création",
        "values.Dernière modification",
        "values.Date vérification",
        "values.Niveau d’IA",
        "values.Qualité",
        "values.État",
        "values.Slug",
        "values.Feuilles de perso",
        "values.Inventaires PNJ",
        "values.Référence visuelle",
        "values.Assets",
        "values.Portraits",
        "sections.guides",
        "sections.que_tes_annexes",
        "sections.instructions_inventaire",
    }
)
"""Champs de suivi éditorial ou de mise en page Notion, sans rien à dire au modèle.

Date de relecture, note de qualité de la fiche, statut « À relire », identifiants
d'inventaire Unity, planches d'illustration : utiles à l'équipe, du bruit payé
pour un modèle qui écrit une réplique. La liste est fermée et explicite — une
heuristique sur les noms écarterait un jour un champ de fond.
"""


def is_editorial_field(path: str) -> bool:
    """Indique si un chemin de champ relève du suivi éditorial (voir `EDITORIAL_FIELD_PATHS`)."""
    return path in EDITORIAL_FIELD_PATHS


def _lookup(raw_id: str, relation_index: Optional[Mapping[str, str]]) -> Optional[str]:
    """Retourne le nom de la fiche désignée par un identifiant Notion, s'il est connu."""
    if not relation_index:
        return None
    try:
        return relation_index.get(normalize_notion_id(raw_id))
    except ValueError:
        return None


def _resolve_relation_list(text: str, relation_index: Optional[Mapping[str, str]]) -> Optional[str]:
    """Résout une valeur faite **uniquement** d'identifiants séparés par `,` ou `;`.

    Args:
        text: Valeur brute.
        relation_index: Index ``{uuid_normalisé: Nom}``.

    Returns:
        Les noms résolus joints par des virgules, ``""`` si aucun ne se résout, ou
        ``None`` si la valeur n'est pas une liste d'identifiants (texte libre).
    """
    tokens = [token.strip() for token in _TOKEN_SPLIT.split(text) if token.strip()]
    if not tokens or not all(_UUID_TOKEN.match(token) for token in tokens):
        return None
    names = [name for name in (_lookup(token, relation_index) for token in tokens) if name]
    return ", ".join(dict.fromkeys(names))


def clean_gdd_text(text: str, relation_index: Optional[Mapping[str, str]] = None) -> str:
    """Rend lisible une valeur textuelle de fiche GDD.

    Args:
        text: Valeur brute issue de la synchronisation Notion.
        relation_index: Index ``{uuid_normalisé: Nom}`` cross-catégorie.

    Returns:
        Le texte nettoyé ; ``""`` s'il ne contenait que du balisage ou des
        identifiants non résolus.
    """
    if not text:
        return ""
    relation = _resolve_relation_list(text, relation_index)
    if relation is not None:
        return relation

    def _paired_page(match: "re.Match[str]") -> str:
        inner = match.group(2).strip()
        return inner or _lookup(match.group(1), relation_index) or ""

    cleaned = _MENTION_PAGE_PAIRED.sub(_paired_page, text)
    cleaned = _MENTION_PAGE_SELF_CLOSING.sub(
        lambda match: _lookup(match.group(1), relation_index) or "", cleaned
    )
    cleaned = _OTHER_MENTION_PAIRED.sub(lambda match: match.group(1), cleaned)
    cleaned = _OTHER_MENTION_SELF_CLOSING.sub("", cleaned)
    cleaned = _EMBED_PAIRED.sub("", cleaned)
    cleaned = _EMBED_LONE.sub("", cleaned)
    cleaned = _MARKDOWN_IMAGE.sub("", cleaned)
    cleaned = _LINE_BREAK.sub("\n", cleaned)
    cleaned = _EMPTY_BLOCK.sub("", cleaned)
    cleaned = _BLANK_RUNS.sub("\n\n", cleaned)
    return cleaned.strip()


# Chaque forme emporte l'espace qui la précède : retirer « » *(geste)* « » ne doit pas
# laisser de double espace, et un nettoyage global des espaces aplatirait
# l'indentation et la typographie française du reste du contexte.
_STAGE_DIRECTIONS = (
    re.compile(r"[ \t]?\*\([^)]*\)\*"),
    re.compile(r"[ \t]?\(\*[^*]*\*\)"),
    re.compile(r"[ \t]?\*\\?\[[^\]]*\\?\]\*"),
)


def strip_stage_directions(text: str) -> str:
    """Retire des exemples de fiche les didascalies qu'un run « sans » interdit.

    Les répliques d'exemple des fiches portent leurs indications de jeu —
    ``*(sa voix prend un ton doucereux)*``, ``(*fronce les sourcils*)``,
    ``*\\[LA JOUEUSE s'approche\\]*`` : 142 sur les fiches d'octobre 2026. Un prompt
    qui interdit les didascalies tout en en montrant des dizaines en exemple se
    contredit, et un modèle qui imite ses exemples suit simplement la majorité.

    Args:
        text: Texte de contexte.

    Returns:
        Le texte sans ces trois formes.
    """
    for pattern in _STAGE_DIRECTIONS:
        text = pattern.sub("", text)
    return text


def cut_text(text: str, limit: int) -> str:
    """Raccourcit un texte à ``limit`` caractères, sur une fin de phrase si possible.

    Args:
        text: Texte à raccourcir.
        limit: Nombre de caractères maximal du texte conservé.

    Returns:
        Le texte inchangé s'il tient, sinon son début suivi de « […] ».
    """
    if limit <= 0 or len(text) <= limit:
        return text
    head = text[:limit]
    boundary = max(head.rfind(". "), head.rfind("\n"), head.rfind("! "), head.rfind("? "))
    if boundary >= int(limit * 0.6):
        head = head[: boundary + 1]
    return head.rstrip() + " […]"


def clean_gdd_value(value: Any, relation_index: Optional[Mapping[str, str]] = None) -> Any:
    """Nettoie une valeur de fiche, quelle que soit sa forme.

    Args:
        value: Chaîne, liste ou dictionnaire issu d'une fiche GDD.
        relation_index: Index ``{uuid_normalisé: Nom}`` cross-catégorie.

    Returns:
        La valeur nettoyée, ou ``None`` si plus rien de lisible n'en reste — le
        champ doit alors disparaître du prompt plutôt que d'y figurer vide.
    """
    if isinstance(value, str):
        return clean_gdd_text(value, relation_index) or None
    if isinstance(value, list):
        items = [clean_gdd_value(item, relation_index) for item in value]
        kept = [item for item in items if item not in (None, "", [], {})]
        return kept or None
    if isinstance(value, dict):
        entries = {key: clean_gdd_value(item, relation_index) for key, item in value.items()}
        kept = {key: item for key, item in entries.items() if item not in (None, "", [], {})}
        return kept or None
    return value
