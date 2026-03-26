"""Client pour l'API Notion officielle."""
import os
import logging
from typing import List, Dict, Any, Optional
import httpx

logger = logging.getLogger(__name__)


class NotionAPIClient:
    """Client pour interagir avec l'API Notion officielle."""
    
    def __init__(self, api_key: Optional[str] = None):
        """Initialise le client Notion API.
        
        Args:
            api_key: Clé API Notion. Si None, récupère depuis NOTION_API_KEY.
        """
        self.api_key = api_key or os.getenv("NOTION_API_KEY")
        if not self.api_key:
            raise ValueError(
                "NOTION_API_KEY non définie. "
                "Configurez la variable d'environnement NOTION_API_KEY avec votre token d'intégration Notion."
            )
        
        self.base_url = "https://api.notion.com/v1"
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json"
        }
        logger.info("NotionAPIClient initialisé")
    
    async def query_database(
        self,
        database_id: str,
        filter_properties: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """Interroge une base de données Notion.
        
        Args:
            database_id: ID de la base de données.
            filter_properties: Liste des propriétés à récupérer (optionnel).
            
        Returns:
            Liste des pages de la base de données.
        """
        url = f"{self.base_url}/databases/{database_id}/query"
        
        payload = {}
        if filter_properties:
            payload["filter_properties"] = filter_properties
        
        all_pages = []
        has_more = True
        start_cursor = None
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            while has_more:
                if start_cursor:
                    payload["start_cursor"] = start_cursor
                
                try:
                    response = await client.post(url, headers=self.headers, json=payload)
                    response.raise_for_status()
                    data = response.json()
                    
                    all_pages.extend(data.get("results", []))
                    has_more = data.get("has_more", False)
                    start_cursor = data.get("next_cursor")
                    
                except httpx.HTTPStatusError as e:
                    logger.error(f"Erreur HTTP lors de la requête Notion: {e.response.status_code} - {e.response.text}")
                    raise
                except Exception as e:
                    logger.error(f"Erreur lors de la requête Notion: {e}")
                    raise
        
        logger.info(f"Récupération de {len(all_pages)} pages depuis la base de données {database_id}")
        return all_pages
    
    async def get_page(self, page_id: str) -> Dict[str, Any]:
        """Récupère une page Notion.
        
        Args:
            page_id: ID de la page.
            
        Returns:
            Données de la page.
        """
        url = f"{self.base_url}/pages/{page_id}"
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.get(url, headers=self.headers)
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as e:
                logger.error(f"Erreur HTTP lors de la récupération de la page: {e.response.status_code} - {e.response.text}")
                raise
            except Exception as e:
                logger.error(f"Erreur lors de la récupération de la page: {e}")
                raise

    async def verify_credentials(self) -> Dict[str, Any]:
        """Valide le token d'intégration via GET /users/me.

        Returns:
            Objet JSON utilisateur/bot Notion.

        Raises:
            httpx.HTTPError: Si le token est invalide ou le réseau indisponible.
        """
        url = f"{self.base_url}/users/me"
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, headers=self.headers)
            response.raise_for_status()
            return response.json()
    
    async def get_page_content(self, page_id: str) -> str:
        """Récupère le contenu markdown d'une page Notion.
        
        Note: L'API Notion ne retourne pas directement le markdown.
        Cette méthode récupère les blocs de la page et les convertit en markdown.
        
        Args:
            page_id: ID de la page.
            
        Returns:
            Contenu markdown de la page.
        """
        # Récupérer tous les blocs de la page (avec pagination)
        all_blocks = await self._get_all_blocks(page_id)
        
        # Filtrer les child_page
        blocks = [b for b in all_blocks if b.get("type") != "child_page"]
        
        # Transformer les blocs en texte markdown (récursif)
        content_parts = []
        for block in blocks:
            text = await self._extract_block_text_recursive(block)
            if text:
                content_parts.append(text)
        
        return "\n\n".join(content_parts)
    
    async def _get_all_blocks(self, block_id: str) -> List[Dict[str, Any]]:
        """Récupère tous les blocs d'une page (avec pagination).
        
        Args:
            block_id: ID de la page ou du bloc parent.
            
        Returns:
            Liste de tous les blocs.
        """
        url = f"{self.base_url}/blocks/{block_id}/children"
        
        all_blocks = []
        has_more = True
        start_cursor = None
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            while has_more:
                params = {}
                if start_cursor:
                    params["start_cursor"] = start_cursor
                
                try:
                    response = await client.get(url, headers=self.headers, params=params)
                    response.raise_for_status()
                    data = response.json()
                    
                    all_blocks.extend(data.get("results", []))
                    has_more = data.get("has_more", False)
                    start_cursor = data.get("next_cursor")
                    
                except httpx.HTTPStatusError as e:
                    logger.error(f"Erreur HTTP lors de la récupération des blocs: {e.response.status_code} - {e.response.text}")
                    raise
                except Exception as e:
                    logger.error(f"Erreur lors de la récupération des blocs: {e}")
                    raise
        
        return all_blocks
    
    async def _extract_block_text_recursive(self, block: Dict[str, Any]) -> Optional[str]:
        """Extrait le texte d'un bloc Notion de manière récursive (avec enfants).
        
        Inspiré de la fonction transform_block de main.py.
        
        Args:
            block: Bloc Notion.
            
        Returns:
            Texte du bloc avec ses enfants ou None.
        """
        block_type = block.get("type")
        if not block_type:
            return None
        
        block_data = block.get(block_type, {})
        rich_text = block_data.get("rich_text", [])
        
        # Extraire le texte principal
        text_parts = []
        for text_item in rich_text:
            plain_text = text_item.get("plain_text", "")
            if plain_text:
                text_parts.append(plain_text)
        
        main_text = "".join(text_parts)
        
        # Gérer les callouts (comme dans main.py)
        if block_type == "callout":
            callout_data = block.get("callout", {})
            rich = callout_data.get("rich_text", [])
            
            # Détecter un sous-titre (texte en gras coloré)
            subtitle = None
            for rt in rich:
                ann = rt.get("annotations", {})
                if ann.get("bold") and ann.get("color") != "default":
                    subtitle = rt.get("plain_text", "").strip()
                    break
            
            # Récupérer les enfants si présents
            children_text = ""
            if block.get("has_children"):
                child_blocks = await self._get_all_blocks(block["id"])
                child_blocks = [b for b in child_blocks if b.get("type") != "child_page"]
                
                # Si pas de sous-titre détecté, vérifier si le premier enfant est un heading_2
                if not subtitle and child_blocks and child_blocks[0].get("type") == "heading_2":
                    hd = child_blocks[0]
                    hd_data = hd.get("heading_2", {})
                    subtitle = "".join(x.get("plain_text", "") for x in hd_data.get("rich_text", [])).strip()
                    child_blocks = child_blocks[1:]
                
                # Si toujours pas de sous-titre, utiliser le texte principal comme sous-titre
                if not subtitle and main_text:
                    subtitle = main_text.strip()
                    # Ne pas inclure le texte principal dans les enfants
                    main_text = ""
                
                # Extraire le contenu des enfants
                child_texts = []
                for cb in child_blocks:
                    child_text = await self._extract_block_text_recursive(cb)
                    if child_text:
                        if cb.get("type") == "bulleted_list_item":
                            child_texts.append(f"• {child_text}")
                        else:
                            child_texts.append(child_text)
                children_text = "\n".join(child_texts) if child_texts else ""
            
            # Formater le résultat
            if subtitle:
                # Callout avec sous-titre
                if children_text:
                    return f"**{subtitle}**\n{children_text}"
                else:
                    # Extraire le texte sans le sous-titre (si le sous-titre était dans le rich_text)
                    text_without_subtitle = ""
                    used = False
                    for rt in rich:
                        ann = rt.get("annotations", {})
                        if not used and ann.get("bold") and ann.get("color") != "default":
                            used = True
                            continue
                        text_without_subtitle += rt.get("plain_text", "") + " "
                    text_without_subtitle = text_without_subtitle.strip()
                    if text_without_subtitle:
                        return f"**{subtitle}**\n{text_without_subtitle}"
                    else:
                        return f"**{subtitle}**"
            else:
                # Callout simple sans sous-titre détecté
                if children_text:
                    # Si on a des enfants mais pas de sous-titre, utiliser le texte principal comme titre
                    if main_text:
                        return f"**{main_text}**\n{children_text}"
                    else:
                        return children_text
                else:
                    return main_text if main_text else None
        
        # Gérer les autres types de blocs
        if not main_text and block_type not in ["callout"]:
            return None
        
        # Récupérer les enfants si présents
        children_texts = []
        if block.get("has_children"):
            child_blocks = await self._get_all_blocks(block["id"])
            child_blocks = [b for b in child_blocks if b.get("type") != "child_page"]
            
            for child_block in child_blocks:
                child_text = await self._extract_block_text_recursive(child_block)
                if child_text:
                    children_texts.append(child_text)
        
        # Formater selon le type
        if block_type == "heading_1":
            result = f"# {main_text}"
        elif block_type == "heading_2":
            result = f"## {main_text}"
        elif block_type == "heading_3":
            result = f"### {main_text}"
        elif block_type == "bulleted_list_item":
            result = f"- {main_text}"
            if children_texts:
                result += " " + " ".join(children_texts)
        elif block_type == "numbered_list_item":
            result = f"1. {main_text}"
            if children_texts:
                result += " " + " ".join(children_texts)
        elif block_type == "quote":
            result = f"> {main_text}"
        elif block_type == "paragraph":
            result = main_text
            if children_texts:
                result += " " + " ".join(children_texts)
        else:
            result = main_text
            if children_texts:
                result += "\n" + "\n".join(children_texts)
        
        return result if result.strip() else None

