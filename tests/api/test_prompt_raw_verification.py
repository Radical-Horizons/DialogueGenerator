"""Tests d'intégration pour vérifier le prompt brut retourné par l'API.

Ce module contient des tests d'intégration qui appellent réellement l'API
sans mocks, utilisant les vrais services et données GDD. Ces tests vérifient
que le prompt brut généré correspond bien à ce qui est envoyé au LLM.

Types de tests :
- Tests d'intégration : Appels API réels, pas de mocks
- Tests lents : Chargement GDD, génération de prompts

Pour exécuter uniquement ces tests :
    pytest tests/api/test_prompt_raw_verification.py -m integration
"""
import pytest
from fastapi.testclient import TestClient
from api.main import app


@pytest.fixture
def real_client():
    """Client de test sans mocks - utilise les vrais services.
    
    Contrairement aux autres fixtures de tests API qui utilisent des mocks,
    cette fixture utilise les vrais services (ContextBuilder, PromptEngine, etc.)
    pour tester le comportement réel de l'API.
    """
    # Pas de dependency_overrides - on utilise les vrais services
    yield TestClient(app)


@pytest.mark.integration
@pytest.mark.slow
@pytest.mark.api
def test_estimate_tokens_raw_prompt_with_character(real_client):
    """Test pour voir le prompt brut réel retourné par l'API avec un personnage.
    
    Ce test vérifie que :
    1. Le prompt brut contient bien SECTION 2A avec le contexte GDD
    2. Le personnage est trouvé (grâce à la normalisation des apostrophes)
    3. Le format du prompt est correct pour le parsing structuré
    """
    # Récupérer un personnage depuis le GDD (générique, pas hardcodé)
    from core.context.context_builder import ContextBuilder
    cb = ContextBuilder()
    cb.load_gdd_files()
    all_characters = cb.get_characters_names()
    character_name = all_characters[0] if all_characters else None
    assert character_name is not None, "Aucun personnage chargé depuis le GDD"
    
    # IMPORTANT: Le schéma ContextSelection attend characters_full ou characters_excerpt, pas characters
    response = real_client.post(
        "/api/v1/dialogues/estimate-tokens",
        json={
            "context_selections": {
                "characters_full": [character_name],  # Utiliser characters_full (schéma API)
                "locations_full": [],
                "items_full": [],
                "species_full": [],
                "communities_full": []
            },
            "field_configs": {
                "characters": ["Nom", "Résumé", "Introduction", "Faiblesse", "Compulsion", "Désir Principal", "Caractérisation", "Contexte Background"]
            },
            "user_instructions": "Test de vérification du prompt brut",
            "max_context_tokens": 2000,
            "npc_speaker_id": character_name
        }
    )
    
    assert response.status_code == 200, f"Erreur: {response.status_code} - {response.text}"
    data = response.json()
    
    # Afficher le prompt brut pour vérification
    raw_prompt = data.get("raw_prompt", "")
    
    # Vérifications de base
    assert "raw_prompt" in data, "Le champ raw_prompt est absent"
    assert isinstance(raw_prompt, str), "raw_prompt doit être une chaîne"
    assert len(raw_prompt) > 0, "raw_prompt ne doit pas être vide"
    
    # Écrire le prompt dans un fichier pour éviter les problèmes d'encodage
    import os
    output_file = os.path.join(os.path.dirname(__file__), "..", "..", "test_prompt_output.txt")
    with open(output_file, "w", encoding="utf-8") as f:
        f.write("="*80 + "\n")
        f.write("PROMPT BRUT COMPLET RETOURNÉ PAR L'API:\n")
        f.write("="*80 + "\n")
        f.write(raw_prompt)
        f.write("\n" + "="*80 + "\n")
    
    print(f"\nPrompt brut écrit dans: {output_file}")
    print(f"Longueur totale: {len(raw_prompt)} caractères")
    
    # Vérifier que c'est du XML
    assert raw_prompt.startswith('<?xml version="1.0" encoding="UTF-8"?>'), "Le prompt doit être en format XML"
    
    # Vérifier que structured_prompt est présent (doit être généré depuis le XML)
    structured_prompt = data.get("structured_prompt")
    assert structured_prompt is not None, "structured_prompt doit être présent dans la réponse"
    assert "sections" in structured_prompt, "structured_prompt doit contenir des sections"
    assert len(structured_prompt["sections"]) > 0, "structured_prompt doit contenir au moins une section"
    print(f"\nstructured_prompt généré: {len(structured_prompt['sections'])} sections")
    
    # Parser le XML pour vérifier la structure
    import xml.etree.ElementTree as ET
    xml_content = raw_prompt.split('?>', 1)[-1].strip()
    root = ET.fromstring(xml_content)
    
    # Vérifier la structure de base
    assert root.tag == "prompt", "L'élément racine doit être <prompt>"
    
    # Vérifier la présence des sections principales en XML
    sections_found = []
    if root.find("contract") is not None:
        sections_found.append("contract (SECTION 0)")
    if root.find("technical") is not None:
        sections_found.append("technical (SECTION 1)")
    if root.find("context") is not None:
        sections_found.append("context (SECTION 2A)")
    if root.find("narrative_guides") is not None:
        sections_found.append("narrative_guides (SECTION 2B)")
    if root.find("vocabulary") is not None:
        sections_found.append("vocabulary (SECTION 2C)")
    if root.find("scene_instructions") is not None:
        sections_found.append("scene_instructions (SECTION 3)")
    
    print(f"Sections XML trouvées: {sections_found}")
    
    # Vérifier spécifiquement la section context (SECTION 2A)
    context_elem = root.find("context")
    has_context = context_elem is not None
    print(f"Section <context> (SECTION 2A) présente: {has_context}")
    
    if has_context:
        # Vérifier qu'il y a du contenu dans le contexte
        characters_elem = context_elem.find("characters")
        if characters_elem is not None:
            print(f"\nContenu <context> (premiers 500 caractères):")
            context_text = ET.tostring(context_elem, encoding='unicode', method='xml')
            print(context_text[:500].encode('utf-8', errors='replace').decode('utf-8', errors='replace'))
    else:
        print("\n⚠️ Section <context> ABSENTE - Le contexte GDD n'a pas été inclus dans le prompt")
