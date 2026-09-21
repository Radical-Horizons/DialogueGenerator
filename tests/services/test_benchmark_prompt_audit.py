"""Un banc doit refuser de mesurer quand sa propre consigne se contredit.

Six bugs de mesure ont été trouvés en une journée sur ce banc, et **aucun par
un test** — tous en relisant des sorties réelles. Deux venaient de la même
cause : le prompt assemblé demandait l'inverse de ce que le run attendait.
Chaque morceau était correct isolément ; la contradiction naissait de leur
assemblage, donc aucun test unitaire de morceau ne pouvait la voir.

Ce fichier verrouille le seul niveau où elle est visible : le texte final.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET

import pytest

from core.prompt.prompt_engine import PromptInput
from services.benchmark_prompt_audit import audit_prompt
from services.prompt_builder import PromptBuilder

INSTRUCTIONS = (
    "Écris le fragment d'ouverture de la scène, avec assez de matière pour que "
    "le prompt assemblé dépasse le seuil de longueur minimale attendu."
)

# Le prompt exact qui a faussé le run 20260921T090302, réduit à ses phrases fautives.
PROMPT_HISTORIQUE = (
    "<prompt><contract><output_format>**IMPORTANT : Génère UN SEUL nœud de dialogue.**\n"
    "Ne génère PAS de séquence de nœuds dans un même appel : l'expansion d'arbre se fait "
    "par appels successifs (un nœud par requête).</output_format></contract>"
    "<generation_instructions>- Didascalies autorisées : *en italique* (markdown *…*), "
    "voix narrateur à la 3e personne.\n"
    "- 1 à 4 phrases (didascalie + réplique comptées ensemble).\n"
    "Mode de narration : SANS didascalies.</generation_instructions></prompt>"
)


def _built(*, fragment_mode: bool, allow_stage_directions: bool) -> str:
    """Assemble un prompt réel, tel que l'orchestrateur l'enverrait."""
    structure = PromptBuilder().build_structure(
        PromptInput(
            user_instructions=INSTRUCTIONS,
            npc_speaker_id="Voknir",
            fragment_mode=fragment_mode,
            allow_stage_directions=allow_stage_directions,
        )
    )
    return ET.tostring(structure, encoding="unicode")


def test_the_prompt_that_broke_the_bench_is_caught() -> None:
    """Le cas réel, et le seul qui prouve que l'audit sert à quelque chose."""
    problems = audit_prompt(
        PROMPT_HISTORIQUE, fragment_mode=True, allow_stage_directions=False
    )

    assert len(problems) >= 4
    joined = " | ".join(problems)
    assert "nœud unique" in joined
    assert "autorise les didascalies" in joined


@pytest.mark.parametrize(
    ("fragment_mode", "allow_stage_directions"),
    [(True, False), (True, True), (False, True)],
)
def test_the_prompts_actually_built_today_are_coherent(
    fragment_mode: bool, allow_stage_directions: bool
) -> None:
    """Les trois combinaisons réellement utilisées passent l'audit.

    C'est le test qui cassera si quelqu'un réintroduit une consigne contraire
    dans n'importe lequel des morceaux assemblés.
    """
    prompt = _built(
        fragment_mode=fragment_mode, allow_stage_directions=allow_stage_directions
    )

    assert audit_prompt(
        prompt,
        fragment_mode=fragment_mode,
        allow_stage_directions=allow_stage_directions,
    ) == []


def test_a_missing_fragment_instruction_is_a_contradiction_too() -> None:
    """Ne rien dire est aussi fautif que dire l'inverse.

    Le modèle retombe alors sur son habitude — un nœud — et le banc le compte
    incomplet.
    """
    problems = audit_prompt(
        _built(fragment_mode=False, allow_stage_directions=True),
        fragment_mode=True,
        allow_stage_directions=True,
    )

    assert any("ne dit nulle part" in p for p in problems)


def test_a_text_that_is_not_an_assembled_prompt_is_left_alone() -> None:
    """L'audit ne parle que des prompts produits par `PromptBuilder`.

    Inventer des contradictions dans un texte qui n'a jamais eu vocation à
    contraindre un modèle ferait échouer des runs pour la mauvaise raison — et
    obligerait chaque double de test à recopier un prompt entier.

    Le cas voisin, un prompt assemblé mais vide de contexte, est couvert en
    amont par `test_benchmark_suite_seed.py`.
    """
    for texte in ("prompt", "", "<prompt/>", "note libre de diagnostic"):
        assert audit_prompt(
            texte, fragment_mode=True, allow_stage_directions=False
        ) == []


def test_stage_directions_are_only_audited_when_forbidden() -> None:
    """En mode « avec », les lignes qui les décrivent sont attendues."""
    prompt = _built(fragment_mode=True, allow_stage_directions=True)

    assert "Didascalies autorisées" in prompt
    assert audit_prompt(prompt, fragment_mode=True, allow_stage_directions=True) == []


class _ContradictoryOrchestrator:
    """Orchestrateur qui renvoie le prompt fautif du 21 septembre."""

    def __init__(self) -> None:
        from tests.services.test_benchmark_failure_classification import (
            _FakeConfigService,
        )

        self.config_service = _FakeConfigService()

    async def generate_with_events(self, request, check_cancelled):
        """Produit une génération valide, avec un prompt qui se contredit."""
        document = {
            "schemaVersion": "1.1.0",
            "nodes": [
                {
                    "id": "START",
                    "displayName": "Ouverture",
                    "speaker": "Voknir",
                    "line": "« Je n'ai pas confiance en vous, et l'atelier non plus. »",
                    "choices": [{"choiceId": "c0", "text": "« Partir. »", "targetNode": "END"}],
                }
            ],
        }
        yield _Event("metadata", {"cost_usd": 0.01, "usage_prompt_tokens": 100})
        yield _Event(
            "complete",
            {"result": {"json_content": __import__("json").dumps(document),
                        "raw_prompt": PROMPT_HISTORIQUE}},
        )


class _Event:
    """Événement de génération."""

    def __init__(self, type: str, data: dict) -> None:
        self.type = type
        self.data = data


@pytest.mark.asyncio
async def test_a_run_stops_instead_of_paying_for_a_broken_measure(tmp_path) -> None:
    """Une génération perdue vaut mieux que vingt-cinq mesures fausses.

    Sans cette garde, le run du 21 septembre est allé au bout : 25 générations,
    une notation, cinquante duels, et un classement inexploitable.
    """
    from tests.services.test_benchmark_failure_classification import (
        _case,
        _FakeConfigService,
        _FakePricingService,
        _run,
    )
    from services.benchmark_gate_service import BenchmarkGateService
    from services.benchmark_run_service import BenchmarkRunService
    from services.benchmark_suite_store import BenchmarkSuiteStore

    service = BenchmarkRunService(
        suite_store=BenchmarkSuiteStore(suites_dir=tmp_path / "suites"),
        gate_service=BenchmarkGateService(flag_validation_service=None),
        pricing_service=_FakePricingService(),
        config_service=_FakeConfigService(),
        orchestrator_factory=lambda request_id: _ContradictoryOrchestrator(),
        runs_dir=tmp_path / "runs",
    )
    run = _run()
    suite = __import__("api.schemas.benchmark", fromlist=["BenchmarkSuite"]).BenchmarkSuite(
        suite_id="alteir-smoke", version=1, name="Fumée", cases=[_case()]
    )

    await service._execute(run, suite)

    final = service.get_run(run.run_id)
    assert final.status == "failed"
    assert "contredit" in (final.message or "")


@pytest.mark.asyncio
async def test_a_run_stopped_for_an_incoherent_prompt_cannot_be_resumed(tmp_path) -> None:
    """Reprendre mêlerait deux consignes dans le même rapport.

    La génération déjà produite l'a été sous un prompt qu'on sait faux ; la
    reprise la garde — `_record_is_usable` la juge réutilisable — et lui ajoute
    des générations d'après correction. Le run neuf est la seule mesure honnête.
    """
    from services.benchmark_gate_service import BenchmarkGateService
    from services.benchmark_run_service import (
        BenchmarkRunConflictError,
        BenchmarkRunService,
    )
    from services.benchmark_suite_store import BenchmarkSuiteStore
    from tests.services.benchmark_fixtures import (
        _FakeConfigService,
        _FakePricingService,
        _case,
        _run,
    )
    from api.schemas.benchmark import BenchmarkSuite

    service = BenchmarkRunService(
        suite_store=BenchmarkSuiteStore(suites_dir=tmp_path / "suites"),
        gate_service=BenchmarkGateService(flag_validation_service=None),
        pricing_service=_FakePricingService(),
        config_service=_FakeConfigService(),
        orchestrator_factory=lambda request_id: _ContradictoryOrchestrator(),
        runs_dir=tmp_path / "runs",
    )
    run = _run()
    suite = BenchmarkSuite(
        suite_id="alteir-smoke", version=1, name="Fumée", cases=[_case()]
    )
    await service._execute(run, suite)
    assert service.get_run(run.run_id).prompt_incoherent is True

    with pytest.raises(BenchmarkRunConflictError, match="consigne incohérente"):
        await service.resume_run(run.run_id)


@pytest.mark.asyncio
async def test_the_generation_that_triggered_the_stop_is_still_recorded(tmp_path) -> None:
    """Elle a été facturée : la perdre ferait sous-compter la dépense réelle."""
    from services.benchmark_gate_service import BenchmarkGateService
    from services.benchmark_run_service import BenchmarkRunService
    from services.benchmark_suite_store import BenchmarkSuiteStore
    from tests.services.benchmark_fixtures import (
        _FakeConfigService,
        _FakePricingService,
        _case,
        _run,
    )
    from api.schemas.benchmark import BenchmarkSuite

    service = BenchmarkRunService(
        suite_store=BenchmarkSuiteStore(suites_dir=tmp_path / "suites"),
        gate_service=BenchmarkGateService(flag_validation_service=None),
        pricing_service=_FakePricingService(),
        config_service=_FakeConfigService(),
        orchestrator_factory=lambda request_id: _ContradictoryOrchestrator(),
        runs_dir=tmp_path / "runs",
    )
    run = _run()
    await service._execute(
        run,
        BenchmarkSuite(suite_id="alteir-smoke", version=1, name="Fumée", cases=[_case()]),
    )

    records = service.list_generations(run.run_id)
    assert len(records) == 1
    assert service.get_run(run.run_id).spent_usd > 0
