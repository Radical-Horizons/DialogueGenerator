"""Résolution des origines CORS en production à partir de l'environnement.

En production, soit ``CORS_ORIGINS`` (CSV, prioritaire), soit ``PUBLIC_ORIGIN``
(URL publique du frontend, une ou plusieurs séparées par des virgules).
"""
from __future__ import annotations

import os
from urllib.parse import urlparse


def _split_csv(value: str) -> list[str]:
    """Découpe une liste CSV en segments non vides."""
    return [part.strip() for part in value.split(",") if part.strip()]


def normalize_browser_origin(fragment: str) -> str:
    """Convertit un fragment (URL complète, domaine seul, avec chemin) en origine navigateur.

    Args:
        fragment: Ex. ``https://demo.example/login``, ``demo.example``, ``http://localhost:3000``.

    Returns:
        Origine au format ``scheme://netloc`` sans barre finale sur le chemin.
    """
    raw = fragment.strip()
    if not raw:
        return ""
    if not raw.startswith(("http://", "https://")):
        raw = "https://" + raw
    parsed = urlparse(raw)
    if not parsed.netloc:
        return raw.rstrip("/")
    origin = f"{parsed.scheme}://{parsed.netloc}"
    return origin.rstrip("/")


def resolve_production_cors_origins() -> list[str]:
    """Liste des origines autorisées en production.

    Priorité : ``CORS_ORIGINS`` si non vide ; sinon ``PUBLIC_ORIGIN``.

    Returns:
        Liste d'origines normalisées, possiblement vide si aucune variable n'est définie.
    """
    cors_csv = os.getenv("CORS_ORIGINS", "").strip()
    if cors_csv:
        out = [normalize_browser_origin(part) for part in _split_csv(cors_csv)]
        return [o for o in out if o]
    public_csv = os.getenv("PUBLIC_ORIGIN", "").strip()
    if public_csv:
        out = [normalize_browser_origin(part) for part in _split_csv(public_csv)]
        return [o for o in out if o]
    return []
