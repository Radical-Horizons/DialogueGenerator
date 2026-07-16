"""Tests pour le service ElementLinker."""
import pytest
from services.element_linker import ElementLinker
from services.element_repository import ElementRepository, ElementCategory
from services.element_resolver import ElementResolver
from services.gdd_loader import GDDData


@pytest.fixture
def sample_gdd_data():
    """Données GDD de test."""
    return GDDData(
        characters=[
            {"Nom": "Alice", "Détient": "Dague Empoisonnée, Messages Codés", "Espèce": "Humain", "Communautés": "Garde Royale", "Lieux de vie": "Capitale"},
            {"Nom": "Bob", "Background": {"Relations": "Alice est son ami, Charles est son ennemi"}},
            {"Nom": "Charles"}
        ],
        locations=[
            {"Nom": "Capitale", "Catégorie": "Ville", "Personnages présents": "Alice, Bob", "Communautés présentes": "Garde Royale"},
            {"Nom": "Forêt Sombre", "Catégorie": "Région", "Contient": "Clairière, Ruines Antiques"},
            {"Nom": "Clairière", "Catégorie": "Lieu"},
            {"Nom": "Ruines Antiques", "Catégorie": "Lieu"}
        ],
        items=[
            {"Nom": "Dague Empoisonnée"},
            {"Nom": "Messages Codés"},
            {"Nom": "Artefact Inconnu"}
        ],
        species=[
            {"Nom": "Humain"}
        ],
        communities=[
            {"Nom": "Garde Royale"}
        ],
        quests=[]
    )


@pytest.fixture
def repository(sample_gdd_data):
    """Repository de test."""
    return ElementRepository(sample_gdd_data)


@pytest.fixture
def resolver(repository):
    """Resolver de test."""
    return ElementResolver(repository)


@pytest.fixture
def linker(resolver):
    """Linker de test."""
    return ElementLinker(element_repository=None, element_resolver=resolver)


class TestElementLinker:
    """Tests pour ElementLinker."""
    
    def test_get_regions(self, linker, sample_gdd_data):
        """Test de récupération des régions."""
        regions = linker.get_regions(sample_gdd_data.locations)
        
        assert len(regions) == 1
        assert "Forêt Sombre" in regions
    
    def test_get_regions_empty(self, linker):
        """Test de récupération des régions avec liste vide."""
        regions = linker.get_regions([])
        
        assert regions == []

    def test_get_regions_shard_mode_all_lieux(self, linker):
        """Sans Catégorie Région, tous les lieux nommés sont listés (fiches individuelles)."""
        locs = [
            {"Nom": "Zeta", "sections": {}},
            {"Nom": "Alpha", "sections": {}},
            {"Nom": "Alpha"},
        ]
        regions = linker.get_regions(locs)
        assert regions == ["Alpha", "Zeta"]

    def test_get_sub_locations_from_contient_without_categorie(self, linker):
        """Contient est lu même sans champ Catégorie (fiche lieu moderne)."""
        locs = [
            {"Nom": "Zone Mère", "Contient": "Site A, Site B"},
        ]
        assert linker.get_sub_locations("Zone Mère", locs) == ["Site A", "Site B"]

    def test_get_scene_region_names_typed_first(self, linker, sample_gdd_data):
        """Scène : priorité aux Catégorie Région."""
        names = linker.get_scene_region_names(sample_gdd_data.locations)
        assert names == ["Forêt Sombre"]

    def test_get_scene_sub_location_names_without_contient_empty(self, linker):
        """Sans Contient, aucun sous-lieu proposé pour la scène."""
        locs = [
            {"Nom": "A"},
            {"Nom": "B"},
            {"Nom": "C"},
        ]
        assert linker.get_scene_sub_location_names("B", locs) == []

    def test_get_sub_locations_from_values_contient_uuids(self, linker, repository):
        """Contient sous values avec UUID Notion → noms de fiches lieux."""
        linker._element_repository = repository
        locs = [
            {
                "Nom": "Léviathan pétrifié",
                "values": {
                    "Contient": (
                        "1b36e4d2-1b45-80ce-9d1b-f71e60cb8e53, "
                        "1b36e4d2-1b45-80d1-a752-c46051c2f742"
                    ),
                },
            },
            {
                "Nom": "Nef Centrale",
                "notion_page_id": "1b36e4d2-1b45-80ce-9d1b-f71e60cb8e53",
            },
            {
                "Nom": "Narthex abyssal",
                "notion_page_id": "1b36e4d2-1b45-80d1-a752-c46051c2f742",
            },
        ]
        subs = linker.get_sub_locations("Léviathan pétrifié", locs)
        assert subs == ["Narthex abyssal", "Nef Centrale"]

    def test_get_scene_region_names_uses_explicit_type_from_values(self, linker):
        """Le sélecteur scène exclut les parents non région même s'ils ont des enfants."""
        locs = [
            {
                "Nom": "Région",
                "values": {
                    "Type": "Région principale",
                    "Contient": "11111111-1111-1111-1111-111111111111",
                },
            },
            {
                "Nom": "Lieu intermédiaire",
                "values": {
                    "Type": "Lieu principal",
                    "Contient": "22222222-2222-2222-2222-222222222222",
                },
                "notion_page_id": "11111111-1111-1111-1111-111111111111",
            },
            {
                "Nom": "Lieu profond",
                "values": {"Type": "Lieu secondaire"},
                "notion_page_id": "22222222-2222-2222-2222-222222222222",
            },
        ]
        assert linker.get_scene_region_names(locs) == ["Région"]
        assert linker.get_scene_sub_location_names("Région", locs) == [
            "Lieu intermédiaire"
        ]
        assert linker.get_scene_sub_location_names("Lieu intermédiaire", locs) == []
    
    def test_get_sub_locations(self, linker, sample_gdd_data):
        """Test de récupération des sous-lieux."""
        sub_locs = linker.get_sub_locations("Forêt Sombre", sample_gdd_data.locations)
        
        assert len(sub_locs) == 2
        assert "Clairière" in sub_locs
        assert "Ruines Antiques" in sub_locs
    
    def test_get_sub_locations_not_region(self, linker, sample_gdd_data):
        """Test de récupération des sous-lieux pour un lieu qui n'est pas une région."""
        sub_locs = linker.get_sub_locations("Capitale", sample_gdd_data.locations)
        
        assert sub_locs == []
    
    def test_get_sub_locations_not_found(self, linker, sample_gdd_data):
        """Test de récupération des sous-lieux pour une région inexistante."""
        sub_locs = linker.get_sub_locations("Région Inexistante", sample_gdd_data.locations)
        
        assert sub_locs == []
    
    def test_extract_linked_names(self, linker):
        """Test d'extraction de noms liés."""
        known_names = ["Dague Empoisonnée", "Messages Codés", "Autre Objet"]
        field_text = "Dague Empoisonnée, Messages Codés, Artefact Inconnu"
        
        extracted = linker.extract_linked_names(field_text, known_names)
        
        assert extracted == {"Dague Empoisonnée", "Messages Codés"}
        assert "Artefact Inconnu" not in extracted
    
    def test_extract_linked_names_none(self, linker):
        """Test d'extraction avec None."""
        known_names = ["Item 1"]
        extracted = linker.extract_linked_names(None, known_names)
        
        assert extracted == set()
    
    def test_extract_linked_names_empty(self, linker):
        """Test d'extraction avec chaîne vide."""
        known_names = ["Item 1"]
        extracted = linker.extract_linked_names("", known_names)
        
        assert extracted == set()
    
    def test_find_related_names_in_text(self, linker):
        """Test de recherche de noms dans le texte."""
        known_names = ["Alice", "Bob", "Charles"]
        text = "Alice a vu Bob, mais Charles n'était pas là."
        
        found = linker.find_related_names_in_text(text, known_names)
        
        assert found == {"Alice", "Bob", "Charles"}
    
    def test_find_related_names_in_text_partial(self, linker):
        """Test de recherche avec seulement certains noms."""
        known_names = ["Alice", "Bob"]
        text = "Alice a vu Bob et David."
        
        found = linker.find_related_names_in_text(text, known_names)
        
        assert found == {"Alice", "Bob"}
        assert "David" not in found
    
    def test_find_related_names_in_text_empty(self, linker):
        """Test de recherche avec texte vide."""
        known_names = ["Alice"]
        found = linker.find_related_names_in_text("", known_names)
        
        assert found == set()
    
    def test_get_linked_elements_character(self, linker):
        """Test de récupération des éléments liés pour un personnage."""
        linked = linker.get_linked_elements(character_name="Alice")
        
        assert "Dague Empoisonnée" in linked["items"]
        assert "Messages Codés" in linked["items"]
        assert "Humain" in linked["species"]
        assert "Garde Royale" in linked["communities"]
        assert "Capitale" in linked["locations"]
    
    def test_get_linked_elements_location(self, linker):
        """Test de récupération des éléments liés pour un lieu."""
        linked = linker.get_linked_elements(location_names=["Capitale"])
        
        assert "Alice" in linked["characters"]
        assert "Bob" in linked["characters"]
        assert "Garde Royale" in linked["communities"]
    
    def test_get_linked_elements_character_and_location(self, linker):
        """Test de récupération des éléments liés pour un personnage et un lieu."""
        linked = linker.get_linked_elements(character_name="Bob", location_names=["Capitale"])
        
        # Vérifier que le personnage source est exclu
        assert "Bob" not in linked["characters"]
        # Vérifier que le lieu source est exclu
        assert "Capitale" not in linked["locations"]
        # Mais les autres éléments liés sont présents
        assert "Alice" in linked["characters"] or "Charles" in linked["characters"]
    
    def test_get_linked_elements_without_resolver(self):
        """Test de récupération des éléments liés sans resolver."""
        linker = ElementLinker()
        linked = linker.get_linked_elements(character_name="Alice")
        
        assert linked == {
            "characters": set(),
            "locations": set(),
            "items": set(),
            "species": set(),
            "communities": set(),
            "quests": set()
        }

    def test_get_linked_elements_shard_sections_narrative(self):
        """Fiche type Notion : relations plats absentes, texte sous sections._general."""
        gdd = GDDData(
            characters=[
                {
                    "Nom": "Hero",
                    "sections": {
                        "_general": (
                            "Rencontre souvent Alice à la Capitale. "
                            "Possède une Dague Empoisonnée."
                        )
                    },
                },
                {"Nom": "Alice"},
            ],
            locations=[{"Nom": "Capitale"}],
            items=[{"Nom": "Dague Empoisonnée"}],
            species=[],
            communities=[],
            quests=[],
        )
        repository = ElementRepository(gdd)
        resolver = ElementResolver(repository)
        linker = ElementLinker(element_resolver=resolver)
        linked = linker.get_linked_elements(character_name="Hero")
        assert "Alice" in linked["characters"]
        assert "Capitale" in linked["locations"]
        assert "Dague Empoisonnée" in linked["items"]
