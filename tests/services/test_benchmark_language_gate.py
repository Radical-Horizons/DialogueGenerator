"""Tests de la porte de langue du mode benchmark."""

from __future__ import annotations

import builtins
from typing import Any

import pytest

from services import benchmark_language_gate
from services.benchmark_language_gate import detect_language, is_french

FRENCH_SAMPLE = (
    "Je n'ai pas confiance en toi, marchand. Tu vends des promesses et tu gardes "
    "les pièces. Alors dis-moi ce que tu veux vraiment, et ne me fais pas perdre "
    "mon temps avec tes belles paroles."
)

ENGLISH_SAMPLE = (
    "I do not trust you, merchant. You sell promises and you keep the coins. "
    "So tell me what you really want, and do not waste my time with your fine words."
)


def test_detects_french_dialogue() -> None:
    """Un dialogue français est accepté par la porte."""
    verdict = detect_language(FRENCH_SAMPLE)
    assert verdict.is_french is True
    assert verdict.detector in {"langdetect", "lexical"}


def test_detects_english_dialogue() -> None:
    """Un dialogue anglais est rejeté avec une raison lisible."""
    verdict = detect_language(ENGLISH_SAMPLE)
    assert verdict.is_french is False
    assert verdict.reason


def test_short_text_is_not_rejected() -> None:
    """Sous le seuil de fiabilité, on n'invalide pas sur du bruit."""
    verdict = detect_language("Oui.")
    assert verdict.is_french is True
    assert verdict.detector == "too_short"


def test_empty_text_is_not_rejected_by_language_gate() -> None:
    """Le vide relève de la porte « non vide », pas de la porte de langue."""
    assert is_french("") is True


def _force_lexical_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    """Rend ``langdetect`` inimportable pour exercer le repli lexical."""
    real_import = builtins.__import__

    def fake_import(name: str, *args: Any, **kwargs: Any) -> Any:
        if name == "langdetect":
            raise ImportError("langdetect indisponible (simulé)")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)


def test_lexical_fallback_accepts_french(monkeypatch: pytest.MonkeyPatch) -> None:
    """Sans langdetect, le repli lexical reconnaît le français."""
    _force_lexical_fallback(monkeypatch)
    verdict = detect_language(FRENCH_SAMPLE)
    assert verdict.detector == "lexical"
    assert verdict.is_french is True


def test_lexical_fallback_rejects_english(monkeypatch: pytest.MonkeyPatch) -> None:
    """Sans langdetect, le repli lexical rejette l'anglais."""
    _force_lexical_fallback(monkeypatch)
    verdict = detect_language(ENGLISH_SAMPLE)
    assert verdict.detector == "lexical"
    assert verdict.is_french is False
    assert verdict.detected == "en"


def test_thresholds_are_named_constants() -> None:
    """Les seuils restent des constantes nommées, pas des nombres magiques."""
    assert benchmark_language_gate.MIN_CHARS_FOR_DETECTION > 0
    assert benchmark_language_gate.FALLBACK_MIN_FRENCH_MARKERS > 0
