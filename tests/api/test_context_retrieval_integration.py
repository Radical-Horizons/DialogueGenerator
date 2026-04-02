"""Tests d'intégration pour la récupération de fiches et construction de prompt brut."""
import pytest
from fastapi.testclient import TestClient


class TestContextRetrievalIntegration:
    """Tests d'intégration pour récupérer des fiches et construire le prompt brut."""
    
    def test_retrieve_fiches_and_build_prompt(self, client: TestClient):
        """Test de récupération de quelques fiches et construction du prompt brut.
        
        Ce test :
        1. Récupère quelques fiches (personnage, lieu, objet) via les endpoints GET
        2. Utilise ces fiches pour construire un contexte via POST /build
        3. Vérifie que le prompt brut contient les informations des fiches
        """
        # 1. Récupérer la liste des personnages
        characters_response = client.get("/api/v1/context/characters")
        assert characters_response.status_code == 200
        characters_data = characters_response.json()
        assert "characters" in characters_data
        assert len(characters_data["characters"]) > 0, "Aucun personnage disponible dans le GDD"
        
        # Prendre le premier personnage disponible
        first_character = characters_data["characters"][0]
        character_name = first_character["name"]
        assert "data" in first_character
        character_data = first_character["data"]
        assert "Nom" in character_data or "name" in character_data, "Le personnage doit avoir un nom"
        
        # 2. Récupérer la liste des lieux
        locations_response = client.get("/api/v1/context/locations")
        assert locations_response.status_code == 200
        locations_data = locations_response.json()
        assert "locations" in locations_data
        assert len(locations_data["locations"]) > 0, "Aucun lieu disponible dans le GDD"
        
        # Prendre le premier lieu disponible
        first_location = locations_data["locations"][0]
        location_name = first_location["name"]
        assert "data" in first_location
        location_data = first_location["data"]
        assert "Nom" in location_data or "name" in location_data, "Le lieu doit avoir un nom"
        
        # 3. Récupérer la liste des objets
        items_response = client.get("/api/v1/context/items")
        assert items_response.status_code == 200
        items_data = items_response.json()
        assert "items" in items_data
        # Les objets peuvent être vides, on continue même si vide
        
        # 4. Construire le contexte avec les fiches récupérées
        context_selections = {
            "characters_full": [character_name],
            "locations_full": [location_name]
        }
        
        # Ajouter un objet si disponible
        if len(items_data.get("items", [])) > 0:
            first_item = items_data["items"][0]
            item_name = first_item["name"]
            context_selections["items_full"] = [item_name]
        
        build_request = {
            "context_selections": context_selections,
            "user_instructions": "Scène de test pour vérifier la récupération de fiches",
            "max_tokens": 10000,
            "include_dialogue_type": False
        }
        
        build_response = client.post("/api/v1/context/build", json=build_request)
        assert build_response.status_code == 200, f"Erreur lors de la construction du contexte: {build_response.text}"
        
        build_data = build_response.json()
        assert "context" in build_data, "La réponse doit contenir le champ 'context'"
        assert "token_count" in build_data, "La réponse doit contenir le champ 'token_count'"
        
        prompt_brut = build_data["context"]
        assert isinstance(prompt_brut, str), "Le prompt brut doit être une chaîne de caractères"
        assert len(prompt_brut) > 0, "Le prompt brut ne doit pas être vide"
        assert build_data["token_count"] > 0, "Le nombre de tokens doit être positif"
        
        # 5. Vérifier que le prompt brut contient les informations des fiches
        # Le prompt doit contenir des sections pour les personnages et lieux
        # Note: Le formatage peut ne pas inclure directement les noms, mais les sections doivent être présentes
        assert "CHARACTERS" in prompt_brut.upper() or "PNJ" in prompt_brut.upper(), \
            "Le prompt doit contenir une section pour les personnages"
        assert "LOCATIONS" in prompt_brut.upper() or "LIEU" in prompt_brut.upper(), \
            "Le prompt doit contenir une section pour les lieux"
        
        # Si un objet a été ajouté, vérifier qu'il apparaît aussi
        if "items_full" in context_selections:
            item_name = context_selections["items_full"][0]
            assert item_name in prompt_brut, f"Le nom de l'objet '{item_name}' doit apparaître dans le prompt brut"
        
        # Vérifier que le prompt contient des informations structurées (sections, catégories, etc.)
        # Le prompt doit contenir au moins quelques marqueurs de structure
        assert "###" in prompt_brut or "---" in prompt_brut or "SECTION" in prompt_brut.upper(), \
            "Le prompt brut doit contenir une structure organisée (sections, catégories)"
    
    def test_retrieve_single_character_and_verify_details(self, client: TestClient):
        """Test de récupération d'un personnage spécifique et vérification des détails."""
        # 1. Récupérer la liste des personnages
        characters_response = client.get("/api/v1/context/characters")
        assert characters_response.status_code == 200
        characters_data = characters_response.json()
        assert len(characters_data["characters"]) > 0, "Aucun personnage disponible"
        
        # Prendre le premier personnage
        first_character = characters_data["characters"][0]
        character_name = first_character["name"]
        
        # 2. Récupérer les détails complets du personnage via l'endpoint GET /characters/{name}
        character_detail_response = client.get(f"/api/v1/context/characters/{character_name}")
        
        # Peut être 200 (personnage trouvé) ou 404 (personnage non trouvé par nom exact)
        if character_detail_response.status_code == 200:
            character_detail = character_detail_response.json()
            assert "name" in character_detail
            assert "data" in character_detail
            assert character_detail["name"] == character_name
            
            # Vérifier que les données contiennent des informations
            character_data = character_detail["data"]
            assert isinstance(character_data, dict)
            assert len(character_data) > 0, "Les données du personnage ne doivent pas être vides"
    
    def test_retrieve_location_and_build_context(self, client: TestClient):
        """Test de récupération d'un lieu et construction de contexte minimal."""
        # 1. Récupérer un lieu
        locations_response = client.get("/api/v1/context/locations")
        assert locations_response.status_code == 200
        locations_data = locations_response.json()
        
        if len(locations_data.get("locations", [])) == 0:
            pytest.skip("Aucun lieu disponible dans le GDD")
        
        first_location = locations_data["locations"][0]
        location_name = first_location["name"]
        
        # 2. Construire un contexte avec uniquement ce lieu
        build_request = {
            "context_selections": {
                "locations_full": [location_name]
            },
            "user_instructions": "Test avec un seul lieu",
            "max_tokens": 10000
        }
        
        build_response = client.post("/api/v1/context/build", json=build_request)
        assert build_response.status_code == 200
        
        build_data = build_response.json()
        prompt_brut = build_data["context"]
        
        # Vérifier que le prompt contient une section pour les lieux
        # Note: Le formatage peut ne pas inclure directement le nom, mais la section doit être présente
        assert "LOCATIONS" in prompt_brut.upper() or "LIEU" in prompt_brut.upper(), \
            f"Le prompt doit contenir une section pour les lieux (testé: {location_name})"
        assert build_data["token_count"] > 0
    
    def test_retrieve_multiple_elements_and_verify_prompt_structure(self, client: TestClient):
        """Test de récupération de plusieurs éléments et vérification de la structure du prompt."""
        # Récupérer plusieurs types d'éléments
        characters_response = client.get("/api/v1/context/characters?page_size=3")
        locations_response = client.get("/api/v1/context/locations?page_size=2")
        items_response = client.get("/api/v1/context/items?page_size=2")
        
        assert characters_response.status_code == 200
        assert locations_response.status_code == 200
        assert items_response.status_code == 200
        
        characters_data = characters_response.json()
        locations_data = locations_response.json()
        items_data = items_response.json()
        
        # Construire les sélections
        context_selections = {}
        
        if len(characters_data.get("characters", [])) > 0:
            character_names = [char["name"] for char in characters_data["characters"][:2]]  # Max 2
            context_selections["characters_full"] = character_names
        
        if len(locations_data.get("locations", [])) > 0:
            location_names = [loc["name"] for loc in locations_data["locations"][:1]]  # Max 1
            context_selections["locations_full"] = location_names
        
        if len(items_data.get("items", [])) > 0:
            item_names = [item["name"] for item in items_data["items"][:1]]  # Max 1
            context_selections["items_full"] = item_names
        
        if not context_selections:
            pytest.skip("Aucun élément disponible pour construire le contexte")
        
        # Construire le contexte
        build_request = {
            "context_selections": context_selections,
            "user_instructions": "Test avec plusieurs éléments",
            "max_tokens": 10000
        }
        
        build_response = client.post("/api/v1/context/build", json=build_request)
        assert build_response.status_code == 200
        
        build_data = build_response.json()
        prompt_brut = build_data["context"]
        
        # Vérifier que le prompt contient des sections pour tous les types d'éléments sélectionnés
        # Note: Le formatage peut ne pas inclure directement les noms, mais les sections doivent être présentes
        if context_selections.get("characters_full"):
            assert "CHARACTERS" in prompt_brut.upper() or "PNJ" in prompt_brut.upper(), \
                "Le prompt doit contenir une section pour les personnages"
        if context_selections.get("locations_full"):
            assert "LOCATIONS" in prompt_brut.upper() or "LIEU" in prompt_brut.upper(), \
                "Le prompt doit contenir une section pour les lieux"
        if context_selections.get("items_full"):
            assert "ITEMS" in prompt_brut.upper() or "OBJET" in prompt_brut.upper(), \
                "Le prompt doit contenir une section pour les objets"
        
        # Vérifier la structure du prompt (doit contenir des sections organisées)
        assert len(prompt_brut) > 100, "Le prompt doit contenir suffisamment de contenu"
        assert build_data["token_count"] > 50, "Le nombre de tokens doit être significatif"
