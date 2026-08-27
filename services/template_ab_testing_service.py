"""A/B testing de templates : expansion Unity, juge 4.7, historique, pouces."""

from __future__ import annotations

import json
import logging
import time
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple
from uuid import UUID, uuid4

from api.schemas.dialogue import ContextSelection
from api.schemas.dialogue_quality import EvaluateDialogueQualityResponse
from api.schemas.template import TemplateConfiguration
from constants import ModelNames
from services.dialogue_tree_expansion_service import (
    DialogueTreeExpansionService,
    TreeExpansionError,
    TreeExpansionResult,
)
from api.schemas.template import (
    MAX_GENERATIONS,
    MAX_MAX_DEPTH,
    MIN_GENERATIONS,
    MIN_MAX_DEPTH,
)
from services.graph_conversion_service import GraphConversionService
from services.llm_quality_judge_service import LLMQualityJudgeService
from services.llm_usage_service import LLMUsageService
from services.scene_dramatis import context_has_location
from services.template_service import TemplateService
from services.unity_dialogue_orchestrator import UnityDialogueOrchestrator

logger = logging.getLogger(__name__)

PREBUILT_ID_PREFIX = "prebuilt:"
AB_TEST_USAGE_ENDPOINT = "templates_ab_test"
DEFAULT_GENERATIONS = 3
DEFAULT_MAX_DEPTH = 2
DEFAULT_MAX_CHOICES = 3
_USD_TO_EUR_RATE = 0.92
WINNER_MODES = frozenset({"score", "score_thumbs", "score_cost"})

DIALOGUE_GENERATOR_DIR = Path(__file__).resolve().parent.parent
DEFAULT_AB_TESTS_DIR = DIALOGUE_GENERATOR_DIR / "data" / "ab-tests"

ProgressCallback = Callable[[int, int, str], None]


class TemplateABTestValidationError(Exception):
    """Paramètres A/B invalides (HTTP 400)."""


class TemplateABTestNotFoundError(Exception):
    """Test ou génération introuvable (HTTP 404)."""


class TemplateABTestingService:
    """Compare deux templates via des dialogues Unity complets et le juge 4.7."""

    def __init__(
        self,
        template_service: TemplateService,
        storage_dir: Optional[Path] = None,
    ) -> None:
        """Initialise le service.

        Args:
            template_service: Résolution custom UUID et pré-built.
            storage_dir: Racine ``data/ab-tests`` (surcharge tests).
        """
        self._template_service = template_service
        self._storage_dir = storage_dir or DEFAULT_AB_TESTS_DIR
        self._storage_dir.mkdir(parents=True, exist_ok=True)

    def resolve_template(
        self, template_id: str
    ) -> Tuple[str, str, TemplateConfiguration]:
        """Résout un UUID custom ou ``prebuilt:{slug}``.

        Args:
            template_id: Identifiant demandé.

        Returns:
            Tuple (id canonique, nom, configuration).

        Raises:
            FileNotFoundError: Template ou slug absent.
        """
        raw = (template_id or "").strip()
        if raw.startswith(PREBUILT_ID_PREFIX):
            slug = raw[len(PREBUILT_ID_PREFIX) :]
            prebuilt = self._template_service.get_prebuilt_template(slug)
            return f"{PREBUILT_ID_PREFIX}{prebuilt.id}", prebuilt.name, prebuilt.configuration
        template = self._template_service.get_template(raw)
        return template.id, template.name, template.configuration

    def validate_launch_params(
        self,
        template_a_id: str,
        template_b_id: str,
        generations_per_template: int,
        max_depth: int,
    ) -> None:
        """Valide IDs distincts, N et profondeur (sans I/O)."""
        if (template_a_id or "").strip() == (template_b_id or "").strip():
            raise TemplateABTestValidationError(
                "Les deux templates doivent être distincts"
            )
        if not MIN_GENERATIONS <= generations_per_template <= MAX_GENERATIONS:
            raise TemplateABTestValidationError(
                f"generationsPerTemplate doit être entre {MIN_GENERATIONS} et {MAX_GENERATIONS}"
            )
        if not MIN_MAX_DEPTH <= max_depth <= MAX_MAX_DEPTH:
            raise TemplateABTestValidationError(
                f"maxDepth doit être entre {MIN_MAX_DEPTH} et {MAX_MAX_DEPTH}"
            )

    def validate_launch(
        self,
        template_a_id: str,
        template_b_id: str,
        generations_per_template: int,
        max_depth: int,
    ) -> Tuple[
        Tuple[str, str, TemplateConfiguration],
        Tuple[str, str, TemplateConfiguration],
    ]:
        """Valide la paire, N, la profondeur, le brief et le lieu.

        Args:
            template_a_id: Identifiant A.
            template_b_id: Identifiant B.
            generations_per_template: N par côté.
            max_depth: Profondeur expand-tree.

        Returns:
            Les deux templates résolus.

        Raises:
            TemplateABTestValidationError: Paramètres métier invalides.
            FileNotFoundError: ID inconnu.
        """
        self.validate_launch_params(
            template_a_id,
            template_b_id,
            generations_per_template,
            max_depth,
        )
        resolved_a = self.resolve_template(template_a_id)
        resolved_b = self.resolve_template(template_b_id)
        for _tid, name, config in (resolved_a, resolved_b):
            self._require_brief_and_location(name, config)
        return resolved_a, resolved_b

    def create_queued_test(
        self,
        *,
        template_a_id: str,
        template_b_id: str,
        generations_per_template: int,
        max_depth: int,
        parent_test_id: Optional[str] = None,
        owner_key: Optional[str] = None,
        winner_mode: str = "score",
    ) -> Dict[str, Any]:
        """Crée le fichier results.json en statut queued.

        Args:
            template_a_id: Identifiant A.
            template_b_id: Identifiant B.
            generations_per_template: N.
            max_depth: Profondeur.
            parent_test_id: Test parent pour une relance.

        Returns:
            Document persisté.
        """
        resolved_a, resolved_b = self.validate_launch(
            template_a_id,
            template_b_id,
            generations_per_template,
            max_depth,
        )
        test_id = str(uuid4())
        now = datetime.now(timezone.utc).isoformat()
        payload: Dict[str, Any] = {
            "testId": test_id,
            "status": "queued",
            "current": 0,
            "total": generations_per_template * 2,
            "createdAt": now,
            "templateAId": resolved_a[0],
            "templateBId": resolved_b[0],
            "templateAName": resolved_a[1],
            "templateBName": resolved_b[1],
            "snapshotA": resolved_a[2].model_dump(mode="json"),
            "snapshotB": resolved_b[2].model_dump(mode="json"),
            "generationsPerTemplate": generations_per_template,
            "maxDepth": max_depth,
            "parentTestId": parent_test_id,
            "ownerKey": owner_key,
            "winnerMode": winner_mode if winner_mode in WINNER_MODES else "score",
            "winnerTemplateId": None,
            "scoreVarianceNote": (
                "Variance attendue ±1 point sur le score global entre deux "
                "évaluations successives (le juge LLM n'est pas déterministe)."
            ),
            "generations": [],
            "totals": {},
            "error": None,
        }
        self._write_results(test_id, payload)
        return payload

    def mark_failed(self, test_id: str, error: str) -> Dict[str, Any]:
        """Passe un test en failed (usine LLM / runner)."""
        payload = self._read_results(test_id)
        payload["status"] = "failed"
        payload["error"] = error
        self._write_results(test_id, payload)
        return payload

    def list_tests(
        self, *, owner_key: Optional[str] = None, is_admin: bool = False
    ) -> List[Dict[str, Any]]:
        """Liste les tests (plus récent d'abord)."""
        items: List[Dict[str, Any]] = []
        if not self._storage_dir.exists():
            return items
        for child in self._storage_dir.iterdir():
            if not child.is_dir():
                continue
            path = child / "results.json"
            if not path.exists():
                continue
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                logger.warning("A/B results.json illisible: %s", path)
                continue
            if not isinstance(payload, dict) or not payload.get("testId"):
                continue
            if not self._is_visible(payload, owner_key=owner_key, is_admin=is_admin):
                continue
            items.append(self._history_item(payload))
        items.sort(key=lambda row: str(row.get("createdAt") or ""), reverse=True)
        return items

    def get_test(self, test_id: str) -> Dict[str, Any]:
        """Charge un test complet.

        Args:
            test_id: UUID du dossier.

        Returns:
            Document results.json.

        Raises:
            TemplateABTestNotFoundError: Absent.
        """
        return self._read_results(test_id)

    def assert_visible(
        self,
        payload: Dict[str, Any],
        *,
        owner_key: Optional[str],
        is_admin: bool,
    ) -> None:
        """404 si le test n'appartient pas à l'acteur (sauf admin)."""
        if not self._is_visible(payload, owner_key=owner_key, is_admin=is_admin):
            raise TemplateABTestNotFoundError(
                f"Test {payload.get('testId')} introuvable"
            )

    @staticmethod
    def _is_visible(
        payload: Dict[str, Any],
        *,
        owner_key: Optional[str],
        is_admin: bool,
    ) -> bool:
        """Admin ou liste non scopée : tout ; sinon ``ownerKey`` strict.

        Un test sans ``ownerKey`` persisté n'est visible que d'un admin : le
        routeur en pose toujours un, donc seul un run antérieur au scoping 6.7
        peut en manquer — il ne doit pas devenir lisible par tous.
        """
        if is_admin or owner_key is None:
            return True
        stored = payload.get("ownerKey")
        if not stored:
            return False
        return stored == owner_key

    def apply_feedback(
        self,
        test_id: str,
        generation_id: str,
        thumb: str,
    ) -> Dict[str, Any]:
        """Enregistre un pouce sans recalculer le gagnant juge.

        Args:
            test_id: UUID du test.
            generation_id: Id de génération.
            thumb: ``up``, ``down`` ou ``none``.

        Returns:
            Document mis à jour.

        Raises:
            TemplateABTestNotFoundError: Test ou génération absent.
            TemplateABTestValidationError: Valeur de pouce invalide.
        """
        if thumb not in ("up", "down", "none"):
            raise TemplateABTestValidationError("thumb doit être up, down ou none")
        payload = self._read_results(test_id)
        if payload.get("status") not in ("completed", "failed"):
            raise TemplateABTestValidationError(
                "Le pouce n'est disponible qu'une fois le test terminé"
            )
        found = False
        for generation in payload.get("generations") or []:
            if generation.get("id") == generation_id:
                generation["thumb"] = None if thumb == "none" else thumb
                found = True
                break
        if not found:
            raise TemplateABTestNotFoundError(f"Génération {generation_id} introuvable")
        payload["totals"] = self._compute_totals(payload)
        payload["winnerTemplateId"] = self._winner_id(payload)
        self._write_results(test_id, payload)
        return payload

    def prepare_rerun(self, parent_test_id: str) -> Dict[str, Any]:
        """Crée un nouveau test queued lié au parent (snapshots actuels).

        Args:
            parent_test_id: Test d'origine.

        Returns:
            Nouveau document queued.

        Raises:
            TemplateABTestNotFoundError: Parent absent.
        """
        parent = self._read_results(parent_test_id)
        return self.create_queued_test(
            template_a_id=str(parent["templateAId"]),
            template_b_id=str(parent["templateBId"]),
            generations_per_template=int(parent.get("generationsPerTemplate") or DEFAULT_GENERATIONS),
            max_depth=int(parent.get("maxDepth") or DEFAULT_MAX_DEPTH),
            parent_test_id=parent_test_id,
            owner_key=str(parent.get("ownerKey") or "") or None,
            winner_mode=str(parent.get("winnerMode") or "score"),
        )

    async def run_ab_test(
        self,
        test_id: str,
        *,
        expansion_service: DialogueTreeExpansionService,
        unity_orchestrator: UnityDialogueOrchestrator,
        generation_llm_client: Any,
        judge_llm_client: Any,
        judge_service: LLMQualityJudgeService,
        config_service: Any,
        usage_service: Optional[LLMUsageService] = None,
        on_progress: Optional[ProgressCallback] = None,
    ) -> Dict[str, Any]:
        """Exécute les générations en alternance A1,B1,A2,B2…

        Args:
            test_id: Test queued.
            expansion_service: Expand-tree (persist=false).
            unity_orchestrator: Orchestrateur START.
            generation_llm_client: Client Luna (ou dummy).
            judge_llm_client: Client juge 4.7.
            judge_service: ``LLMQualityJudgeService``.
            config_service: Config modèles.
            usage_service: Pour sommer les coûts.
            on_progress: ``(current, total, detail)``.

        Returns:
            Document completed ou failed.
        """
        payload = self._read_results(test_id)
        payload["status"] = "running"
        self._write_results(test_id, payload)

        config_a = TemplateConfiguration.model_validate(payload.get("snapshotA") or {})
        config_b = TemplateConfiguration.model_validate(payload.get("snapshotB") or {})
        resolved_a = (str(payload["templateAId"]), str(payload["templateAName"]), config_a)
        resolved_b = (str(payload["templateBId"]), str(payload["templateBName"]), config_b)
        n = int(payload.get("generationsPerTemplate") or DEFAULT_GENERATIONS)
        max_depth = int(payload.get("maxDepth") or DEFAULT_MAX_DEPTH)
        total = n * 2
        judge_model = LLMQualityJudgeService.resolve_default_model_id(config_service)

        current = 0
        try:
            for index in range(n):
                for resolved in (resolved_a, resolved_b):
                    current += 1
                    detail = f"{resolved[1]} #{index + 1}"
                    if on_progress:
                        on_progress(current, total, detail)
                    generation = await self._run_one_generation(
                        template_id=resolved[0],
                        template_name=resolved[1],
                        config=resolved[2],
                        index=index,
                        max_depth=max_depth,
                        expansion_service=expansion_service,
                        unity_orchestrator=unity_orchestrator,
                        generation_llm_client=generation_llm_client,
                        judge_llm_client=judge_llm_client,
                        judge_service=judge_service,
                        config_service=config_service,
                        judge_model_id=judge_model,
                        usage_service=usage_service,
                    )
                    payload["generations"].append(generation)
                    payload["current"] = current
                    payload["totals"] = self._compute_totals(payload)
                    payload["winnerTemplateId"] = self._winner_id(payload)
                    self._write_results(test_id, payload)

            payload["status"] = "completed"
            payload["totals"] = self._compute_totals(payload)
            payload["winnerTemplateId"] = self._winner_id(payload)
            self._write_results(test_id, payload)
            return payload
        except Exception as exc:
            logger.exception("A/B test %s échoué", test_id)
            payload["status"] = "failed"
            payload["error"] = str(exc)
            self._write_results(test_id, payload)
            raise

    async def _run_one_generation(
        self,
        *,
        template_id: str,
        template_name: str,
        config: TemplateConfiguration,
        index: int,
        max_depth: int,
        expansion_service: DialogueTreeExpansionService,
        unity_orchestrator: UnityDialogueOrchestrator,
        generation_llm_client: Any,
        judge_llm_client: Any,
        judge_service: LLMQualityJudgeService,
        config_service: Any,
        judge_model_id: str,
        usage_service: Optional[LLMUsageService],
    ) -> Dict[str, Any]:
        """Génère un arbre, le juge, et enregistre l'échec sans interrompre le run."""
        generation_id = str(uuid4())
        max_choices = config.maxChoices if config.maxChoices and config.maxChoices > 0 else DEFAULT_MAX_CHOICES
        context = self._context_from_configuration(config)
        instructions = (config.instructions or "").strip()
        cost_started = datetime.now(timezone.utc)
        started = time.perf_counter()
        row: Dict[str, Any] = {
            "id": generation_id,
            "templateId": template_id,
            "templateName": template_name,
            "index": index,
            "overallScore": None,
            "criteria": [],
            "costEur": 0.0,
            "durationMs": 0,
            "thumb": None,
            "error": None,
            "document": None,
        }
        try:
            result: TreeExpansionResult = await expansion_service.expand(
                unity_orchestrator=unity_orchestrator,
                llm_client=generation_llm_client,
                user_instructions=instructions,
                context_selections=context,
                max_depth=max_depth,
                max_choices=max_choices,
                llm_model_identifier=ModelNames.GPT_5_6_LUNA,
                title=f"A/B {template_name} #{index + 1}",
                scene_type=config.sceneType or None,
                include_narrative_guides=True,
                organization_mode="narrative",
                allow_partial=False,
            )
            if result.failed_parents or result.expansion_status not in ("complete",):
                raise TreeExpansionError(
                    f"Expansion partielle ({result.expansion_status})"
                )
            nodes, edges = GraphConversionService.unity_json_to_graph(
                json.dumps(result.document, ensure_ascii=False)
            )
            judged: EvaluateDialogueQualityResponse = await judge_service.evaluate_graph(
                nodes=nodes,
                edges=edges,
                llm_client=judge_llm_client,
                config_service=config_service,
                model_id=judge_model_id,
            )
            row["overallScore"] = judged.overall_score
            row["criteria"] = [
                {
                    "criterionId": item.criterion_id,
                    "label": item.label,
                    "score": item.score,
                }
                for item in judged.criteria
            ]
            row["document"] = result.document
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Génération A/B %s (%s #%s) en échec: %s",
                generation_id,
                template_id,
                index,
                exc,
            )
            row["error"] = str(exc)
        row["durationMs"] = int((time.perf_counter() - started) * 1000)
        row["costEur"] = round(self._usage_usd(usage_service, cost_started) * _USD_TO_EUR_RATE, 8)
        return row

    def _require_brief_and_location(
        self,
        name: str,
        config: TemplateConfiguration,
    ) -> None:
        """Refuse un template sans instructions ou sans lieu."""
        if not (config.instructions or "").strip():
            raise TemplateABTestValidationError(
                f"Instructions vides pour « {name} »"
            )
        context = self._context_from_configuration(config)
        if not context_has_location(context):
            raise TemplateABTestValidationError(
                f"Un lieu est requis pour « {name} »"
            )

    def _context_from_configuration(
        self,
        config: TemplateConfiguration,
    ) -> ContextSelection:
        """Construit un ContextSelection depuis le snapshot template."""
        raw = config.contextSelections
        if isinstance(raw, dict) and raw:
            return ContextSelection.model_validate(raw)
        return ContextSelection(
            characters_full=list(config.characters or []),
            locations_full=list(config.locations or []),
            scene_location=(
                {"name": config.selectedRegion or config.region}
                if (config.selectedRegion or config.region)
                else None
            ),
        )

    def _results_path(self, test_id: str) -> Path:
        """Chemin du JSON d'un test (UUID uniquement)."""
        try:
            canonical = str(UUID(test_id))
        except ValueError as exc:
            raise TemplateABTestNotFoundError(f"Test {test_id} introuvable") from exc
        return self._storage_dir / canonical / "results.json"

    def _write_results(self, test_id: str, payload: Dict[str, Any]) -> None:
        """Écrit results.json de façon atomique."""
        directory = self._storage_dir / test_id
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / "results.json"
        tmp = directory / "results.json.tmp"
        tmp.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        tmp.replace(path)

    def _read_results(self, test_id: str) -> Dict[str, Any]:
        """Lit results.json.

        Raises:
            TemplateABTestNotFoundError: Fichier absent ou JSON invalide.
        """
        path = self._results_path(test_id)
        if not path.exists():
            raise TemplateABTestNotFoundError(f"Test {test_id} introuvable")
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise TemplateABTestNotFoundError(f"Test {test_id} introuvable") from exc
        if not isinstance(payload, dict):
            raise TemplateABTestNotFoundError(f"Test {test_id} introuvable")
        return payload

    def _history_item(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Vue liste d'un test."""
        totals = payload.get("totals") or {}
        side_a = totals.get("templateA") or {}
        side_b = totals.get("templateB") or {}
        return {
            "testId": payload.get("testId"),
            "status": payload.get("status"),
            "createdAt": payload.get("createdAt"),
            "templateAId": payload.get("templateAId"),
            "templateBId": payload.get("templateBId"),
            "templateAName": payload.get("templateAName"),
            "templateBName": payload.get("templateBName"),
            "winnerTemplateId": payload.get("winnerTemplateId"),
            "parentTestId": payload.get("parentTestId"),
            "meanScoreA": side_a.get("meanOverall"),
            "meanScoreB": side_b.get("meanOverall"),
        }

    def _compute_totals(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Agrège scores, coûts, durées et pouces par template."""
        return {
            "templateA": self._side_totals(
                payload.get("generations") or [],
                str(payload.get("templateAId")),
            ),
            "templateB": self._side_totals(
                payload.get("generations") or [],
                str(payload.get("templateBId")),
            ),
        }

    def _side_totals(
        self,
        generations: List[Dict[str, Any]],
        template_id: str,
    ) -> Dict[str, Any]:
        """Totaux d'un côté A ou B."""
        rows = [row for row in generations if row.get("templateId") == template_id]
        scores = [
            float(row["overallScore"])
            for row in rows
            if row.get("overallScore") is not None
        ]
        return {
            "meanOverall": round(sum(scores) / len(scores), 3) if scores else None,
            "scoredCount": len(scores),
            "totalCostEur": round(sum(float(row.get("costEur") or 0) for row in rows), 8),
            "totalDurationMs": int(sum(int(row.get("durationMs") or 0) for row in rows)),
            "thumbsUp": sum(1 for row in rows if row.get("thumb") == "up"),
            "thumbsDown": sum(1 for row in rows if row.get("thumb") == "down"),
        }

    def _winner_id(self, payload: Dict[str, Any]) -> Optional[str]:
        """Gagnant selon ``winnerMode`` (score, pouces, coût)."""
        totals = self._compute_totals(payload)
        side_a = totals["templateA"]
        side_b = totals["templateB"]
        mean_a = side_a["meanOverall"]
        mean_b = side_b["meanOverall"]
        mode = str(payload.get("winnerMode") or "score")
        if mode == "score_thumbs":
            net_a = int(side_a["thumbsUp"]) - int(side_a["thumbsDown"])
            net_b = int(side_b["thumbsUp"]) - int(side_b["thumbsDown"])
            if net_a != net_b:
                return (
                    str(payload["templateAId"])
                    if net_a > net_b
                    else str(payload["templateBId"])
                )
        if mode == "score_cost":
            cost_a = float(side_a["totalCostEur"] or 0)
            cost_b = float(side_b["totalCostEur"] or 0)
            if cost_a != cost_b:
                return (
                    str(payload["templateAId"])
                    if cost_a < cost_b
                    else str(payload["templateBId"])
                )
        if mean_a is None or mean_b is None:
            return None
        if mean_a > mean_b:
            return str(payload["templateAId"])
        if mean_b > mean_a:
            return str(payload["templateBId"])
        return None

    def _usage_usd(
        self,
        usage_service: Optional[LLMUsageService],
        started_at: datetime,
    ) -> float:
        """Somme USD des usages A/B depuis ``started_at`` (endpoint dédié)."""
        if usage_service is None:
            return 0.0
        today = date.today()
        try:
            records = usage_service.repository.get_by_date_range(today, today)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Lecture usage A/B impossible: %s", exc)
            return 0.0
        total = 0.0
        for record in records:
            if getattr(record, "endpoint", None) != AB_TEST_USAGE_ENDPOINT:
                continue
            stamp = getattr(record, "timestamp", None)
            if stamp is None:
                continue
            if stamp.tzinfo is None:
                stamp = stamp.replace(tzinfo=timezone.utc)
            if stamp >= started_at:
                total += float(getattr(record, "estimated_cost", 0.0) or 0.0)
        return total
