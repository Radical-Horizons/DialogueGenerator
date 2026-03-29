"""Tests pour le service ElementResolver."""
import pytest
from services.element_resolver import ElementResolver
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
            {"Nom": "Dialogue 1", "Titre": "Title 1", "ID": "dialogue-1"}
        ]
    )


@pytest.fixture
def repository(sample_gdd_data):
    """Repository de test."""
    return ElementRepository(sample_gdd_data)


@pytest.fixture
def resolver(repository):
    """Resolver de test."""
    return ElementResolver(repository)


class TestElementResolver:
    """Tests pour ElementResolver."""
    
    def test_get_element_type(self, resolver):
        """Test de récupération du type d'élément."""
        assert resolver.get_element_type("characters") == "character"
        assert resolver.get_element_type("locations") == "location"
        assert resolver.get_element_type("items") == "item"
        assert resolver.get_element_type("species") == "species"
        assert resolver.get_element_type("communities") == "community"
        assert resolver.get_element_type("quests") == "quest"
        # Catégorie inconnue retourne la clé telle quelle
        assert resolver.get_element_type("unknown") == "unknown"
    
    def test_get_element_label(self, resolver):
        """Test de récupération du label d'élément."""
        assert resolver.get_element_label("characters") == "PNJ"
        assert resolver.get_element_label("locations") == "LIEU"
        assert resolver.get_element_label("items") == "OBJET"
        assert resolver.get_element_label("species") == "ESPÈCE"
        assert resolver.get_element_label("communities") == "COMMUNAUTÉ"
        assert resolver.get_element_label("quests") == "QUÊTE"
        # Catégorie inconnue retourne la clé en majuscules
        assert resolver.get_element_label("unknown") == "UNKNOWN"
    
    def test_get_category_element_category(self, resolver):
        """Test de récupération de l'ElementCategory."""
        assert resolver.get_category_element_category("characters") == ElementCategory.CHARACTERS
        assert resolver.get_category_element_category("locations") == ElementCategory.LOCATIONS
        assert resolver.get_category_element_category("items") == ElementCategory.ITEMS
        assert resolver.get_category_element_category("species") == ElementCategory.SPECIES
        assert resolver.get_category_element_category("communities") == ElementCategory.COMMUNITIES
        assert resolver.get_category_element_category("quests") == ElementCategory.QUESTS
        assert resolver.get_category_element_category("dialogues_examples") == ElementCategory.DIALOGUES
        assert resolver.get_category_element_category("characters_full") == ElementCategory.CHARACTERS
        assert resolver.get_category_element_category("characters_excerpt") == ElementCategory.CHARACTERS
        assert resolver.get_category_element_category("locations_full") == ElementCategory.LOCATIONS
        # Catégorie inconnue retourne None
        assert resolver.get_category_element_category("unknown") is None
    
    def test_get_names_characters(self, resolver):
        """Test de récupération des noms de personnages."""
        names = resolver.get_names("characters")
        
        assert len(names) == 2
        assert "Character 1" in names
        assert "Character 2" in names
    
    def test_get_names_locations(self, resolver):
        """Test de récupération des noms de lieux."""
        names = resolver.get_names("locations")
        
        assert len(names) == 2
        assert "Location 1" in names
        assert "Location 2" in names
    
    def test_get_names_without_repository(self):
        """Test de récupération des noms sans repository."""
        resolver = ElementResolver(None)
        names = resolver.get_names("characters")
        
        assert names == []
    
    def test_get_names_invalid_category(self, resolver):
        """Test de récupération des noms avec catégorie invalide."""
        names = resolver.get_names("unknown_category")
        
        assert names == []
    
    def test_get_by_name_found(self, resolver):
        """Test de récupération d'un élément par nom (trouvé)."""
        character = resolver.get_by_name("characters", "Character 1")
        
        assert character is not None
        assert character["Nom"] == "Character 1"
        assert character["Age"] == 25
    
    def test_get_by_name_not_found(self, resolver):
        """Test de récupération d'un élément par nom (non trouvé)."""
        character = resolver.get_by_name("characters", "Nonexistent")
        
        assert character is None
    
    def test_get_by_name_without_repository(self):
        """Test de récupération d'un élément sans repository."""
        resolver = ElementResolver(None)
        character = resolver.get_by_name("characters", "Character 1")
        
        assert character is None
    
    def test_get_by_name_invalid_category(self, resolver):
        """Test de récupération d'un élément avec catégorie invalide."""
        result = resolver.get_by_name("unknown_category", "Name")
        
        assert result is None

    def test_get_by_name_characters_full_alias(self, resolver):
        """Clé characters_full (sélection contexte) résout comme characters."""
        character = resolver.get_by_name("characters_full", "Character 1")
        assert character is not None
        assert character["Nom"] == "Character 1"
    
    def test_resolve_element_data(self, resolver):
        """Test de résolution d'éléments (alias de get_by_name)."""
        character = resolver.resolve_element_data("characters", "Character 1")
        
        assert character is not None
        assert character["Nom"] == "Character 1"
    
    def test_get_dialogue_examples_titles(self, resolver):
        """Test de récupération des titres d'exemples de dialogues."""
        titles = resolver.get_dialogue_examples_titles()
        
        assert len(titles) == 1
        assert "Dialogue 1" in titles
    
    def test_get_dialogue_examples_titles_without_repository(self):
        """Test de récupération des titres sans repository."""
        resolver = ElementResolver(None)
        titles = resolver.get_dialogue_examples_titles()
        
        assert titles == []
    
    def test_get_dialogue_examples_titles_fallback_to_id(self):
        """Test de fallback vers ID si Nom et Titre absents."""
        gdd_data = GDDData(
            dialogues_examples=[
                {"ID": "dialogue-1"}
            ]
        )
        repository = ElementRepository(gdd_data)
        resolver = ElementResolver(repository)
        
        titles = resolver.get_dialogue_examples_titles()
        
        assert len(titles) == 1
        assert "dialogue-1" in titles
    
    def test_prioritize_elements(self, resolver):
        """Test de priorisation des éléments selon l'ordre standard."""
        selected_elements = {
            "items": ["Item 1"],
            "characters": ["Character 1"],
            "locations": ["Location 1"],
            "quests": ["Quest 1"],
            "species": ["Species 1"],
            "communities": ["Community 1"]
        }
        
        prioritized = resolver.prioritize_elements(selected_elements)
        
        # Vérifier l'ordre : characters, species, communities, locations, items, quests
        keys = list(prioritized.keys())
        assert keys == ["characters", "species", "communities", "locations", "items", "quests"]
    
    def test_prioritize_elements_with_unknown_category(self, resolver):
        """Test de priorisation avec catégorie inconnue."""
        selected_elements = {
            "characters": ["Character 1"],
            "unknown_category": ["Unknown 1"],
            "locations": ["Location 1"]
        }
        
        prioritized = resolver.prioritize_elements(selected_elements)
        
        # Les catégories connues doivent être en premier, puis les inconnues
        keys = list(prioritized.keys())
        assert "characters" in keys
        assert "locations" in keys
        assert "unknown_category" in keys
        assert keys.index("characters") < keys.index("unknown_category")
        assert keys.index("locations") < keys.index("unknown_category")


class TestElementResolverMappings:
    """Tests pour les mappings centralisés."""
    
    def test_element_type_map_completeness(self):
        """Vérifie que tous les types d'éléments sont mappés."""
        resolver = ElementResolver(None)
        
        expected_mappings = {
            "characters": "character",
            "locations": "location",
            "items": "item",
            "species": "species",
            "communities": "community",
            "quests": "quest",
        }
        
        for category, expected_type in expected_mappings.items():
            assert resolver.get_element_type(category) == expected_type
    
    def test_element_label_map_completeness(self):
        """Vérifie que tous les labels d'éléments sont mappés."""
        resolver = ElementResolver(None)
        
        expected_mappings = {
            "characters": "PNJ",
            "locations": "LIEU",
            "items": "OBJET",
            "species": "ESPÈCE",
            "communities": "COMMUNAUTÉ",
            "quests": "QUÊTE",
        }
        
        for category, expected_label in expected_mappings.items():
            assert resolver.get_element_label(category) == expected_label
    
    def test_category_to_element_category_completeness(self):
        """Vérifie que toutes les catégories sont mappées vers ElementCategory."""
        resolver = ElementResolver(None)
        
        expected_mappings = {
            "characters": ElementCategory.CHARACTERS,
            "locations": ElementCategory.LOCATIONS,
            "items": ElementCategory.ITEMS,
            "species": ElementCategory.SPECIES,
            "communities": ElementCategory.COMMUNITIES,
            "quests": ElementCategory.QUESTS,
            "dialogues_examples": ElementCategory.DIALOGUES,
        }
        
        for category, expected_element_category in expected_mappings.items():
            assert resolver.get_category_element_category(category) == expected_element_category
