"""Tests des portes structurelles du mode benchmark.

Couvre les lignes « porte structurelle échouée » et « suite/génération vide » de
la matrice I/O de la spécification.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List

import pytest

from api.schemas.benchmark import BenchmarkCaseExpectations
from services.benchmark_gate_service import BenchmarkGateService

FRENCH_LINE = (
    "Je n'ai pas confiance en toi, marchand : tu vends des promesses et tu gardes "
    "les pièces. Dis-moi ce que tu veux vraiment."
)
ENGLISH_LINE = (
    "I do not trust you, merchant: you sell promises and you keep the coins. "
    "Tell me what you really want and do not waste my time."
)


def _document(line: str = FRENCH_LINE, *, choice_ids: List[str] | None = None) -> Dict[str, Any]:
    """Construit un document Unity minimal valide.

    Args:
        line: Réplique du nœud.
        choice_ids: Identifiants de choix, pour exercer la porte des doublons.

    Returns:
        Document Unity `{schemaVersion, nodes}`.
    """
    ids = choice_ids if choice_ids is not None else ["choice_node-1_0", "choice_node-1_1"]
    return {
        "schemaVersion": "1.1.0",
        "nodes": [
            {
                "id": "node-1",
                "displayName": "Marchandage",
                "speaker": "Uresaïr",
                "line": line,
                "choices": [
                    {
                        "choiceId": choice_id,
                        "text": f"Répondre sèchement, option {index}",
                        "targetNode": "END",
                    }
                    for index, choice_id in enumerate(ids)
                ],
            }
        ],
    }


@pytest.fixture
def gate() -> BenchmarkGateService:
    """Service de portes sans validateur de flags (catalogue non requis ici)."""
    return BenchmarkGateService(flag_validation_service=None)


def test_valid_generation_passes_all_gates(gate: BenchmarkGateService) -> None:
    """Une génération française bien formée ne déclenche aucune porte."""
    assert gate.evaluate(json.dumps(_document(), ensure_ascii=False)) == []


def test_unparsable_json_fails_parsable_gate(gate: BenchmarkGateService) -> None:
    """Un JSON illisible court-circuite les autres portes."""
    failures = gate.evaluate("{ ceci n'est pas du JSON")
    assert [failure.gate for failure in failures] == ["parsable"]


def test_empty_generation_fails_non_empty_gate(gate: BenchmarkGateService) -> None:
    """Une génération vide relève de la porte « non vide »."""
    failures = gate.evaluate("")
    assert [failure.gate for failure in failures] == ["non_empty"]


def test_no_nodes_fails_non_empty_gate(gate: BenchmarkGateService) -> None:
    """Un document sans nœud est invalide, pas simplement médiocre."""
    failures = gate.evaluate(json.dumps({"schemaVersion": "1.1.0", "nodes": []}))
    assert "non_empty" in {failure.gate for failure in failures}


def test_english_generation_fails_language_gate(gate: BenchmarkGateService) -> None:
    """Un modèle qui répond en anglais est détecté et écarté."""
    failures = gate.evaluate(json.dumps(_document(ENGLISH_LINE), ensure_ascii=False))
    assert "language" in {failure.gate for failure in failures}


def test_duplicate_choice_ids_fail_choice_gate(gate: BenchmarkGateService) -> None:
    """Deux choix partageant un choiceId cassent l'intégrité du graphe."""
    document = _document(choice_ids=["choice_node-1_0", "choice_node-1_0"])
    failures = gate.evaluate(json.dumps(document, ensure_ascii=False))
    gates = {failure.gate for failure in failures}
    assert "choice_ids" in gates
    assert "choice_node-1_0" in next(f.message for f in failures if f.gate == "choice_ids")


def test_schema_violation_fails_schema_gate(gate: BenchmarkGateService) -> None:
    """Un document parsable mais non conforme au schéma Unity est invalide.

    Le schéma plafonne les choix à 8 par nœud : au-delà, le document ne serait
    pas importable dans Unity, quelle que soit la qualité de la prose.
    """
    document = _document(choice_ids=[f"choice_node-1_{index}" for index in range(9)])
    failures = gate.evaluate(json.dumps(document, ensure_ascii=False))
    assert "schema" in {failure.gate for failure in failures}


def test_unexpected_structure_fails_parsable_gate(gate: BenchmarkGateService) -> None:
    """Un JSON valide mais sans nœuds exploitables est refusé explicitement."""
    failures = gate.evaluate(json.dumps({"unexpected": True}))
    assert [failure.gate for failure in failures] == ["parsable"]


def test_nodes_without_text_fail_non_empty_gate(gate: BenchmarkGateService) -> None:
    """Des nœuds sans réplique ni libellé sont un fragment, pas une génération."""
    document = {"schemaVersion": "1.1.0", "nodes": [{"id": "node-1", "line": "", "choices": []}]}
    failures = gate.evaluate(json.dumps(document))
    assert "non_empty" in {failure.gate for failure in failures}


def test_flag_errors_fail_flag_gate() -> None:
    """Une référence vers un flag non déclaré invalide la génération."""

    class _Error:
        message = "Flag 'inexistant' non déclaré"

    class _Result:
        errors = [_Error()]
        warnings: List[Any] = []

    class _StubFlagService:
        def analyze_document(self, document: Dict[str, Any]) -> Any:
            return _Result()

    gate = BenchmarkGateService(flag_validation_service=_StubFlagService())
    failures = gate.evaluate(json.dumps(_document(), ensure_ascii=False))
    assert "flags" in {failure.gate for failure in failures}


def test_flag_service_failure_does_not_block() -> None:
    """Un catalogue de flags indisponible ne rend pas la génération invalide.

    La porte devient neutre : bloquer ici transformerait un problème
    d'environnement en défaut du modèle testé.
    """

    class _BrokenFlagService:
        def analyze_document(self, document: Dict[str, Any]) -> Any:
            raise OSError("catalogue illisible")

    gate = BenchmarkGateService(flag_validation_service=_BrokenFlagService())
    assert gate.evaluate(json.dumps(_document(), ensure_ascii=False)) == []


def test_overlong_panel_fails_the_length_gate(gate: BenchmarkGateService) -> None:
    """Un panneau au-delà du plafond du cas est recalé par la porte `length`.

    Le système de dialogue vise 150 mots et plafonne à 300 : c'est une contrainte
    objectivement vérifiable, qui n'a pas à passer par le jugement d'un LLM.
    """
    long_line = " ".join([FRENCH_LINE] * 20)
    failures = gate.evaluate(
        json.dumps(_document(line=long_line), ensure_ascii=False),
        expectations=BenchmarkCaseExpectations(max_words=300),
    )
    length_failures = [failure for failure in failures if failure.gate == "length"]
    assert len(length_failures) == 1
    assert "300" in length_failures[0].message


def test_panel_within_the_word_ceiling_passes(gate: BenchmarkGateService) -> None:
    """Un panneau sous le plafond ne déclenche pas la porte."""
    failures = gate.evaluate(
        json.dumps(_document(), ensure_ascii=False),
        expectations=BenchmarkCaseExpectations(max_words=300),
    )
    assert [failure for failure in failures if failure.gate == "length"] == []


def test_length_gate_is_inert_without_max_words(gate: BenchmarkGateService) -> None:
    """Sans plafond déclaré, la longueur ne recale rien.

    Le plafond est une donnée du cas : un cas qui n'en pose pas ne doit pas hériter
    d'une limite implicite.
    """
    long_line = " ".join([FRENCH_LINE] * 20)
    failures = gate.evaluate(
        json.dumps(_document(line=long_line), ensure_ascii=False),
        expectations=BenchmarkCaseExpectations(min_choices=2),
    )
    assert [failure for failure in failures if failure.gate == "length"] == []


def test_length_gate_measures_the_longest_panel_not_the_sum(
    gate: BenchmarkGateService,
) -> None:
    """Le plafond porte sur un panneau, pas sur la génération entière.

    Une arborescence de nœuds courts ne doit pas être recalée parce que la somme
    de ses répliques dépasse le plafond d'un seul panneau.
    """
    document = _document()
    document["nodes"] = [
        {**document["nodes"][0], "id": f"node-{index}", "line": FRENCH_LINE}
        for index in range(1, 6)
    ]
    for index, node in enumerate(document["nodes"]):
        node["choices"] = [
            {**choice, "choiceId": f"choice_node-{index + 1}_{position}"}
            for position, choice in enumerate(node["choices"])
        ]
    failures = gate.evaluate(
        json.dumps(document, ensure_ascii=False),
        expectations=BenchmarkCaseExpectations(max_words=60),
    )
    assert [failure for failure in failures if failure.gate == "length"] == []


def _fragment_document(*, dangling: bool = False, unreachable: bool = False,
                       duplicate: bool = False) -> Dict[str, Any]:
    """Document Unity à plusieurs panneaux, altérable pour exercer la connexité."""
    root_targets = ["suite-a", "suite-b"]
    if dangling:
        root_targets = ["suite-a", "panneau-absent"]
    nodes: List[Dict[str, Any]] = [
        {
            "id": "START",
            "displayName": "Ouverture",
            "speaker": "Uresaïr",
            "line": FRENCH_LINE,
            "choices": [
                {"choiceId": f"choice_START_{index}", "text": f"Option {index}", "targetNode": target}
                for index, target in enumerate(root_targets)
            ],
        }
    ]
    for suffix in ("a", "b"):
        node_id = "suite-a" if duplicate else f"suite-{suffix}"
        nodes.append(
            {
                "id": node_id,
                "displayName": f"Suite {suffix}",
                "speaker": "Uresaïr",
                "line": FRENCH_LINE,
                "choices": [
                    {"choiceId": f"choice_{node_id}_{suffix}_0", "text": "Poursuivre", "targetNode": "END"},
                    {"choiceId": f"choice_{node_id}_{suffix}_1", "text": "Renoncer", "targetNode": "END"},
                ],
            }
        )
    if unreachable:
        nodes.append(
            {
                "id": "orpheline",
                "displayName": "Orpheline",
                "speaker": "Uresaïr",
                "line": FRENCH_LINE,
                "choices": [
                    {"choiceId": "choice_orpheline_0", "text": "A", "targetNode": "END"},
                    {"choiceId": "choice_orpheline_1", "text": "B", "targetNode": "END"},
                ],
            }
        )
    return {"schemaVersion": "1.1.0", "nodes": nodes}


def test_coherent_fragment_passes_connectivity(gate: BenchmarkGateService) -> None:
    """Un fragment dont chaque branche aboutit franchit la porte."""
    failures = gate.evaluate(json.dumps(_fragment_document(), ensure_ascii=False))
    assert [f for f in failures if f.gate == "connectivity"] == []


def test_dangling_target_fails_connectivity(gate: BenchmarkGateService) -> None:
    """Un choix menant vers un panneau absent rend la génération invalide."""
    failures = gate.evaluate(json.dumps(_fragment_document(dangling=True), ensure_ascii=False))
    connectivity = [f for f in failures if f.gate == "connectivity"]
    assert connectivity and "panneau-absent" in connectivity[0].message


def test_unreachable_panel_fails_connectivity(gate: BenchmarkGateService) -> None:
    """Un panneau que rien ne désigne est du texte mort, pas une œuvre."""
    failures = gate.evaluate(json.dumps(_fragment_document(unreachable=True), ensure_ascii=False))
    assert any(f.gate == "connectivity" and "inatteignable" in f.message for f in failures)


def test_duplicate_node_id_fails_connectivity(gate: BenchmarkGateService) -> None:
    """Deux panneaux au même identifiant rendent l'enchaînement ambigu."""
    failures = gate.evaluate(json.dumps(_fragment_document(duplicate=True), ensure_ascii=False))
    assert any(f.gate == "connectivity" for f in failures)


def test_single_node_generation_still_passes_connectivity(gate: BenchmarkGateService) -> None:
    """Non-régression : une génération mono-nœud aux choix END reste valide."""
    failures = gate.evaluate(json.dumps(_document(), ensure_ascii=False))
    assert [f for f in failures if f.gate == "connectivity"] == []


def test_fragment_below_min_panels_is_invalid(gate: BenchmarkGateService) -> None:
    """Un cas qui attend un fragment ne se satisfait pas d'un panneau isolé."""
    failures = gate.evaluate(
        json.dumps(_document(), ensure_ascii=False),
        expectations=BenchmarkCaseExpectations(min_panels=4),
    )
    assert any("panneau" in f.message for f in failures)
