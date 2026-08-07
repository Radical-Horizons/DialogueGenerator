"""Tests de la résolution d'un fragment généré en document Unity.

Couvre les lignes « fragment nominal », « choix orphelin », « clé dupliquée »,
« panneau inatteignable » et « branche terminale » de la matrice I/O.

Le risque propre à cette étape est silencieux : une référence cassée qu'on
rabattrait sur ``END`` produirait un document parfaitement valide où une branche
promise mène nulle part — et le juge noterait cela comme une œuvre.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import pytest

from models.dialogue_structure.unity_dialogue_fragment import (
    UnityDialogueFragmentResponse,
)
from services.unity_dialogue_fragment_resolver import (
    END_MARKER,
    START_NODE_ID,
    resolve_fragment,
)


def _panel(
    key: Optional[str],
    line: str,
    choices: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Construit un panneau brut."""
    return {"key": key, "displayName": f"Panneau {key or 'ouverture'}", "line": line, "choices": choices}


def _fragment(panels: List[Dict[str, Any]]) -> UnityDialogueFragmentResponse:
    """Valide un fragment depuis des panneaux bruts."""
    return UnityDialogueFragmentResponse.model_validate(
        {"title": "Fragment de test", "panels": panels}
    )


def _nominal() -> UnityDialogueFragmentResponse:
    """Fragment cohérent : ouverture + deux suites, toutes porteuses d'options."""
    return _fragment(
        [
            _panel(
                None,
                "Réplique d'ouverture.",
                [
                    {"text": "Insister", "leadsTo": "insiste"},
                    {"text": "Se taire", "leadsTo": "silence"},
                ],
            ),
            _panel(
                "insiste",
                "Réaction à l'insistance.",
                [{"text": "Pousser encore"}, {"text": "Reculer"}],
            ),
            _panel(
                "silence",
                "Réaction au silence.",
                [{"text": "Attendre"}, {"text": "Partir"}],
            ),
        ]
    )


def test_nominal_fragment_resolves_every_branch() -> None:
    """Chaque choix pointe vers un panneau réellement présent."""
    resolution = resolve_fragment(_nominal())

    assert resolution.reference_errors == []
    assert resolution.panel_count == 3
    nodes = resolution.document["nodes"]
    assert nodes[0]["id"] == START_NODE_ID
    known = {node["id"] for node in nodes}
    targets = [choice["targetNode"] for choice in nodes[0]["choices"]]
    assert all(target in known for target in targets)
    assert len(set(targets)) == 2


def test_model_never_supplies_unity_identifiers() -> None:
    """Les `id`, `choiceId` et `targetNode` sont posés par l'application seule."""
    resolution = resolve_fragment(_nominal())
    for node in resolution.document["nodes"]:
        assert node["id"]
        for index, choice in enumerate(node["choices"]):
            assert choice["choiceId"] == f"choice_{node['id']}_{index}"
            assert "leadsTo" not in choice


def test_choice_without_follow_up_ends_the_branch() -> None:
    """Un choix sans suite déclarée est une fin de branche, pas une erreur."""
    resolution = resolve_fragment(_nominal())
    leaf_targets = [
        choice["targetNode"]
        for node in resolution.document["nodes"][1:]
        for choice in node["choices"]
    ]
    assert leaf_targets and all(target == END_MARKER for target in leaf_targets)
    assert resolution.reference_errors == []


def test_unknown_key_is_reported_and_left_dangling() -> None:
    """Une clé inconnue est signalée et reste visible dans le document.

    La rabattre sur ``END`` ferait passer une branche cassée pour une fin voulue :
    la porte de connexité n'aurait plus rien à voir.
    """
    fragment = _fragment(
        [
            _panel(
                None,
                "Ouverture.",
                [
                    {"text": "Aller là", "leadsTo": "panneau_absent"},
                    {"text": "Rester", "leadsTo": "reste"},
                ],
            ),
            _panel("reste", "On reste.", [{"text": "A"}, {"text": "B"}]),
        ]
    )
    resolution = resolve_fragment(fragment)

    assert any("panneau_absent" in error for error in resolution.reference_errors)
    targets = [choice["targetNode"] for choice in resolution.document["nodes"][0]["choices"]]
    assert "panneau_absent" in targets


def test_duplicate_key_is_reported() -> None:
    """Deux panneaux à la même clé rendent l'enchaînement ambigu."""
    fragment = _fragment(
        [
            _panel(None, "Ouverture.", [{"text": "A", "leadsTo": "suite"}, {"text": "B"}]),
            _panel("suite", "Première suite.", [{"text": "X"}, {"text": "Y"}]),
            _panel("suite", "Seconde suite.", [{"text": "X"}, {"text": "Y"}]),
        ]
    )
    resolution = resolve_fragment(fragment)
    assert any("double" in error.lower() for error in resolution.reference_errors)


def test_unreachable_panel_is_reported() -> None:
    """Un panneau que rien ne désigne est du texte mort."""
    fragment = _fragment(
        [
            _panel(None, "Ouverture.", [{"text": "A", "leadsTo": "vue"}, {"text": "B"}]),
            _panel("vue", "Atteinte.", [{"text": "X"}, {"text": "Y"}]),
            _panel("orpheline", "Jamais atteinte.", [{"text": "X"}, {"text": "Y"}]),
        ]
    )
    resolution = resolve_fragment(fragment)
    assert any("inatteignable" in error for error in resolution.reference_errors)


def test_speaker_fallback_applies_to_panels_without_speaker() -> None:
    """Le locuteur du cas comble les panneaux qui n'en déclarent pas."""
    resolution = resolve_fragment(_nominal(), speaker_fallback="Voknir Esh'Maradel")
    assert all(node["speaker"] == "Voknir Esh'Maradel" for node in resolution.document["nodes"])


@pytest.mark.parametrize("panel_count", [1, 11])
def test_schema_bounds_reject_degenerate_fragments(panel_count: int) -> None:
    """Les bornes du schéma refusent un fragment vide de sens ou démesuré.

    Les Structured Outputs honorent `minItems` / `maxItems` : la forme est garantie
    structurellement, elle n'a pas à être quémandée au prompt.
    """
    panels = [_panel(f"p{index}", "Ligne.", [{"text": "A"}, {"text": "B"}]) for index in range(panel_count)]
    with pytest.raises(Exception):
        _fragment(panels)


@pytest.mark.asyncio
async def test_dummy_client_produces_a_resolvable_fragment() -> None:
    """Sans clé API, le client factice répond au nouveau schéma.

    Les clients LLM aiguillent sur le **nom de classe** du modèle de réponse : un
    modèle inconnu de `DummyLLMClient` retomberait sur un dict générique qui ne
    valide pas, et tout développement sans clé API casserait.
    """
    from core.llm.llm_client import DummyLLMClient

    variants = await DummyLLMClient().generate_variants(
        prompt="peu importe", k=1, response_model=UnityDialogueFragmentResponse
    )
    assert isinstance(variants[0], UnityDialogueFragmentResponse)

    resolution = resolve_fragment(variants[0])
    assert resolution.reference_errors == []
    assert resolution.panel_count >= 3


def test_flag_names_are_normalized_not_penalized() -> None:
    """Un nom de flag accentué ou en minuscules est corrigé par l'application.

    Observé sur run réel : les deux modèles produisaient
    ``URESAIR_DEFIÉ_VOKNIR_AU_SEUIL`` et ``VOKNIR_A_EPROUVE_URESair``, que le
    schéma Unity (``^[A-Z][A-Z0-9_]*$``) refuse. C'est une forme à normaliser,
    pas une faute d'écriture : les recaler ferait chuter le taux de validité
    pour une raison sans rapport avec la qualité du dialogue.
    """
    fragment = UnityDialogueFragmentResponse.model_validate(
        {
            "title": "Fragment de test",
            "panels": [
                {
                    "line": "Ouverture.",
                    "consequences": {"flag": "URESAIR_DEFIÉ_VOKNIR_AU_SEUIL"},
                    "choices": [{"text": "A", "leadsTo": "suite"}, {"text": "B"}],
                },
                {
                    "key": "suite",
                    "line": "Suite.",
                    "consequences": {"flag": "VOKNIR_A_EPROUVE_URESair"},
                    "choices": [{"text": "X"}, {"text": "Y"}],
                },
            ],
        }
    )
    import re

    pattern = re.compile(r"^[A-Z][A-Z0-9_]*$")
    flags = [
        node["consequences"]["flag"]
        for node in resolve_fragment(fragment).document["nodes"]
        if node.get("consequences")
    ]
    assert len(flags) == 2
    assert all(pattern.match(flag) for flag in flags), flags
