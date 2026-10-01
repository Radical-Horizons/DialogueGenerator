"""Magasin de suites de benchmark (donnée versionnée, pas code).

Une suite vit dans un fichier JSON par `suite_id` sous `data/benchmarks/suites/`.
Chaque écriture incrémente la version : un run enregistre la version qu'il a
rejouée, ce qui permet de refuser une reprise ou une comparaison sur une suite
modifiée entre-temps.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from pydantic import ValidationError

from api.schemas.benchmark import BenchmarkSuite, BenchmarkSuiteSummary
from services.benchmark_suite_seed import default_suites
from services.benchmark_seed_marker import (
    content_hash,
    is_untouched,
    marker_exists,
    read_marker,
    write_marker,
)
from services.gdd_notion_atomic_io import read_json_file, write_json_atomic

logger = logging.getLogger(__name__)

_SUITE_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")

_WINDOWS_RESERVED_NAMES = frozenset(
    {"CON", "PRN", "AUX", "NUL"}
    | {f"COM{index}" for index in range(1, 10)}
    | {f"LPT{index}" for index in range(1, 10)}
)
"""Noms de périphériques Windows : ``NUL.json`` **est** le périphérique nul, les
écritures y sont avalées et le magasin répondrait « suite enregistrée » sans rien stocker."""


class BenchmarkSuiteNotFoundError(LookupError):
    """La suite demandée n'existe pas sur disque."""


class BenchmarkSuiteInvalidError(ValueError):
    """La suite fournie ou lue est structurellement invalide."""


def suite_fingerprint(suite: BenchmarkSuite) -> str:
    """Calcule l'empreinte du contenu d'une suite.

    L'empreinte ignore les métadonnées volatiles (`updated_at`) et ne dépend que
    des cas rejoués : c'est elle qui autorise ou refuse une reprise.

    Args:
        suite: Suite à empreindre.

    Returns:
        Empreinte hexadécimale SHA-256.
    """
    # La version est délibérément absente : elle s'incrémente à chaque écriture, même
    # sans changement, et l'import sur une autre machine la réattribue. L'inclure
    # rendrait deux runs strictement comparables déclarés incomparables.
    payload = {
        "suite_id": suite.suite_id,
        "cases": [case.model_dump(mode="json") for case in suite.cases],
    }
    blob = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


class BenchmarkSuiteStore:
    """Lecture, écriture et export des suites de benchmark."""

    def __init__(self, suites_dir: Path) -> None:
        """Initialise le magasin.

        Args:
            suites_dir: Répertoire des suites (résolu depuis `FilePaths`, jamais en dur).
        """
        self._suites_dir = Path(suites_dir)

    @property
    def suites_dir(self) -> Path:
        """Répertoire des suites."""
        return self._suites_dir

    def _path_for(self, suite_id: str) -> Path:
        """Résout le chemin d'une suite après validation de son identifiant.

        Args:
            suite_id: Identifiant de suite.

        Returns:
            Chemin du fichier JSON de la suite.

        Raises:
            BenchmarkSuiteInvalidError: Si l'identifiant sort de l'alphabet autorisé
                (protège d'une traversée de répertoire via `../`).
        """
        if not _SUITE_ID_PATTERN.match(suite_id or ""):
            raise BenchmarkSuiteInvalidError(
                f"suite_id invalide : '{suite_id}' (attendu [A-Za-z0-9._-], sans séparateur de chemin)"
            )
        if suite_id.split(".")[0].upper() in _WINDOWS_RESERVED_NAMES:
            raise BenchmarkSuiteInvalidError(
                f"suite_id réservé par Windows : '{suite_id}' — les écritures seraient perdues"
            )
        return self._suites_dir / f"{suite_id}.json"

    def ensure_seeded(self) -> None:
        """Sème les suites de départ, et rattrape celles restées à l'état d'usine.

        Un benchmark embarque son jeu de test : sans ce semis, un poste neuf ne
        peut rien mesurer avant que quelqu'un ait rédigé du JSON à la main.

        Le marqueur sur disque, et non la vacuité du répertoire, décide de
        l'amorçage : sinon supprimer la dernière suite la ferait renaître au
        contenu d'usine, ce qui contredirait l'intention de la suppression.

        Il porte l'**empreinte** de ce qui a été semé, ce qui autorise la seule
        montée sûre : une suite intacte depuis son semis peut être remplacée sans
        rien perdre, une suite touchée appartient à son auteur. Cela compte
        davantage ici que pour la grille : la suite porte les cas, et son
        **empreinte entre dans l'identité du run** — un poste qui garderait un jeu
        de cas périmé produirait des runs incomparables sans que rien ne le dise.

        Cette méthode **écrit** : elle est appelée à la construction du service,
        jamais depuis un chemin de lecture — un ``GET`` ne doit pas provoquer
        d'écriture.
        """
        seeds = {suite.suite_id: suite for suite in default_suites()}
        if not marker_exists(self._suites_dir):
            if self._suites_dir.exists() and any(self._suites_dir.glob("*.json")):
                # Suites préexistantes, provenance inconnue : marqueur sans
                # empreinte, donc jamais de remplacement.
                write_marker(self._suites_dir, {})
                return
            hashes = {}
            for suite_id, suite in seeds.items():
                self.save_suite(suite, bump_version=False)
                hashes[suite_id] = self._stored_hash(suite_id)
                logger.info("Suite de benchmark de départ semée : %s", suite_id)
            write_marker(self._suites_dir, hashes)
            return

        self._upgrade_untouched_seeds(seeds)

    def _stored_hash(self, suite_id: str) -> str:
        """Empreinte de la suite **telle qu'elle se relit**.

        L'aller-retour disque n'est pas l'identité : un validateur remplit par
        exemple `request.reasoning_summary` (`None` → `"auto"`). Empreindre la
        charge utile d'avant écriture donnerait une valeur que la relecture ne
        reproduit jamais, et aucune montée ne se déclencherait plus.

        Args:
            suite_id: Suite à relire.

        Returns:
            L'empreinte du document relu.
        """
        return content_hash(self.get_suite(suite_id).model_dump(mode="json"))

    def _upgrade_untouched_seeds(self, seeds: Dict[str, BenchmarkSuite]) -> None:
        """Remplace les suites d'usine restées intactes depuis leur semis.

        Args:
            seeds: Suites de départ telles que le code les décrit aujourd'hui.
        """
        hashes = dict(read_marker(self._suites_dir))
        changed = False
        for suite_id, suite in seeds.items():
            fresh = suite.model_dump(mode="json")
            try:
                stored = self.get_suite(suite_id)
            except (BenchmarkSuiteNotFoundError, BenchmarkSuiteInvalidError):
                # Suite supprimée volontairement : ne pas la faire renaître.
                continue
            on_disk = stored.model_dump(mode="json")
            if content_hash(on_disk) == content_hash(fresh):
                continue
            if not is_untouched(self._suites_dir, suite_id, on_disk):
                logger.info(
                    "Suite '%s' modifiée sur disque (v%s) : la v%s du code n'est pas "
                    "appliquée. C'est volontaire — une suite éditée appartient à son auteur.",
                    suite_id,
                    stored.version,
                    suite.version,
                )
                continue
            self.save_suite(suite, bump_version=False)
            hashes[suite_id] = self._stored_hash(suite_id)
            changed = True
            logger.info(
                "Suite d'usine '%s' intacte depuis son semis : montée de v%s à v%s.",
                suite_id,
                stored.version,
                suite.version,
            )
        if changed:
            write_marker(self._suites_dir, hashes)

    def list_suites(self) -> List[BenchmarkSuiteSummary]:
        """Liste les suites lisibles du répertoire.

        Returns:
            Résumés triés par identifiant. Une suite illisible est journalisée et omise.
        """
        if not self._suites_dir.exists():
            return []
        summaries: List[BenchmarkSuiteSummary] = []
        for path in sorted(self._suites_dir.glob("*.json")):
            raw = read_json_file(path, None)
            if raw is None:
                continue
            try:
                suite = BenchmarkSuite.model_validate(raw)
            except ValidationError as exc:
                logger.warning("Suite de benchmark invalide ignorée (%s) : %s", path.name, exc)
                continue
            summaries.append(
                BenchmarkSuiteSummary(
                    suite_id=suite.suite_id,
                    version=suite.version,
                    name=suite.name,
                    description=suite.description,
                    case_count=len(suite.cases),
                    updated_at=suite.updated_at,
                )
            )
        return summaries

    def get_suite(self, suite_id: str, *, version: Optional[int] = None) -> BenchmarkSuite:
        """Charge une suite.

        Args:
            suite_id: Identifiant de la suite.
            version: Version attendue ; `None` accepte la version courante.

        Returns:
            La suite chargée.

        Raises:
            BenchmarkSuiteNotFoundError: Si le fichier est absent.
            BenchmarkSuiteInvalidError: Si le contenu est invalide ou si la version
                demandée ne correspond pas à celle sur disque.
        """
        path = self._path_for(suite_id)
        raw = read_json_file(path, None)
        if raw is None:
            raise BenchmarkSuiteNotFoundError(f"Suite de benchmark introuvable : {suite_id}")
        try:
            suite = BenchmarkSuite.model_validate(raw)
        except ValidationError as exc:
            raise BenchmarkSuiteInvalidError(f"Suite '{suite_id}' invalide : {exc}") from exc
        if version is not None and suite.version != version:
            raise BenchmarkSuiteInvalidError(
                f"Suite '{suite_id}' en version {suite.version}, version {version} demandée"
            )
        return suite

    def save_suite(self, suite: BenchmarkSuite, *, bump_version: bool = True) -> BenchmarkSuite:
        """Écrit une suite de façon atomique.

        Args:
            suite: Suite à écrire (déjà validée par Pydantic).
            bump_version: Incrémente la version depuis celle présente sur disque.

        Returns:
            La suite telle qu'écrite, version et horodatage à jour.
        """
        path = self._path_for(suite.suite_id)
        next_version = suite.version
        if bump_version:
            existing = read_json_file(path, None)
            current = 0
            if isinstance(existing, dict):
                try:
                    current = int(existing.get("version", 0))
                except (TypeError, ValueError):
                    current = 0
            next_version = current + 1
        persisted = suite.model_copy(
            update={
                "version": next_version,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        write_json_atomic(path, persisted.model_dump(mode="json"))
        return persisted

    def delete_suite(self, suite_id: str) -> bool:
        """Supprime une suite.

        Args:
            suite_id: Identifiant de la suite.

        Returns:
            `True` si un fichier a été supprimé.
        """
        path = self._path_for(suite_id)
        if not path.exists():
            return False
        path.unlink()
        return True

    def import_suite(self, payload: object) -> BenchmarkSuite:
        """Importe une suite depuis un document JSON exporté.

        Args:
            payload: Document brut (issu d'un export ou d'un fichier versionné en git).

        Returns:
            La suite importée et persistée.

        Raises:
            BenchmarkSuiteInvalidError: Si le document ne respecte pas le schéma.
        """
        try:
            suite = BenchmarkSuite.model_validate(payload)
        except ValidationError as exc:
            raise BenchmarkSuiteInvalidError(f"Import de suite invalide : {exc}") from exc
        return self.save_suite(suite)
