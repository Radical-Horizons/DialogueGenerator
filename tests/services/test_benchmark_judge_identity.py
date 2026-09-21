"""Changer la consigne d'un juge, c'est changer de juge.

Le protocole interdit d'agréger des notes venues de juges différents, et le
verdict enregistre `judge_model` pour cela. Mais le nom du modèle ne suffit
pas : le 2026-09-21, annoncer l'horizon du fragment aux deux juges a modifié ce
qu'ils pénalisent, sous un `judge_model` inchangé.

Le geste naturel ensuite — rejuger l'ancien run avec « le même » Luna pour
comparer avant/après — ferait tomber anciennes et nouvelles notes dans la même
moyenne. Un chiffre qui a l'air d'une mesure sans en être une : exactement le
mode de défaillance que tout le reste du banc sert à éliminer.
"""

from __future__ import annotations

from typing import Any, List

from api.schemas.benchmark_judging import RubricVerdict
from core.prompt.benchmark_judge import (
    BENCHMARK_PAIRWISE_JUDGE_SYSTEM_PROMPT,
    BENCHMARK_RUBRIC_JUDGE_SYSTEM_PROMPT,
    judge_prompt_fingerprint,
)
from services.benchmark_report_service import BenchmarkReportService

JUDGE = "gpt-5.6-luna"


def _verdict(prompt_hash: str | None, score: int, model_id: str = "gpt-5.6-terra") -> RubricVerdict:
    """Verdict rubrique minimal, noté sur un seul critère."""
    return RubricVerdict.model_validate(
        {
            "run_id": "run-1",
            "case_id": "voknir",
            "model_id": model_id,
            "repetition": 0,
            "judge_model": JUDGE,
            "grid_id": "grille-dialogue-fr",
            "grid_version": 1,
            "judge_prompt_hash": prompt_hash,
            "status": "scored",
            "scores": {"voice_fidelity": score},
            "criteria_snapshot": [
                {
                    "criterion_id": "voice_fidelity",
                    "label": "Justesse de la voix",
                    "description": "…",
                    "direction": "higher_is_better",
                    "weight": 1.0,
                }
            ],
        }
    )


def _reports(verdicts: List[RubricVerdict]) -> List[Any]:
    """Construit les blocs de juge sans monter tout le service."""
    service = BenchmarkReportService.__new__(BenchmarkReportService)
    return service._judge_reports(verdicts, [])  # noqa: SLF001


def test_the_two_judge_prompts_have_distinct_fingerprints() -> None:
    """Rubrique et duels ne notent pas la même chose : deux empreintes."""
    assert judge_prompt_fingerprint(
        BENCHMARK_RUBRIC_JUDGE_SYSTEM_PROMPT
    ) != judge_prompt_fingerprint(BENCHMARK_PAIRWISE_JUDGE_SYSTEM_PROMPT)


def test_the_fingerprint_moves_when_the_instruction_moves() -> None:
    """Sinon l'empreinte ne protège de rien."""
    before = judge_prompt_fingerprint("Tu es juge. Note le dialogue.")
    after = judge_prompt_fingerprint("Tu es juge. Note le dialogue. Le fragment est tronqué.")

    assert before != after


def test_a_leg_that_mixes_two_instructions_is_flagged() -> None:
    """Le cas qui compte : rejuger un ancien run avec une consigne nouvelle.

    Les deux lots portent le même `judge_model` et la même grille ; seule
    l'empreinte les sépare. Sans ce signal, la moyenne les réunirait en
    silence — même nom de modèle, mais deux juges.
    """
    reports = _reports([_verdict("ancienne", 4), _verdict("nouvelle", 9)])

    assert len(reports) == 1, "un juge reste un bloc : on signale, on ne scinde pas"
    assert reports[0].judge_prompt_mixed is True
    assert reports[0].rubric_prompt_hashes == ["ancienne", "nouvelle"]


def test_a_single_instruction_is_not_flagged() -> None:
    """Sans mélange, aucune alerte : le signal doit rester rare pour être lu."""
    reports = _reports([_verdict("meme", 8), _verdict("meme", 6, model_id="gpt-5.6-luna")])

    assert len(reports) == 1
    assert reports[0].judge_prompt_mixed is False
    assert reports[0].rubric_prompt_hashes == ["meme"]


def test_the_two_legs_are_never_compared_to_each_other() -> None:
    """Noter et comparer sont deux tâches : deux consignes par construction.

    Mettre l'empreinte en clé de regroupement coupait un même juge en deux
    blocs à moitié vides — constaté sur le run du 2026-09-21, où la rubrique et
    les duels se sont retrouvés séparés.
    """
    reports = _reports([_verdict("consigne-rubrique", 8)])

    assert len(reports) == 1
    assert reports[0].rubric_prompt_hashes == ["consigne-rubrique"]
    assert reports[0].pairwise_prompt_hashes == []
    assert reports[0].judge_prompt_mixed is False


def test_verdicts_without_a_fingerprint_are_readable() -> None:
    """Les verdicts d'avant le champ restent lisibles, et se déclarent inconnus."""
    reports = _reports([_verdict(None, 7), _verdict(None, 5, model_id="gpt-5.6-luna")])

    assert len(reports) == 1
    assert reports[0].rubric_prompt_hashes == ["inconnue"]
    assert reports[0].judge_prompt_mixed is False


def test_an_old_and_a_new_pass_are_flagged_together() -> None:
    """Rejuger sans empreinte puis avec : c'est encore un mélange."""
    reports = _reports([_verdict(None, 4), _verdict("nouvelle", 9)])

    assert reports[0].judge_prompt_mixed is True
    assert set(reports[0].rubric_prompt_hashes) == {"inconnue", "nouvelle"}
