"""Chronométrage optionnel des phases de démarrage de l'API.

Activé avec la variable d'environnement ``API_STARTUP_TIMING=1`` (ou ``true`` / ``yes``).
Utile pour identifier où passe le temps avant que ``/health`` réponde (import ``api.main``,
chargement GDD, validation des champs, etc.).
"""
from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass, field
from typing import List, Tuple

logger = logging.getLogger(__name__)


def is_startup_timing_enabled() -> bool:
    """Indique si le rapport de timing de démarrage est activé.

    Returns:
        True si ``API_STARTUP_TIMING`` vaut 1, true ou yes (insensible à la casse).
    """
    return os.getenv("API_STARTUP_TIMING", "").lower() in ("1", "true", "yes")


@dataclass
class StartupPhaseTimer:
    """Accumule des marqueurs de temps entre l'entrée du lifespan et le ``yield``.

    Attributes:
        enabled: Si False, ``mark`` et ``log_report`` ne font rien.
        module_import_started_at: ``perf_counter`` au tout début de ``api.main`` (optionnel).
    """

    enabled: bool
    module_import_started_at: float | None = None
    _t0: float = field(init=False, repr=False)
    _last: float = field(init=False, repr=False)
    _phases: List[Tuple[str, float, float]] = field(default_factory=list, init=False, repr=False)

    def __post_init__(self) -> None:
        """Initialise les horodatages internes."""
        self._t0 = time.perf_counter()
        self._last = self._t0

    def log_time_since_module_start(self, label: str) -> None:
        """Journalise le délai entre le début du chargement de ``api.main`` et maintenant.

        Args:
            label: Libellé pour le message de log.
        """
        if not self.enabled or self.module_import_started_at is None:
            return
        elapsed_ms = (self._t0 - self.module_import_started_at) * 1000
        logger.warning("API startup timing: %s = %.0f ms", label, elapsed_ms)

    def mark(self, label: str) -> None:
        """Enregistre une étape (delta depuis la précédente + cumul depuis l'entrée lifespan).

        Args:
            label: Nom de la phase terminée.
        """
        if not self.enabled:
            return
        now = time.perf_counter()
        delta_ms = (now - self._last) * 1000
        total_ms = (now - self._t0) * 1000
        self._phases.append((label, delta_ms, total_ms))
        self._last = now

    def log_report(self) -> None:
        """Écrit un récapitulatif des phases (niveau WARNING pour rester visible avec LOG_CONSOLE_LEVEL=WARNING)."""
        if not self.enabled or not self._phases:
            return
        logger.warning("API startup timing — phases lifespan (depuis entrée lifespan):")
        for label, delta_ms, total_ms in self._phases:
            logger.warning(
                "  %-40s  +%6.0f ms   (cumul %7.0f ms)",
                label,
                delta_ms,
                total_ms,
            )
