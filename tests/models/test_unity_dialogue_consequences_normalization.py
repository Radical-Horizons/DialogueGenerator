"""Tests de normalisation pour `node.consequences`.

Objectif: certains providers renvoient `consequences` comme une liste d'objets
au lieu d'un objet unique. Le modèle doit rester tolérant.
"""

from models.dialogue_structure.unity_dialogue_node import UnityDialogueGenerationResponse


def test_unity_dialogue_generation_response_accepts_consequences_as_singleton_list() -> None:
    """`node.consequences` peut arriver comme liste singleton et doit être normalisé."""
    payload = {
        "title": "Test",
        "node": {
            "speaker": "PNJ",
            "line": "Bonjour.",
            "consequences": [
                {
                    "flag": "Voknir_RevealsSecret",
                    "description": "Révélation partielle.",
                }
            ],
        },
    }

    parsed = UnityDialogueGenerationResponse.model_validate(payload)
    assert parsed.node.consequences is not None
    assert parsed.node.consequences.flag == "Voknir_RevealsSecret"
    assert parsed.node.consequences.description == "Révélation partielle."

