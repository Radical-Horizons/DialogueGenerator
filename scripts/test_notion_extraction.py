"""Script de test pour vérifier l'extraction Notion.

Référence pour un corps de page complet : ``NotionAPIClient.get_page_content``
(markdown API puis repli blocs). L'appel à ``_get_all_blocks`` ci-dessous sert au
débogage (comptage / types de blocs), pas comme stratégie d'export plein texte.
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from services.notion_api_client import NotionAPIClient

async def test_extraction():
    """Test l'extraction d'une page Notion."""
    client = NotionAPIClient()
    
    # Test avec le guide de narration
    page_id = "1886e4d21b4581339cf2ef6486fa001d"
    
    print("=== GUIDE DE NARRATION ===")
    print("Récupération des blocs...")
    blocks = await client._get_all_blocks(page_id)
    print(f"Nombre de blocs: {len(blocks)}")
    
    # Afficher les 10 premiers blocs pour debug
    for i, block in enumerate(blocks[:10]):
        print(f"\n--- Bloc {i+1} ---")
        print(f"Type: {block.get('type')}")
        print(f"Has children: {block.get('has_children')}")
        block_data = block.get(block.get('type'), {})
        rich_text = block_data.get('rich_text', [])
        if rich_text:
            text = "".join(rt.get('plain_text', '') for rt in rich_text)
            print(f"Texte: {text[:150]}")
        else:
            print("Pas de rich_text")
    
    print("\n\nExtraction complète...")
    content = await client.get_page_content(page_id)
    print(f"Longueur totale: {len(content)} caractères")
    try:
        print(f"\nPremiers 2000 caractères:\n{content[:2000]}")
    except UnicodeEncodeError:
        # Pour Windows, encoder en UTF-8
        print(f"\nPremiers 2000 caractères:\n{content[:2000].encode('utf-8', errors='replace').decode('utf-8', errors='replace')}")
    
    # Test aussi avec le guide des dialogues
    print("\n\n=== GUIDE DES DIALOGUES ===")
    page_id2 = "1886e4d21b45812094c4fb4e9666e0cb"
    content2 = await client.get_page_content(page_id2)
    print(f"Longueur: {len(content2)} caractères")
    print(f"Premiers 500 caractères:\n{content2[:500]}")

if __name__ == "__main__":
    asyncio.run(test_extraction())

