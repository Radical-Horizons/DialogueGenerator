"""Un appel d'outil stringifié n'est pas un juge incapable.

Le 2026-10-01, `anthropic/claude-sonnet-5` employé comme juge a perdu **9
verdicts sur 24**, déjà payés. Son contenu était correct : la passerelle
tool-calling d'OpenRouter pour les modèles Anthropic avait encodé la charge
entière en **chaîne**, dans le premier champ de l'argument.

Rien ne distinguait ce cas d'un juge réellement inapte. La jambe `medium` ne
reposait plus que sur **trois** notes, et une moyenne sur trois notes ressemble
à une mesure.
"""

from __future__ import annotations

import json

from core.llm.openrouter_client import OpenRouterClient
from models.benchmark_judge_output import BenchmarkRubricJudgeResult

ATTENDU = {
    "criteria": [
        {"criterion_id": "context_fidelity", "score": 7, "comment": "exploite les fiches"},
        {"criterion_id": "french_correctness", "score": 9, "comment": "idiomatique"},
    ],
    "reasoning": "Raisonnement libre, conservé pour audit.",
}


def _deballe(brut: str):
    """Tente le rattrapage, comme le client le fait après un échec de validation."""
    return OpenRouterClient._try_unwrap_stringified_payload(
        BenchmarkRubricJudgeResult, brut
    )


def test_the_whole_payload_nested_in_one_field_is_recovered() -> None:
    """La forme exacte observée en production : tout l'objet dans `criteria`."""
    brut = json.dumps(
        {"criteria": json.dumps(ATTENDU, ensure_ascii=False)}, ensure_ascii=False
    )

    recupere = _deballe(brut)

    assert recupere is not None
    assert [c.criterion_id for c in recupere.criteria] == [
        "context_fidelity",
        "french_correctness",
    ]
    assert recupere.criteria[0].score == 7


def test_a_single_stringified_field_is_recovered() -> None:
    """Variante plus simple : seul le tableau est encodé en chaîne."""
    brut = json.dumps(
        {
            "criteria": json.dumps(ATTENDU["criteria"], ensure_ascii=False),
            "reasoning": ATTENDU["reasoning"],
        },
        ensure_ascii=False,
    )

    recupere = _deballe(brut)

    assert recupere is not None
    assert len(recupere.criteria) == 2
    assert recupere.reasoning == ATTENDU["reasoning"]


def test_a_healthy_payload_is_left_to_the_normal_path() -> None:
    """Rien à déballer : le rattrapage rend ``None`` et ne s'interpose pas.

    Le chemin normal a déjà réussi dans ce cas ; renvoyer un objet ici masquerait
    une divergence entre les deux voies.
    """
    assert _deballe(json.dumps(ATTENDU, ensure_ascii=False)) is None


def test_a_field_that_merely_looks_like_json_is_not_mangled() -> None:
    """Un commentaire qui commence par une accolade reste du texte.

    Le juge cite parfois le JSON qu'il note. Si son commentaire était décodé comme
    une charge imbriquée, le rattrapage corromprait un verdict valide.
    """
    charge = {
        "criteria": ATTENDU["criteria"],
        "reasoning": '{"nodes": []} — le fragment rendu était vide.',
    }

    # Le chemin normal valide déjà cette charge : le rattrapage ne doit pas être
    # sollicité. On vérifie qu'il ne casse rien s'il l'est tout de même.
    recupere = _deballe(json.dumps(charge, ensure_ascii=False))
    if recupere is not None:
        assert recupere.reasoning == charge["reasoning"]


def test_unparsable_arguments_are_refused() -> None:
    """Du bruit reste un échec : on ne doit pas inventer un verdict."""
    assert _deballe("ceci n'est pas du JSON") is None
    assert _deballe(json.dumps({"criteria": "pas du JSON non plus"})) is None
