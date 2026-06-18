"""Seuils GDD pour le nombre de flags liés à un dialogue (Story 9.1, FR89 AC5).

Valeurs repères maintenabilité ; alerte non bloquante si dépassé.
Story 5.3 : MAX_NODES_MAINTAINABILITY aligné frontend ``dialogueFlagThresholds.ts``.
"""

MAX_CONVERSATIONAL_FLAGS: int = 10
MAX_COUNTERS: int = 3
MAX_NODES_MAINTAINABILITY: int = 1000
