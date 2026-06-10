"""Bornes GDD pour les deltas de réputation dans les effets dialogue (Story 9.3).

Repères : Prestige ±5 à ±15 (amplitude max |delta| 15) ; Respect / Admiration ±5 à ±20 (max 20).
Crainte : plage laissée large (variable selon design).
"""

from __future__ import annotations


PRESTIGE_DELTA_ABS_MAX: float = 15.0
DEFAULT_REPUTATION_DELTA_ABS_MAX: float = 20.0
CRAINTE_DELTA_ABS_MAX: float = 25.0


def reputation_delta_bounds_for_axis(axis_id: str) -> tuple[float, float]:
    """Retourne (min, max) pour un delta de réputation selon l'axe (IDs stables ou libellés).

    Args:
        axis_id: Identifiant d'axe (ex. slug GDD ou libellé court).

    Returns:
        Intervalle inclusif autorisé pour ``delta``.
    """
    a = (axis_id or "").strip().lower()
    if "prestige" in a:
        return (-PRESTIGE_DELTA_ABS_MAX, PRESTIGE_DELTA_ABS_MAX)
    if "crainte" in a or "fear" in a:
        return (-CRAINTE_DELTA_ABS_MAX, CRAINTE_DELTA_ABS_MAX)
    return (-DEFAULT_REPUTATION_DELTA_ABS_MAX, DEFAULT_REPUTATION_DELTA_ABS_MAX)
