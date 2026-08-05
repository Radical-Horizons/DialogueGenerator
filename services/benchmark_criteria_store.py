"""Magasin des grilles de critères du benchmark (donnée versionnée, pas code).

Une grille par fichier sous `data/benchmarks/criteria/`. La grille de départ est
semée au premier accès si le répertoire est vide, de sorte qu'un poste neuf puisse
juger sans configuration préalable — mais elle reste modifiable comme n'importe
quelle autre donnée.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from pydantic import ValidationError

from api.schemas.benchmark_judging import CriteriaGrid, CriteriaGridSummary
from services.benchmark_criteria_seed import DEFAULT_GRID_ID, default_grid_payload
from services.gdd_notion_atomic_io import read_json_file, write_json_atomic

logger = logging.getLogger(__name__)

_GRID_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")

_SEED_MARKER_NAME = ".seeded"
"""Marqueur d'amorçage : l'absence de grille ne suffit pas à décider de semer."""

_WINDOWS_RESERVED_NAMES = frozenset(
    {"CON", "PRN", "AUX", "NUL"}
    | {f"COM{index}" for index in range(1, 10)}
    | {f"LPT{index}" for index in range(1, 10)}
)
"""``NUL.json`` **est** le périphérique nul : l'écriture serait avalée sans erreur."""


class CriteriaGridNotFoundError(LookupError):
    """La grille demandée n'existe pas."""


class CriteriaGridInvalidError(ValueError):
    """La grille fournie ou lue est structurellement invalide."""


class BenchmarkCriteriaStore:
    """Lecture, écriture et amorçage des grilles de critères."""

    def __init__(self, criteria_dir: Path) -> None:
        """Initialise le magasin.

        Args:
            criteria_dir: Répertoire des grilles (résolu depuis `FilePaths`).
        """
        self._criteria_dir = Path(criteria_dir)

    @property
    def criteria_dir(self) -> Path:
        """Répertoire des grilles."""
        return self._criteria_dir

    def _path_for(self, grid_id: str) -> Path:
        """Résout le chemin d'une grille après validation de son identifiant.

        Args:
            grid_id: Identifiant de grille.

        Returns:
            Chemin du fichier JSON.

        Raises:
            CriteriaGridInvalidError: Si l'identifiant sort de l'alphabet autorisé
                ou heurte un nom réservé par Windows.
        """
        if not _GRID_ID_PATTERN.match(grid_id or ""):
            raise CriteriaGridInvalidError(
                f"grid_id invalide : '{grid_id}' (attendu [A-Za-z0-9._-], sans séparateur de chemin)"
            )
        if grid_id.split(".")[0].upper() in _WINDOWS_RESERVED_NAMES:
            raise CriteriaGridInvalidError(
                f"grid_id réservé par Windows : '{grid_id}' — les écritures seraient perdues"
            )
        return self._criteria_dir / f"{grid_id}.json"

    def ensure_seeded(self) -> None:
        """Sème la grille de départ, une seule fois dans la vie du magasin.

        Un marqueur sur disque, et non la vacuité du répertoire, décide de
        l'amorçage : sinon supprimer la dernière grille la ferait renaître au
        contenu d'usine, ce qui contredirait l'intention de la suppression.

        Cette méthode **écrit** : elle est appelée à la construction du service,
        jamais depuis un chemin de lecture — un ``GET`` ne doit pas provoquer
        d'écriture, encore moins depuis un endpoint ouvert.
        """
        marker = self._criteria_dir / _SEED_MARKER_NAME
        if marker.exists():
            return
        if self._criteria_dir.exists() and any(self._criteria_dir.glob("*.json")):
            self._write_seed_marker(marker)
            return
        grid = CriteriaGrid.model_validate(default_grid_payload())
        self.save_grid(grid, bump_version=False)
        self._write_seed_marker(marker)
        logger.info("Grille de critères de départ semée : %s", DEFAULT_GRID_ID)

    @staticmethod
    def _write_seed_marker(marker: Path) -> None:
        """Pose le marqueur d'amorçage, sans faire échouer le service s'il résiste."""
        try:
            marker.parent.mkdir(parents=True, exist_ok=True)
            marker.write_text("seeded", encoding="utf-8")
        except OSError as exc:
            logger.warning("Marqueur d'amorçage des grilles non écrit : %s", exc)

    def list_grids(self) -> List[CriteriaGridSummary]:
        """Liste les grilles lisibles.

        Returns:
            Résumés triés par identifiant ; une grille illisible est journalisée et omise.
        """
        if not self._criteria_dir.exists():
            return []
        summaries: List[CriteriaGridSummary] = []
        for path in sorted(self._criteria_dir.glob("*.json")):
            raw = read_json_file(path, None)
            if raw is None:
                continue
            try:
                grid = CriteriaGrid.model_validate(raw)
            except ValidationError as exc:
                logger.warning("Grille de critères invalide ignorée (%s) : %s", path.name, exc)
                continue
            summaries.append(
                CriteriaGridSummary(
                    grid_id=grid.grid_id,
                    version=grid.version,
                    name=grid.name,
                    description=grid.description,
                    criterion_count=len(grid.criteria),
                    updated_at=grid.updated_at,
                )
            )
        return summaries

    def get_grid(self, grid_id: str, *, version: Optional[int] = None) -> CriteriaGrid:
        """Charge une grille.

        Args:
            grid_id: Identifiant de la grille.
            version: Version attendue ; `None` accepte la version courante.

        Returns:
            La grille chargée.

        Raises:
            CriteriaGridNotFoundError: Si le fichier est absent.
            CriteriaGridInvalidError: Si le contenu est invalide, ou si la version
                demandée diffère de celle sur disque.
        """
        path = self._path_for(grid_id)
        raw = read_json_file(path, None)
        if raw is None:
            raise CriteriaGridNotFoundError(f"Grille de critères introuvable : {grid_id}")
        try:
            grid = CriteriaGrid.model_validate(raw)
        except ValidationError as exc:
            raise CriteriaGridInvalidError(f"Grille '{grid_id}' invalide : {exc}") from exc
        if version is not None and grid.version != version:
            raise CriteriaGridInvalidError(
                f"Grille '{grid_id}' en version {grid.version}, version {version} demandée"
            )
        return grid

    def save_grid(self, grid: CriteriaGrid, *, bump_version: bool = True) -> CriteriaGrid:
        """Écrit une grille de façon atomique.

        Args:
            grid: Grille à écrire (déjà validée par Pydantic).
            bump_version: Incrémente la version depuis celle présente sur disque.

        Returns:
            La grille telle qu'écrite.
        """
        path = self._path_for(grid.grid_id)
        next_version = grid.version
        if bump_version:
            existing = read_json_file(path, None)
            current = 0
            if isinstance(existing, dict):
                try:
                    current = int(existing.get("version", 0))
                except (TypeError, ValueError):
                    current = 0
            next_version = current + 1
        persisted = grid.model_copy(
            update={
                "version": next_version,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        write_json_atomic(path, persisted.model_dump(mode="json"))
        return persisted

    def delete_grid(self, grid_id: str) -> bool:
        """Supprime une grille.

        Args:
            grid_id: Identifiant de la grille.

        Returns:
            `True` si un fichier a été supprimé.
        """
        path = self._path_for(grid_id)
        try:
            path.unlink()
        except FileNotFoundError:
            return False
        return True
