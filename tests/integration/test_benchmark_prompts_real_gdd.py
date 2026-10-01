"""Les prompts réels du banc portent toutes les fiches que leurs cas demandent.

Le 2026-10-02, la relecture des 48 prompts d'un run a montré que dans quatre cas
sur huit, la fiche du PNJ, plus grosse que le budget à elle seule, avait évincé le
PJ, le lieu et l'espèce — et que chaque prompt portait 40 à 250 UUID Notion bruts.
Aucun test ne le voyait : ils assemblaient des fiches factices, toujours sous le
budget. Celui-ci assemble les cas réels sur le GDD réel, avec le client factice.

Générique par construction : il parcourt les cas de la suite livrée et vérifie les
entités que **chaque cas** déclare, sans en nommer aucune.
"""

from __future__ import annotations

import asyncio
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import List

import pytest

from services.benchmark_suite_seed import STANDARD_SUITE_ID, default_suites

_UUID = re.compile(r"[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}")


def _assembled_prompts() -> List[tuple]:
    """Assemble le prompt de chaque cas de la suite standard, sans appel facturé."""
    from api.container import ServiceContainer

    container = ServiceContainer()
    service = container.get_benchmark_run_service()
    suite = next(s for s in default_suites() if s.suite_id == STANDARD_SUITE_ID)

    async def _one(case):
        request = service._build_request(case, "dummy", "sans")
        orchestrator = container.get_unity_dialogue_orchestrator(f"test-{case.case_id}")
        async for event in orchestrator.generate_with_events(request, lambda: False):
            if event.type == "complete":
                return case, event.data["result"]["raw_prompt"]
        return case, None

    return [asyncio.run(_one(case)) for case in suite.cases]


@pytest.mark.slow
@pytest.mark.integration
def test_every_declared_sheet_reaches_the_prompt_and_no_raw_uuid_does(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Chaque fiche demandée par un cas figure dans son prompt ; aucun UUID brut."""
    # Le service de banc sème ses suites et sa grille à la construction : hors du
    # répertoire de données réel.
    monkeypatch.setenv("BENCHMARK_DATA_DIR", str(tmp_path))
    for case, prompt in _assembled_prompts():
        assert prompt, f"{case.case_id} : aucun prompt assemblé"
        selections = case.request.context_selections
        declared = [
            *selections.characters_full,
            *selections.characters_excerpt,
            *selections.locations_excerpt,
            *selections.species_excerpt,
        ]
        for name in declared:
            assert f"--- {name} ---" in prompt or f'name="{name}"' in prompt, (
                f"{case.case_id} : la fiche « {name} » a disparu du prompt"
            )
        context = ET.fromstring(prompt).find("context")
        context_text = ET.tostring(context, encoding="unicode") if context is not None else ""
        assert not _UUID.search(context_text), f"{case.case_id} : UUID brut dans le contexte"
