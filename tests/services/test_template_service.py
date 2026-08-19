"""Tests unitaires pour TemplateService (Story 6.1.1)."""
import json
from pathlib import Path
from typing import Any, Dict
from unittest.mock import Mock
from uuid import UUID

import pytest

from api.schemas.preset import PresetValidationResult
from services.preset_service import PresetService
from services.template_service import TemplateService


@pytest.fixture
def mock_config_service() -> Mock:
    """ConfigurationService mocké (pas d'I/O GDD réel)."""
    return Mock()


@pytest.fixture
def mock_context_builder() -> Mock:
    """ContextBuilder mocké avec IDs génériques (pas de noms GDD réels)."""
    from services.element_repository import ElementRepository
    from services.gdd_loader import GDDData

    gdd_data = GDDData(
        characters=[
            {"Nom": "char-alpha", "id": "char-001"},
            {"Nom": "char-beta", "id": "char-002"},
        ],
        locations=[
            {"Nom": "loc-alpha", "id": "loc-001"},
            {"Nom": "loc-beta", "id": "loc-002"},
        ],
    )
    repo = ElementRepository(gdd_data)
    builder = Mock()
    builder._gdd_data = gdd_data
    builder._element_repository = repo
    builder.get_characters_names.return_value = ["char-alpha", "char-beta"]
    builder.get_locations_names.return_value = ["loc-alpha", "loc-beta"]
    builder.load_gdd_files = Mock()
    return builder


@pytest.fixture
def preset_service(
    tmp_path: Path,
    mock_config_service: Mock,
    mock_context_builder: Mock,
) -> PresetService:
    """PresetService isolé pour réutiliser la validation GDD lazy."""
    return PresetService(
        config_service=mock_config_service,
        context_builder=mock_context_builder,
        presets_dir=tmp_path / "presets",
    )


@pytest.fixture
def template_service(tmp_path: Path, preset_service: PresetService) -> TemplateService:
    """TemplateService avec dossier temporaire injectable."""
    return TemplateService(
        preset_service=preset_service,
        templates_dir=tmp_path / "templates" / "custom",
    )


@pytest.fixture
def sample_template_data() -> Dict[str, Any]:
    """Payload de création générique (IDs fixtures, pas de fiches GDD réelles)."""
    return {
        "name": "Template test",
        "description": "Description de test",
        "category": "Confrontation",
        "icon": "⚔️",
        "configuration": {
            "characters": ["char-alpha"],
            "locations": ["loc-alpha"],
            "region": "loc-alpha",
            "subLocation": "loc-beta",
            "sceneType": "Generic",
            "instructions": "Instructions de scène",
            "llmModel": "gpt-5.6-terra",
            "llmProvider": "openai",
            "temperature": 0.7,
        },
    }


class TestTemplateServiceCreate:
    """Création de templates sur disque."""

    def test_create_template_success_writes_uuid_json(
        self,
        template_service: TemplateService,
        sample_template_data: Dict[str, Any],
    ) -> None:
        """Given un payload valide, when create, then UUID.json UTF-8 sur disque."""
        template, warnings = template_service.create_template(sample_template_data)

        assert template.name == "Template test"
        assert template.description == "Description de test"
        assert template.category == "Confrontation"
        assert template.icon == "⚔️"
        assert UUID(template.id)
        assert warnings == []
        assert template.configuration.characters == ["char-alpha"]
        assert template.configuration.llmProvider == "openai"
        assert template.configuration.temperature == 0.7

        template_file = template_service.templates_dir / f"{template.id}.json"
        assert template_file.exists()
        with open(template_file, "r", encoding="utf-8") as handle:
            saved = json.load(handle)
        assert saved["name"] == "Template test"
        assert saved["id"] == template.id
        assert saved["configuration"]["characters"] == ["char-alpha"]
        assert saved["history"][0]["action"] == "created"
        assert saved["history"][0]["at"]
        assert "char-alpha" in json.dumps(saved, ensure_ascii=False)

    def test_create_template_auto_creates_directory(
        self,
        tmp_path: Path,
        preset_service: PresetService,
        sample_template_data: Dict[str, Any],
    ) -> None:
        """Given un dossier inexistant, when create, then le dossier est créé."""
        templates_dir = tmp_path / "nested" / "custom"
        assert not templates_dir.exists()

        service = TemplateService(preset_service, templates_dir)
        template, _ = service.create_template(sample_template_data)

        assert templates_dir.exists()
        assert (templates_dir / f"{template.id}.json").exists()

    def test_create_template_obsolete_gdd_returns_warnings_not_error(
        self,
        template_service: TemplateService,
        sample_template_data: Dict[str, Any],
    ) -> None:
        """Given des IDs GDD inconnus, when create, then succès + warnings (pas d'exception)."""
        sample_template_data["configuration"]["characters"] = ["char-obsolete"]
        sample_template_data["configuration"]["locations"] = ["loc-obsolete"]
        sample_template_data["configuration"]["region"] = "loc-obsolete"

        template, warnings = template_service.create_template(sample_template_data)

        assert template.id
        assert len(warnings) >= 1
        assert any("not found" in w.lower() or "obsolète" in w.lower() or "not found" in w for w in warnings)
        assert (template_service.templates_dir / f"{template.id}.json").exists()


class TestTemplateServiceList:
    """Liste des templates."""

    def test_list_templates_empty(self, template_service: TemplateService) -> None:
        """Given aucun fichier, when list, then []."""
        assert template_service.list_templates() == []

    def test_list_templates_multiple_categories(
        self,
        template_service: TemplateService,
        sample_template_data: Dict[str, Any],
    ) -> None:
        """Given 3 templates / 2 catégories, when list, then les 3 sont retournés."""
        template_service.create_template({**sample_template_data, "name": "A", "category": "Salutation"})
        template_service.create_template({**sample_template_data, "name": "B", "category": "Confrontation"})
        template_service.create_template({**sample_template_data, "name": "C", "category": "Salutation"})

        templates = template_service.list_templates()
        names = {t.name for t in templates}
        categories = {t.category for t in templates}

        assert len(templates) == 3
        assert names == {"A", "B", "C"}
        assert categories == {"Salutation", "Confrontation"}

    def test_list_templates_skips_corrupted_files(
        self,
        template_service: TemplateService,
        sample_template_data: Dict[str, Any],
    ) -> None:
        """Given un JSON corrompu, when list, then il est ignoré sans crash."""
        template_service.create_template(sample_template_data)
        corrupted = template_service.templates_dir / "corrupted.json"
        corrupted.write_text("{ invalid json", encoding="utf-8")

        templates = template_service.list_templates()
        assert len(templates) == 1
        assert templates[0].name == "Template test"

    def test_list_templates_skips_non_object_json(
        self,
        template_service: TemplateService,
        sample_template_data: Dict[str, Any],
    ) -> None:
        """Given un JSON non-objet (liste), when list, then pas de crash."""
        template_service.create_template(sample_template_data)
        array_file = template_service.templates_dir / "array.json"
        array_file.write_text('["not", "an", "object"]', encoding="utf-8")

        templates = template_service.list_templates()
        assert len(templates) == 1
        assert templates[0].name == "Template test"


class TestTemplateServiceValidationReuse:
    """La validation GDD délègue à PresetService (pas de fork du resolver)."""

    def test_create_calls_preset_validate_preset_references(
        self,
        tmp_path: Path,
        sample_template_data: Dict[str, Any],
    ) -> None:
        """Given un PresetService mocké, when create, then validate_preset_references est appelé."""
        mock_preset = Mock(spec=PresetService)
        mock_preset.validate_preset_references.return_value = PresetValidationResult(
            valid=True,
            warnings=[],
            obsoleteRefs=[],
            resolvedRefs={},
        )
        service = TemplateService(mock_preset, tmp_path / "templates")

        service.create_template(sample_template_data)

        mock_preset.validate_preset_references.assert_called_once()

    def test_create_resolved_refs_preserves_llm_provider(
        self,
        tmp_path: Path,
        sample_template_data: Dict[str, Any],
    ) -> None:
        """Given un alias GDD résolu, when create, then remap + llmProvider conservé."""
        from api.schemas.preset import Preset

        sample_template_data["configuration"]["characters"] = ["char-alias"]
        mock_preset = Mock(spec=PresetService)
        mock_preset.validate_preset_references.return_value = PresetValidationResult(
            valid=True,
            warnings=["Alias résolu"],
            obsoleteRefs=[],
            resolvedRefs={"char-alias": "char-alpha"},
        )

        def apply_refs(preset: Preset, resolved_refs: Dict[str, str]) -> Preset:
            config = preset.configuration.model_copy(deep=True)
            config.characters = [
                resolved_refs.get(name, name) for name in config.characters
            ]
            return preset.model_copy(update={"configuration": config})

        mock_preset.apply_resolved_refs_to_preset.side_effect = apply_refs
        service = TemplateService(mock_preset, tmp_path / "templates")

        template, warnings = service.create_template(sample_template_data)

        assert template.configuration.characters == ["char-alpha"]
        assert template.configuration.llmProvider == "openai"
        assert warnings == ["Alias résolu"]

    def test_list_hydrates_history_from_metadata_when_missing(
        self,
        template_service: TemplateService,
        sample_template_data: Dict[str, Any],
    ) -> None:
        """Given un JSON sans history, when list, then une entrée created est synthétisée."""
        template, _ = template_service.create_template(sample_template_data)
        template_file = template_service.templates_dir / f"{template.id}.json"
        payload = json.loads(template_file.read_text(encoding="utf-8"))
        payload.pop("history", None)
        template_file.write_text(json.dumps(payload), encoding="utf-8")

        listed = template_service.list_templates()
        assert len(listed) == 1
        assert listed[0].history[0].action == "created"


class TestTemplateServiceGetUpdateDelete:
    """Lecture, mise à jour et suppression."""

    def test_get_template_returns_persisted(
        self,
        template_service: TemplateService,
        sample_template_data: Dict[str, Any],
    ) -> None:
        """Given un UUID existant, when get, then le template est retourné."""
        created, _ = template_service.create_template(sample_template_data)
        loaded = template_service.get_template(created.id)
        assert loaded.id == created.id
        assert loaded.name == created.name

    def test_get_template_missing_raises(
        self,
        template_service: TemplateService,
    ) -> None:
        """Given un UUID absent, when get, then FileNotFoundError."""
        with pytest.raises(FileNotFoundError):
            template_service.get_template("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")

    def test_update_keeps_same_id_and_appends_history(
        self,
        template_service: TemplateService,
        sample_template_data: Dict[str, Any],
    ) -> None:
        """Given un PUT nom, when update, then même UUID + history updated."""
        created, _ = template_service.create_template(sample_template_data)
        updated, warnings = template_service.update_template(
            created.id,
            {"name": "Nouveau nom", "description": "Desc 2"},
        )
        assert warnings == []
        assert updated.id == created.id
        assert updated.name == "Nouveau nom"
        assert updated.description == "Desc 2"
        assert updated.history[-1].action == "updated"
        assert (template_service.templates_dir / f"{created.id}.json").exists()
        assert len(list(template_service.templates_dir.glob("*.json"))) == 1

    def test_delete_removes_file(
        self,
        template_service: TemplateService,
        sample_template_data: Dict[str, Any],
    ) -> None:
        """Given un UUID existant, when delete, then le fichier disparaît."""
        created, _ = template_service.create_template(sample_template_data)
        template_service.delete_template(created.id)
        assert not (template_service.templates_dir / f"{created.id}.json").exists()
        assert template_service.list_templates() == []

    def test_update_missing_raises(
        self,
        template_service: TemplateService,
    ) -> None:
        """Given un UUID absent, when update, then FileNotFoundError."""
        with pytest.raises(FileNotFoundError):
            template_service.update_template(
                "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
                {"name": "Fantôme"},
            )

    def test_delete_missing_raises(
        self,
        template_service: TemplateService,
    ) -> None:
        """Given un UUID absent, when delete, then FileNotFoundError."""
        with pytest.raises(FileNotFoundError):
            template_service.delete_template("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")

    def test_validate_template_references_valid(
        self,
        template_service: TemplateService,
        sample_template_data: Dict[str, Any],
    ) -> None:
        """Given un template GDD OK, when validate, then valid sans muter."""
        created, _ = template_service.create_template(sample_template_data)
        result = template_service.validate_template_references(created.id)
        assert result.valid is True
        assert result.obsoleteRefs == []

    def test_validate_template_references_obsolete_does_not_mutate(
        self,
        template_service: TemplateService,
        sample_template_data: Dict[str, Any],
    ) -> None:
        """Given des refs obsolètes sur disque, when validate, then invalide et JSON intact."""
        created, _ = template_service.create_template(sample_template_data)
        path = template_service.templates_dir / f"{created.id}.json"
        payload = json.loads(path.read_text(encoding="utf-8"))
        payload["configuration"]["characters"] = ["char-ghost"]
        path.write_text(json.dumps(payload), encoding="utf-8")

        result = template_service.validate_template_references(created.id)
        assert result.valid is False
        assert "char-ghost" in result.obsoleteRefs

        reloaded = json.loads(path.read_text(encoding="utf-8"))
        assert reloaded["configuration"]["characters"] == ["char-ghost"]

    def test_validate_template_references_missing_raises(
        self,
        template_service: TemplateService,
    ) -> None:
        """Given un UUID absent, when validate, then FileNotFoundError."""
        with pytest.raises(FileNotFoundError):
            template_service.validate_template_references(
                "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
            )


class TestTemplateServicePrebuilt:
    """Catalogue pré-built lecture seule."""

    def test_list_and_get_from_catalog_file(
        self,
        template_service: TemplateService,
    ) -> None:
        """Given le JSON versionné, when list/get, then 7 fiches et slug OK."""
        listed = template_service.list_prebuilt_templates()
        assert len(listed) == 10
        loaded = template_service.get_prebuilt_template("confrontation")
        assert loaded.name == "Confrontation"
        assert loaded.configuration.characters == []

    def test_get_unknown_raises(self, template_service: TemplateService) -> None:
        """Given un slug absent, when get, then FileNotFoundError."""
        with pytest.raises(FileNotFoundError):
            template_service.get_prebuilt_template("inconnu")

    def test_missing_file_returns_empty(
        self,
        tmp_path: Path,
        preset_service: PresetService,
    ) -> None:
        """Given un chemin absent, when list, then []."""
        service = TemplateService(
            preset_service=preset_service,
            templates_dir=tmp_path / "custom",
            prebuilt_path=tmp_path / "missing.json",
        )
        assert service.list_prebuilt_templates() == []

