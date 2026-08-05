"""Tests de la construction des paires — logique pure, sans LLM ni disque.

C'est ici que se décide ce que le juge voit : deux des trois contrôles de biais
(identité et longueur) se jouent dans ce module.
"""

from __future__ import annotations

import json
from typing import Any, List

from api.schemas.benchmark import BenchmarkGenerationRecord
from services.benchmark_pair_builder import (
    PAIRWISE_TRUNCATION_CHARS,
    TRUNCATION_MARKER,
    build_pairs,
    count_unpairable_cases,
    pair_seed,
    truncate_for_pairwise,
)

RUN_ID = "run-1"


def _record(
    model_id: str,
    case_id: str = "cas-0",
    repetition: int = 0,
    status: str = "valid",
    line: str = "Une réplique.",
) -> BenchmarkGenerationRecord:
    """Génération minimale."""
    payload: dict[str, Any] = {
        "run_id": RUN_ID,
        "case_id": case_id,
        "model_id": model_id,
        "repetition": repetition,
        "status": status,
        "json_content": json.dumps(
            {"schemaVersion": "1.1.0", "nodes": [{"id": "n1", "line": line}]},
            ensure_ascii=False,
        ),
    }
    return BenchmarkGenerationRecord.model_validate(payload)


def test_pairs_are_built_per_case_and_repetition() -> None:
    """Trois modèles sur un cas donnent trois duels."""
    records = [_record("m-a"), _record("m-b"), _record("m-c")]
    pairs = build_pairs(records, run_id=RUN_ID)
    assert len(pairs) == 3
    assert {p.models_sorted for p in pairs} == {
        ("m-a", "m-b"),
        ("m-a", "m-c"),
        ("m-b", "m-c"),
    }


def test_generations_of_different_repetitions_are_never_paired() -> None:
    """Deux répétitions différentes n'ont pas le même prompt : jamais appariables."""
    records = [_record("m-a", repetition=0), _record("m-b", repetition=1)]
    assert build_pairs(records, run_id=RUN_ID) == []


def test_generations_of_different_cases_are_never_paired() -> None:
    """Deux cas différents n'ont pas le même prompt : jamais appariables."""
    records = [_record("m-a", case_id="cas-0"), _record("m-b", case_id="cas-1")]
    assert build_pairs(records, run_id=RUN_ID) == []


def test_repetitions_are_paired_index_by_index() -> None:
    """K répétitions donnent K duels par paire de modèles, pas K²."""
    records = [
        _record(model, repetition=rep)
        for model in ("m-a", "m-b")
        for rep in range(3)
    ]
    pairs = build_pairs(records, run_id=RUN_ID)
    assert len(pairs) == 3, "linéaire en K, pas quadratique"
    assert sorted(p.repetition for p in pairs) == [0, 1, 2]


def test_invalid_generations_are_excluded() -> None:
    """Une génération écartée par les portes n'entre pas dans un duel."""
    records = [_record("m-a"), _record("m-b", status="invalid"), _record("m-c")]
    pairs = build_pairs(records, run_id=RUN_ID)
    assert len(pairs) == 1
    assert pairs[0].models_sorted == ("m-a", "m-c")


def test_label_assignment_is_reproducible_across_processes() -> None:
    """La disposition doit être stable d'une **exécution** à l'autre.

    Comparer deux appels dans le même processus ne prouverait que la pureté de la
    fonction — vrai aussi d'une implémentation à base de `hash()`, dont la stabilité
    inter-processus n'est pas garantie et casserait silencieusement la reprise.
    Seule une valeur figée distingue les deux.
    """
    assert pair_seed(RUN_ID, "cas-0", "m-a", "m-b", 0) == 0x2F3E3660
    records = [_record("m-a"), _record("m-b")]
    assert [(p.model_a, p.model_b) for p in build_pairs(records, run_id=RUN_ID)] == [
        ("m-a", "m-b")
    ]


def test_label_assignment_is_not_constant_across_pairs() -> None:
    """Le juge ne doit pas pouvoir apprendre qu'une position est toujours le même modèle.

    Sur un échantillon de cas, le modèle placé en position `A` doit varier — sinon
    l'étiquette opaque ne masque plus rien.
    """
    positions: List[str] = []
    for index in range(24):
        records = [_record("m-a", case_id=f"cas-{index}"), _record("m-b", case_id=f"cas-{index}")]
        pairs = build_pairs(records, run_id=RUN_ID)
        positions.append(pairs[0].model_a)
    assert set(positions) == {"m-a", "m-b"}, "la disposition doit alterner selon la paire"


def test_pair_seed_ignores_model_order() -> None:
    """La paire (A, B) et la paire (B, A) partagent la même graine.

    Sans cela, l'ordre d'énumération changerait la disposition et la reprise
    produirait un second fichier pour un duel déjà joué.
    """
    assert pair_seed(RUN_ID, "cas-0", "m-a", "m-b", 0) == pair_seed(
        RUN_ID, "cas-0", "m-b", "m-a", 0
    )


def test_pair_seed_varies_with_every_component() -> None:
    """Chaque composante de l'identité de la paire entre dans la graine."""
    base = pair_seed(RUN_ID, "cas-0", "m-a", "m-b", 0)
    assert base != pair_seed("run-2", "cas-0", "m-a", "m-b", 0)
    assert base != pair_seed(RUN_ID, "cas-1", "m-a", "m-b", 0)
    assert base != pair_seed(RUN_ID, "cas-0", "m-a", "m-c", 0)
    assert base != pair_seed(RUN_ID, "cas-0", "m-a", "m-b", 1)


def test_truncation_applies_the_same_limit_to_both_texts() -> None:
    """Un juge favorise le texte le plus long : la limite doit être commune."""
    short = _record("m-a", line="Court.")
    long = _record("m-b", line="Très long. " * 2000)
    pairs = build_pairs([short, long], run_id=RUN_ID, truncation_limit=200)
    pair = pairs[0]
    assert len(pair.text_a) <= 200 + len(TRUNCATION_MARKER)
    assert len(pair.text_b) <= 200 + len(TRUNCATION_MARKER)
    assert pair.truncated is True


def test_real_lengths_survive_truncation() -> None:
    """La longueur réelle est conservée : c'est une mesure objective du rapport."""
    short = _record("m-a", line="Court.")
    long = _record("m-b", line="Très long. " * 2000)
    pair = build_pairs([short, long], run_id=RUN_ID, truncation_limit=200)[0]
    lengths = {pair.model_a: pair.length_a, pair.model_b: pair.length_b}
    assert lengths["m-b"] > lengths["m-a"] * 10
    assert lengths["m-b"] > 200, "la longueur réelle n'est pas celle du texte tronqué"


def test_short_texts_are_left_untouched() -> None:
    """Sans dépassement, aucune coupure et aucune marque parasite."""
    text, cut = truncate_for_pairwise("court", limit=PAIRWISE_TRUNCATION_CHARS)
    assert (text, cut) == ("court", False)


def test_unparsable_content_is_shown_as_is() -> None:
    """Une génération illisible est montrée brute plutôt que de faire échouer la paire."""
    broken = _record("m-a")
    broken = broken.model_copy(update={"json_content": "{ pas du JSON"})
    pairs = build_pairs([broken, _record("m-b")], run_id=RUN_ID)
    assert len(pairs) == 1
    texts = {pairs[0].model_a: pairs[0].text_a, pairs[0].model_b: pairs[0].text_b}
    assert texts["m-a"] == "{ pas du JSON"


def test_unpairable_slots_are_counted() -> None:
    """Un cas à un seul modèle valide doit apparaître, pas disparaître.

    Sans ce compte, un run largement invalide donnerait un classement fondé sur
    trois duels sans que rien ne le signale.
    """
    records = [
        _record("m-a", case_id="cas-0"),
        _record("m-b", case_id="cas-0"),
        _record("m-a", case_id="cas-1"),
        _record("m-b", case_id="cas-1", status="invalid"),
    ]
    assert count_unpairable_cases(records) == 1
    assert len(build_pairs(records, run_id=RUN_ID)) == 1


def test_pairs_are_ordered_deterministically() -> None:
    """L'ordre d'énumération est stable, condition d'une reprise prévisible."""
    records = [
        _record(model, case_id=case, repetition=rep)
        for case in ("cas-1", "cas-0")
        for model in ("m-c", "m-a", "m-b")
        for rep in (1, 0)
    ]
    keys = [(p.case_id, p.repetition, p.models_sorted) for p in build_pairs(records, run_id=RUN_ID)]
    assert keys == sorted(keys)
