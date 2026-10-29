"""Inventaire des routes ``/api/v1/context`` — garde anti-régression du découpage des routers.

``api/routers/context.py`` a été éclaté en modules par domaine. Ce test fige le contrat
HTTP exposé (couples méthode/chemin) et l'ordre de résolution FastAPI, qui n'est pas
détectable par les tests fonctionnels tant qu'une route statique n'est pas masquée par
une route à paramètre.
"""
from __future__ import annotations

from typing import List, Set, Tuple

from api.main import app

#: Contrat figé : les 29 endpoints exposés sous ``/api/v1/context``.
EXPECTED_CONTEXT_ROUTES: Set[Tuple[str, str]] = {
    ("DELETE", "/api/v1/context/rules/{rule_id}"),
    ("GET", "/api/v1/context/characters"),
    ("GET", "/api/v1/context/characters/{name}"),
    ("GET", "/api/v1/context/communities"),
    ("GET", "/api/v1/context/communities/{name}"),
    ("GET", "/api/v1/context/gdd-entity-history"),
    ("GET", "/api/v1/context/items"),
    ("GET", "/api/v1/context/items/{name}"),
    ("GET", "/api/v1/context/locations"),
    ("GET", "/api/v1/context/locations/regions"),
    ("GET", "/api/v1/context/locations/regions/{name}/sub-locations"),
    ("GET", "/api/v1/context/locations/scene/regions"),
    ("GET", "/api/v1/context/locations/scene/sub-locations/{name}"),
    ("GET", "/api/v1/context/locations/{name}"),
    ("GET", "/api/v1/context/narrative-contexts"),
    ("GET", "/api/v1/context/rules"),
    ("GET", "/api/v1/context/rules/by-dialogue-type/{dialogue_type}"),
    ("GET", "/api/v1/context/species"),
    ("GET", "/api/v1/context/species/{name}"),
    ("POST", "/api/v1/context/build"),
    ("POST", "/api/v1/context/estimate-tokens"),
    ("POST", "/api/v1/context/gdd-content-fingerprint"),
    ("POST", "/api/v1/context/linked-elements"),
    ("POST", "/api/v1/context/optimize"),
    ("POST", "/api/v1/context/precomputed-entity-tokens"),
    ("POST", "/api/v1/context/rules"),
    ("POST", "/api/v1/context/suggestions"),
    ("PUT", "/api/v1/context/rules/by-dialogue-type/{dialogue_type}"),
    ("PUT", "/api/v1/context/rules/{rule_id}"),
}


def _collect_context_routes() -> List[Tuple[str, str]]:
    """Retourne les couples (méthode, chemin) sous ``/api/v1/context``, dans l'ordre d'enregistrement."""
    collected: List[Tuple[str, str]] = []
    for route in app.routes:
        path = getattr(route, "path", None)
        methods = getattr(route, "methods", None)
        if not path or not methods or not path.startswith("/api/v1/context"):
            continue
        for method in sorted(methods):
            if method in ("HEAD", "OPTIONS"):
                continue
            collected.append((method, path))
    return collected


def test_context_routes_inventory_is_unchanged() -> None:
    """Le découpage des routers n'ajoute, ne perd ni ne renomme aucun endpoint."""
    actual = set(_collect_context_routes())

    missing = EXPECTED_CONTEXT_ROUTES - actual
    unexpected = actual - EXPECTED_CONTEXT_ROUTES

    assert not missing, f"Endpoints /context disparus après refactor : {sorted(missing)}"
    assert not unexpected, f"Endpoints /context inattendus après refactor : {sorted(unexpected)}"


def test_context_routes_have_no_duplicate_registration() -> None:
    """Aucun endpoint n'est enregistré deux fois (module inclus deux fois dans main.py)."""
    collected = _collect_context_routes()
    duplicates = {item for item in collected if collected.count(item) > 1}
    assert not duplicates, f"Endpoints /context enregistrés en double : {sorted(duplicates)}"


def test_static_location_routes_resolve_before_dynamic_name() -> None:
    """Les chemins statiques sous ``/locations`` précèdent ``/locations/{name}``.

    FastAPI résout dans l'ordre d'enregistrement : si ``/locations/{name}`` était
    enregistré en premier, il capturerait ``regions`` et ``scene`` comme valeurs de
    ``name``, et les listings de régions renverraient un 404 de lieu introuvable.
    """
    ordered_paths = [path for _, path in _collect_context_routes()]
    dynamic_index = ordered_paths.index("/api/v1/context/locations/{name}")

    for static_path in (
        "/api/v1/context/locations/regions",
        "/api/v1/context/locations/scene/regions",
        "/api/v1/context/locations/scene/sub-locations/{name}",
        "/api/v1/context/locations/regions/{name}/sub-locations",
    ):
        assert ordered_paths.index(static_path) < dynamic_index, (
            f"{static_path} est enregistré après /locations/{{name}} : "
            "la route statique est masquée par le paramètre de chemin."
        )
