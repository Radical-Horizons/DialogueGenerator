"""La raison d'arrêt doit se lire pareil, quelle que soit l'API.

Sans elle, une génération coupée par le plafond de complétion et une génération
que le modèle a bâclée produisent la même sortie tronquée — et le benchmark
impute au modèle un défaut du harnais. C'est exactement ce qui s'est passé au
banc du 2026-08-08.

Deux familles d'API, deux vocabulaires : Chat Completions dit
``choices[0].finish_reason``, la Responses API dit ``status`` +
``incomplete_details``. Le benchmark ne doit connaître qu'un seul mot.
"""

from __future__ import annotations

from typing import Any

import pytest

from core.llm.finish_reason import COMPLETED, TRUNCATED, extract_finish_reason, is_truncated


class _Obj:
    """Objet de réponse minimal, façon SDK."""

    def __init__(self, **fields: Any) -> None:
        self.__dict__.update(fields)


@pytest.mark.parametrize("reason", ["stop", "length", "content_filter", "tool_calls"])
def test_chat_completions_reason_passes_through(reason: str) -> None:
    """Mistral et OpenRouter parlent déjà le vocabulaire de référence."""
    assert extract_finish_reason(_Obj(choices=[_Obj(finish_reason=reason)])) == reason


def test_responses_completed_reads_as_stop() -> None:
    """Un `status: completed` vaut un arrêt normal."""
    assert extract_finish_reason(_Obj(status="completed")) == COMPLETED


def test_responses_max_output_tokens_reads_as_truncation() -> None:
    """Le plafond de complétion doit se voir sous le même nom partout."""
    response = _Obj(status="incomplete", incomplete_details=_Obj(reason="max_output_tokens"))
    assert extract_finish_reason(response) == TRUNCATED
    assert is_truncated(extract_finish_reason(response))


def test_streaming_incomplete_payload_is_a_plain_dict() -> None:
    """Le streaming livre l'événement de troncature en dictionnaire brut.

    C'est *l'*événement qui compte : le manquer viderait le module de son sens.
    """
    payload = {"status": "incomplete", "incomplete_details": {"reason": "max_output_tokens"}}
    assert extract_finish_reason(payload) == TRUNCATED


def test_incomplete_without_reason_is_not_guessed() -> None:
    """Un `incomplete` muet reste `incomplete` : on ne devine pas la troncature."""
    assert extract_finish_reason(_Obj(status="incomplete")) == "incomplete"


def test_unknown_shape_returns_none() -> None:
    """`None` veut dire « on ne sait pas », jamais « tout va bien »."""
    assert extract_finish_reason(_Obj()) is None
    assert not is_truncated(None)


def test_exotic_response_never_breaks_a_generation() -> None:
    """Un accès qui lève ne doit pas faire tomber l'appel LLM qui l'entoure."""

    class _Hostile:
        @property
        def choices(self) -> Any:
            raise RuntimeError("propriété piégée")

    assert extract_finish_reason(_Hostile()) is None
