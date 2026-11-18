"""Composition du contexte GDD du prompt graphe quand les fiches dépassent le budget.

Mesuré le 2026-11-18 sur un vrai dialogue : la fiche du PNJ, gonflée d'URL d'images et
d'UUID Notion, remplissait seule les 10 000 tokens et la troncature coupait le PJ, le lieu
et l'exemple de dialogue. Ces tests rendent le prompt complet (vrai ``ContextBuilder`` sur
un GDD factice, vrai ``PromptEngine``) et vérifient ce qui arrive au LLM.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from core.context.context_builder import ContextBuilder
from core.prompt.prompt_engine import PromptEngine
from services.graph_prompt_context import GraphPromptContextFactory
from services.gdd_relation_resolver import build_global_relation_index
from services.prompt_builder import PromptBuilder
from services.skill_catalog_service import SkillCatalogService
from services.trait_catalog_service import TraitCatalogService

NPC = "Témoin Gris"
PLAYER = "Voyageuse Test"
LOCATION = "Galerie Muette"
PLAYER_MARKER = "Voyageuse sans mémoire qui vouvoie tout le monde"
LOCATION_MARKER = "Galerie où les échos arrivent avant les voix"
NPC_ID = "1c36e4d21b4580f28124e9ddf8d9359e"
PLAYER_ID = "1996e4d21b4580c49c73ddac6322e9bd"
S3_URL = "https://prod-files-secure.s3.us-west-2.amazonaws.com/x/portrait.png?X-Amz-Signature=deadbeef"


@pytest.fixture
def prompt_context_factory(tmp_path: Path) -> GraphPromptContextFactory:
    """Fabrique sur un GDD factice : PNJ très long et bruité, PJ et lieu courts."""
    categories = tmp_path / "categories"
    categories.mkdir()
    import_dir = tmp_path / "import"
    import_dir.mkdir()
    long_npc_story = " ".join(f"L'archiviste compte la marche {i} et la note." for i in range(1500))
    characters = [
        {
            "Nom": NPC,
            "notion_page_id": NPC_ID,
            "values": {
                "Occupation": "Archiviste",
                "Relations principales": PLAYER_ID,
                "Date de création": "2025-03-27T22:22:00.000Z",
                "Slug": "temoin_gris",
            },
            "sections": {
                "preamble": f"![]({S3_URL})",
                "relations": f'Admire <mention-page url="https://app.notion.com/p/{PLAYER_ID}"/>.',
                "biographie": long_npc_story,
            },
        },
        {
            "Nom": PLAYER,
            "notion_page_id": PLAYER_ID,
            "sections": {"re_sume__de_la_fiche": PLAYER_MARKER},
        },
    ]
    locations = [{"Nom": LOCATION, "Introduction": LOCATION_MARKER}]
    # Shards (une fiche = un fichier) : c'est la forme que l'index des relations parcourt.
    for folder, records in (("personnages", characters), ("lieux", locations)):
        (categories / folder).mkdir()
        for position, record in enumerate(records):
            (categories / folder / f"fiche_{position}.json").write_text(
                json.dumps(record, ensure_ascii=False), encoding="utf-8"
            )
    (import_dir / "Vision.json").write_text("{}", encoding="utf-8")
    context_builder = ContextBuilder(gdd_categories_path=categories, gdd_import_path=import_dir)
    context_builder.load_gdd_files()
    # Même branchement que ServiceContainer._inject_relation_index_into_context_builder.
    context_builder._context_construction_service._relation_index = build_global_relation_index(
        categories
    )
    prompt_engine = PromptEngine(
        context_builder=context_builder,
        prompt_builder=PromptBuilder(context_builder=context_builder),
    )
    return GraphPromptContextFactory(
        context_builder, prompt_engine, SkillCatalogService(), TraitCatalogService()
    )


def render_prompt(factory: GraphPromptContextFactory, max_context_tokens: int) -> str:
    """Prompt complet d'un nœud de graphe pour la scène PNJ / PJ / lieu."""
    context = factory.build(
        {
            "characters_full": [NPC],
            "characters_excerpt": [PLAYER],
            "locations_full": [LOCATION],
            "scene_protagonists": {"personnage_a": PLAYER, "personnage_b": NPC},
        },
        npc_speaker_id=NPC,
        player_character_id=PLAYER,
        scene_instruction="Continue la scène.",
        max_context_tokens=max_context_tokens,
    )
    return context.render("Instructions pour la suite:\nContinue la scène.", None)


def test_long_npc_sheet_leaves_room_for_player_and_location(
    prompt_context_factory: GraphPromptContextFactory,
) -> None:
    """Au-delà du budget, le PJ et le lieu restent dans le prompt à côté du PNJ raccourci."""
    prompt = render_prompt(prompt_context_factory, max_context_tokens=10_000)

    assert PLAYER_MARKER in prompt
    assert LOCATION_MARKER in prompt
    assert "L'archiviste compte la marche 0 et la note." in prompt
    assert "L'archiviste compte la marche 1499 et la note." not in prompt
    assert "(extrait)" in prompt


def test_notion_noise_never_reaches_the_prompt(
    prompt_context_factory: GraphPromptContextFactory,
) -> None:
    """URL d'images, UUID, mentions brutes et propriétés de production sont absents."""
    prompt = render_prompt(prompt_context_factory, max_context_tokens=10_000)

    assert "amazonaws" not in prompt
    assert "mention-page" not in prompt
    assert PLAYER_ID not in prompt
    assert "temoin_gris" not in prompt
    assert "2025-03-27" not in prompt
    assert f"Admire {PLAYER}." in prompt
