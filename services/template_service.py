"""Service de gestion des templates custom de génération."""
import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID, uuid4

from api.schemas.preset import Preset, PresetConfiguration, PresetMetadata, PresetValidationResult
from api.schemas.template import (
    PREBUILT_SLUG_PATTERN,
    PrebuiltTemplate,
    Template,
    TemplateConfiguration,
    TemplateHistoryEntry,
    TemplateVersionSummary,
)
from services.preset_service import PresetService

logger = logging.getLogger(__name__)

DIALOGUE_GENERATOR_DIR = Path(__file__).resolve().parent.parent
DEFAULT_TEMPLATES_DIR = DIALOGUE_GENERATOR_DIR / "data" / "templates" / "custom"
DEFAULT_PREBUILT_FILE = DIALOGUE_GENERATOR_DIR / "config" / "prebuilt_templates.json"
MAX_TEMPLATE_VERSIONS = 10
_VERSION_ID_RE = re.compile(r"^[0-9T]+$")


class TemplateService:
    """CRUD des templates custom (création, liste, lecture, mise à jour, suppression).

    Stockage : fichiers JSON UUID sous ``data/templates/custom/``.
    La validation GDD est lazy : on réutilise ``PresetService.validate_preset_references``
    sans forker le resolver. Les refs obsolètes produisent des warnings, jamais un 4xx.
    """

    def __init__(
        self,
        preset_service: PresetService,
        templates_dir: Optional[Path] = None,
        prebuilt_path: Optional[Path] = None,
    ) -> None:
        """Initialise le TemplateService.

        Args:
            preset_service: PresetService pour la validation GDD lazy (helpers existants).
            templates_dir: Dossier de stockage custom (défaut : data/templates/custom/).
            prebuilt_path: Catalogue pré-built JSON (défaut : config/prebuilt_templates.json).
        """
        self.preset_service = preset_service
        self.templates_dir = templates_dir or DEFAULT_TEMPLATES_DIR
        self.templates_dir.mkdir(parents=True, exist_ok=True)
        self.prebuilt_path = prebuilt_path or DEFAULT_PREBUILT_FILE
        logger.info("TemplateService initialisé avec dossier: %s", self.templates_dir)

    def create_template(self, template_data: Dict[str, Any]) -> Tuple[Template, List[str]]:
        """Crée un template, le persiste, et retourne les warnings GDD.

        Args:
            template_data: name, description, category, icon, configuration.

        Returns:
            Tuple (template persisté, liste de warnings — éventuellement vide).

        Raises:
            PermissionError: Permissions insuffisantes sur le dossier.
            OSError: Erreur d'écriture disque.
        """
        template_id = str(uuid4())
        now = datetime.now(timezone.utc)
        category = (template_data.get("category") or "").strip() or "Général"
        raw_owner = template_data.get("ownerId") or template_data.get("owner_id")
        owner_id = str(raw_owner).strip() if raw_owner else None

        template = Template(
            id=template_id,
            name=template_data["name"],
            description=template_data.get("description", "") or "",
            category=category,
            icon=template_data.get("icon", "📋"),
            metadata=PresetMetadata(created=now, modified=now),
            configuration=TemplateConfiguration(**template_data["configuration"]),
            history=[TemplateHistoryEntry(at=now, action="created")],
            ownerId=owner_id or None,
        )

        template, warnings = self._apply_gdd_validation(template)
        self._save_template_to_disk(template)
        logger.info("Template créé: %s (ID: %s)", template.name, template_id)
        return template, warnings

    def list_templates(self) -> List[Template]:
        """Liste tous les templates custom.

        Returns:
            Liste des templates (vide si aucun fichier valide).
        """
        templates: List[Template] = []
        if not self.templates_dir.exists():
            return templates

        for template_file in self.templates_dir.glob("*.json"):
            try:
                with open(template_file, "r", encoding="utf-8") as handle:
                    payload = json.load(handle)
                    templates.append(Template(**payload))
            except (
                json.JSONDecodeError,
                ValueError,
                TypeError,
                OSError,
                UnicodeDecodeError,
            ) as exc:
                logger.error("Erreur chargement template %s: %s", template_file.name, exc)
                continue

        logger.debug("Liste templates chargée: %s templates", len(templates))
        return templates

    def get_template(self, template_id: str) -> Template:
        """Charge un template par UUID.

        Args:
            template_id: UUID du fichier.

        Returns:
            Template persisté.

        Raises:
            FileNotFoundError: Fichier absent ou UUID invalide.
        """
        template_file = self._template_path(template_id)
        if not template_file.exists():
            raise FileNotFoundError(f"Template {template_id} not found")
        with open(template_file, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        return Template(**payload)

    def update_template(
        self,
        template_id: str,
        update_data: Dict[str, Any],
    ) -> Tuple[Template, List[str]]:
        """Met à jour un template (même UUID), append ``history`` updated.

        Args:
            template_id: UUID existant.
            update_data: Champs partiels (name, description, category, icon, configuration).

        Returns:
            Tuple (template persisté, warnings GDD).

        Raises:
            FileNotFoundError: Template absent.
        """
        template = self.get_template(template_id)
        self._archive_version(template)
        now = datetime.now(timezone.utc)
        updates: Dict[str, Any] = {}
        if "name" in update_data:
            updates["name"] = update_data["name"]
        if "description" in update_data:
            updates["description"] = update_data["description"] or ""
        if "category" in update_data:
            updates["category"] = (update_data.get("category") or "").strip() or "Général"
        if "icon" in update_data:
            updates["icon"] = update_data.get("icon") or "📋"
        if "configuration" in update_data and update_data["configuration"] is not None:
            updates["configuration"] = TemplateConfiguration(**update_data["configuration"])

        history_action = update_data.get("_history_action") or "updated"
        if history_action not in ("updated", "restored"):
            history_action = "updated"
        history = list(template.history)
        history.append(TemplateHistoryEntry(at=now, action=history_action))
        metadata = template.metadata.model_copy(update={"modified": now})
        template = template.model_copy(
            update={**updates, "history": history, "metadata": metadata}
        )

        template, warnings = self._apply_gdd_validation(template)
        if not self._template_path(template_id).exists():
            raise FileNotFoundError(f"Template {template_id} not found")
        self._save_template_to_disk(template)
        logger.info("Template mis à jour: %s (ID: %s)", template.name, template_id)
        return template, warnings

    def delete_template(self, template_id: str) -> None:
        """Supprime le fichier UUID du template.

        Args:
            template_id: UUID du fichier.

        Raises:
            FileNotFoundError: Template absent.
        """
        template_file = self._template_path(template_id)
        if not template_file.exists():
            raise FileNotFoundError(f"Template {template_id} not found")
        template_file.unlink()
        self._delete_versions(template_id)
        logger.info("Template supprimé: %s", template_id)

    def list_versions(self, template_id: str) -> List[TemplateVersionSummary]:
        """Liste les snapshots (plus récent d'abord)."""
        self.get_template(template_id)
        versions_dir = self._versions_dir(template_id)
        if not versions_dir.exists():
            return []
        items: List[TemplateVersionSummary] = []
        for path in sorted(versions_dir.glob("*.json"), reverse=True):
            version_id = path.stem
            if not _VERSION_ID_RE.match(version_id):
                continue
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
                snapshot = Template(**payload)
            except (OSError, json.JSONDecodeError, ValueError, TypeError):
                logger.warning("Snapshot template illisible: %s", path)
                continue
            preview = (snapshot.configuration.instructions or "").strip()
            if len(preview) > 160:
                preview = preview[:157] + "..."
            items.append(
                TemplateVersionSummary(
                    id=version_id,
                    at=snapshot.metadata.modified.isoformat(),
                    name=snapshot.name,
                    instructionsPreview=preview,
                )
            )
        return items

    def restore_version(
        self, template_id: str, version_id: str
    ) -> Tuple[Template, List[str]]:
        """Restaure un snapshot (nouvelle entrée history ``restored``)."""
        snapshot = self._load_version(template_id, version_id)
        return self.update_template(
            template_id,
            {
                "name": snapshot.name,
                "description": snapshot.description,
                "category": snapshot.category,
                "icon": snapshot.icon,
                "configuration": snapshot.configuration.model_dump(mode="json"),
                "_history_action": "restored",
            },
        )

    def _versions_dir(self, template_id: str) -> Path:
        """Dossier des snapshots d'un custom."""
        return self.templates_dir.parent / "versions" / template_id

    def _archive_version(self, template: Template) -> None:
        """Écrit le JSON courant dans versions/ et plafonne à 10."""
        versions_dir = self._versions_dir(template.id)
        versions_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%f")
        path = versions_dir / f"{stamp}.json"
        path.write_text(
            json.dumps(template.model_dump(mode="json"), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        existing = sorted(
            [p for p in versions_dir.glob("*.json") if _VERSION_ID_RE.match(p.stem)]
        )
        extra = len(existing) - MAX_TEMPLATE_VERSIONS
        for stale in existing[: max(extra, 0)]:
            try:
                stale.unlink()
            except OSError:
                logger.warning("Impossible de retirer un vieux snapshot: %s", stale)

    def _load_version(self, template_id: str, version_id: str) -> Template:
        """Charge un snapshot disque."""
        self.get_template(template_id)
        if not _VERSION_ID_RE.match(version_id):
            raise FileNotFoundError(f"Version {version_id} introuvable")
        path = self._versions_dir(template_id) / f"{version_id}.json"
        if not path.exists():
            raise FileNotFoundError(f"Version {version_id} introuvable")
        payload = json.loads(path.read_text(encoding="utf-8"))
        return Template(**payload)

    def _delete_versions(self, template_id: str) -> None:
        """Supprime le dossier de snapshots (cascade applicative)."""
        versions_dir = self._versions_dir(template_id)
        if not versions_dir.exists():
            return
        for path in versions_dir.glob("*.json"):
            try:
                path.unlink()
            except OSError:
                logger.warning("Snapshot non supprimé: %s", path)
        try:
            versions_dir.rmdir()
        except OSError:
            logger.warning("Dossier versions non vide: %s", versions_dir)

    def validate_template_references(self, template_id: str) -> PresetValidationResult:
        """Valide les références GDD d'un template sans muter le fichier.

        Args:
            template_id: UUID du template.

        Returns:
            Résultat de validation (warnings / refs obsolètes), jamais un 4xx métier.

        Raises:
            FileNotFoundError: Template absent ou UUID invalide.
        """
        template = self.get_template(template_id)
        return self.preset_service.validate_preset_references(
            self._as_preset_for_validation(template)
        )

    def list_prebuilt_templates(self) -> List[PrebuiltTemplate]:
        """Charge le catalogue pré-built (lecture seule).

        Returns:
            Liste des fiches (vide si le fichier est absent).

        Raises:
            ValueError: JSON invalide ou entrée non conforme.
        """
        if not self.prebuilt_path.exists():
            logger.warning("Catalogue pré-built absent: %s", self.prebuilt_path)
            return []
        with open(self.prebuilt_path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        raw_list = payload.get("templates") if isinstance(payload, dict) else None
        if not isinstance(raw_list, list):
            raise ValueError("Invalid prebuilt catalog")
        templates = [PrebuiltTemplate(**item) for item in raw_list]
        logger.debug("Liste pré-built chargée: %s fiches", len(templates))
        return templates

    def get_prebuilt_template(self, slug: str) -> PrebuiltTemplate:
        """Charge une fiche pré-built par slug.

        Args:
            slug: Identifiant kebab-case.

        Returns:
            Fiche persistée dans le catalogue.

        Raises:
            FileNotFoundError: Slug invalide ou absent.
        """
        if not PREBUILT_SLUG_PATTERN.match(slug):
            raise FileNotFoundError(f"Prebuilt {slug} not found")
        for template in self.list_prebuilt_templates():
            if template.id == slug:
                return template
        raise FileNotFoundError(f"Prebuilt {slug} not found")

    def _template_path(self, template_id: str) -> Path:
        """Résout le chemin JSON d'un UUID (refuse un id non-UUID)."""
        try:
            UUID(template_id)
        except ValueError as exc:
            raise FileNotFoundError(f"Template {template_id} not found") from exc
        return self.templates_dir / f"{template_id}.json"

    def _apply_gdd_validation(self, template: Template) -> Tuple[Template, List[str]]:
        """Applique la validation GDD lazy (warnings, jamais d'échec)."""
        validation = self.preset_service.validate_preset_references(
            self._as_preset_for_validation(template)
        )

        if validation.resolvedRefs:
            remapped = self.preset_service.apply_resolved_refs_to_preset(
                self._as_preset_for_validation(template),
                validation.resolvedRefs,
            )
            extra = template.configuration.model_dump(
                include={"llmProvider", "temperature"}
            )
            template = template.model_copy(
                update={
                    "configuration": TemplateConfiguration(
                        **remapped.configuration.model_dump(),
                        **extra,
                    )
                }
            )

        if not validation.valid and validation.obsoleteRefs:
            template.configuration.characters = [
                c
                for c in template.configuration.characters
                if c not in validation.obsoleteRefs
            ]
            template.configuration.locations = [
                loc
                for loc in template.configuration.locations
                if loc not in validation.obsoleteRefs
            ]
            logger.info(
                "Template avec %s référence(s) obsolète(s) (warnings, pas d'erreur)",
                len(validation.obsoleteRefs),
            )

        return template, list(validation.warnings)

    def _as_preset_for_validation(self, template: Template) -> Preset:
        """Construit un Preset temporaire pour réutiliser la validation GDD existante.

        Args:
            template: Template dont la configuration doit être validée.

        Returns:
            Preset avec la même configuration (hors champs LLM spécifiques).
        """
        config_dump = template.configuration.model_dump(
            exclude={"llmProvider", "temperature"}
        )
        return Preset(
            id=template.id,
            name=template.name,
            icon=template.icon,
            metadata=template.metadata,
            configuration=PresetConfiguration(**config_dump),
        )

    def _save_template_to_disk(self, template: Template) -> None:
        """Sauvegarde un template en JSON UTF-8 (ensure_ascii=False).

        Args:
            template: Template à persister.

        Raises:
            PermissionError: Permissions insuffisantes.
            OSError: Erreur d'écriture disque.
        """
        template_file = self.templates_dir / f"{template.id}.json"
        payload = template.model_dump(
            mode="json",
            exclude={"visibility", "ownerUsername", "sharedByUsername"},
        )
        if not payload.get("ownerId"):
            payload.pop("ownerId", None)
        tmp_file = self.templates_dir / f".{template.id}.json.tmp"
        try:
            with open(tmp_file, "w", encoding="utf-8") as handle:
                json.dump(payload, handle, indent=2, ensure_ascii=False)
            tmp_file.replace(template_file)
        except PermissionError as exc:
            logger.error("Permission denied writing template %s: %s", template.id, exc)
            raise
        except OSError as exc:
            logger.error("Disk error writing template %s: %s", template.id, exc)
            raise
        finally:
            if tmp_file.exists():
                try:
                    tmp_file.unlink()
                except OSError:
                    logger.warning("Impossible de supprimer le fichier temp %s", tmp_file)
