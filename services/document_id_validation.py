"""Validation partagée des identifiants de documents compatibles Windows."""

from __future__ import annotations

import re

_INVALID_WINDOWS_CHARACTERS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
_RESERVED_WINDOWS_NAMES = {
    "CON",
    "PRN",
    "AUX",
    "NUL",
    *(f"COM{index}" for index in range(1, 10)),
    *(f"LPT{index}" for index in range(1, 10)),
}


def validate_document_id(document_id: str) -> str:
    """Retourne un identifiant sûr ou lève ``ValueError`` avec une raison utile."""
    normalized = document_id.removesuffix(".json").strip()
    if not normalized:
        raise ValueError("L'identifiant du document est vide.")
    if len(normalized) > 200:
        raise ValueError("L'identifiant du document dépasse 200 caractères.")
    if normalized.endswith((".", " ")):
        raise ValueError("Un nom Windows ne peut pas finir par un point ou un espace.")
    if _INVALID_WINDOWS_CHARACTERS.search(normalized):
        raise ValueError("Le nom contient un caractère interdit sous Windows.")
    if normalized.split(".", 1)[0].upper() in _RESERVED_WINDOWS_NAMES:
        raise ValueError("Ce nom est réservé par Windows.")
    return normalized
