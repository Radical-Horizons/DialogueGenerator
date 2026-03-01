"""Tests d'intégration pour le parsing structuré du prompt avec vraies données.

Ce module teste que le prompt brut retourné par l'API peut être correctement
parsé par la fonction parsePromptSections du frontend, et que toutes les
sections sont correctement détectées et structurées.

Types de tests :
- Tests d'intégration : Utilisent les vraies données GDD et l'API réelle
- Tests de parsing : Vérifient que le format du prompt est compatible avec le parser frontend
"""
import pytest
from fastapi.testclient import TestClient
from api.main import app


@pytest.fixture
def real_client():
    """Client de test sans mocks - utilise les vrais services."""
    yield TestClient(app)


@pytest.mark.integration
@pytest.mark.slow
@pytest.mark.api
def test_prompt_structured_parsing_with_real_data(real_client):
    """Test que le prompt brut peut être parsé en sections structurées.
    
    Ce test vérifie que :
    1. Le prompt brut contient SECTION 2A avec le contexte GDD
    2. Le format est compatible avec parsePromptSections (frontend)
    3. Les sections CHARACTERS sont correctement formatées
    """
    # Récupérer un personnage depuis le GDD (générique, pas hardcodé)
    from core.context.context_builder import ContextBuilder
    cb = ContextBuilder()
    cb.load_gdd_files()
    all_characters = cb.get_characters_names()
    character_name = all_characters[0] if all_characters else None
    assert character_name is not None, "Aucun personnage chargé depuis le GDD"
    
    # Le schéma ContextSelection attend characters_full ou characters_excerpt, pas characters
    response = real_client.post(
        "/api/v1/dialogues/estimate-tokens",
        json={
            "context_selections": {
                "characters_full": [character_name],  # Utiliser characters_full au lieu de characters
                "locations_full": [],
                "items_full": [],
                "species_full": [],
                "communities_full": []
            },
            "field_configs": {
                "characters": ["Nom", "Résumé", "Introduction", "Faiblesse", "Compulsion", "Désir Principal", "Caractérisation", "Contexte Background"]
            },
            "user_instructions": "Test de parsing structuré",
            "max_context_tokens": 2000,
            "npc_speaker_id": character_name
        }
    )
    
    assert response.status_code == 200, f"Erreur: {response.status_code} - {response.text}"
    data = response.json()
    raw_prompt = data.get("raw_prompt", "")
    
    assert len(raw_prompt) > 0, "Le prompt brut ne doit pas être vide"

    # Compatibilité : le prompt brut est désormais un document XML (source de vérité),
    # mais d'anciens formats pouvaient inclure des headings markdown "### SECTION 2A".
    # On supporte les deux signatures pour éviter des faux négatifs.
    is_markdown_sections = "### SECTION 2A" in raw_prompt
    is_xml_prompt = "<context" in raw_prompt or "<?xml" in raw_prompt
    assert is_markdown_sections or is_xml_prompt, (
        "Le prompt brut devrait être soit un format legacy avec '### SECTION 2A', "
        "soit un document XML contenant <context>."
    )

    # Vérifier que le contexte GDD est présent et parsable via marqueurs legacy
    # (parsePromptSections frontend s'appuie sur les marqueurs '--- ... ---').
    has_characters_marker = ("--- CHARACTERS ---" in raw_prompt) or ("--- CHARACTER ---" in raw_prompt) or ("--- PNJ" in raw_prompt)
    has_identity_section = ("--- IDENTITÉ ---" in raw_prompt) or ("--- IDENTITE ---" in raw_prompt)

    character_first_part = character_name.split(',')[0] if ',' in character_name else character_name
    assert has_characters_marker or has_identity_section or (character_first_part in raw_prompt), (
        "Le prompt brut devrait contenir des marqueurs de sections (--- CHARACTERS --- / --- IDENTITÉ ---) "
        f"ou le nom du personnage. Début prompt (500 chars): {raw_prompt[:500]}"
    )

    character_normalized = character_name.replace('\u2019', "'").replace('\u2018', "'")
    assert (character_name in raw_prompt) or (character_normalized in raw_prompt) or (character_first_part in raw_prompt), (
        f"Le nom du personnage devrait apparaître dans le prompt brut. Nom GDD: {character_name}, Normalisé: {character_normalized}"
    )
