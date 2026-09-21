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


def test_two_instructions_never_share_a_block() -> None:
    """Le cas qui compte : rejuger un ancien run avec une consigne nouvelle.

    Deux blocs, donc deux moyennes — et non une seule qui mélangerait un juge
    qui pénalisait l'horizon du fragment avec un juge à qui on l'a expliqué.
    """
    reports = _reports([_verdict("ancienne", 4), _verdict("nouvelle", 9)])

    assert len(reports) == 2
    assert {r.judge_prompt_hash for r in reports} == {"ancienne", "nouvelle"}
    moyennes = sorted(r.models[0].weighted_mean for r in reports)
    assert moyennes[0] != moyennes[1], "les deux consignes ne doivent pas se moyenner"


def test_one_instruction_stays_one_block() -> None:
    """Sans changement de consigne, le rapport ne se fragmente pas."""
    reports = _reports([_verdict("meme", 8), _verdict("meme", 6, model_id="gpt-5.6-luna")])

    assert len(reports) == 1
    assert reports[0].judge_prompt_hash == "meme"


def test_verdicts_without_a_fingerprint_are_grouped_together() -> None:
    """Les verdicts d'avant le champ restent lisibles, entre eux.

    Ils sortent en un bloc à `judge_prompt_hash` nul : on ne sait pas sous
    quelle consigne ils ont été produits, et c'est précisément pour cela qu'on
    ne les mêle pas aux suivants.
    """
    reports = _reports([_verdict(None, 7), _verdict(None, 5, model_id="gpt-5.6-luna")])

    assert len(reports) == 1
    assert reports[0].judge_prompt_hash is None
