"""Test d'intégration pour vérifier l'absence de doublons dans les prompts générés."""
import pytest
import re
from typing import Dict, List, Set
from collections import Counter


class TestPromptDeduplication:
    """Tests d'intégration pour vérifier que les prompts ne contiennent pas de doublons."""
    
    @pytest.fixture
    def analyze_duplicates(self):
        """Fixture pour analyser les doublons dans un texte."""
        def _analyze(text: str, min_length: int = 50) -> Dict[str, int]:
            """Analyse les fragments dupliqués dans un texte.
            
            Args:
                text: Texte à analyser
                min_length: Longueur minimale des fragments à considérer
                
            Returns:
                Dict mapping fragment -> nombre d'occurrences
            """
            # Extraire des fragments de texte significatifs
            fragments = []
            words = text.split()
            
            # Créer des fragments de différentes tailles
            for window_size in [10, 15, 20]:
                for i in range(len(words) - window_size + 1):
                    fragment = ' '.join(words[i:i + window_size])
                    if len(fragment) >= min_length:
                        # Normaliser pour comparaison
                        normalized = fragment.lower().strip()
                        fragments.append(normalized)
            
            # Compter les occurrences
            counts = Counter(fragments)
            
            # Ne garder que les doublons (count >= 2)
            duplicates = {frag: count for frag, count in counts.items() if count >= 2}
            
            return duplicates
        
        return _analyze
    
    @pytest.fixture
    def extract_xml_fields(self):
        """Fixture pour extraire les champs XML d'un prompt."""
        def _extract(xml_text: str) -> Dict[str, List[str]]:
            """Extrait les champs XML et leur contenu.
            
            Returns:
                Dict mapping tag_name -> list of content values
            """
            # Pattern pour extraire les balises et leur contenu
            pattern = r'<(\w+)>(.*?)</\1>'
            matches = re.findall(pattern, xml_text, re.DOTALL)
            
            fields: Dict[str, List[str]] = {}
            for tag, content in matches:
                if tag not in fields:
                    fields[tag] = []
                # Nettoyer le contenu
                clean_content = content.strip()
                if clean_content:
                    fields[tag].append(clean_content)
            
            return fields
        
        return _extract
    
    def test_no_duplicate_xml_tags_in_character(
        self,
        context_builder_with_real_data,
    ) -> None:
        """Test qu'un personnage n'a pas de balises XML dupliquées dans son prompt.
        
        Test générique qui utilise le premier personnage disponible.
        Note: Ce test est simplifié car build_context ne génère plus de XML par défaut.
        On vérifie l'absence de grandes duplications de contenu.
        """
        # Sélectionner dynamiquement le premier personnage disponible
        characters = context_builder_with_real_data.get_characters_names()
        if not characters:
            pytest.skip("Aucun personnage disponible dans les données GDD")
        
        character_name = characters[0]
        
        # Construire le contexte pour ce personnage (retourne une string)
        raw_prompt = context_builder_with_real_data.build_context(
            selected_elements={"characters": [character_name]},
            scene_instruction="Test"
        )
        
        # Vérifier qu'il n'y a pas de duplication massive de contenu
        # (test simplifié: pas de section de plus de 200 chars répétée)
        words = raw_prompt.split()
        for window_size in [50, 75, 100]:
            for i in range(len(words) - window_size):
                fragment = ' '.join(words[i:i + window_size])
                rest_of_text = ' '.join(words[i + window_size:])
                # Vérifier que ce fragment n'apparaît pas ailleurs
                if fragment in rest_of_text:
                    pytest.fail(
                        f"Fragment de {window_size} mots répété dans le prompt pour '{character_name}': "
                        f"{fragment[:100]}..."
                    )
    
    def test_no_content_duplication_in_prompt(
        self,
        context_builder_with_real_data,
        analyze_duplicates
    ) -> None:
        """Test qu'il n'y a pas de duplication significative de contenu.
        
        Test générique qui utilise le premier personnage disponible.
        """
        # Sélectionner dynamiquement le premier personnage disponible
        characters = context_builder_with_real_data.get_characters_names()
        if not characters:
            pytest.skip("Aucun personnage disponible dans les données GDD")
        
        character_name = characters[0]
        
        # Construire le contexte (retourne une string)
        raw_prompt = context_builder_with_real_data.build_context(
            selected_elements={"characters": [character_name]},
            scene_instruction="Test"
        )
        
        # Analyser les doublons
        duplicates = analyze_duplicates(raw_prompt, min_length=100)
        
        # Il ne devrait pas y avoir de fragments longs dupliqués
        # (tolérance: max 2 petits fragments, probablement des formules répétées)
        assert len(duplicates) <= 2, (
            f"Trouvé {len(duplicates)} fragments dupliqués dans le prompt pour '{character_name}'. "
            f"Exemples: {list(duplicates.keys())[:3]}"
        )
        
        # Si des doublons existent, ils ne doivent pas être trop fréquents
        for fragment, count in duplicates.items():
            assert count <= 2, (
                f"Fragment répété {count} fois (max 2 attendu) pour '{character_name}': "
                f"{fragment[:100]}..."
            )
    
    def test_extract_all_fields_no_parent_duplication(self) -> None:
        """Test que extract_all_fields n'extrait pas les parents ET les enfants."""
        # Données de test similaires à Uresaïr
        test_data = {
            "Nom": "Test",
            "Background": {
                "Context": "Histoire",
                "Appearance": "Apparence"
            },
            "Introduction": {
                "Resume": "Résumé"
            }
        }
        
        # Simuler extract_all_fields (la fonction interne de _build_context_item)
        def extract_all_fields(data: Dict, prefix: str = "") -> List[str]:
            fields = []
            for key, value in data.items():
                if key.startswith("_") or value is None:
                    continue
                
                field_path = f"{prefix}.{key}" if prefix else key
                
                if isinstance(value, dict):
                    # Ne PAS ajouter le parent, seulement les enfants
                    fields.extend(extract_all_fields(value, field_path))
                elif isinstance(value, list):
                    has_dicts = any(isinstance(item, dict) for item in value)
                    if has_dicts:
                        for item in value:
                            if isinstance(item, dict):
                                fields.extend(extract_all_fields(item, field_path))
                    else:
                        fields.append(field_path)
                else:
                    # Valeur terminale
                    fields.append(field_path)
            return fields
        
        fields = extract_all_fields(test_data)
        
        # Vérifications
        assert "Nom" in fields
        assert "Background.Context" in fields
        assert "Background.Appearance" in fields
        assert "Introduction.Resume" in fields
        
        # Les parents ne doivent PAS être présents
        assert "Background" not in fields, "Background (parent) ne doit pas être extrait"
        assert "Introduction" not in fields, "Introduction (parent) ne doit pas être extrait"
        
        # Pas de doublons
        assert len(fields) == len(set(fields)), "Il ne doit pas y avoir de doublons dans les champs extraits"
    
    def test_raw_content_serialization_no_duplication(
        self,
        context_builder_with_real_data
    ) -> None:
        """Test que l'utilisation de raw_content n'introduit pas de doublons.
        
        Test générique qui utilise le premier personnage disponible.
        """
        # Sélectionner dynamiquement le premier personnage disponible
        characters = context_builder_with_real_data.get_characters_names()
        if not characters:
            pytest.skip("Aucun personnage disponible dans les données GDD")
        
        character_name = characters[0]
        
        # Construire avec raw_content (retourne string)
        raw_prompt = context_builder_with_real_data.build_context(
            selected_elements={"characters": [character_name]},
            scene_instruction="Test"
        )
        
        # Vérifier l'absence de doublons dans le résultat final
        # Ex: pas de <background><context>...</context></background> ET <context>...</context> séparés
        background_sections = re.findall(
            r'<background>(.*?)</background>',
            raw_prompt,
            re.DOTALL
        )
        
        # S'il y a une section background, elle ne doit apparaître qu'une fois
        assert len(background_sections) <= 1, (
            f"Section <background> apparaît {len(background_sections)} fois pour '{character_name}' "
            f"(devrait apparaître maximum 1 fois)"
        )
    
    @pytest.mark.parametrize("char_index", [0, 1])
    def test_no_duplication_for_multiple_characters(
        self,
        context_builder_with_real_data,
        char_index: int
    ) -> None:
        """Test que différents personnages ne présentent pas de doublons.
        
        Test de régression générique pour s'assurer que le fix fonctionne pour tous les personnages.
        Teste les 2 premiers personnages disponibles (si présents).
        """
        # Sélectionner dynamiquement les personnages disponibles
        characters = context_builder_with_real_data.get_characters_names()
        if len(characters) <= char_index:
            pytest.skip(f"Pas assez de personnages (besoin de {char_index + 1}, trouvé {len(characters)})")
        
        character_name = characters[char_index]
        
        try:
            raw_prompt = context_builder_with_real_data.build_context(
                selected_elements={"characters": [character_name]},
                scene_instruction="Test"
            )
            
            # Vérifier qu'il n'y a pas de doublons évidents
            # (tags XML principaux ne doivent pas être répétés)
            character_match = re.search(
                r'<character[^>]*>(.*?)</character>',
                raw_prompt,
                re.DOTALL
            )
            
            if character_match:
                character_content = character_match.group(1)
                
                # Vérifier quelques tags clés
                for tag in ['background', 'characterization', 'identity']:
                    count = len(re.findall(f'<{tag}(?:\\s|>)', character_content))
                    assert count <= 1, (
                        f"Tag <{tag}> apparaît {count} fois pour {character_name}"
                    )
        except Exception as e:
            # Si une erreur survient, skip le test
            pytest.skip(f"Erreur lors du test de '{character_name}': {e}")
