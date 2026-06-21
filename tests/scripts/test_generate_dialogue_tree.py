"""Tests unitaires pour scripts/generate_dialogue_tree.py (chemin BFS)."""
from __future__ import annotations

from scripts.generate_dialogue_tree import format_path, pick_path


def test_pick_path_follows_choice_index() -> None:
    nodes = [
        {
            "id": "START",
            "speaker": "PNJ",
            "line": "A",
            "choices": [
                {"text": "c0", "targetNode": "N1"},
                {"text": "c1", "targetNode": "N2"},
            ],
        },
        {"id": "N1", "speaker": "PNJ", "line": "B", "choices": []},
        {"id": "N2", "speaker": "PNJ", "line": "C", "choices": []},
    ]
    path0 = pick_path(nodes, 0)
    assert [n["id"] for n in path0] == ["START", "N1"]
    path1 = pick_path(nodes, 1)
    assert [n["id"] for n in path1] == ["START", "N2"]


def test_format_path_includes_player_choice_label() -> None:
    nodes = [
        {
            "id": "START",
            "speaker": "Voknir",
            "line": "Bonjour",
            "choices": [{"text": "Salut", "targetNode": "N1"}],
        },
        {"id": "N1", "speaker": "Voknir", "line": "Suite", "choices": []},
    ]
    text = format_path(pick_path(nodes, 0), player_label="Uresaïr")
    assert "Uresaïr (choix): Salut" in text
    assert "Voknir: Bonjour" in text
