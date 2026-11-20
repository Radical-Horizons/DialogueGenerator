"""Provenance nœud → appel LLM, sûre quand plusieurs appels tournent en parallèle.

Une requête de génération peut faire plusieurs appels LLM sous le même ``request_id``
(choix avec test : 4 appels concurrents ; « tous les choix » : une tâche par choix). Pour
annoter chaque nœud sur **son** appel, deux ``ContextVar`` :

- :func:`collect_node_provenance`, posé par le router autour de la génération, ouvre un dict
  ``node_id → call_id``. Les tâches filles reçoivent une copie superficielle du contexte :
  elles écrivent toutes dans ce même dict.
- :func:`capture_llm_calls`, posé **dans** la tâche qui appelle le LLM, ouvre une liste où
  :func:`report_llm_call` (appelé par le suivi d'usage) dépose le ``call_id`` de chaque appel
  réussi. Posé avant ``create_task``/``gather``, il serait partagé par toutes les tâches.
"""

from __future__ import annotations

import logging
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Dict, Iterable, Iterator, List, Optional, Sequence

logger = logging.getLogger(__name__)

_call_sink: ContextVar[Optional[List[str]]] = ContextVar("llm_call_sink", default=None)
_node_provenance: ContextVar[Optional[Dict[str, str]]] = ContextVar(
    "llm_node_provenance", default=None
)


@contextmanager
def capture_llm_calls() -> Iterator[List[str]]:
    """Capture les ``call_id`` des appels LLM réussis faits dans la tâche courante.

    Yields:
        Liste remplie, dans l'ordre, par :func:`report_llm_call`.
    """
    calls: List[str] = []
    token = _call_sink.set(calls)
    try:
        yield calls
    finally:
        _call_sink.reset(token)


def report_llm_call(call_id: str) -> None:
    """Signale un appel LLM réussi à la capture en cours (no-op hors capture).

    Args:
        call_id: Identifiant unique de l'appel, tel que persisté dans le suivi d'usage.
    """
    sink = _call_sink.get()
    if sink is not None and call_id:
        sink.append(call_id)


@contextmanager
def collect_node_provenance() -> Iterator[Dict[str, str]]:
    """Ouvre la table ``node_id → call_id`` partagée par les tâches de la génération.

    Yields:
        Dict rempli par :func:`link_nodes_to_calls` (y compris depuis les tâches filles).
    """
    provenance: Dict[str, str] = {}
    token = _node_provenance.set(provenance)
    try:
        yield provenance
    finally:
        _node_provenance.reset(token)


def link_nodes_to_calls(node_ids: Iterable[str], call_ids: Sequence[str]) -> None:
    """Relie des nœuds produits à l'appel qui les a générés (le dernier capturé).

    Le dernier ``call_id`` est retenu : une relance (retry, repli de fournisseur) qui a
    fini par réussir est l'appel dont sort le nœud. No-op sans appel capturé (client sans
    suivi d'usage, ``DummyLLMClient``) ou hors de :func:`collect_node_provenance`.

    Args:
        node_ids: Identifiants des nœuds produits par l'appel.
        call_ids: ``call_id`` capturés pendant l'appel, dans l'ordre.
    """
    provenance = _node_provenance.get()
    if provenance is None or not call_ids:
        return
    call_id = call_ids[-1]
    for node_id in node_ids:
        if node_id:
            provenance[str(node_id)] = call_id
            logger.debug("Provenance: nœud %s ← appel %s", node_id, call_id)
