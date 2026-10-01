"""Deux consignes dans une jambe, ce sont deux juges : on ne les moyenne pas.

`judge_prompt_mixed` existait et disait vrai — mais la moyenne se faisait quand
même, à côté du drapeau. Un chiffre qui a l'air d'une mesure sans en être une,
exactement ce que tout le reste du banc sert à éliminer.

Le cas qui arrive : on rejuge un run parce que l'ancien juge était en défaut
(contexte tronqué à 24 000 caractères, effort non fixé). Le répertoire des
verdicts étant désormais indexé sur l'empreinte, les deux cohortes cohabitent sur
disque et `list_verdicts` les ramasse toutes.
"""

from __future__ import annotations

from typing import List, Optional

from api.schemas.benchmark_judging import RubricVerdict
from services.benchmark_report_service import BenchmarkReportService

JUDGE = "openai/gpt-5.6-luna"
GRID = "grille-dialogue-fr"


def _verdict(
    prompt_hash: str, score: int, created_at: str, model_id: str = "openai/gpt-5.6-terra"
) -> RubricVerdict:
    """Verdict rubrique minimal, noté sur un seul critère."""
    return RubricVerdict(
        run_id="run",
        case_id="cas",
        model_id=model_id,
        repetition=0,
        judge_model=JUDGE,
        grid_id=GRID,
        grid_version=2,
        judge_prompt_hash=prompt_hash,
        status="scored",
        scores={"context_fidelity": score},
        comments={},
        criteria_snapshot=[
            {
                "criterion_id": "context_fidelity",
                "label": "Fidélité",
                "description": "d",
                "direction": "higher_is_better",
                "weight": 1.0,
            }
        ],
        created_at=created_at,
    )


def _cohort(verdicts: List[RubricVerdict]) -> List[RubricVerdict]:
    """Cohorte retenue pour les moyennes."""
    return BenchmarkReportService._latest_cohort(verdicts)


def test_a_single_cohort_passes_through_untouched() -> None:
    """Le cas normal ne doit rien perdre."""
    verdicts = [
        _verdict("aaaa", 8, "2026-10-01T10:00:00+00:00"),
        _verdict("aaaa", 6, "2026-10-01T10:01:00+00:00"),
    ]

    assert _cohort(verdicts) == verdicts


def test_only_the_newest_instruction_feeds_the_averages() -> None:
    """La re-notation remplace l'ancienne mesure, elle ne s'y ajoute pas."""
    ancien = _verdict("vieux", 9, "2026-09-21T15:00:00+00:00")
    nouveau = _verdict("neuf", 4, "2026-10-01T10:00:00+00:00")

    retenus = _cohort([ancien, nouveau])

    assert retenus == [nouveau]


def test_the_discarded_cohort_stays_visible_in_the_report() -> None:
    """Écarté des chiffres, pas de l'historique.

    `rubric_prompt_hashes` doit porter **les deux** empreintes et
    `judge_prompt_mixed` rester vrai : sinon on masquerait qu'un rejugement a eu
    lieu, et plus personne ne saurait pourquoi les notes ont bougé.
    """
    verdicts = [
        _verdict("vieux", 9, "2026-09-21T15:00:00+00:00"),
        _verdict("neuf", 4, "2026-10-01T10:00:00+00:00"),
    ]

    # Le rapport n'a besoin d'aucune de ses dependances injectees pour cet
    # assemblage : on evite de cabler quatre services pour verifier un tri.
    service = object.__new__(BenchmarkReportService)
    reports = service._judge_reports(verdicts, [])

    assert len(reports) == 1
    bloc = reports[0]
    assert bloc.judge_prompt_mixed is True
    assert set(bloc.rubric_prompt_hashes) == {"vieux", "neuf"}
    assert bloc.models[0].scored_count == 1, "une seule cohorte dans les moyennes"
    assert bloc.models[0].weighted_mean == 4.0, "la note du juge courant, pas 6,5"


def test_verdicts_without_a_date_do_not_silently_win() -> None:
    """Sans date, on ne tranche pas — et on préfère la cohorte datee.

    Une chaîne vide se compare plus petit que n'importe quelle date ISO : la
    cohorte sans date ne peut pas passer pour la plus récente.
    """
    date = _verdict("neuf", 3, "2026-10-01T10:00:00+00:00")
    sans = _verdict("vieux", 9, "")

    assert _cohort([sans, date]) == [date]
