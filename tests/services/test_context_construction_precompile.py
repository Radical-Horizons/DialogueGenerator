"""Tests d'intégration : build_context_json lit le cache disque précompilé."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest

from core.context.context_builder import ContextBuilder, PROJECT_ROOT_DIR
from services import gdd_context_precompile as precompile_mod


@pytest.fixture
def context_builder() -> ContextBuilder:
    builder = ContextBuilder()
    builder.load_gdd_files()
    if not builder.get_characters_names():
        pytest.skip("GDD personnages indisponible")
    return builder


@pytest.mark.integration
def test_build_context_json_reads_disk_precompile_cache(
    context_builder: ContextBuilder,
) -> None:
    """Avec cache disque réel, _build_context_item n'est pas appelé."""
    manifest = PROJECT_ROOT_DIR / "data" / ".gdd_context_precompile" / "manifest.json"
    if not manifest.is_file():
        pytest.skip("Cache précompilation absent — lancer scripts.precompile_gdd_context")

    names = context_builder.get_characters_names()[:1]
    name = names[0]
    details = context_builder.get_character_details_by_name(name)
    assert details is not None

    variant = precompile_mod.load_variant(
        PROJECT_ROOT_DIR,
        "personnages",
        str(details.get("Nom") or name),
        "narrative",
        "full",
        "standard",
        expected_content_hash=precompile_mod.compute_content_hash(details),
    )
    if variant is None:
        pytest.skip(f"Pas de variante précompilée pour {name}")

    service = context_builder._context_construction_service
    assert service is not None
    with patch.object(service, "_build_context_item") as mock_build:
        result = context_builder.build_context_json(
            selected_elements={"characters": names},
            scene_instruction=" ",
            organization_mode="narrative",
        )
    mock_build.assert_not_called()
    assert result.metadata.totalTokens > 0
