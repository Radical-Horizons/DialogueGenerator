"""Tests pour le service GDDLoader."""
import pytest
import json
from pathlib import Path
from unittest.mock import MagicMock, patch
from services.gdd_loader import GDDLoader, GDDData


@pytest.fixture
def tmp_gdd_categories_dir(tmp_path):
    """Crée un répertoire temporaire pour les catégories GDD."""
    categories_dir = tmp_path / "GDD_categories"
    categories_dir.mkdir()
    return categories_dir


@pytest.fixture
def tmp_import_dir(tmp_path):
    """Crée un répertoire temporaire pour l'import."""
    import_dir = tmp_path / "import" / "Bible_Narrative"
    import_dir.mkdir(parents=True)
    return import_dir


@pytest.fixture
def sample_character_data():
    """Données de test pour un personnage."""
    return [
        {"Nom": "Test Character 1", "Age": 25},
        {"Nom": "Test Character 2", "Age": 30}
    ]


@pytest.fixture
def sample_location_data():
    """Données de test pour un lieu."""
    return [
        {"Nom": "Test Location 1", "Type": "City"},
        {"Nom": "Test Location 2", "Type": "Forest"}
    ]


@pytest.fixture
def sample_vision_data():
    """Données de test pour Vision.json."""
    return {"title": "Test Vision", "content": "Test content"}


class TestGDDLoader:
    """Tests pour GDDLoader."""
    
    def test_init_with_paths(self, tmp_gdd_categories_dir, tmp_import_dir):
        """Test d'initialisation avec chemins explicites."""
        loader = GDDLoader(
            categories_path=tmp_gdd_categories_dir,
            import_path=tmp_import_dir
        )
        
        assert loader._categories_path == tmp_gdd_categories_dir
        assert loader._import_path == tmp_import_dir
    
    def test_init_with_env_vars(self, tmp_gdd_categories_dir, tmp_import_dir, monkeypatch):
        """Test d'initialisation avec variables d'environnement."""
        monkeypatch.setenv("GDD_CATEGORIES_PATH", str(tmp_gdd_categories_dir))
        monkeypatch.setenv("GDD_IMPORT_PATH", str(tmp_import_dir))
        
        loader = GDDLoader()
        
        assert loader._categories_path == tmp_gdd_categories_dir
        assert loader._import_path == tmp_import_dir
    
    def test_load_category_list(self, tmp_gdd_categories_dir, sample_character_data):
        """Test de chargement d'une catégorie de type liste."""
        # Créer le fichier JSON
        character_file = tmp_gdd_categories_dir / "personnages.json"
        with open(character_file, "w", encoding="utf-8") as f:
            json.dump({"personnages": sample_character_data}, f, ensure_ascii=False)
        
        loader = GDDLoader(categories_path=tmp_gdd_categories_dir)
        result = loader.load_category("personnages")
        
        assert result == sample_character_data
        assert len(result) == 2
        assert result[0]["Nom"] == "Test Character 1"
    
    def test_load_category_not_found(self, tmp_gdd_categories_dir):
        """Test de chargement d'une catégorie inexistante."""
        loader = GDDLoader(categories_path=tmp_gdd_categories_dir)
        result = loader.load_category("nonexistent")
        
        assert result == []
    
    def test_load_vision(self, tmp_import_dir, sample_vision_data):
        """Test de chargement de Vision.json."""
        vision_file = tmp_import_dir / "Vision.json"
        with open(vision_file, "w", encoding="utf-8") as f:
            json.dump(sample_vision_data, f, ensure_ascii=False)
        
        loader = GDDLoader(import_path=tmp_import_dir)
        result = loader.load_vision()
        
        assert result == sample_vision_data
        assert result["title"] == "Test Vision"
    
    def test_load_vision_not_found(self, tmp_import_dir):
        """Test de chargement de Vision.json inexistant."""
        loader = GDDLoader(import_path=tmp_import_dir)
        result = loader.load_vision()
        
        assert result is None
    
    def test_load_all(self, tmp_gdd_categories_dir, tmp_import_dir, 
                      sample_character_data, sample_location_data, sample_vision_data):
        """Test de chargement de tous les fichiers."""
        # Créer les fichiers
        character_file = tmp_gdd_categories_dir / "personnages.json"
        with open(character_file, "w", encoding="utf-8") as f:
            json.dump({"personnages": sample_character_data}, f, ensure_ascii=False)
        
        location_file = tmp_gdd_categories_dir / "lieux.json"
        with open(location_file, "w", encoding="utf-8") as f:
            json.dump({"lieux": sample_location_data}, f, ensure_ascii=False)
        
        vision_file = tmp_import_dir / "Vision.json"
        with open(vision_file, "w", encoding="utf-8") as f:
            json.dump(sample_vision_data, f, ensure_ascii=False)
        
        loader = GDDLoader(
            categories_path=tmp_gdd_categories_dir,
            import_path=tmp_import_dir
        )
        result = loader.load_all()
        
        assert isinstance(result, GDDData)
        assert len(result.characters) == 2
        assert len(result.locations) == 2
        assert result.vision_data == sample_vision_data
    
    def test_load_category_invalid_json(self, tmp_gdd_categories_dir):
        """Test de chargement avec JSON invalide."""
        character_file = tmp_gdd_categories_dir / "personnages.json"
        with open(character_file, "w", encoding="utf-8") as f:
            f.write("invalid json")
        
        loader = GDDLoader(categories_path=tmp_gdd_categories_dir)
        result = loader.load_category("personnages")
        
        # Devrait retourner la valeur par défaut (liste vide)
        assert result == []
    
    def test_load_category_with_cache(self, tmp_gdd_categories_dir, sample_character_data):
        """Test de chargement (le cache est testé via l'interface publique)."""
        # Le cache est géré en interne, on teste juste que le chargement fonctionne
        character_file = tmp_gdd_categories_dir / "personnages.json"
        with open(character_file, "w", encoding="utf-8") as f:
            json.dump({"personnages": sample_character_data}, f, ensure_ascii=False)
        
        loader = GDDLoader(categories_path=tmp_gdd_categories_dir)
        result = loader.load_category("personnages")
        
        assert result == sample_character_data
