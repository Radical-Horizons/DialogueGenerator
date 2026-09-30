"""La suite pytest ne touche ni aux services facturés ni à l'état local du poste.

Régression (sept. 2026) : sur un poste où `OPENAI_API_KEY` / `NOTION_API_KEY` sont des
variables d'environnement utilisateur, un test « DummyLLM » facturait un vrai appel
OpenAI, un test de sync réécrivait `data/notion_cache/`, et chaque run incrémentait le
budget LLM réel, remplissait l'historique de vraies fiches GDD et l'historique des
exports Unity, et versait ~30 000 entrées de test dans `data/logs/`.
"""
import logging
import os
from pathlib import Path

from api.llm_usage_factory import create_llm_usage_service
from core.context.context_builder import PROJECT_ROOT_DIR
from services.export_log_service import _default_logs_dir
from services.gdd_entity_history import entity_history_path
from services.gdd_notion_sync_log import get_gdd_notion_sync_logger

REPO_DATA_DIR = Path(PROJECT_ROOT_DIR).resolve() / "data"


def _is_under(path: Path, root: Path) -> bool:
    """Indique si ``path`` se trouve sous ``root``."""
    return path.resolve().is_relative_to(root)


def test_external_service_keys_are_not_inherited() -> None:
    """Aucune clé de service distant n'atteint le code testé, quelle que soit la machine."""
    # Liste de noms, jamais de valeurs : l'introspection d'assertion de pytest imprimerait
    # la clé en clair dans la sortie en cas d'échec.
    inherited = [
        name
        for name in ("OPENAI_API_KEY", "MISTRAL_API_KEY", "OPENROUTER_API_KEY", "NOTION_API_KEY")
        if name in os.environ
    ]
    assert inherited == []


def test_llm_usage_and_budget_are_written_outside_the_repository() -> None:
    """Le registre d'usage et le budget mensuel du service d'usage LLM restent hors de ``data/``."""
    service = create_llm_usage_service()

    assert not _is_under(service.repository.storage_dir, REPO_DATA_DIR)
    budget_file = service.cost_governance_service.repository.storage_file
    assert not _is_under(budget_file, REPO_DATA_DIR)


def test_entity_history_is_written_outside_the_repository() -> None:
    """L'historique d'entité GDD visé depuis la racine du dépôt atterrit hors de ``data/``."""
    path = entity_history_path(Path(PROJECT_ROOT_DIR), "personnages", "Héros Test")

    assert not _is_under(path, REPO_DATA_DIR)


def test_logs_are_written_outside_the_repository() -> None:
    """Les logs fichier de la suite ne se mêlent pas à ceux de l'app dans ``data/logs/``."""
    assert not _is_under(Path(os.environ["LOG_DIR"]), REPO_DATA_DIR)

    sync_files = [
        Path(h.baseFilename)
        for h in get_gdd_notion_sync_logger().handlers
        if isinstance(h, logging.FileHandler)
    ]
    assert sync_files, "journal de sync Notion sans fichier"
    assert not any(_is_under(p, REPO_DATA_DIR) for p in sync_files)
    # Journal métier des exports Unity : l'historique d'exports affiché dans l'app.
    assert not _is_under(_default_logs_dir(), REPO_DATA_DIR)
