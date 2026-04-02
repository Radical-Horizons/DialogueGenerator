"""Factory pour ``LLMUsageService`` sans dépendre de ``api.dependencies``.

Évite le cycle d'import ``api.container`` ↔ ``api.dependencies`` (le container
appelle cette factory au lieu d'importer ``dependencies``).
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

from constants import FilePaths
from services.cost_governance_service import CostGovernanceService
from services.llm_usage_service import LLMUsageService
from services.repositories.cost_budget_repository import FileCostBudgetRepository
from services.repositories.llm_usage_repository import FileLLMUsageRepository

logger = logging.getLogger(__name__)

_PROJECT_ROOT = Path(__file__).resolve().parent.parent


def create_llm_usage_service() -> LLMUsageService:
    """Instancie le service d'utilisation LLM avec repositories fichier et cost governance.

    Returns:
        Instance configurée pour persistance sous ``data/`` et mise à jour du budget.
    """
    storage_dir = str(_PROJECT_ROOT / FilePaths.LLM_USAGE_DIR)
    os.makedirs(storage_dir, exist_ok=True)
    repository = FileLLMUsageRepository(storage_dir=storage_dir)

    cost_storage_file = str(_PROJECT_ROOT / FilePaths.COST_BUDGETS_FILE)
    cost_repository = FileCostBudgetRepository(storage_file=cost_storage_file)
    cost_service = CostGovernanceService(repository=cost_repository)

    svc = LLMUsageService(
        repository=repository,
        cost_governance_service=cost_service,
    )
    logger.debug("LLMUsageService créé via llm_usage_factory.")
    return svc
