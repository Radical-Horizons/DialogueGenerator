"""Tests du verrou asymétrique de rechargement GDD (core/context/context_builder.py).

Vérifie le comportement du verrou tel que conçu par le plan v3 (§1) :
- ``load_gdd_files()`` (écriture) reste strictement bloquant, sans timeout — deux
  écritures concurrentes se sérialisent, la seconde attend la première.
- ``build_context_json()`` (lecture) se replie sans verrou après un timeout court
  (``_GDD_RELOAD_LOCK_READ_TIMEOUT_SECONDS``) en cas de contention avec une
  écriture en cours, plutôt que d'attendre indéfiniment.

Contrôle déterministe des threads simulés via ``threading.Event`` (jamais un
``time.sleep`` fixe côté test) : évite la flakiness liée au timing. Le "writer"
est simulé en patchant ``GDDLoader.load_all`` plutôt qu'en rechargeant le vrai
GDD disque — isole le test du contenu GDD réel et de sa durée variable.

Voir _bmad-output/implementation-artifacts/spec-fix-event-loop-blocking-context-endpoints.md
"""
from __future__ import annotations

import logging
import threading
import time
from typing import Any, Dict, Iterator
from unittest.mock import MagicMock

import pytest

from core.context.context_builder import (
    _GDD_RELOAD_LOCK_READ_TIMEOUT_SECONDS,
    ContextBuilder,
)
from services.gdd_loader import GDDData


@pytest.fixture
def builder() -> ContextBuilder:
    """ContextBuilder non chargé : suffisant pour tester le verrou lui-même."""
    return ContextBuilder()


@pytest.fixture(autouse=True)
def _reset_warning_throttle_state() -> Iterator[None]:
    """Isole chaque test de l'état de throttling des logs (dict de classe partagé)."""
    ContextBuilder._last_warning_log_time.clear()
    yield
    ContextBuilder._last_warning_log_time.clear()


def test_load_gdd_files_blocks_second_writer_until_first_releases(
    builder: ContextBuilder,
) -> None:
    """Écriture bloquante classique : le second ``load_gdd_files()`` attend le premier.

    Preuve que ``load_gdd_files()`` n'a aucun timeout d'acquisition : le second
    appel reste bloqué bien au-delà de ``_GDD_RELOAD_LOCK_READ_TIMEOUT_SECONDS``
    (qui ne s'applique qu'à ``build_context_json()``), jusqu'à ce que le premier
    relâche explicitement le verrou.
    """
    first_started = threading.Event()
    first_may_finish = threading.Event()
    second_started = threading.Event()
    call_count = {"n": 0}

    def _controlled_load_all() -> GDDData:
        call_count["n"] += 1
        if call_count["n"] == 1:
            first_started.set()
            assert first_may_finish.wait(timeout=5.0), "premier writer jamais relâché"
        else:
            second_started.set()
        return GDDData()

    builder._gdd_loader.load_all = _controlled_load_all  # type: ignore[method-assign]

    first_thread = threading.Thread(target=builder.load_gdd_files)
    first_thread.start()
    assert first_started.wait(timeout=5.0), "premier writer n'a jamais démarré"

    second_finished = threading.Event()
    second_thread = threading.Thread(
        target=lambda: (builder.load_gdd_files(), second_finished.set())
    )
    second_thread.start()

    try:
        # Le second writer doit rester bloqué sur l'acquisition du verrou bien
        # au-delà du timeout de lecture (0.2s) — celui-ci ne s'applique pas à
        # load_gdd_files(), qui n'a structurellement aucun timeout.
        still_blocked = not second_started.wait(
            timeout=_GDD_RELOAD_LOCK_READ_TIMEOUT_SECONDS * 2
        )
        assert still_blocked, (
            "le second load_gdd_files() n'a pas attendu le verrou : "
            "l'écriture ne devrait jamais se replier."
        )
    finally:
        first_may_finish.set()
        first_thread.join(timeout=5.0)

    assert second_started.wait(timeout=5.0), "le second writer n'a jamais pu démarrer"
    second_thread.join(timeout=5.0)
    assert second_finished.is_set()
    assert call_count["n"] == 2


def test_build_context_json_falls_back_without_lock_on_contention(
    builder: ContextBuilder,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Lecture avec verrou contesté : repli mesuré sans attente indéfinie.

    Un writer détient ``_reload_lock`` pendant toute la durée du test. La lecture
    doit se replier après ``_GDD_RELOAD_LOCK_READ_TIMEOUT_SECONDS`` plutôt que
    d'attendre le relâchement du writer (le test le relâche seulement après avoir
    mesuré la lecture, pour prouver que celle-ci ne l'a pas attendu).
    """
    writer_holds_lock = threading.Event()
    release_writer = threading.Event()

    def _writer() -> None:
        with builder._reload_lock:
            writer_holds_lock.set()
            release_writer.wait(timeout=5.0)

    writer_thread = threading.Thread(target=_writer)
    writer_thread.start()
    assert writer_holds_lock.wait(timeout=5.0), "writer n'a jamais pris le verrou"

    # Service de construction minimal : le point sous test est le verrou, pas la
    # construction réelle du contexte (évite une dépendance au GDD chargé).
    fake_service = MagicMock()
    fake_service.build_context_json = MagicMock(return_value="fake-structured-context")
    builder._context_construction_service = fake_service

    caplog.set_level(logging.WARNING, logger="core.context.context_builder")

    try:
        t0 = time.perf_counter()
        result = builder.build_context_json(selected_elements={}, scene_instruction="")
        elapsed = time.perf_counter() - t0
    finally:
        release_writer.set()
        writer_thread.join(timeout=5.0)

    assert result == "fake-structured-context"
    # Repli après le timeout d'acquisition (0.2s) : marge généreuse pour
    # l'overhead thread/scheduler Windows, mais jamais proche des 5s que le
    # writer aurait pu tenir — la lecture ne l'a structurellement pas attendu.
    assert elapsed < _GDD_RELOAD_LOCK_READ_TIMEOUT_SECONDS * 5, (
        f"build_context_json() a mis {elapsed:.3f}s : semble avoir attendu le writer "
        "au lieu de se replier sans verrou."
    )
    assert any(
        "repli en lecture sans verrou" in record.getMessage()
        for record in caplog.records
    ), "le repli sans verrou n'a pas été journalisé (WARNING throttlé attendu)"


def test_build_context_json_uses_lock_when_uncontended(
    builder: ContextBuilder,
) -> None:
    """Sans contention, la lecture acquiert normalement le verrou (chemin nominal)."""
    fake_service = MagicMock()
    fake_service.build_context_json = MagicMock(return_value="fake-structured-context")
    builder._context_construction_service = fake_service

    result = builder.build_context_json(selected_elements={}, scene_instruction="")

    assert result == "fake-structured-context"
    # Le verrou doit être libre après l'appel (acquis puis relâché normalement).
    assert builder._reload_lock.acquire(blocking=False)
    builder._reload_lock.release()


def test_build_context_json_with_previous_dialogue_is_atomic_under_concurrency(
    builder: ContextBuilder,
) -> None:
    """Deux threads concurrents, dialogues précédents distincts, ne s'entrelacent jamais.

    Reproduit le scénario de régression trouvé en revue sur la spec v3 : avant
    ``_previous_dialogue_lock``, ``set_previous_dialogue_context()`` (écriture d'un
    état d'instance sur le ``ContextBuilder`` singleton partagé) et la lecture de
    ce même état par ``build_context_json()`` n'étaient plus atomiques une fois
    ces appels déportés en thread réel (``asyncio.to_thread``) — deux requêtes
    concurrentes pouvaient interlacer leurs paires set+lecture, la requête A
    lisant alors le dialogue précédent posé par la requête B.

    Le thread 2 doit rester bloqué sur l'acquisition du verrou tant que le
    thread 1 n'a pas terminé sa section critique (set + lecture) ; chaque thread
    doit lire exactement le texte qu'il a posé lui-même, jamais celui de l'autre.
    """
    thread1_entered_critical_section = threading.Event()
    thread1_may_finish = threading.Event()
    call_count = {"n": 0}

    def _fake_build_context_json(*_args: Any, **_kwargs: Any) -> str:
        """Capture le dialogue précédent visible à cet instant précis pour ce thread."""
        current = builder.previous_dialogue_context
        call_count["n"] += 1
        if call_count["n"] == 1:
            # Signale que le thread 1 est entré dans la section critique (set déjà
            # fait, lecture en cours) puis se bloque : le thread 2 doit rester
            # bloqué sur l'acquisition du verrou pendant toute cette fenêtre.
            thread1_entered_critical_section.set()
            assert thread1_may_finish.wait(timeout=5.0), "thread 1 jamais relâché"
        return f"structured::{current}"

    fake_service = MagicMock()
    fake_service.build_context_json = MagicMock(side_effect=_fake_build_context_json)
    builder._context_construction_service = fake_service

    thread1_result: Dict[str, str] = {}
    thread2_result: Dict[str, str] = {}

    def _run_thread1() -> None:
        thread1_result["value"] = builder.build_context_json_with_previous_dialogue(
            previous_dialogue_preview="TEXTE_THREAD_1",
            selected_elements={},
            scene_instruction="",
        )

    def _run_thread2() -> None:
        thread2_result["value"] = builder.build_context_json_with_previous_dialogue(
            previous_dialogue_preview="TEXTE_THREAD_2",
            selected_elements={},
            scene_instruction="",
        )

    t1 = threading.Thread(target=_run_thread1)
    t1.start()
    assert thread1_entered_critical_section.wait(timeout=5.0), (
        "thread 1 n'est jamais entré dans sa section critique"
    )

    t2 = threading.Thread(target=_run_thread2)
    t2.start()
    # Le thread 2 tente d'acquérir _previous_dialogue_lock, déjà tenu par le
    # thread 1 : il doit rester bloqué avant même d'appeler son propre
    # set_previous_dialogue_context("TEXTE_THREAD_2").
    time.sleep(0.2)
    assert "value" not in thread2_result, (
        "thread 2 n'aurait pas dû pouvoir entrer avant la libération de thread 1 : "
        "le verrou ne protège pas correctement la section critique."
    )
    assert builder.previous_dialogue_context == "TEXTE_THREAD_1", (
        "le dialogue précédent du thread 1 a été écrasé pendant que thread 2 "
        "attendait — la fenêtre de course n'est pas fermée."
    )

    thread1_may_finish.set()
    t1.join(timeout=5.0)
    t2.join(timeout=5.0)

    assert thread1_result["value"] == "structured::TEXTE_THREAD_1"
    assert thread2_result["value"] == "structured::TEXTE_THREAD_2"
