"""Tests pour le service NotionAPIClient."""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
import httpx
from services.notion_api_client import NotionAPIClient


@pytest.fixture
def mock_api_key():
    """Clé API mock pour les tests."""
    return "test_notion_api_key_12345"


@pytest.fixture
def notion_client(mock_api_key, monkeypatch):
    """Fixture pour créer un NotionAPIClient avec clé API mock."""
    monkeypatch.setenv("NOTION_API_KEY", mock_api_key)
    return NotionAPIClient()


class TestNotionAPIClient:
    """Tests pour NotionAPIClient."""
    
    def test_init_with_api_key(self, mock_api_key):
        """Test d'initialisation avec clé API fournie."""
        client = NotionAPIClient(api_key=mock_api_key)
        
        assert client.api_key == mock_api_key
        assert client.base_url == "https://api.notion.com/v1"
        assert "Authorization" in client.headers
        assert f"Bearer {mock_api_key}" in client.headers["Authorization"]
    
    def test_init_without_api_key_with_env(self, mock_api_key, monkeypatch):
        """Test d'initialisation sans clé API mais avec variable d'environnement."""
        monkeypatch.setenv("NOTION_API_KEY", mock_api_key)
        client = NotionAPIClient()
        
        assert client.api_key == mock_api_key
    
    def test_init_without_api_key_no_env(self, monkeypatch):
        """Test d'initialisation sans clé API et sans variable d'environnement."""
        monkeypatch.delenv("NOTION_API_KEY", raising=False)
        
        with pytest.raises(ValueError) as exc_info:
            NotionAPIClient()
        
        assert "NOTION_API_KEY" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_query_database_success(self, notion_client):
        """Test de requête de base de données avec succès (chemin data_sources)."""
        database_id = "test_database_id"
        mock_get_response = MagicMock()
        mock_get_response.json.return_value = {
            "object": "database",
            "id": database_id,
            "data_sources": [{"id": "ds-1", "name": "Default"}],
        }
        mock_get_response.raise_for_status = MagicMock()

        mock_response_data = {
            "results": [
                {"id": "page1", "properties": {}},
                {"id": "page2", "properties": {}}
            ],
            "has_more": False
        }
        
        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_post_response = MagicMock()
            mock_post_response.json.return_value = mock_response_data
            mock_post_response.raise_for_status = MagicMock()
            mock_client.get = AsyncMock(return_value=mock_get_response)
            mock_client.post = AsyncMock(return_value=mock_post_response)
            mock_client_class.return_value.__aenter__.return_value = mock_client
            
            result = await notion_client.query_database(database_id)
            
            assert len(result) == 2
            assert result[0]["id"] == "page1"
            mock_client.get.assert_called_once()
            mock_client.post.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_query_database_with_pagination(self, notion_client):
        """Test de requête de base de données avec pagination (chemin data_sources)."""
        database_id = "test_database_id"

        mock_get_response = MagicMock()
        mock_get_response.json.return_value = {
            "object": "database",
            "data_sources": [{"id": "ds-1"}],
        }
        mock_get_response.raise_for_status = MagicMock()
        
        # Première page
        mock_response_1 = MagicMock()
        mock_response_1.json.return_value = {
            "results": [{"id": "page1"}],
            "has_more": True,
            "next_cursor": "cursor123"
        }
        mock_response_1.raise_for_status = MagicMock()
        
        # Deuxième page
        mock_response_2 = MagicMock()
        mock_response_2.json.return_value = {
            "results": [{"id": "page2"}],
            "has_more": False
        }
        mock_response_2.raise_for_status = MagicMock()
        
        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_get_response)
            mock_client.post = AsyncMock(side_effect=[mock_response_1, mock_response_2])
            mock_client_class.return_value.__aenter__.return_value = mock_client
            
            result = await notion_client.query_database(database_id)
            
            assert len(result) == 2
            assert mock_client.post.call_count == 2

    @pytest.mark.asyncio
    async def test_query_database_multi_data_sources_excludes_reward_named(
        self, notion_client
    ):
        """Une seule requête data_source : vue « récompenses » exclue par le nom."""
        database_id = "test_database_id"
        mock_get_response = MagicMock()
        mock_get_response.json.return_value = {
            "object": "database",
            "id": database_id,
            "title": [{"type": "text", "plain_text": "Systèmes de jeu"}],
            "data_sources": [
                {"id": "ds-main", "name": "Systèmes de jeu"},
                {"id": "ds-rew", "name": "Récompenses types"},
            ],
        }
        mock_get_response.raise_for_status = MagicMock()
        mock_post_response = MagicMock()
        mock_post_response.json.return_value = {
            "results": [{"id": "page-sys"}],
            "has_more": False,
        }
        mock_post_response.raise_for_status = MagicMock()
        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_get_response)
            mock_client.post = AsyncMock(return_value=mock_post_response)
            mock_client_class.return_value.__aenter__.return_value = mock_client
            result = await notion_client.query_database(database_id)
            assert len(result) == 1
            assert result[0]["id"] == "page-sys"
            assert mock_client.post.call_count == 1
            called_url = mock_client.post.call_args[0][0]
            assert "ds-main" in called_url
            assert "ds-rew" not in called_url

    @pytest.mark.asyncio
    async def test_query_database_respects_explicit_data_source_ids(
        self, notion_client
    ):
        """notion_data_source_ids forcés : interroge uniquement ces UUID."""
        database_id = "test_database_id"
        mock_get_response = MagicMock()
        mock_get_response.json.return_value = {
            "object": "database",
            "id": database_id,
            "data_sources": [
                {"id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "name": "A"},
                {"id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "name": "B"},
            ],
        }
        mock_get_response.raise_for_status = MagicMock()
        mock_post_response = MagicMock()
        mock_post_response.json.return_value = {"results": [], "has_more": False}
        mock_post_response.raise_for_status = MagicMock()
        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_get_response)
            mock_client.post = AsyncMock(return_value=mock_post_response)
            mock_client_class.return_value.__aenter__.return_value = mock_client
            await notion_client.query_database(
                database_id,
                data_source_ids=["bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"],
            )
            called_url = mock_client.post.call_args[0][0]
            assert "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" in called_url
    
    @pytest.mark.asyncio
    async def test_query_database_http_error(self, notion_client):
        """Test de requête de base de données avec erreur HTTP (fallback legacy)."""
        database_id = "test_database_id"
        
        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_get_response = MagicMock()
            mock_get_response.json.return_value = {
                "object": "database",
                "data_sources": [],
            }
            mock_get_response.raise_for_status = MagicMock()
            mock_client.get = AsyncMock(return_value=mock_get_response)

            mock_response = MagicMock()
            mock_response.status_code = 401
            mock_response.text = "Unauthorized"
            mock_http_error = httpx.HTTPStatusError(
                "Unauthorized",
                request=MagicMock(),
                response=mock_response
            )
            mock_client.post = AsyncMock(side_effect=mock_http_error)
            mock_client_class.return_value.__aenter__.return_value = mock_client
            
            with pytest.raises(httpx.HTTPStatusError):
                await notion_client.query_database(database_id)
    
    @pytest.mark.asyncio
    async def test_get_page_success(self, notion_client):
        """Test de récupération d'une page avec succès."""
        page_id = "test_page_id"
        mock_page_data = {
            "id": page_id,
            "properties": {},
            "content": "Test content"
        }
        
        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_response = MagicMock()
            mock_response.json.return_value = mock_page_data
            mock_response.raise_for_status = MagicMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value.__aenter__.return_value = mock_client
            
            result = await notion_client.get_page(page_id)
            
            assert result["id"] == page_id
            mock_client.get.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_get_page_http_error(self, notion_client):
        """Test de récupération d'une page avec erreur HTTP."""
        page_id = "test_page_id"
        
        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_response = MagicMock()
            mock_response.status_code = 404
            mock_response.text = "Not Found"
            mock_http_error = httpx.HTTPStatusError(
                "Not Found",
                request=MagicMock(),
                response=mock_response
            )
            mock_client.get = AsyncMock(side_effect=mock_http_error)
            mock_client_class.return_value.__aenter__.return_value = mock_client
            
            with pytest.raises(httpx.HTTPStatusError):
                await notion_client.get_page(page_id)
    
    @pytest.mark.asyncio
    async def test_get_page_content_prefers_page_markdown_endpoint(self, notion_client):
        """``GET /pages/{id}/markdown`` (API 2026-03-11) évite l’arbre blocs quand il répond."""
        with patch.object(
            notion_client, "_try_get_page_markdown", new_callable=AsyncMock
        ) as mock_md:
            mock_md.return_value = "## Section\n\nCorps markdown enrichi."
            with patch.object(
                notion_client, "_get_all_blocks", new_callable=AsyncMock
            ) as mock_blocks:
                out = await notion_client.get_page_content("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
        mock_md.assert_called_once()
        mock_blocks.assert_not_called()
        assert "Corps markdown enrichi." in out

    @pytest.mark.asyncio
    async def test_get_page_content_falls_back_to_blocks_when_markdown_none(
        self, notion_client
    ):
        with patch.object(
            notion_client, "_try_get_page_markdown", new_callable=AsyncMock
        ) as mock_md:
            mock_md.return_value = None
            with patch.object(
                notion_client, "_get_all_blocks", new_callable=AsyncMock
            ) as mock_blocks:
                mock_blocks.return_value = [
                    {
                        "type": "paragraph",
                        "paragraph": {"rich_text": [{"plain_text": "fallback"}]},
                    }
                ]
                with patch.object(
                    notion_client,
                    "_extract_block_text_recursive",
                    new_callable=AsyncMock,
                ) as mock_ex:
                    mock_ex.return_value = "fallback"
                    out = await notion_client.get_page_content(
                        "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
                    )
        mock_blocks.assert_called_once()
        assert out == "fallback"

    @pytest.mark.asyncio
    async def test_get_page_content_success_if_exists(self, notion_client):
        """Test de récupération du contenu d'une page avec succès si la méthode existe."""
        if not hasattr(notion_client, "get_page_content"):
            pytest.skip("get_page_content method does not exist")
        
        page_id = "test_page_id"
        
        # Mocker _try_get_page_markdown (sinon appel réel Notion avec clé de test invalide)
        with patch.object(
            notion_client, "_try_get_page_markdown", new_callable=AsyncMock
        ) as mock_md:
            mock_md.return_value = None
            # Mocker _get_all_blocks pour éviter les appels HTTP réels
            with patch.object(
                notion_client, "_get_all_blocks", new_callable=AsyncMock
            ) as mock_get_blocks:
                mock_get_blocks.return_value = [
                    {
                        "type": "paragraph",
                        "paragraph": {
                            "rich_text": [{"plain_text": "Test content"}]
                        },
                    }
                ]

                # Mocker _extract_block_text_recursive
                with patch.object(
                    notion_client,
                    "_extract_block_text_recursive",
                    new_callable=AsyncMock,
                ) as mock_extract:
                    mock_extract.return_value = "Test content"

                    result = await notion_client.get_page_content(page_id)
                
                assert isinstance(result, str)
                assert len(result) >= 0

    @pytest.mark.asyncio
    async def test_extract_block_text_table_row_cells(self, notion_client):
        """Les cellules ``table_row.cells`` sont sérialisées (pas de ``rich_text`` racine)."""
        block = {
            "type": "table_row",
            "table_row": {
                "cells": [
                    [{"plain_text": "A1", "type": "text"}],
                    [{"plain_text": "B1", "type": "text"}],
                ]
            },
        }
        out = await notion_client._extract_block_text_recursive(block)
        assert out == "A1 | B1"

    @pytest.mark.asyncio
    async def test_extract_callout_body_inside_column_list(self, notion_client):
        """Callout + column_list : le corps vit dans les colonnes sans ``rich_text`` intermédiaire."""
        blocks_by_id = {
            "page-root": [
                {
                    "id": "co1",
                    "type": "callout",
                    "has_children": True,
                    "callout": {
                        "rich_text": [
                            {
                                "plain_text": "Histoire",
                                "annotations": {"bold": True, "color": "green"},
                            }
                        ]
                    },
                }
            ],
            "co1": [
                {
                    "id": "cl1",
                    "type": "column_list",
                    "has_children": True,
                    "column_list": {},
                }
            ],
            "cl1": [
                {
                    "id": "cleft",
                    "type": "column",
                    "has_children": True,
                    "column": {},
                },
                {
                    "id": "cright",
                    "type": "column",
                    "has_children": True,
                    "column": {},
                },
            ],
            "cleft": [
                {
                    "type": "paragraph",
                    "paragraph": {
                        "rich_text": [{"plain_text": "Corps colonne gauche."}]
                    },
                }
            ],
            "cright": [
                {
                    "type": "paragraph",
                    "paragraph": {
                        "rich_text": [{"plain_text": "Corps colonne droite."}]
                    },
                }
            ],
        }

        async def fake_get_all_blocks(block_id: str, *args, **kwargs):
            return list(blocks_by_id.get(block_id, []))

        with patch.object(
            notion_client, "_get_all_blocks", new_callable=AsyncMock
        ) as mock_gb:
            mock_gb.side_effect = fake_get_all_blocks
            root = blocks_by_id["page-root"][0]
            out = await notion_client._extract_block_text_recursive(root)
        assert "## Histoire" in (out or "")
        assert "Corps colonne gauche." in (out or "")
        assert "Corps colonne droite." in (out or "")

    @pytest.mark.asyncio
    async def test_extract_child_page_embeds_nested_page(self, notion_client):
        """Bloc ``child_page`` : récupère le markdown de la sous-page (ID = id du bloc)."""
        block = {
            "id": "subpage-uuid",
            "type": "child_page",
            "child_page": {"title": "Détail"},
        }
        with patch.object(
            notion_client,
            "get_page_content",
            new_callable=AsyncMock,
        ) as mock_gpc:
            mock_gpc.return_value = "Ligne interne."
            out = await notion_client._extract_block_text_recursive(block)
        mock_gpc.assert_called_once_with("subpage-uuid", _embed_depth=1)
        assert out is not None
        assert "## Détail" in out
        assert "Ligne interne." in out
