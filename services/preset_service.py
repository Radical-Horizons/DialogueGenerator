"""Service de gestion des presets de génération."""
import json
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from uuid import uuid4
from datetime import datetime, timezone

from api.schemas.preset import (
    Preset, PresetMetadata, PresetConfiguration, 
    PresetCreate, PresetUpdate, PresetValidationResult
)
from services.configuration_service import ConfigurationService
from core.context.context_builder import ContextBuilder
from services.gdd_name_resolver import GddNameResolver

logger = logging.getLogger(__name__)

# Chemin par défaut du dossier presets
DIALOGUE_GENERATOR_DIR = Path(__file__).resolve().parent.parent
DEFAULT_PRESETS_DIR = DIALOGUE_GENERATOR_DIR / "data" / "presets"


class PresetService:
    """Service pour la gestion des presets de génération.
    
    Fournit des opérations CRUD pour les presets et validation des références GDD.
    Les presets sont stockés en fichiers JSON locaux dans data/presets/{uuid}.json.
    """
    
    def __init__(
        self, 
        config_service: ConfigurationService,
        context_builder: ContextBuilder,
        presets_dir: Optional[Path] = None
    ):
        """Initialise le PresetService.
        
        Args:
            config_service: Service de configuration pour validation GDD
            context_builder: ContextBuilder pour accès données GDD
            presets_dir: Chemin du dossier presets (par défaut: data/presets/)
        """
        self.config_service = config_service
        self.context_builder = context_builder
        self.presets_dir = presets_dir or DEFAULT_PRESETS_DIR
        
        # Créer dossier presets si n'existe pas
        self.presets_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"PresetService initialisé avec dossier: {self.presets_dir}")

    def _gdd_name_resolver(self) -> GddNameResolver:
        """Construit un resolver sur les données GDD courantes."""
        self.context_builder.load_gdd_files()
        return GddNameResolver(
            self.context_builder._gdd_data,
            self.context_builder._element_repository,
        )

    @staticmethod
    def _remap_string_list(values: List[str], resolved_refs: Dict[str, str]) -> List[str]:
        """Remplace les libellés résolus et déduplique en conservant l'ordre."""
        seen: set[str] = set()
        remapped: List[str] = []
        for value in values:
            canonical = resolved_refs.get(value, value)
            if canonical not in seen:
                seen.add(canonical)
                remapped.append(canonical)
        return remapped

    def apply_resolved_refs_to_preset(self, preset: Preset, resolved_refs: Dict[str, str]) -> Preset:
        """Applique les noms canoniques GDD sur un preset (API publique).

        Args:
            preset: Preset dont les refs doivent être remappées.
            resolved_refs: Ancien libellé → nom canonique.

        Returns:
            Preset avec les refs remappées (inchangé si ``resolved_refs`` est vide).
        """
        return self._apply_resolved_refs_to_preset(preset, resolved_refs)

    def _apply_resolved_refs_to_preset(self, preset: Preset, resolved_refs: Dict[str, str]) -> Preset:
        """Applique les noms canoniques sur la configuration d'un preset."""
        if not resolved_refs:
            return preset

        config = preset.configuration.model_copy(deep=True)
        config.characters = self._remap_string_list(config.characters, resolved_refs)
        config.locations = self._remap_string_list(config.locations, resolved_refs)
        if config.region in resolved_refs:
            config.region = resolved_refs[config.region]
        if config.subLocation and config.subLocation in resolved_refs:
            config.subLocation = resolved_refs[config.subLocation]
        if config.selectedRegion and config.selectedRegion in resolved_refs:
            config.selectedRegion = resolved_refs[config.selectedRegion]
        if config.selectedSubLocations:
            config.selectedSubLocations = self._remap_string_list(
                config.selectedSubLocations,
                resolved_refs,
            )

        if config.contextSelections and isinstance(config.contextSelections, dict):
            selections = dict(config.contextSelections)
            for key in (
                "characters_full",
                "characters_excerpt",
                "locations_full",
                "locations_excerpt",
                "items_full",
                "items_excerpt",
                "species_full",
                "species_excerpt",
                "communities_full",
                "communities_excerpt",
            ):
                raw = selections.get(key)
                if isinstance(raw, list):
                    selections[key] = self._remap_string_list(raw, resolved_refs)
            config.contextSelections = selections

        return preset.model_copy(update={"configuration": config})

    def _resolve_reference_name(
        self,
        resolver: GddNameResolver,
        *,
        kind: str,
        name: str,
        valid_names: set[str],
    ) -> tuple[Optional[str], bool]:
        """Résout une référence preset vers un nom canonique GDD.

        Returns:
            Tuple (nom canonique ou None, True si résolution alias/fuzzy).
        """
        if name in valid_names:
            return name, False

        if kind == "character":
            canonical = resolver.resolve_character(name)
        else:
            canonical = resolver.resolve_location(name)

        if canonical and canonical in valid_names:
            return canonical, canonical != name
        return None, False

    def create_preset(self, preset_data: Dict[str, Any]) -> Tuple[Preset, Optional[str]]:
        """Crée un nouveau preset.
        
        Valide et nettoie automatiquement les références obsolètes avant sauvegarde.
        
        Args:
            preset_data: Données du preset (name, icon, configuration)
        
        Returns:
            Preset créé avec UUID généré (références obsolètes supprimées si présentes)
        
        Raises:
            PermissionError: Si permissions insuffisantes sur dossier
            OSError: Si erreur d'écriture disque (ex: disque plein)
        """
        # Générer UUID pour le preset
        preset_id = str(uuid4())
        now = datetime.now(timezone.utc)
        
        # Créer preset complet
        preset = Preset(
            id=preset_id,
            name=preset_data["name"],
            icon=preset_data.get("icon", "📋"),
            metadata=PresetMetadata(created=now, modified=now),
            configuration=PresetConfiguration(**preset_data["configuration"])
        )
        
        # Valider références avant sauvegarde
        validation = self.validate_preset_references(preset)
        
        if validation.resolvedRefs:
            preset = self._apply_resolved_refs_to_preset(preset, validation.resolvedRefs)

        # Auto-cleanup si références obsolètes détectées
        if not validation.valid and validation.obsoleteRefs:
            preset.configuration.characters = [
                c for c in preset.configuration.characters
                if c not in validation.obsoleteRefs
            ]
            preset.configuration.locations = [
                l for l in preset.configuration.locations
                if l not in validation.obsoleteRefs
            ]
            logger.info(f"Preset créé avec {len(validation.obsoleteRefs)} référence(s) obsolète(s) supprimée(s)")
        
        # Sauvegarder preset nettoyé sur disque
        self._save_preset_to_disk(preset)
        
        logger.info(f"Preset créé: {preset.name} (ID: {preset_id})")
        
        # Retourner preset + message auto-cleanup (si applicable)
        cleanup_message = None
        if not validation.valid and validation.obsoleteRefs:
            cleanup_message = f"Preset créé avec {len(validation.obsoleteRefs)} référence(s) obsolète(s) supprimée(s)"
        
        return preset, cleanup_message
    
    def list_presets(self) -> List[Preset]:
        """Liste tous les presets disponibles.
        
        Returns:
            Liste de tous les presets (vide si aucun)
        """
        presets = []
        
        if not self.presets_dir.exists():
            return presets
        
        for preset_file in self.presets_dir.glob("*.json"):
            try:
                with open(preset_file, "r", encoding="utf-8") as f:
                    preset_data = json.load(f)
                    preset = Preset(**preset_data)
                    presets.append(preset)
            except (json.JSONDecodeError, ValueError) as e:
                # Fichier corrompu ou invalide : skip avec log erreur
                logger.error(f"Erreur chargement preset {preset_file.name}: {e}")
                continue
        
        logger.debug(f"Liste presets chargée: {len(presets)} presets trouvés")
        return presets
    
    def load_preset(self, preset_id: str) -> Preset:
        """Charge un preset spécifique.
        
        Args:
            preset_id: UUID du preset
        
        Returns:
            Preset chargé
        
        Raises:
            FileNotFoundError: Si preset n'existe pas
            ValueError: Si fichier JSON invalide
        """
        preset_file = self.presets_dir / f"{preset_id}.json"
        
        if not preset_file.exists():
            raise FileNotFoundError(f"Preset {preset_id} not found")
        
        try:
            with open(preset_file, "r", encoding="utf-8") as f:
                preset_data = json.load(f)
                preset = Preset(**preset_data)
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON in preset {preset_id}: {e}")
        
        logger.debug(f"Preset chargé: {preset.name} (ID: {preset_id})")
        return preset
    
    def update_preset(self, preset_id: str, update_data: Dict[str, Any]) -> Tuple[Preset, Optional[str]]:
        """Met à jour un preset existant.
        
        Valide et nettoie automatiquement les références obsolètes avant sauvegarde.
        
        Args:
            preset_id: UUID du preset
            update_data: Données à mettre à jour (champs partiels)
        
        Returns:
            Preset mis à jour (références obsolètes supprimées si présentes)
        
        Raises:
            FileNotFoundError: Si preset n'existe pas
        """
        # Charger preset existant
        preset = self.load_preset(preset_id)
        
        # Mettre à jour champs fournis
        if "name" in update_data:
            preset.name = update_data["name"]
        if "icon" in update_data:
            preset.icon = update_data["icon"]
        if "configuration" in update_data:
            preset.configuration = PresetConfiguration(**update_data["configuration"])
        
        # Actualiser metadata.modified
        preset.metadata.modified = datetime.now(timezone.utc)
        
        # Valider références avant sauvegarde
        validation = self.validate_preset_references(preset)
        
        if validation.resolvedRefs:
            preset = self._apply_resolved_refs_to_preset(preset, validation.resolvedRefs)

        # Auto-cleanup si références obsolètes détectées
        if not validation.valid and validation.obsoleteRefs:
            preset.configuration.characters = [
                c for c in preset.configuration.characters
                if c not in validation.obsoleteRefs
            ]
            preset.configuration.locations = [
                l for l in preset.configuration.locations
                if l not in validation.obsoleteRefs
            ]
            logger.info(f"Preset mis à jour avec {len(validation.obsoleteRefs)} référence(s) obsolète(s) supprimée(s)")
        
        # Sauvegarder preset nettoyé
        self._save_preset_to_disk(preset)
        
        logger.info(f"Preset mis à jour: {preset.name} (ID: {preset_id})")
        
        # Retourner preset + message auto-cleanup (si applicable)
        cleanup_message = None
        if not validation.valid and validation.obsoleteRefs:
            cleanup_message = f"Preset mis à jour - {len(validation.obsoleteRefs)} référence(s) obsolète(s) supprimée(s)"
        
        return preset, cleanup_message
    
    def delete_preset(self, preset_id: str) -> None:
        """Supprime un preset.
        
        Args:
            preset_id: UUID du preset
        
        Raises:
            FileNotFoundError: Si preset n'existe pas
        """
        preset_file = self.presets_dir / f"{preset_id}.json"
        
        if not preset_file.exists():
            raise FileNotFoundError(f"Preset {preset_id} not found")
        
        preset_file.unlink()
        logger.info(f"Preset supprimé: {preset_id}")
    
    def validate_preset_references(self, preset: Preset) -> PresetValidationResult:
        """Valide les références GDD d'un preset (personnages, lieux).
        
        Vérifie que les IDs référencés dans le preset existent dans le GDD actuel.
        Validation lazy : appelé au chargement, pas à la sauvegarde.
        
        Args:
            preset: Preset à valider
        
        Returns:
            Résultat de validation avec warnings si références obsolètes
        """
        obsolete_refs: List[str] = []
        warnings: List[str] = []
        resolved_refs: Dict[str, str] = {}

        resolver = self._gdd_name_resolver()
        valid_character_names = set(self.context_builder.get_characters_names())
        valid_location_names = set(self.context_builder.get_locations_names())

        character_refs: set[str] = set(preset.configuration.characters)
        location_refs: set[str] = set(preset.configuration.locations)
        if preset.configuration.region:
            location_refs.add(preset.configuration.region)
        if preset.configuration.subLocation:
            location_refs.add(preset.configuration.subLocation)
        if preset.configuration.selectedRegion:
            location_refs.add(preset.configuration.selectedRegion)
        for sub_loc in preset.configuration.selectedSubLocations or []:
            if sub_loc:
                location_refs.add(sub_loc)
        if isinstance(preset.configuration.contextSelections, dict):
            for key in ("characters_full", "characters_excerpt"):
                raw = preset.configuration.contextSelections.get(key)
                if isinstance(raw, list):
                    character_refs.update(str(n) for n in raw if n)
            for key in ("locations_full", "locations_excerpt"):
                raw = preset.configuration.contextSelections.get(key)
                if isinstance(raw, list):
                    location_refs.update(str(n) for n in raw if n)

        for char_name in sorted(character_refs):
            canonical, was_resolved = self._resolve_reference_name(
                resolver,
                kind="character",
                name=char_name,
                valid_names=valid_character_names,
            )
            if canonical and was_resolved:
                resolved_refs[char_name] = canonical
                warnings.append(f"Character '{char_name}' resolved to '{canonical}'")
            elif not canonical:
                obsolete_refs.append(char_name)
                warnings.append(f"Character '{char_name}' not found in GDD")

        for loc_name in sorted(location_refs):
            canonical, was_resolved = self._resolve_reference_name(
                resolver,
                kind="location",
                name=loc_name,
                valid_names=valid_location_names,
            )
            if canonical and was_resolved:
                resolved_refs[loc_name] = canonical
                warnings.append(f"Location '{loc_name}' resolved to '{canonical}'")
            elif not canonical:
                obsolete_refs.append(loc_name)
                warnings.append(f"Location '{loc_name}' not found in GDD")

        result = PresetValidationResult(
            valid=len(obsolete_refs) == 0,
            warnings=warnings,
            obsoleteRefs=obsolete_refs,
            resolvedRefs=resolved_refs,
        )
        
        if not result.valid:
            logger.warning(f"Preset {preset.name} has {len(obsolete_refs)} obsolete references")
        
        return result
    
    def _save_preset_to_disk(self, preset: Preset) -> None:
        """Sauvegarde un preset sur disque.
        
        Args:
            preset: Preset à sauvegarder
        
        Raises:
            PermissionError: Si permissions insuffisantes
            OSError: Si erreur écriture disque
        """
        preset_file = self.presets_dir / f"{preset.id}.json"
        
        # Sérialiser en JSON
        preset_json = preset.model_dump(mode="json")
        
        try:
            with open(preset_file, "w", encoding="utf-8") as f:
                json.dump(preset_json, f, indent=2, ensure_ascii=False)
        except PermissionError as e:
            logger.error(f"Permission denied writing preset {preset.id}: {e}")
            raise
        except OSError as e:
            logger.error(f"Disk error writing preset {preset.id}: {e}")
            raise
