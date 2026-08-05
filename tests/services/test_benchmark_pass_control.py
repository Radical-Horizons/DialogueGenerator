"""Tests du contrôle coopératif partagé des passes de fond.

Ce composant a été extrait du moteur de run et sert désormais aux deux passes
(génération et jugement). Ses invariants n'étaient couverts qu'indirectement :
un défaut ici stériliserait le service pour toute la vie du processus.
"""

from __future__ import annotations

import asyncio

import pytest

from services.benchmark_pass_control import CooperativePassControl, PassCancelled


def test_no_command_applies_without_an_active_pass() -> None:
    """Sans passe active, aucune commande ne s'applique."""
    control = CooperativePassControl()
    assert control.is_active(None) is False
    assert control.is_active("run-1") is False


def test_commands_target_the_active_pass_only() -> None:
    """Une commande visant une autre passe ne s'applique pas.

    Sans ce filtre, annuler depuis l'onglet d'une passe terminée tuerait la passe
    en cours.
    """
    control = CooperativePassControl()
    control.claim("run-1")
    assert control.is_active("run-1") is True
    assert control.is_active(None) is True, "None cible la passe active, quelle qu'elle soit"
    assert control.is_active("run-2") is False


@pytest.mark.asyncio
async def test_checkpoint_passes_when_nothing_is_requested() -> None:
    """Sans pause ni annulation, le point de contrôle ne coûte rien."""
    control = CooperativePassControl()
    control.claim("run-1")
    await asyncio.wait_for(control.checkpoint(), timeout=1)


@pytest.mark.asyncio
async def test_checkpoint_raises_after_cancel() -> None:
    """L'annulation se manifeste au prochain point de contrôle."""
    control = CooperativePassControl()
    control.claim("run-1")
    control.cancel()
    with pytest.raises(PassCancelled):
        await control.checkpoint()


@pytest.mark.asyncio
async def test_checkpoint_blocks_while_paused_then_resumes() -> None:
    """La pause suspend au point de contrôle jusqu'à la reprise."""
    control = CooperativePassControl()
    control.claim("run-1")
    control.pause()
    assert control.paused is True

    task = asyncio.create_task(control.checkpoint())
    await asyncio.sleep(0.02)
    assert not task.done(), "le point de contrôle doit rester bloqué pendant la pause"

    control.unpause()
    await asyncio.wait_for(task, timeout=1)
    assert control.paused is False


@pytest.mark.asyncio
async def test_cancel_wakes_a_paused_pass() -> None:
    """Annuler une passe en pause ne doit pas la laisser dormir pour toujours."""
    control = CooperativePassControl()
    control.claim("run-1")
    control.pause()
    task = asyncio.create_task(control.checkpoint())
    await asyncio.sleep(0.02)
    control.cancel()
    with pytest.raises(PassCancelled):
        await asyncio.wait_for(task, timeout=1)


@pytest.mark.asyncio
async def test_claim_disarms_a_previous_cancellation() -> None:
    """Une annulation ne doit pas survivre à la passe suivante.

    Sans cette remise à zéro, la première annulation stériliserait le service :
    toute passe ultérieure mourrait au premier point de contrôle.
    """
    control = CooperativePassControl()
    control.claim("run-1")
    control.cancel()
    with pytest.raises(PassCancelled):
        await control.checkpoint()

    control.claim("run-2")
    await asyncio.wait_for(control.checkpoint(), timeout=1)


@pytest.mark.asyncio
async def test_claim_disarms_a_previous_pause() -> None:
    """Une pause oubliée ne doit pas bloquer la passe suivante."""
    control = CooperativePassControl()
    control.claim("run-1")
    control.pause()
    control.claim("run-2")
    assert control.paused is False
    await asyncio.wait_for(control.checkpoint(), timeout=1)


@pytest.mark.asyncio
async def test_release_disarms_cancellation_for_the_next_pass() -> None:
    """Après libération, une annulation résiduelle ne doit pas armer la suite."""
    control = CooperativePassControl()
    control.claim("run-1")
    control.cancel()
    control.release()
    assert control.active_id is None
    assert control.is_active("run-1") is False

    control.claim("run-2")
    await asyncio.wait_for(control.checkpoint(), timeout=1)


def test_release_keeps_the_task_handle() -> None:
    """La tâche reste consultable après libération : on peut l'attendre après coup."""
    control = CooperativePassControl()
    control.claim("run-1")
    sentinel = object()
    control.task = sentinel  # type: ignore[assignment]
    control.release()
    assert control.task is sentinel
