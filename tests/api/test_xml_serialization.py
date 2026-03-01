"""Tests pour la sérialisation XML du prompt.

Ce module teste la conversion du contexte JSON en XML pour le LLM.
"""
import pytest
import xml.etree.ElementTree as ET
from fastapi.testclient import TestClient
from api.main import app
from core.context.context_builder import ContextBuilder
from models.prompt_structure import PromptStructure, PromptSection, ContextCategory, ContextItem, ItemSection, PromptMetadata
from datetime import datetime


@pytest.fixture
def context_builder():
    """Fixture pour ContextBuilder."""
    return ContextBuilder()


@pytest.fixture
def sample_prompt_structure():
    """Fixture pour une structure de prompt de test."""
    return PromptStructure(
        sections=[
            PromptSection(
                type="context",
                title="CONTEXTE GDD",
                content="",
                categories=[
                    ContextCategory(
                        type="characters",
                        title="CHARACTERS",
                        items=[
                            ContextItem(
                                id="PNJ_1",
                                name="PNJ 1",
                                sections=[
                                    ItemSection(
                                        title="IDENTITÉ",
                                        content="Nom: Test Character\nEspèce: Humain"
                                    ),
                                    ItemSection(
                                        title="CARACTÉRISATION",
                                        content="Personnage courageux et déterminé."
                                    )
                                ],
                                metadata={"name": "Test Character"}
                            )
                        ]
                    )
                ]
            )
        ],
        metadata=PromptMetadata(
            totalTokens=100,
            generatedAt=datetime.now().isoformat(),
            organizationMode="narrative"
        )
    )


@pytest.mark.unit
def test_serialize_context_to_xml_generates_valid_xml(context_builder, sample_prompt_structure):
    """Test que serialize_context_to_xml() retourne un ET.Element valide."""
    xml_element = context_builder._context_serializer.serialize_to_xml(sample_prompt_structure)
    
    # Vérifier que c'est un ET.Element
    assert isinstance(xml_element, ET.Element)
    
    # Vérifier la structure de base
    assert xml_element.tag == "context"
    assert len(xml_element) > 0  # Doit avoir au moins une catégorie


@pytest.mark.unit
def test_serialize_context_to_xml_structure(context_builder, sample_prompt_structure):
    """Test que la structure XML est correcte."""
    root = context_builder._context_serializer.serialize_to_xml(sample_prompt_structure)
    
    # Vérifier que c'est un ET.Element
    assert isinstance(root, ET.Element)
    
    # Vérifier la hiérarchie : context > characters > character > sections
    assert root.tag == "context"
    
    characters_elem = root.find("characters")
    assert characters_elem is not None, "Élément <characters> manquant"
    
    character_elem = characters_elem.find("character")
    assert character_elem is not None, "Élément <character> manquant"
    
    # Vérifier les sections
    identity_elem = character_elem.find("identity")
    assert identity_elem is not None, "Élément <identity> manquant"
    assert identity_elem.text is not None
    assert "Test Character" in identity_elem.text or "Humain" in identity_elem.text


@pytest.mark.unit
def test_serialize_context_to_xml_escapes_special_characters(context_builder):
    """Test que les caractères spéciaux XML sont correctement échappés."""
    # Créer une structure avec des caractères spéciaux
    structure = PromptStructure(
        sections=[
            PromptSection(
                type="context",
                title="CONTEXTE GDD",
                content="",
                categories=[
                    ContextCategory(
                        type="characters",
                        title="CHARACTERS",
                        items=[
                            ContextItem(
                                id="PNJ_1",
                                name="PNJ 1",
                                sections=[
                                    ItemSection(
                                        title="IDENTITÉ",
                                        content="Nom: Test & Character <with> special chars"
                                    )
                                ]
                            )
                        ]
                    )
                ]
            )
        ],
        metadata=PromptMetadata(
            totalTokens=50,
            generatedAt=datetime.now().isoformat(),
            organizationMode="narrative"
        )
    )
    
    root = context_builder._context_serializer.serialize_to_xml(structure)
    
    # Vérifier que c'est un ET.Element
    assert isinstance(root, ET.Element)
    
    # Vérifier que les caractères sont échappés dans le texte
    # On convertit en string pour vérifier l'échappement
    xml_str = ET.tostring(root, encoding='unicode', method='xml')
    assert "&amp;" in xml_str or "&lt;" in xml_str or "&gt;" in xml_str


@pytest.mark.integration
@pytest.mark.api
def test_prompt_xml_format(real_client):
    """Test que le prompt retourné par l'API est en format XML."""
    from core.context.context_builder import ContextBuilder
    cb = ContextBuilder()
    cb.load_gdd_files()
    all_characters = cb.get_characters_names()
    test_character = all_characters[0] if all_characters else "Test Character"
    
    response = real_client.post(
        "/api/v1/dialogues/estimate-tokens",
        json={
            "context_selections": {
                "characters_full": [test_character],
                "locations_full": [],
                "items_full": [],
                "species_full": [],
                "communities_full": []
            },
            "user_instructions": "Test XML format",
            "max_context_tokens": 1000
        }
    )
    
    assert response.status_code == 200
    data = response.json()
    raw_prompt = data.get("raw_prompt", "")
    
    # Vérifier que c'est du XML
    assert raw_prompt.startswith('<?xml version="1.0" encoding="UTF-8"?>')
    
    # Parser le XML pour vérifier qu'il est bien formé
    xml_content = raw_prompt.split('?>', 1)[-1].strip()
    root = ET.fromstring(xml_content)
    
    # Vérifier la structure de base
    assert root.tag == "prompt"
    
    # Vérifier la présence des sections principales
    assert root.find("contract") is not None or root.find("technical") is not None or root.find("context") is not None


@pytest.mark.integration
@pytest.mark.api
def test_debug_raw_json_endpoint(real_client):
    """Test que l'endpoint debug/raw-json retourne le JSON brut."""
    from core.context.context_builder import ContextBuilder
    cb = ContextBuilder()
    cb.load_gdd_files()
    all_characters = cb.get_characters_names()
    test_character = all_characters[0] if all_characters else "Test Character"
    
    response = real_client.post(
        "/api/v1/dialogues/debug/raw-json",
        json={
            "context_selections": {
                "characters_full": [test_character],
                "locations_full": [],
                "items_full": [],
                "species_full": [],
                "communities_full": []
            },
            "user_instructions": "Test debug endpoint",
            "max_context_tokens": 1000
        }
    )
    
    assert response.status_code == 200
    data = response.json()
    
    # Vérifier la structure de la réponse
    assert "structured_context" in data
    assert "prompt_hash" in data
    
    # Vérifier que structured_context est un dict (JSON)
    structured_context = data["structured_context"]
    assert isinstance(structured_context, dict)
    
    # Vérifier la structure de base du JSON
    assert "sections" in structured_context
    assert "metadata" in structured_context


@pytest.mark.integration
@pytest.mark.api
def test_structured_prompt_remains_json(real_client):
    """Test que structured_prompt reste en JSON pour l'UI."""
    from core.context.context_builder import ContextBuilder
    cb = ContextBuilder()
    cb.load_gdd_files()
    all_characters = cb.get_characters_names()
    test_character = all_characters[0] if all_characters else "Test Character"
    
    response = real_client.post(
        "/api/v1/dialogues/estimate-tokens",
        json={
            "context_selections": {
                "characters_full": [test_character],
                "locations_full": [],
                "items_full": [],
                "species_full": [],
                "communities_full": []
            },
            "user_instructions": "Test structured prompt",
            "max_context_tokens": 1000
        }
    )
    
    assert response.status_code == 200
    data = response.json()
    
    # Vérifier que raw_prompt est en XML
    raw_prompt = data.get("raw_prompt", "")
    assert raw_prompt.startswith('<?xml')
    
    # Vérifier que structured_prompt est en JSON (dict)
    structured_prompt = data.get("structured_prompt")
    if structured_prompt:
        assert isinstance(structured_prompt, dict)
        assert "sections" in structured_prompt
        assert "metadata" in structured_prompt


@pytest.mark.unit
def test_no_generic_section_tags(context_builder):
    """Test que les tags génériques <section> ne sont plus utilisés."""
    structure = PromptStructure(
        sections=[
            PromptSection(
                type="context",
                title="CONTEXTE GDD",
                content="",
                categories=[
                    ContextCategory(
                        type="characters",
                        title="CHARACTERS",
                        items=[
                            ContextItem(
                                id="PNJ_1",
                                name="PNJ 1",
                                sections=[
                                    ItemSection(
                                        title="INFORMATIONS",
                                        content="Nom: Test Character\nAlias: Test Alias\nEspèce: Humain"
                                    ),
                                    ItemSection(
                                        title="CARACTÉRISATION",
                                        content='{"Faiblesse": "Test weakness", "Compulsion": "Test compulsion"}'
                                    )
                                ],
                                metadata={"name": "Test Character"}
                            )
                        ]
                    )
                ]
            )
        ],
        metadata=PromptMetadata(
            totalTokens=100,
            generatedAt=datetime.now().isoformat(),
            organizationMode="narrative"
        )
    )
    
    root = context_builder._context_serializer.serialize_to_xml(structure)
    xml_str = ET.tostring(root, encoding='unicode', method='xml')
    
    # Vérifier qu'il n'y a pas de tags <section>
    assert "<section" not in xml_str, "Tags génériques <section> ne doivent plus être utilisés"
    
    # Vérifier que INFORMATIONS est déstructuré en <identity> et <metadata>
    character_elem = root.find(".//character")
    assert character_elem is not None
    identity_elem = character_elem.find("identity")
    assert identity_elem is not None, "Section INFORMATIONS doit être déstructurée en <identity>"
    
    # Vérifier que le JSON est déstructuré
    characterization_elem = character_elem.find("characterization")
    assert characterization_elem is not None
    # Vérifier qu'il n'y a pas de JSON brut dans le texte
    if characterization_elem.text:
        assert not (characterization_elem.text.strip().startswith("{") or 
                   characterization_elem.text.strip().startswith("[")), \
            "JSON ne doit pas être présent en texte brut, doit être déstructuré"
    
    # Vérifier la structure déstructurée du JSON
    weakness_elem = characterization_elem.find("weakness")
    compulsion_elem = characterization_elem.find("compulsion")
    assert weakness_elem is not None or compulsion_elem is not None, \
        "JSON doit être déstructuré en éléments XML"


@pytest.mark.unit
def test_informations_section_parsed(context_builder):
    """Test que la section INFORMATIONS est correctement parsée en structure XML."""
    structure = PromptStructure(
        sections=[
            PromptSection(
                type="context",
                title="CONTEXTE GDD",
                content="",
                categories=[
                    ContextCategory(
                        type="characters",
                        title="CHARACTERS",
                        items=[
                            ContextItem(
                                id="PNJ_1",
                                name="PNJ 1",
                                sections=[
                                    ItemSection(
                                        title="INFORMATIONS",
                                        content="Nom: Test Character\nAlias: Test Alias\nEspèce: Humain\nOccupation: Testeur"
                                    )
                                ],
                                metadata={"name": "Test Character"}
                            )
                        ]
                    )
                ]
            )
        ],
        metadata=PromptMetadata(
            totalTokens=50,
            generatedAt=datetime.now().isoformat(),
            organizationMode="narrative"
        )
    )
    
    root = context_builder._context_serializer.serialize_to_xml(structure)
    character_elem = root.find(".//character")
    assert character_elem is not None
    
    # Vérifier que <identity> existe avec les champs appropriés
    identity_elem = character_elem.find("identity")
    assert identity_elem is not None, "Section INFORMATIONS doit créer <identity>"
    
    name_elem = identity_elem.find("name")
    alias_elem = identity_elem.find("alias")
    species_elem = identity_elem.find("species")
    
    assert name_elem is not None, "Champ 'Nom' doit être dans <identity><name>"
    assert name_elem.text == "Test Character"
    assert alias_elem is not None, "Champ 'Alias' doit être dans <identity><alias>"
    assert species_elem is not None, "Champ 'Espèce' doit être dans <identity><species>"
    
    # Vérifier que <metadata> existe avec les champs appropriés
    metadata_elem = character_elem.find("metadata")
    assert metadata_elem is not None, "Champs métadonnées doivent être dans <metadata>"
    
    occupation_elem = metadata_elem.find("occupation")
    assert occupation_elem is not None, "Champ 'Occupation' doit être dans <metadata><occupation>"
    assert occupation_elem.text == "Testeur"


@pytest.mark.unit
def test_json_content_destructured(context_builder):
    """Test que le contenu JSON est déstructuré en éléments XML."""
    structure = PromptStructure(
        sections=[
            PromptSection(
                type="context",
                title="CONTEXTE GDD",
                content="",
                categories=[
                    ContextCategory(
                        type="characters",
                        title="CHARACTERS",
                        items=[
                            ContextItem(
                                id="PNJ_1",
                                name="PNJ 1",
                                sections=[
                                    ItemSection(
                                        title="CARACTÉRISATION",
                                        content='{"Faiblesse": "Test weakness", "Compulsion": "Test compulsion", "Désir": "Test desire"}'
                                    )
                                ],
                                metadata={"name": "Test Character"}
                            )
                        ]
                    )
                ]
            )
        ],
        metadata=PromptMetadata(
            totalTokens=50,
            generatedAt=datetime.now().isoformat(),
            organizationMode="narrative"
        )
    )
    
    root = context_builder._context_serializer.serialize_to_xml(structure)
    characterization_elem = root.find(".//characterization")
    assert characterization_elem is not None
    
    # Vérifier que le JSON est déstructuré en éléments XML
    weakness_elem = characterization_elem.find("weakness")
    compulsion_elem = characterization_elem.find("compulsion")
    desire_elem = characterization_elem.find("desire")
    
    assert weakness_elem is not None, "JSON doit être déstructuré en <weakness>"
    assert weakness_elem.text == "Test weakness"
    assert compulsion_elem is not None, "JSON doit être déstructuré en <compulsion>"
    assert compulsion_elem.text == "Test compulsion"
    assert desire_elem is not None, "JSON doit être déstructuré en <desire>"
    assert desire_elem.text == "Test desire"
    
    # Vérifier qu'il n'y a pas de JSON brut dans le texte
    if characterization_elem.text:
        assert not characterization_elem.text.strip().startswith("{"), \
            "Ne doit pas y avoir de JSON brut dans le texte"


@pytest.mark.unit
def test_no_duplicate_fields_between_structured_and_metadata_sections(context_builder):
    """Test qu'un champ présent dans une section structurée n'est pas dupliqué dans metadata.
    
    Cas de test : un champ (ex: "Faiblesse") présent à la fois dans "CARACTÉRISATION" 
    (section structurée) ET dans "AUTRES INFORMATIONS" ne doit apparaître qu'UNE SEULE FOIS 
    dans le XML (dans la section structurée, pas dans metadata).
    """
    structure = PromptStructure(
        sections=[
            PromptSection(
                type="context",
                title="CONTEXTE GDD",
                content="",
                categories=[
                    ContextCategory(
                        type="characters",
                        title="CHARACTERS",
                        items=[
                            ContextItem(
                                id="PNJ_1",
                                name="PNJ 1",
                                sections=[
                                    # Section structurée : CARACTÉRISATION avec Faiblesse, Compulsion, Désir
                                    ItemSection(
                                        title="CARACTÉRISATION",
                                        content='{"Faiblesse": "Test weakness value", "Compulsion": "Test compulsion value", "Désir Principal": "Test desire value"}'
                                    ),
                                    # Section structurée : BACKGROUND avec Apparence, Contexte, Relations
                                    ItemSection(
                                        title="HISTOIRE ET RELATIONS",
                                        content='{"Apparence": "Test appearance value", "Contexte": "Test context value", "Relations": "Test relations value"}'
                                    ),
                                    # Section AUTRES INFORMATIONS avec les MÊMES champs (simule duplication)
                                    ItemSection(
                                        title="AUTRES INFORMATIONS",
                                        content="Faiblesse: Duplicate weakness value\nCompulsion: Duplicate compulsion value\nDésir Principal: Duplicate desire value\nApparence: Duplicate appearance value\nContexte: Duplicate context value\nRelations: Duplicate relations value\nSprint: Sprint 1\nÉtat: A implémenter"
                                    )
                                ],
                                metadata={"name": "Test Character"}
                            )
                        ]
                    )
                ]
            )
        ],
        metadata=PromptMetadata(
            totalTokens=200,
            generatedAt=datetime.now().isoformat(),
            organizationMode="narrative"
        )
    )
    
    root = context_builder._context_serializer.serialize_to_xml(structure)
    character_elem = root.find(".//character")
    assert character_elem is not None, "Élément <character> manquant"
    
    # Vérifier que les champs structurés sont dans <characterization> et <background>
    characterization_elem = character_elem.find("characterization")
    assert characterization_elem is not None, "Section CARACTÉRISATION doit créer <characterization>"
    
    background_elem = character_elem.find("background")
    assert background_elem is not None, "Section HISTOIRE ET RELATIONS doit créer <background>"
    
    # Vérifier que les champs sont bien dans les sections structurées
    weakness_structured = characterization_elem.find("weakness")
    compulsion_structured = characterization_elem.find("compulsion")
    desire_structured = characterization_elem.find("desire")
    
    assert weakness_structured is not None, "Faiblesse doit être dans <characterization><weakness>"
    assert weakness_structured.text == "Test weakness value"
    assert compulsion_structured is not None, "Compulsion doit être dans <characterization><compulsion>"
    assert compulsion_structured.text == "Test compulsion value"
    assert desire_structured is not None, "Désir Principal doit être dans <characterization><desire>"
    assert desire_structured.text == "Test desire value"
    
    appearance_structured = background_elem.find("appearance")
    context_structured = background_elem.find("context")
    relations_structured = background_elem.find("relationships")
    
    assert appearance_structured is not None, "Apparence doit être dans <background><appearance>"
    assert appearance_structured.text == "Test appearance value"
    assert context_structured is not None, "Contexte doit être dans <background><context>"
    assert context_structured.text == "Test context value"
    assert relations_structured is not None, "Relations doit être dans <background><relationships>"
    assert relations_structured.text == "Test relations value"
    
    # Vérifier que <metadata> existe (car AUTRES INFORMATIONS doit créer metadata)
    metadata_elem = character_elem.find("metadata")
    assert metadata_elem is not None, "Section AUTRES INFORMATIONS doit créer <metadata>"
    
    # CRITIQUE : Vérifier que les champs déjà dans les sections structurées NE SONT PAS dans metadata
    weakness_metadata = metadata_elem.find("faiblesse")
    compulsion_metadata = metadata_elem.find("compulsion")
    desire_metadata = metadata_elem.find("desir_principal")
    appearance_metadata = metadata_elem.find("apparence")
    context_metadata = metadata_elem.find("contexte")
    relations_metadata = metadata_elem.find("relations")
    
    assert weakness_metadata is None, \
        "Faiblesse NE DOIT PAS être dans <metadata> (déjà dans <characterization>)"
    assert compulsion_metadata is None, \
        "Compulsion NE DOIT PAS être dans <metadata> (déjà dans <characterization>)"
    assert desire_metadata is None, \
        "Désir Principal NE DOIT PAS être dans <metadata> (déjà dans <characterization>)"
    assert appearance_metadata is None, \
        "Apparence NE DOIT PAS être dans <metadata> (déjà dans <background>)"
    assert context_metadata is None, \
        "Contexte NE DOIT PAS être dans <metadata> (déjà dans <background>)"
    assert relations_metadata is None, \
        "Relations NE DOIT PAS être dans <metadata> (déjà dans <background>)"
    
    # Vérifier que les champs UNIQUEMENT dans AUTRES INFORMATIONS (pas dans sections structurées) sont dans metadata
    sprint_metadata = metadata_elem.find("sprint")
    status_metadata = metadata_elem.find("status")  # "État" est mappé vers "status" dans METADATA_FIELD_MAP
    
    assert sprint_metadata is not None, \
        "Sprint doit être dans <metadata> (pas dans sections structurées)"
    assert sprint_metadata.text == "Sprint 1"
    assert status_metadata is not None, \
        "État doit être dans <metadata> (pas dans sections structurées, mappé vers tag 'status')"
    assert status_metadata.text == "A implémenter"


@pytest.mark.integration
@pytest.mark.api
def test_end_to_end_no_duplicate_fields_real_data(real_client):
    """Test end-to-end avec données réelles : vérifie qu'il n'y a pas de duplications.
    
    Charge des données GDD réelles, construit un prompt, et vérifie qu'aucun champ
    n'apparaît à la fois dans <metadata> ET dans une section structurée.
    """
    from core.context.context_builder import ContextBuilder
    cb = ContextBuilder()
    cb.load_gdd_files()
    all_characters = cb.get_characters_names()
    
    if not all_characters:
        pytest.skip("Aucun personnage disponible dans les données GDD")
    
    test_character = all_characters[0]
    
    # Construire un contexte avec un personnage (full pour avoir toutes les sections)
    response = real_client.post(
        "/api/v1/dialogues/estimate-tokens",
        json={
            "context_selections": {
                "characters_full": [test_character],
                "locations_full": [],
                "items_full": [],
                "species_full": [],
                "communities_full": []
            },
            "user_instructions": "Test end-to-end déduplication",
            "max_context_tokens": 5000,
            "include_narrative_guides": True
        }
    )
    
    assert response.status_code == 200, f"Erreur API: {response.status_code} - {response.text}"
    data = response.json()
    raw_prompt = data.get("raw_prompt", "")
    
    # Parser le XML
    assert raw_prompt.startswith('<?xml'), "Le prompt doit être en XML"
    xml_content = raw_prompt.split('?>', 1)[-1].strip()
    root = ET.fromstring(xml_content)
    
    # Trouver tous les éléments <character>
    context_elem = root.find("context")
    if context_elem is None:
        pytest.skip("Pas de section <context> dans le prompt")
    
    characters_elem = context_elem.find("characters")
    if characters_elem is None:
        pytest.skip("Pas de section <characters> dans le prompt")
    
    character_elems = characters_elem.findall("character")
    if not character_elems:
        pytest.skip("Aucun personnage trouvé dans le prompt")
    
    # Pour chaque personnage, vérifier qu'il n'y a pas de duplications
    for char_elem in character_elems:
        # Collecter tous les champs dans les sections structurées
        structured_fields = set()
        
        # Champs dans <characterization>
        characterization = char_elem.find("characterization")
        if characterization is not None:
            for child in characterization:
                if child.text:
                    structured_fields.add(child.tag.lower())
        
        # Champs dans <background>
        background = char_elem.find("background")
        if background is not None:
            for child in background:
                if child.text:
                    structured_fields.add(child.tag.lower())
                    # Extraire récursivement les champs des sous-dicts
                    for subchild in child:
                        if subchild.text:
                            structured_fields.add(subchild.tag.lower())
        
        # Champs dans <narrative_arcs>
        narrative_arcs = char_elem.find("narrative_arcs")
        if narrative_arcs is not None:
            for child in narrative_arcs:
                if child.text:
                    structured_fields.add(child.tag.lower())
        
        # Vérifier que <metadata> ne contient AUCUN de ces champs
        metadata = char_elem.find("metadata")
        if metadata is not None:
            metadata_fields = {child.tag.lower() for child in metadata if child.text}
            
            # Vérifier qu'il n'y a pas de champs dupliqués
            duplicates = structured_fields & metadata_fields
            assert len(duplicates) == 0, \
                f"Champs dupliqués trouvés dans metadata ET sections structurées pour {char_elem.get('name', 'unknown')}: {duplicates}"
            
            if duplicates:
                print(f"\n⚠️ DUPLICATIONS DÉTECTÉES pour {char_elem.get('name', 'unknown')}:")
                for dup in duplicates:
                    print(f"  - {dup} présent à la fois dans sections structurées ET metadata")


@pytest.fixture
def real_client():
    """Client de test sans mocks - utilise les vrais services."""
    yield TestClient(app)
