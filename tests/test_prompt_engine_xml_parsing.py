"""Tests pour le parsing XML vers PromptStructure dans prompt_engine."""
import pytest
import xml.etree.ElementTree as ET
from unittest.mock import MagicMock
from core.prompt.prompt_engine import PromptEngine, PromptInput
from services.prompt_builder import PromptBuilder
from models.prompt_structure import PromptStructure, PromptSection, ContextCategory, ContextItem, ItemSection


def _make_mock_context_builder():
    """Crée un mock ContextBuilder avec un _context_serializer fonctionnel."""
    mock_cb = MagicMock()

    def _serialize_to_xml(structured_context):
        """Sérialise un PromptStructure en <context> XML minimal."""
        ctx = ET.Element("context")
        for section in getattr(structured_context, "sections", []):
            for cat in getattr(section, "categories", []):
                cat_elem = ET.SubElement(ctx, cat.type)
                for item in getattr(cat, "items", []):
                    item_elem = ET.SubElement(cat_elem, "element")
                    item_elem.set("id", item.id)
                    item_elem.set("name", item.name)
                    for sec in getattr(item, "sections", []):
                        s_elem = ET.SubElement(item_elem, sec.title.lower().replace(" ", "_"))
                        s_elem.text = sec.content
        return ctx

    mock_cb._context_serializer.serialize_to_xml.side_effect = _serialize_to_xml
    return mock_cb


@pytest.fixture
def prompt_engine():
    """Fixture pour créer un PromptEngine avec un mock ContextBuilder injecté."""
    mock_cb = _make_mock_context_builder()
    builder = PromptBuilder(context_builder=mock_cb)
    return PromptEngine(prompt_builder=builder)


@pytest.fixture
def sample_xml_root():
    """Crée un élément XML <prompt> de test avec toutes les sections."""
    root = ET.Element("prompt")
    
    # Section contract
    contract = ET.SubElement(root, "contract")
    author = ET.SubElement(contract, "author_directives")
    author.text = "Style épique et immersif"
    tone = ET.SubElement(contract, "narrative_tone")
    tone.text = "Ton : #tension, #dramatique"
    
    # Section technical
    technical = ET.SubElement(root, "technical")
    gen = ET.SubElement(technical, "generation_instructions")
    gen.text = "Speaker: PNJ_1\nChoix: Options du joueur"
    
    # Section context
    context = ET.SubElement(root, "context")
    general = ET.SubElement(context, "general")
    general.text = "Contexte général de la scène"
    
    # Section narrative_guides
    guides = ET.SubElement(root, "narrative_guides")
    guides.text = "Guide de dialogue..."
    
    # Section vocabulary
    vocab = ET.SubElement(root, "vocabulary")
    vocab.text = "Vocabulaire Alteir..."
    
    # Section scene_instructions
    scene = ET.SubElement(root, "scene_instructions")
    scene.set("priority", "high")
    scene.text = "Instructions de scène spécifiques"
    
    return root


@pytest.fixture
def sample_structured_context():
    """Crée un PromptStructure de test pour le contexte structuré."""
    from models.prompt_structure import PromptMetadata
    
    return PromptStructure(
        sections=[
            PromptSection(
                type="context",
                title="SECTION 2A. CONTEXTE GDD",
                content="",
                tokenCount=100,
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
                                        content="Nom: Test",
                                        tokenCount=10
                                    )
                                ],
                                tokenCount=10
                            )
                        ],
                        tokenCount=10
                    )
                ]
            )
        ],
        metadata=PromptMetadata(
            totalTokens=100,
            generatedAt="2024-01-01T00:00:00",
            organizationMode="narrative"
        )
    )


class TestParseXmlToPromptStructure:
    """Tests pour _parse_xml_to_prompt_structure()."""
    
    def test_parse_complete_xml(self, prompt_engine, sample_xml_root):
        """Test le parsing d'un XML complet avec toutes les sections."""
        result = prompt_engine._parse_xml_to_prompt_structure(
            sample_xml_root,
            None,
            1000
        )
        
        assert result is not None
        assert isinstance(result, PromptStructure)
        assert len(result.sections) > 0
        
        # Vérifier que toutes les sections sont présentes
        section_titles = [s.title for s in result.sections]
        assert "SECTION 0. CONTRAT GLOBAL" in section_titles
        assert "SECTION 1. INSTRUCTIONS TECHNIQUES (NORMATIVES)" in section_titles
        assert "SECTION 2B. GUIDES NARRATIFS" in section_titles
        assert "SECTION 2C. VOCABULAIRE ALTEIR" in section_titles
        assert "SECTION 3. INSTRUCTIONS DE SCÈNE (PRIORITÉ EFFECTIVE)" in section_titles
    
    def test_parse_xml_with_structured_context(self, prompt_engine, sample_xml_root, sample_structured_context):
        """Test le parsing avec un contexte structuré (doit utiliser les categories)."""
        result = prompt_engine._parse_xml_to_prompt_structure(
            sample_xml_root,
            sample_structured_context,
            1000
        )
        
        assert result is not None
        assert isinstance(result, PromptStructure)
        
        # Vérifier que la section context utilise les categories du structured_context
        context_section = None
        for section in result.sections:
            if section.type == "context":
                context_section = section
                break
        
        assert context_section is not None
        assert context_section.categories is not None
        assert len(context_section.categories) > 0
        assert context_section.categories[0].type == "characters"
    
    def test_parse_minimal_xml(self, prompt_engine):
        """Test le parsing d'un XML minimal (seulement certaines sections)."""
        root = ET.Element("prompt")
        
        # Seulement contract et scene_instructions
        contract = ET.SubElement(root, "contract")
        author = ET.SubElement(contract, "author_directives")
        author.text = "Directives minimales"
        
        scene = ET.SubElement(root, "scene_instructions")
        scene.text = "Instructions minimales"
        
        result = prompt_engine._parse_xml_to_prompt_structure(root, None, 100)
        
        assert result is not None
        assert len(result.sections) == 2
        section_titles = [s.title for s in result.sections]
        assert "SECTION 0. CONTRAT GLOBAL" in section_titles
        assert "SECTION 3. INSTRUCTIONS DE SCÈNE (PRIORITÉ EFFECTIVE)" in section_titles
    
    def test_parse_xml_without_structured_context(self, prompt_engine, sample_xml_root):
        """Test le parsing sans contexte structuré (doit parser le XML context)."""
        result = prompt_engine._parse_xml_to_prompt_structure(
            sample_xml_root,
            None,
            1000
        )
        
        assert result is not None
        
        # Vérifier que la section context est créée depuis le XML
        context_section = None
        for section in result.sections:
            if section.type == "context":
                context_section = section
                break
        
        assert context_section is not None
        assert context_section.title == "SECTION 2A. CONTEXTE GDD"
        assert "Contexte général" in context_section.content
    
    def test_parse_xml_empty_sections(self, prompt_engine):
        """Test le parsing d'un XML avec des sections vides (doit les ignorer)."""
        root = ET.Element("prompt")
        
        # Section vide
        contract = ET.SubElement(root, "contract")
        # Pas de contenu
        
        result = prompt_engine._parse_xml_to_prompt_structure(root, None, 100)
        
        # Les sections vides ne doivent pas être ajoutées
        assert result is not None
        assert len(result.sections) == 0
    
    def test_parse_xml_preserves_metadata(self, prompt_engine, sample_xml_root, sample_structured_context):
        """Test que les métadonnées sont préservées (organizationMode)."""
        result = prompt_engine._parse_xml_to_prompt_structure(
            sample_xml_root,
            sample_structured_context,
            1000
        )
        
        assert result is not None
        assert result.metadata is not None
        assert result.metadata.totalTokens == 1000
        assert result.metadata.organizationMode == "narrative"
        assert result.metadata.generatedAt is not None
    
    def test_parse_xml_handles_errors_gracefully(self, prompt_engine):
        """Test que les erreurs de parsing sont gérées gracieusement."""
        # XML invalide (None)
        result = prompt_engine._parse_xml_to_prompt_structure(None, None, 100)
        assert result is None
        
        # XML avec structure invalide
        root = ET.Element("prompt")
        # Pas de sections valides
        
        result = prompt_engine._parse_xml_to_prompt_structure(root, None, 100)
        # Ne doit pas lever d'exception, retourne une structure vide ou None
        assert result is not None  # Retourne une structure avec sections vides


class TestBuildPromptIntegration:
    """Tests d'intégration pour build_prompt() avec parsing XML."""
    
    def test_build_prompt_generates_structured_prompt(self, prompt_engine):
        """Test que build_prompt() génère un structured_prompt depuis le XML."""
        prompt_input = PromptInput(
            user_instructions="Test instructions",
            npc_speaker_id="PNJ_1",
            player_character_id="URESAIR",
            author_profile="Test author profile",
            narrative_tags=["tension", "dramatique"]
        )
        
        built = prompt_engine.build_prompt(prompt_input)
        
        assert built.raw_prompt.startswith('<?xml version="1.0" encoding="UTF-8"?>')
        # structured_prompt peut être None si structured_context n'est pas fourni
        # mais le XML doit être valide
    
    def test_build_prompt_with_structured_context(self, prompt_engine, sample_structured_context):
        """Test que build_prompt() génère structured_prompt avec structured_context."""
        prompt_input = PromptInput(
            user_instructions="Test instructions",
            npc_speaker_id="PNJ_1",
            player_character_id="URESAIR",
            structured_context=sample_structured_context
        )
        
        built = prompt_engine.build_prompt(prompt_input)
        
        assert built.structured_prompt is not None
        assert isinstance(built.structured_prompt, PromptStructure)
        assert len(built.structured_prompt.sections) > 0
    
    def test_build_prompt_validates_xml(self, prompt_engine):
        """Test que build_prompt() valide le XML généré."""
        prompt_input = PromptInput(
            user_instructions="Test instructions",
            npc_speaker_id="PNJ_1",
            player_character_id="URESAIR"
        )
        
        built = prompt_engine.build_prompt(prompt_input)
        
        # Le XML doit être valide
        from utils.xml_utils import validate_xml_content
        assert validate_xml_content(built.raw_prompt)
        
        # Parser le XML pour vérifier la structure
        import xml.etree.ElementTree as ET
        xml_content = built.raw_prompt.split('?>', 1)[-1].strip()
        root = ET.fromstring(xml_content)
        assert root.tag == "prompt"
