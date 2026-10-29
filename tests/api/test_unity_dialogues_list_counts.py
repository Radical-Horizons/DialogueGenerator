"""Comptage des nœuds et liens dans le listing Unity (écran 2e).

La liste de dialogues affiche la forme du dialogue (``N NŒUDS · M LIENS``) plutôt
que le poids du fichier : ces compteurs viennent du JSON déjà parsé pour le titre.
"""
from __future__ import annotations

from typing import Any

from api.routers.unity_dialogues import _count_nodes_and_edges


def test_compte_les_noeuds_et_les_choix_cibles() -> None:
    """Chaque choix pointant vers un nœud compte pour un lien."""
    data: list[dict[str, Any]] = [
        {
            "id": "START",
            "line": "Bonjour",
            "choices": [
                {"text": "a", "targetNode": "N2"},
                {"text": "b", "targetNode": "END"},
            ],
        },
        {"id": "N2", "line": "Suite", "choices": []},
    ]
    assert _count_nodes_and_edges(data) == (2, 2)


def test_compte_les_branches_de_test_et_les_enchainements_directs() -> None:
    """Un test ouvre plusieurs arêtes ; ``nextNode`` en est une aussi."""
    data: list[dict[str, Any]] = [
        {
            "id": "START",
            "nextNode": "N2",
            "choices": [
                {
                    "text": "tenter",
                    "test": "Volonté+Sang-froid:12",
                    "testSuccessNode": "OK",
                    "testFailureNode": "KO",
                }
            ],
        }
    ]
    assert _count_nodes_and_edges(data) == (1, 3)


def test_ignore_les_entrees_non_dict() -> None:
    """Un JSON partiellement corrompu ne doit pas faire échouer le listing."""
    data: list[Any] = [{"id": "A"}, "pas un nœud", None, 42]
    assert _count_nodes_and_edges(data) == (1, 0)


def test_entree_non_liste_renvoie_zero() -> None:
    """Forme inattendue : compteurs à zéro plutôt qu'une exception."""
    assert _count_nodes_and_edges({"nodes": []}) == (0, 0)  # type: ignore[arg-type]
    assert _count_nodes_and_edges([]) == (0, 0)


def test_choix_sans_cible_ne_compte_pas() -> None:
    """Un choix non relié n'est pas une arête du graphe."""
    data: list[dict[str, Any]] = [{"id": "A", "choices": [{"text": "orphelin"}]}]
    assert _count_nodes_and_edges(data) == (1, 0)


def test_accepte_le_document_persiste_et_le_tableau_nu() -> None:
    """Deux formes circulent : tableau de la génération, document du disque."""
    nodes = [{"id": "A", "choices": [{"text": "x", "targetNode": "B"}]}, {"id": "B"}]
    assert _count_nodes_and_edges(nodes) == (2, 1)
    assert _count_nodes_and_edges({"schemaVersion": "1.2.0", "nodes": nodes}) == (2, 1)
