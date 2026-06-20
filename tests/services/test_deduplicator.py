"""Tests unitaires pour le déduplicateur de champs."""
import pytest
from services.context_serializer.deduplicator import FieldDeduplicator


class TestFieldDeduplicator:
    """Tests pour la classe FieldDeduplicator."""
    
    @pytest.fixture
    def deduplicator(self) -> FieldDeduplicator:
        """Fixture pour créer une instance du déduplicateur."""
        return FieldDeduplicator()
    
    def test_extract_field_paths_simple(self, deduplicator: FieldDeduplicator) -> None:
        """Test extraction de chemins depuis un dict simple."""
        data = {
            "Nom": "Test",
            "Age": 25,
            "Actif": True
        }
        
        paths = deduplicator.extract_field_paths(data)
        
        assert len(paths) == 3
        assert "Nom" in paths
        assert "Age" in paths
        assert "Actif" in paths
        assert paths["Nom"] == "Test"
        assert paths["Age"] == 25
    
    def test_extract_field_paths_nested(self, deduplicator: FieldDeduplicator) -> None:
        """Test extraction de chemins depuis un dict imbriqué."""
        data = {
            "Nom": "Test",
            "Background": {
                "Context": "Histoire...",
                "Appearance": "Description..."
            }
        }
        
        paths = deduplicator.extract_field_paths(data)
        
        assert len(paths) == 3
        assert "Nom" in paths
        assert "Background.Context" in paths
        assert "Background.Appearance" in paths
        # Le parent "Background" ne doit PAS être dans les chemins
        assert "Background" not in paths
    
    def test_extract_field_paths_ignores_technical_fields(self, deduplicator: FieldDeduplicator) -> None:
        """Test que les champs techniques commençant par _ sont ignorés."""
        data = {
            "Nom": "Test",
            "_internal": "ignore",
            "_metadata": {"skip": "this"}
        }
        
        paths = deduplicator.extract_field_paths(data)
        
        assert len(paths) == 1
        assert "Nom" in paths
        assert "_internal" not in paths
        assert "_metadata" not in paths
    
    def test_detect_duplicates_finds_exact_duplicates(self, deduplicator: FieldDeduplicator) -> None:
        """Test détection de doublons exacts."""
        data = {
            "Background": {
                "Context": "Histoire identique",
                "Appearance": "Apparence unique"
            },
            "Context": "Histoire identique"  # Doublon!
        }
        
        duplicates = deduplicator.detect_duplicates(data)
        
        assert len(duplicates) == 1
        # Il devrait y avoir un groupe avec 2 chemins
        duplicate_values = list(duplicates.values())
        assert len(duplicate_values[0]) == 2
        assert "Background.Context" in duplicate_values[0]
        assert "Context" in duplicate_values[0]
    
    def test_detect_duplicates_case_insensitive(self, deduplicator: FieldDeduplicator) -> None:
        """Test que la détection est insensible à la casse."""
        data = {
            "Field1": "Contenu Test",
            "Field2": "contenu test"  # Même contenu, casse différente
        }
        
        duplicates = deduplicator.detect_duplicates(data)
        
        assert len(duplicates) == 1
        duplicate_paths = list(duplicates.values())[0]
        assert len(duplicate_paths) == 2
        assert "Field1" in duplicate_paths
        assert "Field2" in duplicate_paths
    
    def test_detect_duplicates_ignores_empty_values(self, deduplicator: FieldDeduplicator) -> None:
        """Test que les valeurs vides sont ignorées."""
        data = {
            "Field1": "",
            "Field2": "",
            "Field3": None
        }
        
        duplicates = deduplicator.detect_duplicates(data)
        
        # Pas de doublons détectés car valeurs vides
        assert len(duplicates) == 0
    
    def test_deduplicate_fields_prefers_direct_paths(self, deduplicator: FieldDeduplicator) -> None:
        """Test que la déduplication privilégie les chemins directs."""
        data = {
            "Background": {
                "Context": "Histoire",
                "Appearance": "Apparence"
            },
            "Context": "Histoire",
            "Appearance": "Apparence"
        }
        
        fields_to_include = [
            "Background.Context",
            "Background.Appearance",
            "Context",
            "Appearance"
        ]
        
        deduplicated = deduplicator.deduplicate_fields(fields_to_include, data)
        
        # Les chemins directs doivent être conservés
        assert "Context" in deduplicated
        assert "Appearance" in deduplicated
        # Les chemins imbriqués doivent être supprimés
        assert "Background.Context" not in deduplicated
        assert "Background.Appearance" not in deduplicated
        # Total: 2 champs (au lieu de 4)
        assert len(deduplicated) == 2
    
    def test_deduplicate_fields_preserves_order(self, deduplicator: FieldDeduplicator) -> None:
        """Test que l'ordre des champs non dupliqués est préservé."""
        data = {
            "Field1": "Value1",
            "Field2": "Value2",
            "Field3": "Value3"
        }
        
        fields_to_include = ["Field1", "Field2", "Field3"]
        
        deduplicated = deduplicator.deduplicate_fields(fields_to_include, data)
        
        # Ordre préservé
        assert deduplicated == ["Field1", "Field2", "Field3"]
    
    def test_deduplicate_fields_handles_no_duplicates(self, deduplicator: FieldDeduplicator) -> None:
        """Test que la déduplication fonctionne même sans doublons."""
        data = {
            "Field1": "Unique1",
            "Field2": "Unique2",
            "Field3": "Unique3"
        }
        
        fields_to_include = ["Field1", "Field2", "Field3"]
        
        deduplicated = deduplicator.deduplicate_fields(fields_to_include, data)
        
        assert deduplicated == fields_to_include
        assert len(deduplicated) == 3
    
    def test_deduplicate_fields_empty_list(self, deduplicator: FieldDeduplicator) -> None:
        """Test avec une liste vide."""
        data = {"Field1": "Value1"}
        
        deduplicated = deduplicator.deduplicate_fields([], data)
        
        assert deduplicated == []
    
    def test_get_duplicate_groups_readable_format(self, deduplicator: FieldDeduplicator) -> None:
        """Test que les groupes de doublons sont dans un format lisible."""
        data = {
            "Background.Context": "Histoire complète",
            "Context": "Histoire complète"
        }
        
        groups = deduplicator.get_duplicate_groups(data)
        
        assert len(groups) == 1
        preview, paths = groups[0]
        assert "histoire complète" in preview.lower()
        assert len(paths) == 2
    
    def test_real_world_uresair_scenario(self, deduplicator: FieldDeduplicator) -> None:
        """Test avec un scénario réel inspiré d'Uresaïr.
        
        Ce test reproduit le bug original où Background.Context et Context
        étaient dupliqués dans le prompt.
        """
        data = {
            "Nom": "Seigneuresse Uresaïr",
            "Background": {
                "Context": "Avant l'effondrement, Uresaïr régnait sur les Déserts Temporels...",
                "Appearance": "Uresaïr se manifeste comme un masque...",
                "Relationships": "À sa famille : Autres Seigneurs Originels..."
            },
            "Context": "Avant l'effondrement, Uresaïr régnait sur les Déserts Temporels...",
            "Appearance": "Uresaïr se manifeste comme un masque...",
            "Relationships": "À sa famille : Autres Seigneurs Originels..."
        }
        
        # Ces champs seraient extraits par extract_all_fields
        fields_to_include = [
            "Nom",
            "Background.Context",
            "Background.Appearance",
            "Background.Relationships",
            "Context",
            "Appearance",
            "Relationships"
        ]
        
        # Détecter les doublons
        duplicates = deduplicator.detect_duplicates(data)
        assert len(duplicates) == 3  # Context, Appearance, Relationships
        
        # Dédupliquer
        deduplicated = deduplicator.deduplicate_fields(fields_to_include, data)
        
        # Vérifier que les doublons ont été éliminés
        assert len(deduplicated) == 4  # Nom + 3 champs uniques
        assert "Nom" in deduplicated
        assert "Context" in deduplicated
        assert "Appearance" in deduplicated
        assert "Relationships" in deduplicated
        # Les chemins imbriqués ne doivent PAS être présents
        assert "Background.Context" not in deduplicated
        assert "Background.Appearance" not in deduplicated
        assert "Background.Relationships" not in deduplicated

    def test_deduplicate_fields_drops_section_titles_when_sections_present(
        self, deduplicator: FieldDeduplicator
    ) -> None:
        """Les titres UI ne doivent pas masquer le corps ``sections.<slug>``."""
        data = {
            "Nom": "PNJ",
            "sections": {"biographie": "Long corps narratif"},
            "section_titles": {"biographie": "Biographie"},
        }
        fields = [
            "sections.biographie",
            "section_titles.biographie",
            "notion_page_id",
        ]
        result = deduplicator.deduplicate_fields(fields, data)
        assert result == ["sections.biographie"]
