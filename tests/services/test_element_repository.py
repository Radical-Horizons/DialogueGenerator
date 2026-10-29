"""Tests pour le service ElementRepository."""
import pytest
from services.element_repository import ElementRepository, ElementCategory
from services.gdd_loader import GDDData


@pytest.fixture
def sample_gdd_data():
    """Données GDD de test."""
    return GDDData(
        characters=[
            {"Nom": "Character 1", "Age": 25},
            {"Nom": "Character 2", "Age": 30}
        ],
        locations=[
            {"Nom": "Location 1", "Type": "City"},
            {"Nom": "Location 2", "Type": "Forest"}
        ],
        items=[
            {"Nom": "Item 1", "Type": "Weapon"}
        ],
        species=[
            {"Nom": "Species 1"}
        ],
        communities=[
            {"Nom": "Community 1"}
        ],
        quests=[
            {"Nom": "Quest 1"}
        ],
        dialogues_examples=[
            {"Nom": "Dialogue 1", "Titre": "Title 1"}
        ]
    )


@pytest.fixture
def repository(sample_gdd_data):
    """Repository de test."""
    return ElementRepository(sample_gdd_data)


class TestElementRepository:
    """Tests pour ElementRepository."""
    
    def test_get_names_characters(self, repository):
        """Test de récupération des noms de personnages."""
        names = repository.get_names(ElementCategory.CHARACTERS)
        
        assert len(names) == 2
        assert "Character 1" in names
        assert "Character 2" in names
    
    def test_get_names_locations(self, repository):
        """Test de récupération des noms de lieux."""
        names = repository.get_names(ElementCategory.LOCATIONS)
        
        assert len(names) == 2
        assert "Location 1" in names
        assert "Location 2" in names
    
    def test_get_by_name_found(self, repository):
        """Test de récupération d'un élément par nom (trouvé)."""
        character = repository.get_by_name(ElementCategory.CHARACTERS, "Character 1")
        
        assert character is not None
        assert character["Nom"] == "Character 1"
        assert character["Age"] == 25
    
    def test_get_by_name_not_found(self, repository):
        """Test de récupération d'un élément par nom (non trouvé)."""
        character = repository.get_by_name(ElementCategory.CHARACTERS, "Nonexistent")
        
        assert character is None
    
    def test_get_by_name_normalization(self):
        """Test de normalisation des noms (apostrophes typographiques)."""
        # Créer des données avec apostrophe typographique (U+2019)
        gdd_data = GDDData(
            characters=[
                {"Nom": "L\u2019épée"}  # Apostrophe typographique U+2019
            ]
        )
        repo = ElementRepository(gdd_data)
        
        # Rechercher avec apostrophe droite (U+0027)
        result = repo.get_by_name(ElementCategory.CHARACTERS, "L'épée")
        
        # Doit trouver grâce à la normalisation
        assert result is not None
        assert result["Nom"] == "L\u2019épée"
    
    def test_get_by_name_historical_alias_plus_nom(self):
        """Nom historique « alias + Nom » (ex. Seigneuresse Uresaïr)."""
        gdd_data = GDDData(
            characters=[
                {
                    "Nom": "Uresaïr",
                    "values": {"Alias": "Seigneuresse, La Rebelle Immortelle"},
                }
            ]
        )
        repo = ElementRepository(gdd_data)
        
        result = repo.get_by_name(ElementCategory.CHARACTERS, "Seigneuresse Uresaïr")
        
        assert result is not None
        assert result["Nom"] == "Uresaïr"

    def test_get_by_name_historical_nom_comma_alias(self):
        """Forme historique « Nom, alias » (presets / prompts Akthar)."""
        gdd_data = GDDData(
            characters=[
                {
                    "Nom": "Akthar-Neth Amatru",
                    "values": {
                        "Alias": "Grand-Père, Le Nœud Éternel, l\u2019Exégète",
                    },
                }
            ]
        )
        repo = ElementRepository(gdd_data)

        # Apostrophe typographique U+2019 (comme dans les sélections UI persistées)
        result = repo.get_by_name(
            ElementCategory.CHARACTERS,
            "Akthar-Neth Amatru, l\u2019Exégète",
        )
        assert result is not None
        assert result["Nom"] == "Akthar-Neth Amatru"

        # Apostrophe droite aussi
        result_ascii = repo.get_by_name(
            ElementCategory.CHARACTERS,
            "Akthar-Neth Amatru, l'Exégète",
        )
        assert result_ascii is not None
        assert result_ascii["Nom"] == "Akthar-Neth Amatru"
    
    def test_get_all(self, repository):
        """Test de récupération de tous les éléments."""
        characters = repository.get_all(ElementCategory.CHARACTERS)
        
        assert len(characters) == 2
        assert all(isinstance(c, dict) for c in characters)
    
    def test_get_all_empty(self):
        """Test de récupération avec catégorie vide."""
        gdd_data = GDDData(characters=[])
        repo = ElementRepository(gdd_data)
        
        result = repo.get_all(ElementCategory.CHARACTERS)
        
        assert result == []
    
    # Tests de compatibilité avec l'ancienne interface
    def test_get_characters_names(self, repository):
        """Test de méthode de compatibilité get_characters_names()."""
        names = repository.get_characters_names()
        
        assert len(names) == 2
        assert "Character 1" in names
    
    def test_get_character_details_by_name(self, repository):
        """Test de méthode de compatibilité get_character_details_by_name()."""
        character = repository.get_character_details_by_name("Character 1")
        
        assert character is not None
        assert character["Nom"] == "Character 1"
    
    def test_get_dialogue_example_details_by_title(self, repository):
        """Test de récupération par titre pour les dialogues."""
        # Peut chercher par Nom ou Titre
        dialogue1 = repository.get_dialogue_example_details_by_title("Dialogue 1")
        dialogue2 = repository.get_dialogue_example_details_by_title("Title 1")
        
        assert dialogue1 is not None
        assert dialogue2 is not None
        assert dialogue1 == dialogue2
