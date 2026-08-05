"""État de contrôle partagé des passes de fond du mode benchmark.

Une passe (génération ou jugement) tourne en tâche de fond et doit pouvoir être
suivie, mise en pause, annulée — sans jamais laisser le service croire qu'un run
mort est encore actif.

Deux invariants, appris à la revue du moteur de run :

- La garde d'unicité repose sur ``active_id``, posé **synchroniquement** au
  lancement, jamais sur l'état du verrou : celui-ci n'est pris que dans la tâche,
  donc après le retour de l'appelant, ce qui laisserait passer deux lancements
  concurrents — et deux fois le plafond budgétaire.
- Les commandes de contrôle portent un identifiant : l'ignorer permettrait
  d'annuler la passe en cours depuis l'onglet d'une passe terminée.
"""

from __future__ import annotations

import asyncio
from typing import Optional


class PassCancelled(Exception):
    """Annulation coopérative demandée pendant une passe."""


class CooperativePassControl:
    """Verrou, pause et annulation d'une passe de fond, pour un service."""

    def __init__(self) -> None:
        """Initialise l'état : aucune passe active, pas de pause."""
        self.lock = asyncio.Lock()
        self.active_id: Optional[str] = None
        self.task: Optional[asyncio.Task] = None
        self._unpaused = asyncio.Event()
        self._unpaused.set()
        self._cancel_requested = False

    @property
    def paused(self) -> bool:
        """``True`` si une pause est demandée."""
        return not self._unpaused.is_set()

    def claim(self, pass_id: str) -> None:
        """Marque une passe comme active avant de lancer sa tâche.

        Args:
            pass_id: Identifiant de la passe.
        """
        self._cancel_requested = False
        self._unpaused.set()
        self.active_id = pass_id

    def release(self) -> None:
        """Libère la passe active, y compris après un échec de finalisation.

        Le drapeau d'annulation et la pause sont désarmés : les laisser armés
        ferait mourir la passe suivante au premier point de contrôle, ou la
        bloquerait indéfiniment — un redémarrage du processus serait le seul remède.

        ``task`` est délibérément conservée : elle reste la poignée de la dernière
        passe, que l'appelant a le droit d'attendre après coup.
        """
        self.active_id = None
        self._cancel_requested = False
        self._unpaused.set()

    def is_active(self, pass_id: Optional[str]) -> bool:
        """Indique si ``pass_id`` désigne la passe active de ce processus.

        Args:
            pass_id: Identifiant visé, ou ``None`` pour « la passe active ».

        Returns:
            ``True`` si une commande de contrôle peut s'appliquer.
        """
        if self.active_id is None:
            return False
        return pass_id is None or pass_id == self.active_id

    def pause(self) -> None:
        """Suspend la passe au prochain point de contrôle."""
        self._unpaused.clear()

    def unpause(self) -> None:
        """Relance une passe suspendue."""
        self._unpaused.set()

    def cancel(self) -> None:
        """Demande l'annulation ; réveille la passe si elle est en pause."""
        self._cancel_requested = True
        self._unpaused.set()

    async def checkpoint(self) -> None:
        """Point de contrôle coopératif : pause puis annulation.

        Raises:
            PassCancelled: Si une annulation a été demandée.
        """
        if self._cancel_requested:
            raise PassCancelled()
        await self._unpaused.wait()
        if self._cancel_requested:
            raise PassCancelled()
