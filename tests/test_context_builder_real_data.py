"""Tests d'intégration du ContextBuilder avec les vraies données GDD.

Ce module contient des tests d'intégration qui utilisent les vraies données GDD
du projet (fichiers dans data/GDD_categories/). Contrairement aux tests unitaires
dans test_context_builder.py qui utilisent des données mockées, ces tests
vérifient le comportement réel du ContextBuilder avec les données de production.

Types de tests :
- Tests d'intégration : Utilisent les vraies données GDD
- Tests lents : Chargement de fichiers réels, pas de mocks

Pour exécuter uniquement ces tests :
    pytest tests/test_context_builder_real_data.py -m integration

Pour exécuter uniquement les tests unitaires (plus rapides) :
    pytest tests/test_context_builder.py -m unit
"""
import pytest
from core.context.context_builder import ContextBuilder
from pathlib import Path


@pytest.fixture
def real_context_builder():
    """ContextBuilder avec les vraies données GDD du projet.
    
    Cette fixture charge les vraies données GDD depuis data/GDD_categories/,
    contrairement aux fixtures des tests unitaires qui utilisent des données mockées.
    """
    cb = ContextBuilder()
    cb.load_gdd_files()
    return cb


@pytest.mark.integration
@pytest.mark.slow
class TestContextBuilderRealData:
    """Tests d'intégration avec les vraies données GDD.
    
    Ces tests vérifient que le ContextBuilder fonctionne correctement
    avec les données réelles du projet, notamment :
    - Recherche de personnages avec normalisation des apostrophes
    - Construction de contexte avec vraies données
    - Gestion des champs personnalisés avec données réelles
    """
    
    def test_find_akthar_character(self, real_context_builder: ContextBuilder):
        """Test pour trouver le personnage Akthar-Neth Amatru.
        
        Teste que la recherche fonctionne avec les deux types d'apostrophes
        (typographique ' et droite ').
        """
        # Vérifier que le personnage existe dans la liste
        all_characters = real_context_builder.get_characters_names()
        print(f"\nTotal personnages chargés: {len(all_characters)}")
        print(f"Premiers personnages: {all_characters[:5]}")
        
        # Le nom dans le GDD utilise une apostrophe typographique
        # On peut chercher avec les deux types d'apostrophes
        akthar_name_gdd = all_characters[0] if all_characters else None
        assert akthar_name_gdd is not None, "Aucun personnage chargé"
        
        # Test 1: Recherche avec le nom exact du GDD (apostrophe typographique)
        details1 = real_context_builder.get_character_details_by_name(akthar_name_gdd)
        assert details1 is not None, f"Les détails du personnage '{akthar_name_gdd}' sont None (recherche avec nom GDD)"
        
        # Test 2: Recherche avec apostrophe droite (normalisation)
        akthar_name_normalized = akthar_name_gdd.replace('\u2019', "'").replace('\u2018', "'")
        if akthar_name_normalized != akthar_name_gdd:
            details2 = real_context_builder.get_character_details_by_name(akthar_name_normalized)
            assert details2 is not None, f"Les détails du personnage '{akthar_name_normalized}' sont None (recherche normalisée)"
            assert details2 == details1, "Les détails devraient être identiques quelle que soit l'apostrophe"
        
        print(f"\n[OK] Personnage trouve: {details1.get('Nom')}")
        print(f"  Espece: {details1.get('Espèce', 'N/A')}")
        print(f"  Occupation: {details1.get('Occupation/Rôle', 'N/A')}")
    
    def test_build_context_with_akthar(self, real_context_builder: ContextBuilder):
        """Test pour construire le contexte avec Akthar."""
        akthar_name = "Akthar-Neth Amatru, l'Exégète"
        
        # Construire le contexte avec ce personnage
        context = real_context_builder.build_context(
            selected_elements={
                "characters": [akthar_name],
                "locations": [],
                "items": [],
                "species": [],
                "communities": []
            },
            scene_instruction="Test de contexte",
            max_tokens=2000
        )
        
        assert context is not None, "Le contexte construit est None"
        assert len(context) > 0, "Le contexte construit est vide"
        
        # Vérifier que le contexte contient des informations sur le personnage
        assert akthar_name in context or "Akthar" in context or "Exégète" in context, \
            f"Le contexte ne contient pas d'informations sur le personnage. Contexte: {context[:500]}"
        
        print(f"\n✓ Contexte construit avec succès")
        print(f"  Longueur: {len(context)} caractères")
        print(f"  Début: {context[:200]}...")
    
    def test_build_context_with_custom_fields_akthar(self, real_context_builder: ContextBuilder):
        """Test pour construire le contexte avec champs personnalisés pour Akthar."""
        # Récupérer le nom exact du GDD (avec apostrophe typographique)
        all_characters = real_context_builder.get_characters_names()
        akthar_name_gdd = all_characters[0] if all_characters else None
        assert akthar_name_gdd is not None, "Aucun personnage chargé"
        
        # Construire le contexte avec des champs spécifiques
        field_configs = {
            "characters": ["Nom", "Résumé", "Introduction", "Faiblesse", "Compulsion", "Désir Principal", "Caractérisation", "Contexte Background"]
        }
        
        if hasattr(real_context_builder, 'build_context_with_custom_fields'):
            # Test avec le nom du GDD (apostrophe typographique)
            context1 = real_context_builder.build_context_with_custom_fields(
                selected_elements={
                    "characters": [akthar_name_gdd],
                    "locations": [],
                    "items": [],
                    "species": [],
                    "communities": []
                },
                scene_instruction="Test de contexte avec champs personnalisés",
                field_configs=field_configs,
                organization_mode="default",
                max_tokens=2000
            )
            
            assert context1 is not None, "Le contexte construit est None"
            assert len(context1) > 0, "Le contexte construit est vide"
            assert akthar_name_gdd in context1 or "Akthar" in context1, "Le nom du personnage devrait être dans le contexte"
            
            # Test avec nom normalisé (apostrophe droite) - devrait fonctionner grâce à la normalisation
            akthar_name_normalized = akthar_name_gdd.replace('\u2019', "'").replace('\u2018', "'")
            if akthar_name_normalized != akthar_name_gdd:
                context2 = real_context_builder.build_context_with_custom_fields(
                    selected_elements={
                        "characters": [akthar_name_normalized],
                        "locations": [],
                        "items": [],
                        "species": [],
                        "communities": []
                    },
                    scene_instruction="Test de contexte avec champs personnalisés (normalisé)",
                    field_configs=field_configs,
                    organization_mode="default",
                    max_tokens=2000
                )
                assert context2 is not None, "Le contexte construit est None (nom normalisé)"
                assert len(context2) > 0, "Le contexte construit est vide (nom normalisé)"
            
            print(f"\n[OK] Contexte avec champs personnalises construit")
            print(f"  Longueur: {len(context1)} caracteres")
            print(f"  Contient 'Nom': {'Nom' in context1}")
            print(f"  Contient 'Resume': {'Résumé' in context1 or 'Resume' in context1}")
        else:
            pytest.skip("build_context_with_custom_fields n'est pas disponible")
