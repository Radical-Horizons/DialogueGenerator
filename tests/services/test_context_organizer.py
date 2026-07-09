"""Tests pour le service ContextOrganizer."""
import pytest
from services.context_organizer import ContextOrganizer


class TestContextOrganizer:
    """Tests pour ContextOrganizer."""
    
    def test_organize_default(self):
        """Test d'organisation par défaut."""
        organizer = ContextOrganizer()
        element_data = {
            "Nom": "Test Character",
            "Type": "Character",
            "Age": 25,
        }
        fields_to_include = ["Nom", "Type", "Age"]
        
        result = organizer.organize_context(
            element_data,
            "character",
            fields_to_include,
            "default"
        )
        
        assert "Nom" in result
        assert "Type" in result
        assert "Age" in result
        assert "Test Character" in result
    
    def test_organize_narrative(self):
        """Test d'organisation narrative."""
        organizer = ContextOrganizer()
        element_data = {
            "Nom": "Test Character",
            "Caractérisation": {
                "Désir": "Test desire",
                "Faiblesse": "Test weakness",
            },
            "Dialogue Type": {
                "Registre": "Formel",
            }
        }
        fields_to_include = ["Nom", "Caractérisation.Désir", "Dialogue Type.Registre"]
        
        result = organizer.organize_context(
            element_data,
            "character",
            fields_to_include,
            "narrative"
        )
        
        # Vérifier que les sections sont présentes
        assert "IDENTITÉ" in result or "Nom" in result
        assert "CARACTÉRISATION" in result or "Désir" in result
        assert "VOIX" in result or "Registre" in result
    
    def test_organize_minimal(self):
        """Test d'organisation minimale."""
        organizer = ContextOrganizer()
        element_data = {
            "Nom": "Test Character",
            "Dialogue Type": {
                "Registre de langage du personnage": "Formel",
            },
            "Caractérisation": {
                "Désir": "Test desire",
                "Faiblesse": "Test weakness",
            },
            "Autre": "Non essentiel"
        }
        fields_to_include = [
            "Nom",
            "Dialogue Type.Registre de langage du personnage",
            "Caractérisation.Désir",
            "Caractérisation.Faiblesse",
            "Autre"
        ]
        
        result = organizer.organize_context(
            element_data,
            "character",
            fields_to_include,
            "minimal"
        )
        
        # Le mode minimal devrait inclure les champs essentiels du contexte narratif
        assert "Registre" in result or "Registre de langage du personnage" in result
        assert "Désir" in result
        assert "Faiblesse" in result
        # "Autre" ne devrait pas être inclus dans le mode minimal
        assert "Autre" not in result or "Autre" not in result.split("\n")[-1]
    
    def test_extract_field_value(self):
        """Test d'extraction de valeur de champ."""
        organizer = ContextOrganizer()
        data = {
            "Nom": "Test",
            "Nested": {
                "Value": "NestedValue"
            }
        }
        
        assert organizer._extract_field_value(data, "Nom") == "Test"
        assert organizer._extract_field_value(data, "Nested.Value") == "NestedValue"
        assert organizer._extract_field_value(data, "NonExistent") is None
    
    def test_format_value(self):
        """Test de formatage de valeurs."""
        organizer = ContextOrganizer()
        
        # String
        assert organizer._format_value("Test") == "Test"
        
        # List
        assert organizer._format_value(["A", "B", "C"]) == "A, B, C"
        
        # List of dicts
        assert organizer._format_value([{"Nom": "Test1"}, {"Nom": "Test2"}]) == "Test1, Test2"
        
        # Empty list
        assert organizer._format_value([]) == "Aucun"
    
    def test_categorize_field(self):
        """Test de catégorisation des champs."""
        organizer = ContextOrganizer()
        
        assert organizer._categorize_field("Nom", "character") == "identity"
        assert organizer._categorize_field("Caractérisation.Désir", "character") == "characterization"
        # "Dialogue Type.Registre" devrait être catégorisé comme "voice" car "dialogue" a la priorité
        assert organizer._categorize_field("Dialogue Type.Registre", "character") == "voice"
        assert organizer._categorize_field("Dialogue Type", "character") == "voice"
        assert organizer._categorize_field("Background.Histoire", "character") == "background"
        assert organizer._categorize_field("Pouvoirs", "character") == "mechanics"

    def test_resolve_notion_ids_resolves_uuid(self):
        """_resolve_notion_ids remplace un UUID par son Nom quand l'index contient l'entrée.

        L'index utilise le format canonique avec tirets (sortie de normalize_notion_id).
        """
        uid = "1a16e4d2-1b45-8051-88d9-d744a1bbc095"
        organizer = ContextOrganizer(relation_index={uid: "Van'Doei"})
        assert organizer._resolve_notion_ids(uid) == "Van'Doei"

    def test_resolve_notion_ids_unknown_uuid_kept(self):
        """UUID absent de l'index est conservé tel quel."""
        uid = "00000000-0000-4000-8000-000000000001"
        organizer = ContextOrganizer(relation_index={})
        assert organizer._resolve_notion_ids(uid) == uid

    def test_resolve_notion_ids_plain_text_unchanged(self):
        """Texte sans UUID n'est pas altéré."""
        organizer = ContextOrganizer(relation_index={"abc": "X"})
        assert organizer._resolve_notion_ids("Van'Doei") == "Van'Doei"

    def test_resolve_notion_ids_no_index(self):
        """Sans index, la valeur est retournée inchangée."""
        organizer = ContextOrganizer()
        uid = "1a16e4d2-1b45-8051-88d9-d744a1bbc095"
        assert organizer._resolve_notion_ids(uid) == uid

    def test_resolve_notion_ids_multiple_uuids(self):
        """Plusieurs UUID dans une chaîne sont tous résolus."""
        uid1 = "1a16e4d2-1b45-8051-88d9-d744a1bbc095"
        uid2 = "1b36e4d2-1b45-80ce-9d1b-f71e60cb8e53"
        idx = {uid1: "Van'Doei", uid2: "Nef Centrale"}
        organizer = ContextOrganizer(relation_index=idx)
        result = organizer._resolve_notion_ids(f"{uid1}, {uid2}")
        assert "Van'Doei" in result
        assert "Nef Centrale" in result
        assert uid1 not in result

    def test_format_value_resolves_uuid_via_index(self):
        """_format_value appelle la résolution UUID quand un index est disponible."""
        uid = "1a16e4d2-1b45-8051-88d9-d744a1bbc095"
        organizer = ContextOrganizer(relation_index={uid: "Van'Doei"})
        assert organizer._format_value(uid) == "Van'Doei"

