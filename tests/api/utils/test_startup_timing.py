"""Tests pour le chronométrage optionnel du démarrage API."""
import logging

import pytest

from api.utils.startup_timing import StartupPhaseTimer, is_startup_timing_enabled


def test_is_startup_timing_enabled_false_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    """Sans variable d'environnement, le timing est désactivé."""
    monkeypatch.delenv("API_STARTUP_TIMING", raising=False)
    assert is_startup_timing_enabled() is False


@pytest.mark.parametrize(
    "value",
    ["1", "true", "yes", "TRUE", "Yes"],
)
def test_is_startup_timing_enabled_truthy(monkeypatch: pytest.MonkeyPatch, value: str) -> None:
    """Les valeurs usuelles activent le timing."""
    monkeypatch.setenv("API_STARTUP_TIMING", value)
    assert is_startup_timing_enabled() is True


def test_startup_phase_timer_mark_and_report_disabled(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Désactivé : aucun marqueur ni log."""
    caplog.set_level(logging.WARNING)
    timer = StartupPhaseTimer(enabled=False, module_import_started_at=0.0)
    timer.mark("should_not_appear")
    timer.log_report()
    assert not any("should_not_appear" in r.message for r in caplog.records)


def test_startup_phase_timer_report_when_enabled(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Activé : les phases apparaissent dans les logs."""
    caplog.set_level(logging.WARNING)
    timer = StartupPhaseTimer(enabled=True, module_import_started_at=None)
    timer.mark("phase_a")
    timer.mark("phase_b")
    timer.log_report()
    messages = " ".join(r.message for r in caplog.records)
    assert "phase_a" in messages
    assert "phase_b" in messages
