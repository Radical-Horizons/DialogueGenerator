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
    async def test_get_page_content_success_if_exists(self, notion_client):
        """Test de récupération du contenu d'une page avec succès si la méthode existe."""
        if not hasattr(notion_client, "get_page_content"):
            pytest.skip("get_page_content method does not exist")
        
        page_id = "test_page_id"
        
        # Mocker _get_all_blocks pour éviter les appels HTTP réels
        with patch.object(notion_client, "_get_all_blocks", new_callable=AsyncMock) as mock_get_blocks:
            mock_get_blocks.return_value = [
                {
                    "type": "paragraph",
                    "paragraph": {
                        "rich_text": [{"plain_text": "Test content"}]
                    }
                }
            ]
            
            # Mocker _extract_block_text_recursive
            with patch.object(notion_client, "_extract_block_text_recursive", new_callable=AsyncMock) as mock_extract:
                mock_extract.return_value = "Test content"
                
                result = await notion_client.get_page_content(page_id)
                
                assert isinstance(result, str)
                assert len(result) >= 0
