"""Service de gestion des templates custom de génération."""
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

from api.schemas.preset import Preset, PresetConfiguration, PresetMetadata
from api.schemas.template import Template, TemplateConfiguration
from services.preset_service import PresetService

logger = logging.getLogger(__name__)

DIALOGUE_GENERATOR_DIR = Path(__file__).resolve().parent.parent
DEFAULT_TEMPLATES_DIR = DIALOGUE_GENERATOR_DIR / "data" / "templates" / "custom"


class TemplateService:
    """CRUD minimal des templates custom (création + liste).

    Stockage : fichiers JSON UUID sous ``data/templates/custom/``.
    La validation GDD est lazy : on réutilise ``PresetService.validate_preset_references``
    sans forker le resolver. Les refs obsolètes produisent des warnings, jamais un 4xx.
    """

    def __init__(
        self,
        preset_service: PresetService,
        templates_dir: Optional[Path] = None,
    ) -> None:
        """Initialise le TemplateService.

        Args:
            preset_service: PresetService pour la validation GDD lazy (helpers existants).
            templates_dir: Dossier de stockage (défaut : data/templates/custom/).
        """
        self.preset_service = preset_service
        self.templates_dir = templates_dir or DEFAULT_TEMPLATES_DIR
        self.templates_dir.mkdir(parents=True, exist_ok=True)
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

        template = Template(
            id=template_id,
            name=template_data["name"],
            description=template_data.get("description", "") or "",
            category=category,
            icon=template_data.get("icon", "📋"),
            metadata=PresetMetadata(created=now, modified=now),
            configuration=TemplateConfiguration(**template_data["configuration"]),
        )

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
                "Template créé avec %s référence(s) obsolète(s) (warnings, pas d'erreur)",
                len(validation.obsoleteRefs),
            )

        self._save_template_to_disk(template)
        logger.info("Template créé: %s (ID: %s)", template.name, template_id)
        return template, list(validation.warnings)

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
        payload = template.model_dump(mode="json")
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
