"""Fait converger presets et fiches de catalogue vers des templates.

Trois objets coexistaient pour une seule idée — « une configuration de génération que
je réutilise » : les presets (`data/presets/`, avec leur propre menu), les fiches
livrées avec l'application (`config/prebuilt_templates.json`, en lecture seule) et les
templates. L'utilisateur voyait donc un menu « Charger preset » au-dessus d'une liste
qui contenait déjà ce qu'il proposait, et des fiches qu'il ne pouvait pas modifier.

La convergence **copie** : ni les presets ni le catalogue ne sont effacés. Un marqueur
sur disque empêche la répétition, et la reprise se fait par nom pour qu'un passage
interrompu ne produise pas de doublon.

Les objets convergés n'ont pas de propriétaire : ils sont `shared`, donc visibles et
modifiables par toute l'équipe — ce que le catalogue n'était jamais.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

MARKER_NAME = ".convergence-templates-v1"


@dataclass(frozen=True)
class ConvergenceResult:
    """Compte de ce qu'une exécution a produit."""

    from_presets: int
    from_catalog: int
    skipped: int
    already_done: bool

    @property
    def created(self) -> int:
        """Total d'objets créés pendant cet appel."""
        return self.from_presets + self.from_catalog


class TemplateConvergenceService:
    """Importe presets et catalogue dans les templates, une seule fois."""

    def __init__(self, *, template_service: Any, preset_service: Any) -> None:
        """Initialise le service.

        Args:
            template_service: Service de persistance des templates (cible).
            preset_service: Service des presets (source, lue seulement).
        """
        self._templates = template_service
        self._presets = preset_service

    @property
    def _marker(self) -> Path:
        """Marqueur posé à côté des templates, pour rester avec la donnée cible."""
        return Path(self._templates.templates_dir) / MARKER_NAME

    def already_converged(self) -> bool:
        """La convergence a-t-elle déjà abouti sur ce déploiement ?"""
        return self._marker.exists()

    @staticmethod
    def _payload_from_preset(preset: Any) -> Dict[str, Any]:
        """Un preset est un template auquel il manque catégorie et description."""
        configuration = preset.configuration
        if hasattr(configuration, "model_dump"):
            configuration = configuration.model_dump()
        return {
            "name": preset.name,
            "description": "Importé depuis les presets",
            "category": "Preset",
            "icon": getattr(preset, "icon", None) or "📄",
            "configuration": dict(configuration),
        }

    @staticmethod
    def _payload_from_catalog(fiche: Any) -> Dict[str, Any]:
        """Une fiche livrée devient un template ordinaire, donc modifiable."""
        configuration = fiche.configuration
        if hasattr(configuration, "model_dump"):
            configuration = configuration.model_dump()
        return {
            "name": fiche.name,
            "description": fiche.description,
            "category": fiche.category,
            "icon": fiche.icon,
            "configuration": dict(configuration),
        }

    def _existing_names(self) -> set[str]:
        """Noms déjà présents côté templates, pour la reprise sans doublon."""
        return {t.name.strip() for t in self._templates.list_templates()}

    def _import(self, payloads: List[Dict[str, Any]], seen: set[str]) -> tuple[int, int]:
        """Crée ce qui manque ; retourne (créés, ignorés)."""
        created = skipped = 0
        for payload in payloads:
            name = payload["name"].strip()
            if not name or name in seen:
                skipped += 1
                continue
            self._templates.create_template(payload)
            seen.add(name)
            created += 1
        return created, skipped

    def converge(self) -> ConvergenceResult:
        """Importe presets puis catalogue, si ce n'est pas déjà fait.

        Returns:
            Le compte de ce qui a été créé et ignoré.
        """
        if self.already_converged():
            return ConvergenceResult(0, 0, 0, already_done=True)

        seen = self._existing_names()

        presets = [self._payload_from_preset(p) for p in self._presets.list_presets()]
        from_presets, skipped_presets = self._import(presets, seen)

        catalog = [
            self._payload_from_catalog(f) for f in self._templates.list_prebuilt_templates()
        ]
        from_catalog, skipped_catalog = self._import(catalog, seen)

        # Le marqueur n'est posé qu'après un passage complet : une interruption laisse
        # la convergence ouverte, et la reprise par nom évite de recréer l'existant.
        self._marker.parent.mkdir(parents=True, exist_ok=True)
        self._marker.write_text("", encoding="utf-8")

        result = ConvergenceResult(
            from_presets=from_presets,
            from_catalog=from_catalog,
            skipped=skipped_presets + skipped_catalog,
            already_done=False,
        )
        logger.info(
            "Convergence templates : %d preset(s), %d fiche(s) de catalogue, %d ignoré(s)",
            result.from_presets,
            result.from_catalog,
            result.skipped,
        )
        return result
