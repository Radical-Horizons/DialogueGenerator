"""Service de tracking de l'utilisation des LLM."""
import logging
import time
from dataclasses import dataclass
from datetime import date, datetime, UTC
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple
from uuid import uuid4

from models.llm_usage import LLMUsageRecord
from services.llm_call_provenance import report_llm_call
from services.llm_pricing_service import LLMPricingService
from services.repositories.llm_usage_repository import ILLMUsageRepository

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class NodeGenerationLookup:
    """Record de génération d'un nœud, et fiabilité de son lien au nœud."""

    record: Optional[LLMUsageRecord]
    legacy_ambiguous: bool = False
    """Record antérieur à ``call_id`` dont la requête a fait d'autres appels : l'ancien
    ``update()`` a pu y recopier l'appel d'un nœud voisin, le lien n'est pas fiable."""


def _aware(moment: datetime) -> datetime:
    """Rend comparables les horodatages anciens (naïfs) et récents (UTC)."""
    return moment if moment.tzinfo is not None else moment.replace(tzinfo=UTC)


class LLMUsageService:
    """Service principal pour le tracking de l'utilisation LLM.
    
    Gère l'enregistrement des appels LLM et le calcul des statistiques.
    Met à jour automatiquement le budget si CostGovernanceService est fourni.
    """
    
    def __init__(
        self,
        repository: ILLMUsageRepository,
        pricing_service: Optional[LLMPricingService] = None,
        cost_governance_service: Optional[Any] = None  # CostGovernanceService (éviter import circulaire)
    ):
        """Initialise le service de tracking.
        
        Args:
            repository: Repository pour stocker les enregistrements.
            pricing_service: Service de calcul des prix. Si None, en crée un nouveau.
            cost_governance_service: Service de cost governance (optionnel). Si fourni,
                                    met à jour le budget après chaque track_usage.
        """
        self.repository = repository
        self.pricing_service = pricing_service or LLMPricingService()
        self.cost_governance_service = cost_governance_service
        logger.info("LLMUsageService initialisé")
    
    def track_usage(
        self,
        request_id: str,
        model_name: str,
        prompt_tokens: int,
        completion_tokens: int,
        total_tokens: int,
        duration_ms: int,
        success: bool,
        endpoint: str,
        k_variants: int = 1,
        error_message: Optional[str] = None,
        dialogue_id: Optional[str] = None,
        node_id: Optional[str] = None,
        prompt: Optional[str] = None,
        response: Optional[str] = None,
        fallback_from: Optional[str] = None,
        fallback_reason: Optional[str] = None,
        cached_tokens: int = 0,
        cache_write_tokens: int = 0,
    ) -> Optional[str]:
        """Enregistre un appel LLM sous un ``call_id`` unique.

        Un appel réussi est signalé à la capture de provenance en cours
        (:func:`services.llm_call_provenance.report_llm_call`), pour que le nœud qu'il
        produit puisse être annoté sur ce record précis.
        
        Args:
            request_id: ID de la requête API.
            model_name: Nom du modèle utilisé.
            prompt_tokens: Nombre de tokens dans le prompt.
            completion_tokens: Nombre de tokens dans la réponse.
            total_tokens: Nombre total de tokens.
            duration_ms: Durée de l'appel en millisecondes.
            success: Indique si l'appel a réussi.
            endpoint: Endpoint appelé.
            k_variants: Nombre de variantes générées.
            error_message: Message d'erreur si success=False.
            dialogue_id: ID du dialogue associé (optionnel).
            node_id: ID du nœud généré associé (optionnel).
            prompt: Prompt complet envoyé au LLM (optionnel, Story 1.15).
            response: Réponse brute du LLM (optionnel, Story 1.15).
            fallback_from: model_id du provider initial en échec (optionnel, Story 1.16).
            fallback_reason: Raison de l'échec du provider initial (optionnel, Story 1.16).
            cached_tokens: Part de ``prompt_tokens`` relue depuis le cache du fournisseur.
            cache_write_tokens: Part de ``prompt_tokens`` écrite dans ce cache.

        Returns:
            Le ``call_id`` du record persisté, ou None si l'enregistrement a échoué.
        """
        try:
            from api.middleware.billable_user_context import get_billable_user_id

            billable_uid = get_billable_user_id()
            # Calculer le coût estimé (0€ pour génération échouée, Story 1.15 AC#5)
            if success:
                estimated_cost = self.pricing_service.calculate_cost(
                    model_name=model_name,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    cached_tokens=cached_tokens,
                    cache_write_tokens=cache_write_tokens,
                )
            else:
                estimated_cost = 0.0
            
            call_id = uuid4().hex
            record = LLMUsageRecord(
                request_id=request_id,
                call_id=call_id,
                timestamp=datetime.now(UTC),
                model_name=model_name,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
                cached_tokens=cached_tokens,
                cache_write_tokens=cache_write_tokens,
                estimated_cost=estimated_cost,
                duration_ms=duration_ms,
                success=success,
                endpoint=endpoint,
                k_variants=k_variants,
                error_message=error_message,
                dialogue_id=dialogue_id,
                node_id=node_id,
                prompt=prompt,
                response=response,
                fallback_from=fallback_from,
                fallback_reason=fallback_reason,
                billable_user_id=billable_uid,
            )
            
            # Sauvegarder
            self.repository.save(record)
            if success:
                report_llm_call(call_id)
            
            # Mettre à jour le budget si le service de cost governance est disponible
            if self.cost_governance_service and success:
                try:
                    self.cost_governance_service.update_budget(
                        user_id=billable_uid,
                        cost=estimated_cost
                    )
                    logger.debug(f"Budget mis à jour: +${estimated_cost:.6f}")
                except Exception as budget_error:
                    # Ne pas faire échouer le tracking si la mise à jour du budget échoue
                    logger.warning(f"Erreur lors de la mise à jour du budget: {budget_error}", exc_info=True)
            
            logger.debug(
                f"Usage LLM enregistré: {model_name}, "
                f"{total_tokens} tokens, ${estimated_cost:.6f}, "
                f"{duration_ms}ms, success={success}"
            )
            return call_id
        except Exception as e:
            # Ne pas faire échouer l'appel LLM si le tracking échoue
            logger.error(f"Erreur lors de l'enregistrement de l'usage LLM: {e}", exc_info=True)
            return None
    
    def get_usage_history(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        model_name: Optional[str] = None,
        limit: Optional[int] = None,
        billable_user_id: Optional[str] = None,
    ) -> List[LLMUsageRecord]:
        """Récupère l'historique d'utilisation avec filtres.
        
        Args:
            start_date: Date de début (optionnel).
            end_date: Date de fin (optionnel).
            model_name: Filtrer par modèle (optionnel).
            limit: Limiter le nombre de résultats (optionnel).
            billable_user_id: Si défini, ne retient que les enregistrements de cet utilisateur.
            
        Returns:
            Liste des enregistrements correspondants, triés par timestamp décroissant.
        """
        if start_date and end_date:
            records = self.repository.get_by_date_range(
                start_date=start_date,
                end_date=end_date,
                model_name=model_name
            )
        else:
            records = self.repository.get_all(model_name=model_name)

        if billable_user_id is not None:
            records = [
                r for r in records
                if getattr(r, "billable_user_id", None) == billable_user_id
            ]
        
        # Appliquer la limite si demandée
        if limit:
            records = records[:limit]
        
        return records
    
    def annotate_call(
        self,
        call_id: str,
        dialogue_id: str,
        node_id: str,
        template_id: Optional[str] = None,
        template_name: Optional[str] = None,
    ) -> None:
        """Annote post-hoc le record d'un appel LLM avec le dialogue et le nœud qu'il a produit.

        Le record est désigné par son ``call_id`` : les autres appels de la même requête
        restent intacts. Record introuvable : warning, sans lever d'exception.

        Args:
            call_id: Identifiant de l'appel LLM déjà tracké.
            dialogue_id: ID du dialogue à associer.
            node_id: ID du nœud généré à associer.
            template_id: Template appliqué (UUID ou slug), optionnel.
            template_name: Nom snapshoté du template, optionnel.
        """
        self.annotate_calls(
            [(call_id, node_id)],
            dialogue_id,
            template_id=template_id,
            template_name=template_name,
        )

    def annotate_calls(
        self,
        annotations: Sequence[Tuple[str, str]],
        dialogue_id: str,
        template_id: Optional[str] = None,
        template_name: Optional[str] = None,
    ) -> List[str]:
        """Annote plusieurs appels en lot : un parcours de lecture, une écriture par fichier du jour.

        Args:
            annotations: Paires ``(call_id, node_id)``.
            dialogue_id: ID du dialogue à associer.
            template_id: Template appliqué (UUID ou slug), optionnel.
            template_name: Nom snapshoté du template, optionnel.

        Returns:
            Les ``call_id`` retrouvés et soumis à l'écriture, dans l'ordre reçu.
        """
        if not annotations:
            return []
        try:
            records = self.repository.get_by_call_ids([call_id for call_id, _ in annotations])
            annotated: List[str] = []
            to_update: List[LLMUsageRecord] = []
            for call_id, node_id in annotations:
                record = records.get(call_id)
                if record is None:
                    logger.warning(
                        f"annotate_calls: record introuvable pour call_id='{call_id}', no-op."
                    )
                    continue
                record.dialogue_id = dialogue_id
                record.node_id = node_id
                if template_id is not None:
                    record.template_id = template_id
                    record.template_name = template_name
                to_update.append(record)
                annotated.append(call_id)
            self.repository.update_many(to_update)
            logger.debug(
                "annotate_calls: %d appel(s) annoté(s) → dialogue='%s', template='%s'",
                len(annotated),
                dialogue_id,
                template_id,
            )
            return annotated
        except Exception as e:
            logger.error(
                f"annotate_calls: erreur pour dialogue='{dialogue_id}': {e}",
                exc_info=True,
            )
            return []

    def find_node_generation_record(
        self,
        dialogue_ids: Iterable[str],
        node_id: str,
    ) -> NodeGenerationLookup:
        """Record de génération le plus récent d'un nœud, en un seul parcours de l'historique.

        Args:
            dialogue_ids: Formes acceptées de l'identifiant du dialogue (``D`` et ``D.json``).
            node_id: Nœud généré.

        Returns:
            Le record retenu (ou None) et l'indication d'un lien legacy peu fiable.
        """
        accepted = set(dialogue_ids)
        records = self.repository.get_all()
        candidates = [
            r
            for r in records
            if r.dialogue_id in accepted and r.node_id == node_id and not r.deleted
        ]
        if not candidates:
            return NodeGenerationLookup(record=None)
        chosen = max(candidates, key=lambda r: _aware(r.timestamp))
        legacy_ambiguous = chosen.call_id is None and any(
            r is not chosen and r.request_id == chosen.request_id for r in records
        )
        return NodeGenerationLookup(record=chosen, legacy_ambiguous=legacy_ambiguous)

    _USD_TO_EUR_RATE: float = 0.92

    def mark_node_deleted(self, node_id: str) -> bool:
        """Marque un nœud comme supprimé dans l'historique des coûts.
        
        Retrouve le record correspondant par node_id et passe deleted=True.
        Si le record n'est pas trouvé, log un warning sans lever d'exception.
        
        Args:
            node_id: ID du nœud supprimé du graphe.
            
        Returns:
            True si le record a été trouvé et mis à jour, False sinon.
        """
        try:
            found = self.repository.mark_node_deleted(node_id)
            if not found:
                logger.warning(
                    f"mark_node_deleted: aucun record trouvé pour node_id='{node_id}', no-op."
                )
            else:
                logger.debug(f"mark_node_deleted: node_id='{node_id}' marqué comme supprimé.")
            return found
        except Exception as e:
            logger.error(
                f"mark_node_deleted: erreur pour node_id='{node_id}': {e}", exc_info=True
            )
            return False

    def get_all_dialogues_costs(self) -> List[Dict]:
        """Agrège les coûts LLM pour tous les dialogues, triés par coût décroissant.
        
        Retourne une liste de résumés de coûts par dialogue, utile pour la
        comparaison multi-dialogues (AC#3).
        
        Returns:
            Liste de dictionnaires triés par total_cost_eur décroissant, chacun avec :
            - dialogue_id: str
            - total_cost_eur: float
            - node_count: int
            - avg_cost_per_node_eur: float
        """
        grouped = self.repository.get_all_by_dialogue_ids()
        summaries = []
        for dialogue_id, records in grouped.items():
            total_cost_eur = round(
                sum(r.estimated_cost for r in records) * self._USD_TO_EUR_RATE, 8
            )
            node_count = len(records)
            avg_cost_per_node_eur = round(total_cost_eur / node_count, 8) if node_count > 0 else 0.0
            summaries.append({
                "dialogue_id": dialogue_id,
                "total_cost_eur": total_cost_eur,
                "node_count": node_count,
                "avg_cost_per_node_eur": avg_cost_per_node_eur,
            })
        summaries.sort(key=lambda s: s["total_cost_eur"], reverse=True)
        return summaries

    def get_dialogue_costs(self, dialogue_id: str) -> Dict:
        """Agrège les coûts LLM pour un dialogue donné.
        
        Retourne le coût total, le nombre de nœuds, le coût moyen et le
        détail par nœud, avec conversion USD → EUR.
        
        Args:
            dialogue_id: ID du dialogue.
            
        Returns:
            Dictionnaire avec :
            - dialogue_id: str
            - total_cost_eur: float
            - node_count: int
            - avg_cost_per_node_eur: float
            - breakdown: list[dict] (NodeCostEntry)
        """
        records = self.repository.get_by_dialogue_id(dialogue_id)
        
        if not records:
            return {
                "dialogue_id": dialogue_id,
                "total_cost_eur": 0.0,
                "node_count": 0,
                "avg_cost_per_node_eur": 0.0,
                "breakdown": [],
            }
        
        breakdown = [
            {
                "node_id": r.node_id,
                "timestamp": r.timestamp.isoformat(),
                "model_name": r.model_name,
                "prompt_tokens": r.prompt_tokens,
                "completion_tokens": r.completion_tokens,
                "cost_eur": round(r.estimated_cost * self._USD_TO_EUR_RATE, 8),
                "success": r.success,
                "deleted": r.deleted,
                "fallback_from": r.fallback_from,
                "fallback_reason": r.fallback_reason,
            }
            for r in records
        ]
        
        total_cost_eur = round(
            sum(r.estimated_cost for r in records) * self._USD_TO_EUR_RATE, 8
        )
        node_count = len(records)
        avg_cost_per_node_eur = round(total_cost_eur / node_count, 8) if node_count > 0 else 0.0
        
        return {
            "dialogue_id": dialogue_id,
            "total_cost_eur": total_cost_eur,
            "node_count": node_count,
            "avg_cost_per_node_eur": avg_cost_per_node_eur,
            "breakdown": breakdown,
        }

    def get_generation_logs(
        self,
        dialogue_id: str,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        model_name: Optional[str] = None,
    ) -> Dict:
        """Récupère les logs de génération pour un dialogue (Story 1.15).
        
        Args:
            dialogue_id: ID du dialogue.
            start_date: Filtre date de début (optionnel).
            end_date: Filtre date de fin (optionnel).
            model_name: Filtre par modèle / provider (optionnel).
            
        Returns:
            Dictionnaire avec entries (liste triée par timestamp décroissant),
            total_count, total_cost_eur.
        """
        records = self.repository.get_by_dialogue_id(dialogue_id)
        if start_date is not None or end_date is not None:
            records = [
                r for r in records
                if (start_date is None or r.timestamp.date() >= start_date)
                and (end_date is None or r.timestamp.date() <= end_date)
            ]
        if model_name is not None and model_name.strip():
            records = [r for r in records if r.model_name == model_name.strip()]
        records = sorted(records, key=lambda r: r.timestamp, reverse=True)
        total_cost_eur = round(
            sum(r.estimated_cost for r in records) * self._USD_TO_EUR_RATE, 8
        )
        entries = [
            {
                "request_id": r.request_id,
                "timestamp": r.timestamp,
                "node_id": r.node_id,
                "model_name": r.model_name,
                "prompt_tokens": r.prompt_tokens,
                "completion_tokens": r.completion_tokens,
                "total_tokens": r.total_tokens,
                "estimated_cost": r.estimated_cost,
                "cost_eur": round(r.estimated_cost * self._USD_TO_EUR_RATE, 8),
                "duration_ms": r.duration_ms,
                "success": r.success,
                "error_message": r.error_message,
                "prompt": r.prompt,
                "response": r.response,
                "fallback_from": r.fallback_from,
                "fallback_reason": r.fallback_reason,
                "template_id": getattr(r, "template_id", None),
                "template_name": getattr(r, "template_name", None),
            }
            for r in records
        ]
        return {
            "entries": entries,
            "total_count": len(entries),
            "total_cost_eur": total_cost_eur,
        }

    def get_statistics(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        model_name: Optional[str] = None
    ) -> Dict:
        """Calcule des statistiques agrégées.
        
        Args:
            start_date: Date de début (optionnel).
            end_date: Date de fin (optionnel).
            model_name: Filtrer par modèle (optionnel).
            
        Returns:
            Dictionnaire avec les statistiques agrégées.
        """
        return self.repository.get_statistics(
            start_date=start_date,
            end_date=end_date,
            model_name=model_name
        )

    def get_record_for_dialogue_node(
        self,
        dialogue_id: str,
        node_id: str,
    ) -> Optional[LLMUsageRecord]:
        """Retourne l’enregistrement d’usage LLM pour un couple dialogue / nœud."""
        return self.repository.get_by_dialogue_and_node(dialogue_id, node_id)

    def get_record_by_call_id(self, call_id: str) -> Optional[LLMUsageRecord]:
        """Retourne le record d'un appel LLM précis, ou None.

        Args:
            call_id: Identifiant unique de l'appel.
        """
        return self.repository.get_by_call_id(call_id)

    def compute_and_persist_context_relevance(self, call_id: str) -> None:
        """Calcule pertinence + usage par section et met à jour l’enregistrement (3.6 / 3.7).

        Ne lève pas d’exception vers l’appelant : les erreurs sont loguées uniquement.

        Args:
            call_id: Identifiant de l'appel LLM déjà persisté.
        """
        self.compute_and_persist_context_relevance_many([call_id])

    def compute_and_persist_context_relevance_many(self, call_ids: Sequence[str]) -> None:
        """Pertinence + usage par section pour plusieurs appels, persistés en lot.

        Ne lève pas d’exception vers l’appelant : les erreurs sont loguées uniquement.

        Args:
            call_ids: Identifiants des appels LLM déjà persistés.
        """
        from services.context_relevance_scoring import compute_context_relevance_result
        from services.context_section_usage_scoring import (
            compute_context_section_usage_result,
        )

        if not call_ids:
            return
        try:
            records = self.repository.get_by_call_ids(call_ids)
            to_update: List[LLMUsageRecord] = []
            for call_id in call_ids:
                record = records.get(call_id)
                if record is None or not record.success:
                    continue
                if not record.prompt or not record.response:
                    continue
                record.context_relevance = compute_context_relevance_result(
                    record.prompt, record.response, request_id=record.request_id
                )
                record.context_section_usage = compute_context_section_usage_result(
                    record.prompt, record.response, request_id=record.request_id
                )
                to_update.append(record)
            self.repository.update_many(to_update)
        except Exception as e:
            logger.error(
                "compute_and_persist_context_relevance: échec pour call_ids=%s: %s",
                list(call_ids),
                e,
                exc_info=True,
            )

    def get_context_relevance_for_node(
        self,
        dialogue_id: str,
        node_id: str,
    ) -> Optional[Dict[str, Any]]:
        """Retourne le rapport de pertinence pour un nœud (lazy-compute si absent).

        Args:
            dialogue_id: Identifiant dialogue (fichier).
            node_id: Identifiant nœud Unity.

        Returns:
            Dict rapport ou None si aucun enregistrement exploitable.
        """
        from services.context_relevance_scoring import compute_context_relevance_result

        record = self.get_record_for_dialogue_node(dialogue_id, node_id)
        if record is None:
            return None
        if record.context_relevance is not None:
            return dict(record.context_relevance)
        if record.prompt and record.response and record.success:
            relevance = compute_context_relevance_result(
                record.prompt, record.response, request_id=record.request_id
            )
            record.context_relevance = relevance
            if record.context_section_usage is None:
                from services.context_section_usage_scoring import (
                    compute_context_section_usage_result,
                )

                record.context_section_usage = compute_context_section_usage_result(
                    record.prompt, record.response, request_id=record.request_id
                )
            self.repository.update(record)
            return relevance
        return None

    def get_context_section_usage_for_node(
        self,
        dialogue_id: str,
        node_id: str,
    ) -> Optional[Dict[str, Any]]:
        """Retourne le rapport d’usage par section GDD pour un nœud (lazy-compute si absent).

        Args:
            dialogue_id: Identifiant dialogue (fichier).
            node_id: Identifiant nœud Unity.

        Returns:
            Dict rapport ou None si aucun enregistrement exploitable.
        """
        from services.context_section_usage_scoring import (
            compute_context_section_usage_result,
        )

        record = self.get_record_for_dialogue_node(dialogue_id, node_id)
        if record is None:
            return None
        if record.context_section_usage is not None:
            return dict(record.context_section_usage)
        if record.prompt and record.response and record.success:
            usage = compute_context_section_usage_result(
                record.prompt, record.response, request_id=record.request_id
            )
            record.context_section_usage = usage
            if record.context_relevance is None:
                from services.context_relevance_scoring import (
                    compute_context_relevance_result,
                )

                record.context_relevance = compute_context_relevance_result(
                    record.prompt, record.response, request_id=record.request_id
                )
            self.repository.update(record)
            return usage
        return None

    def list_context_relevance_history(self, dialogue_id: str) -> List[Dict[str, Any]]:
        """Liste les mesures de pertinence persistées pour un dialogue, ordre chronologique.

        Args:
            dialogue_id: Identifiant dialogue.

        Returns:
            Liste d’entrées simplifiées (request_id, node_id, timestamp, score, …).
        """
        records = self.repository.get_by_dialogue_id(dialogue_id)
        out: List[Dict[str, Any]] = []
        for r in records:
            if not r.success or not r.node_id or r.context_relevance is None:
                continue
            rel = r.context_relevance
            out.append(
                {
                    "request_id": r.request_id,
                    "node_id": r.node_id,
                    "timestamp": r.timestamp,
                    "score_percent": float(rel.get("score_percent", 0.0)),
                    "low_context_warning": bool(rel.get("low_context_warning", False)),
                    "breakdown_by_type": dict(rel.get("breakdown_by_type", {})),
                }
            )
        out.sort(key=lambda x: x["timestamp"])
        return out

