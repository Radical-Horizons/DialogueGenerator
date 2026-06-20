"""Service de journalisation métier des exports Unity (Story 5.6 / FR54).

Persiste les tentatives d'export réelles (succès et échec) dans
``data/logs/exports/YYYY-MM-DD.json`` — distinct des logs observabilité FastAPI.
"""
from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

from constants import FilePaths
from services.llm_usage_service import LLMUsageService
from services.unity_export_validation_service import validate_unity_export_document

logger = logging.getLogger(__name__)

ExportStatus = Literal["success", "failure"]
ValidationStatus = Literal["valid", "invalid", "skipped"]
ExportSource = Literal["graph", "library", "batch", "unity_export"]


@dataclass
class ExportLogListResult:
    """Résultat agrégé de consultation des logs export."""

    entries: List[Dict[str, Any]]
    total_count: int
    success_count: int
    failure_count: int


def _default_logs_dir() -> Path:
    """Répertoire dédié aux logs export métier."""
    return Path(__file__).resolve().parent.parent / FilePaths.LOGS_DIR / "exports"


def _read_daily_entries(log_file: Path) -> List[Dict[str, Any]]:
    """Lit un fichier journalier ; retourne liste vide si absent ou corrompu."""
    if not log_file.is_file():
        return []
    try:
        raw = log_file.read_text(encoding="utf-8").strip()
        if not raw:
            return []
        data = json.loads(raw)
        if not isinstance(data, list):
            logger.warning("Format invalide dans %s — ignoré", log_file)
            return []
        return [e for e in data if isinstance(e, dict)]
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Lecture logs export ignorée pour %s: %s", log_file, exc)
        return []


def _atomic_write_entries(log_file: Path, entries: List[Dict[str, Any]]) -> None:
    """Écrit atomiquement un tableau JSON (tmp → rename)."""
    log_file.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(entries, ensure_ascii=False, indent=2)
    tmp_path = log_file.with_suffix(".json.tmp")
    tmp_path.write_text(payload, encoding="utf-8")
    tmp_path.replace(log_file)


def build_export_log_metadata(
    *,
    dialogue_id: str,
    filename: str,
    export_status: ExportStatus,
    validation_status: ValidationStatus,
    file_size_bytes: Optional[int],
    errors: List[str],
    warnings_gdd: List[Dict[str, Any]],
    source: ExportSource,
    llm_usage_service: Optional[LLMUsageService] = None,
) -> Dict[str, Any]:
    """Construit le payload métadonnées d'une entrée log export (centralisé Task 1 refactor).

    Args:
        dialogue_id: Identifiant dialogue (stem sans ``.json``).
        filename: Nom de fichier exporté ou visé.
        export_status: ``success`` ou ``failure``.
        validation_status: ``valid``, ``invalid`` ou ``skipped``.
        file_size_bytes: Taille octets du JSON écrit, ou ``None`` si échec.
        errors: Messages d'erreur structurés.
        warnings_gdd: Avertissements validateur export non bloquants.
        source: Origine de l'export (graphe, bibliothèque, batch, API unity/export).
        llm_usage_service: Service coûts LLM pour snapshot ``cost_eur``.

    Returns:
        Dictionnaire prêt à persister.
    """
    cost_eur: Optional[float] = None
    if llm_usage_service is not None:
        costs = llm_usage_service.get_dialogue_costs(dialogue_id)
        if costs.get("node_count", 0) > 0:
            cost_eur = float(costs["total_cost_eur"])

    return {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now().astimezone().isoformat(),
        "dialogue_id": dialogue_id,
        "filename": filename if filename.endswith(".json") else f"{filename}.json",
        "export_status": export_status,
        "validation_status": validation_status,
        "cost_eur": cost_eur,
        "file_size_bytes": file_size_bytes,
        "errors": errors,
        "warnings_gdd": warnings_gdd,
        "source": source,
    }


def metadata_from_document(
    document: Dict[str, Any],
    *,
    dialogue_id: str,
    filename: str,
    export_status: ExportStatus,
    skip_validation: bool,
    formatted_json: Optional[str] = None,
    errors: Optional[List[str]] = None,
    source: ExportSource,
    llm_usage_service: Optional[LLMUsageService] = None,
) -> Dict[str, Any]:
    """Dérive métadonnées export depuis un document Unity et son état validation.

    Args:
        document: Document Unity canonique.
        dialogue_id: Identifiant dialogue.
        filename: Nom fichier cible.
        export_status: Succès ou échec de l'export.
        skip_validation: Si True, ``validation_status=skipped``.
        formatted_json: JSON sérialisé pour calcul taille (succès).
        errors: Erreurs explicites (échec).
        source: Origine export.
        llm_usage_service: Service coûts LLM injecté.

    Returns:
        Payload métadonnées prêt pour ``log_export``.
    """
    if skip_validation:
        validation_status: ValidationStatus = "skipped"
        warnings_gdd: List[Dict[str, Any]] = []
    else:
        result = validate_unity_export_document(document)
        validation_status = "valid" if export_status == "success" else "invalid"
        warnings_gdd = list(result.warnings)

    file_size: Optional[int] = None
    if formatted_json is not None:
        file_size = len(formatted_json.encode("utf-8"))
    elif export_status == "success":
        file_size = len(
            json.dumps(document, indent=2, ensure_ascii=False).encode("utf-8")
        )

    return build_export_log_metadata(
        dialogue_id=dialogue_id,
        filename=filename,
        export_status=export_status,
        validation_status=validation_status,
        file_size_bytes=file_size,
        errors=list(errors or []),
        warnings_gdd=warnings_gdd,
        source=source,
        llm_usage_service=llm_usage_service,
    )


class ExportLogService:
    """Persiste et consulte les logs métier d'export Unity."""

    def __init__(self, logs_dir: Optional[Path] = None) -> None:
        """Initialise le service avec répertoire logs optionnel (tests).

        Args:
            logs_dir: Chemin ``data/logs/exports`` ou override test.
        """
        self._logs_dir = logs_dir or _default_logs_dir()

    @property
    def logs_dir(self) -> Path:
        """Répertoire des fichiers journaliers export."""
        return self._logs_dir

    def log_export(self, entry: Dict[str, Any]) -> None:
        """Append une entrée au fichier journalier du jour.

        Args:
            entry: Payload métadonnées (voir ``build_export_log_metadata``).
        """
        day_key = date.today().isoformat()
        log_file = self._logs_dir / f"{day_key}.json"
        entries = _read_daily_entries(log_file)
        entries.append(entry)
        _atomic_write_entries(log_file, entries)
        logger.info(
            "Export log %s dialogue=%s file=%s",
            entry.get("export_status"),
            entry.get("dialogue_id"),
            entry.get("filename"),
        )

    def list_exports(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        status: Optional[ExportStatus] = None,
    ) -> ExportLogListResult:
        """Liste les entrées export sur une plage de dates, tri récent → ancien.

        Args:
            start_date: Date début inclusive (défaut : 30 jours).
            end_date: Date fin inclusive (défaut : aujourd'hui).
            status: Filtre ``success`` ou ``failure`` (omit = tous).

        Returns:
            Entrées filtrées et compteurs agrégés.
        """
        if end_date is None:
            end_date = date.today()
        if start_date is None:
            start_date = end_date - timedelta(days=30)

        if start_date > end_date:
            start_date, end_date = end_date, start_date

        collected: List[Dict[str, Any]] = []
        current = start_date
        while current <= end_date:
            log_file = self._logs_dir / f"{current.isoformat()}.json"
            collected.extend(_read_daily_entries(log_file))
            current += timedelta(days=1)

        if status is not None:
            collected = [e for e in collected if e.get("export_status") == status]

        collected.sort(key=lambda e: str(e.get("timestamp", "")), reverse=True)

        success_count = sum(1 for e in collected if e.get("export_status") == "success")
        failure_count = sum(1 for e in collected if e.get("export_status") == "failure")

        return ExportLogListResult(
            entries=collected,
            total_count=len(collected),
            success_count=success_count,
            failure_count=failure_count,
        )
