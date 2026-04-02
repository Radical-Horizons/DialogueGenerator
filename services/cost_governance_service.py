"""Service de gouvernance des coûts LLM."""
import logging
from datetime import datetime
from typing import Any, Dict, Optional

from services.repositories.cost_budget_repository import ICostBudgetRepository

logger = logging.getLogger(__name__)


class CostGovernanceService:
    """Service pour gérer les budgets LLM et vérifier les limites.
    
    Gère les soft warnings (90%) et hard blocks (100%) pour protéger
    contre les dépassements de budget.
    """
    
    def __init__(self, repository: ICostBudgetRepository):
        """Initialise le service de cost governance.
        
        Args:
            repository: Repository pour stocker et récupérer les budgets.
        """
        self.repository = repository
        logger.info("CostGovernanceService initialisé")
    
    def check_budget(
        self,
        user_id: str,
        estimated_cost: float
    ) -> Dict[str, Any]:
        """Vérifie si le budget permet une génération.
        
        Args:
            user_id: ID de l'utilisateur.
            estimated_cost: Coût estimé de la génération.
            
        Returns:
            Dictionnaire avec:
            - allowed: bool - True si génération autorisée, False si bloquée
            - percentage: float - Pourcentage du budget utilisé (0-100+)
            - warning: Optional[str] - Message d'avertissement si applicable
        """
        current_month = datetime.now().strftime("%Y-%m")
        
        # Récupérer le budget actuel
        budget = self.repository.get_budget(user_id, current_month)
        
        # Si pas de budget, créer un budget par défaut (quota = 0 → illimité jusqu'à définition d'un quota > 0)
        if budget is None:
            budget = {
                "month": current_month,
                "amount": 0.0,
                "quota": 0.0,
                "updated_at": datetime.now().isoformat()
            }
            self.repository.update_budget(user_id, current_month, 0.0, 0.0)
        
        # Vérifier reset mensuel
        if budget.get("month") != current_month:
            quota = budget.get("quota", 0.0)  # Préserver le quota
            self.repository.reset_month(user_id, current_month)
            # Sauvegarder le budget reseté
            self.repository.update_budget(user_id, current_month, 0.0, quota)
            budget = {
                "month": current_month,
                "amount": 0.0,
                "quota": quota,
                "updated_at": datetime.now().isoformat()
            }
        
        quota = budget.get("quota", 0.0)
        amount = budget.get("amount", 0.0)

        # Quota <= 0 : pas de plafond mensuel (illimité pour l'usage courant)
        if quota <= 0.0:
            return {"allowed": True, "percentage": 0.0, "warning": None}

        # Calculer le nouveau montant après génération
        new_amount = amount + estimated_cost

        percentage = (new_amount / quota) * 100.0
        
        # Hard block à 100%
        if new_amount >= quota and quota > 0:
            return {
                "allowed": False,
                "percentage": percentage,
                "warning": f"Budget dépassé ({percentage:.1f}%) - Veuillez augmenter le budget ou attendre le prochain mois"
            }
        
        # Soft warning à 90%
        if percentage >= 90.0 and quota > 0:
            remaining = quota - new_amount
            return {
                "allowed": True,
                "percentage": percentage,
                "warning": f"Budget atteint à {percentage:.1f}% — {remaining:.2f} USD restants"
            }
        
        # Pas de warning
        return {
            "allowed": True,
            "percentage": percentage,
            "warning": None
        }
    
    def get_budget_status(self, user_id: str) -> Dict[str, Any]:
        """Récupère le statut du budget actuel.
        
        Args:
            user_id: ID de l'utilisateur.
            
        Returns:
            Dictionnaire avec: quota, amount, percentage, remaining
        """
        current_month = datetime.now().strftime("%Y-%m")
        budget = self.repository.get_budget(user_id, current_month)
        
        # Si pas de budget, retourner valeurs par défaut
        if budget is None:
            return {
                "quota": 0.0,
                "amount": 0.0,
                "percentage": 0.0,
                "remaining": 0.0
            }
        
        # Vérifier reset mensuel
        if budget.get("month") != current_month:
            quota = budget.get("quota", 0.0)  # Préserver le quota
            self.repository.reset_month(user_id, current_month)
            # Sauvegarder le budget reseté
            self.repository.update_budget(user_id, current_month, 0.0, quota)
            budget = {
                "month": current_month,
                "amount": 0.0,
                "quota": quota,
                "updated_at": datetime.now().isoformat()
            }
        
        quota = budget.get("quota", 0.0)
        amount = budget.get("amount", 0.0)
        
        if quota == 0.0:
            percentage = 0.0
        else:
            percentage = min(100.0, (amount / quota) * 100.0)
        
        remaining = max(0.0, quota - amount)
        
        return {
            "quota": quota,
            "amount": amount,
            "percentage": percentage,
            "remaining": remaining
        }
    
    def update_budget(self, user_id: str, cost: float) -> None:
        """Met à jour le budget après une génération.
        
        Args:
            user_id: ID de l'utilisateur.
            cost: Coût réel de la génération.
        """
        current_month = datetime.now().strftime("%Y-%m")
        # Mise à jour atomique si disponible (thread-safe)
        if hasattr(self.repository, "add_cost"):
            try:
                # quota: si existant, sera préservé par le repository
                new_amount = self.repository.add_cost(user_id, current_month, cost, quota=0.0)  # type: ignore[attr-defined]
                logger.debug(f"Budget mis à jour (atomique) pour {user_id}: {new_amount:.2f} USD")
                return
            except Exception:
                # Fallback sur l'ancienne logique si le repository ne supporte pas correctement add_cost
                logger.exception("Fallback update_budget: add_cost a échoué")

        budget = self.repository.get_budget(user_id, current_month)

        # Si pas de budget, créer un budget par défaut
        if budget is None:
            quota = 0.0
            amount = cost
        else:
            # Vérifier reset mensuel
            if budget.get("month") != current_month:
                self.repository.reset_month(user_id, current_month)
                quota = budget.get("quota", 0.0)
                amount = cost
            else:
                quota = budget.get("quota", 0.0)
                amount = budget.get("amount", 0.0) + cost

        self.repository.update_budget(user_id, current_month, amount, quota)
        logger.debug(f"Budget mis à jour pour {user_id}: {amount:.2f} / {quota:.2f} USD")
    
    def update_quota(self, user_id: str, new_quota: float) -> None:
        """Met à jour le quota mensuel.
        
        Args:
            user_id: ID de l'utilisateur.
            new_quota: Nouveau quota mensuel.
        """
        current_month = datetime.now().strftime("%Y-%m")
        budget = self.repository.get_budget(user_id, current_month)
        
        # Si pas de budget, créer un nouveau budget avec le quota
        if budget is None:
            amount = 0.0
        else:
            # Vérifier reset mensuel
            if budget.get("month") != current_month:
                self.repository.reset_month(user_id, current_month)
                amount = 0.0
            else:
                amount = budget.get("amount", 0.0)
        
        self.repository.update_budget(user_id, current_month, amount, new_quota)
        logger.debug(f"Quota mis à jour pour {user_id}: {new_quota:.2f} USD")
