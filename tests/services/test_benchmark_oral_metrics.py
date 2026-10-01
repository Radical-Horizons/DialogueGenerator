"""Oralité mesurée sans juge, et règle de l'oralité faible légitime."""

from __future__ import annotations

import json
from typing import Dict

import pytest

from api.schemas.benchmark import BenchmarkGenerationRecord
from services.benchmark_criteria_seed import default_criteria, default_grid_payload
from services.benchmark_oral_metrics import copied_ngrams, npc_lines, tally
from services.benchmark_report_service import BenchmarkReportService, is_oral_low_legitimate


def _content(*lines: str) -> str:
    """Génération Unity minimale portant ces répliques."""
    return json.dumps({"nodes": [{"line": line, "choices": []} for line in lines]})


def test_written_and_spoken_lines_are_told_apart() -> None:
    """Les mesures séparent ce que le juge reprochait de ce qu'il saluait."""
    written = tally(
        [
            "« Vous ne franchirez pas ce seuil en emportant le secret que les Plis ont "
            "reconnu ; votre prochaine parole décidera quelle paroi portera la fissure. »"
        ]
    )
    spoken = tally(["« Non — non… Pardon. Pardon. Écoutez-moi. Trente secondes. »"])

    assert written.words / written.sentences > spoken.words / spoken.sentences
    assert written.joins == 1 and spoken.joins == 0
    assert spoken.breaks >= 2 and written.breaks == 0


def test_npc_lines_reads_unity_nodes() -> None:
    """Seules les répliques non vides du PNJ sont mesurées."""
    assert npc_lines(_content("« Un. »", "  ", "« Deux. »")) == ["« Un. »", "« Deux. »"]
    assert npc_lines("pas du json") == []


def test_copy_from_the_prompt_is_counted() -> None:
    """Une phrase d'exemple reprise à l'identique se voit ; une formule courte, non."""
    prompt = "Exemple : « Les angles mentent mais les courbes révèlent toujours ce que la pierre cache »"
    copied = ["« Les angles mentent mais les courbes révèlent toujours ce que la pierre cache. »"]
    signature = ["« Les angles mentent, mais la lumière, elle, ne ment jamais. »"]

    assert copied_ngrams(copied, prompt) > 0
    assert copied_ngrams(signature, prompt) == 0


@pytest.mark.parametrize(
    "scores,expected",
    [
        ({"oral_naturalness": 5, "voice_fidelity": 8, "voice_consistency": 9}, True),
        ({"oral_naturalness": 5, "voice_fidelity": 8, "voice_consistency": 6}, False),
        ({"oral_naturalness": 5, "voice_fidelity": 7, "voice_consistency": 9}, False),
        ({"oral_naturalness": 7, "voice_fidelity": 9, "voice_consistency": 9}, False),
        ({"oral_naturalness": 5, "voice_fidelity": 9}, False),
    ],
)
def test_low_orality_is_legitimate_only_with_a_right_and_consistent_voice(
    scores: Dict[str, int], expected: bool
) -> None:
    """Règle produit : il faut la justesse **et** la cohérence de la voix."""
    assert is_oral_low_legitimate(scores) is expected


def test_report_carries_oral_observations() -> None:
    """Le rapport publie les mesures à côté des notes, par modèle."""
    record = BenchmarkGenerationRecord(
        run_id="r",
        case_id="c",
        model_id="m",
        repetition=0,
        status="valid",
        json_content=_content("« Non — non… Pardon. »", "« Écoute ; regarde : là. »"),
        raw_prompt="prompt sans rapport",
    )
    (validity,) = BenchmarkReportService._model_validity(["m"], [record])

    assert validity.oral is not None
    assert validity.oral.joins_per_100_words > 0
    assert validity.oral.breaks_per_100_words > 0
    assert validity.oral.generations_with_copy == 0


def test_grid_v3_scores_voice_consistency_separately() -> None:
    """La cohérence de la voix est un critère à part, que la règle peut combiner."""
    ids = [criterion["criterion_id"] for criterion in default_criteria()]
    assert "voice_consistency" in ids
    assert default_grid_payload()["version"] == 3
    oral = next(c for c in default_criteria() if c["criterion_id"] == "oral_naturalness")
    assert "Repères" in oral["description"]
