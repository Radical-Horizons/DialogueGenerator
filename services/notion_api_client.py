"""Client pour l'API Notion officielle."""
import os
import logging
from typing import List, Dict, Any, Optional, Mapping, Tuple
import httpx

logger = logging.getLogger(__name__)

# Pages / blocs : version stable historique.
NOTION_VERSION_LEGACY = "2022-06-28"
# Bases au modèle multi-sources : découverte + query via data_sources (Notion 2025-09-03).
NOTION_VERSION_DATA_SOURCES = "2025-09-03"


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
            "Notion-Version": NOTION_VERSION_LEGACY,
            "Content-Type": "application/json"
        }
        logger.info("NotionAPIClient initialisé")

    def _headers_with_version(self, notion_version: str) -> Dict[str, str]:
        """En-têtes identiques au client mais avec une ``Notion-Version`` explicite."""
        h = dict(self.headers)
        h["Notion-Version"] = notion_version
        return h

    async def _retrieve_database_for_data_sources(
        self, database_id: str
    ) -> Optional[Dict[str, Any]]:
        """GET /v1/databases/{id} avec API 2025-09-03 (liste ``data_sources``).

        Returns:
            Objet JSON base, ou ``None`` si la requête échoue (ex. 404).
        """
        url = f"{self.base_url}/databases/{database_id}"
        headers = self._headers_with_version(NOTION_VERSION_DATA_SOURCES)
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.get(url, headers=headers)
                response.raise_for_status()
                data = response.json()
                return data if isinstance(data, dict) else None
            except httpx.HTTPStatusError as e:
                logger.debug(
                    "GET database (data_sources discovery) %s → %s : %s",
                    database_id,
                    e.response.status_code,
                    e.response.text[:500] if e.response.text else "",
                )
                return None
            except (httpx.RequestError, ValueError) as e:
                logger.debug("GET database (data_sources discovery) %s échoué: %s", database_id, e)
                return None

    async def _query_data_source(
        self,
        data_source_id: str,
        filter_properties: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """POST /v1/data_sources/{id}/query (API 2025-09-03), pagination incluse."""
        url = f"{self.base_url}/data_sources/{data_source_id}/query"
        headers = self._headers_with_version(NOTION_VERSION_DATA_SOURCES)
        payload: Dict[str, Any] = {}
        params: Optional[List[Tuple[str, str]]] = None
        if filter_properties:
            params = [("filter_properties", fp) for fp in filter_properties]

        all_pages: List[Dict[str, Any]] = []
        has_more = True
        start_cursor: Optional[str] = None

        async with httpx.AsyncClient(timeout=30.0) as client:
            while has_more:
                body = dict(payload)
                if start_cursor:
                    body["start_cursor"] = start_cursor
                try:
                    response = await client.post(
                        url, headers=headers, json=body, params=params
                    )
                    response.raise_for_status()
                    data = response.json()
                except httpx.HTTPStatusError as e:
                    logger.error(
                        "Erreur HTTP Notion (data_sources query): %s - %s",
                        e.response.status_code,
                        e.response.text,
                    )
                    raise
                except Exception as e:
                    logger.error("Erreur lors de la requête data_source Notion: %s", e)
                    raise

                all_pages.extend(data.get("results", []))
                has_more = data.get("has_more", False)
                start_cursor = data.get("next_cursor")

        return all_pages

    async def _query_database_legacy(
        self,
        database_id: str,
        filter_properties: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """POST /v1/databases/{id}/query (API 2022-06-28)."""
        url = f"{self.base_url}/databases/{database_id}/query"

        payload: Dict[str, Any] = {}
        if filter_properties:
            payload["filter_properties"] = filter_properties

        all_pages: List[Dict[str, Any]] = []
        has_more = True
        start_cursor: Optional[str] = None

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
                    logger.error(
                        "Erreur HTTP lors de la requête Notion: %s - %s",
                        e.response.status_code,
                        e.response.text,
                    )
                    raise
                except Exception as e:
                    logger.error(f"Erreur lors de la requête Notion: {e}")
                    raise

        return all_pages
    
    async def query_database(
        self,
        database_id: str,
        filter_properties: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """Interroge une base de données Notion.
        
        Utilise d'abord le modèle **data sources** (Notion API ``2025-09-03``) lorsque
        la base expose des ``data_sources`` ; sinon retombe sur ``POST .../databases/.../query``
        (``2022-06-28``). Sans cela, les bases migrées renvoient une erreur du type
        « does not contain any data sources accessible by this API bot » alors que
        l'intégration a bien accès.

        Args:
            database_id: ID de la base de données.
            filter_properties: Liste des propriétés à récupérer (optionnel).
            
        Returns:
            Liste des pages de la base de données.
        """
        db_meta = await self._retrieve_database_for_data_sources(database_id)
        if db_meta is not None:
            raw_sources = db_meta.get("data_sources")
            if isinstance(raw_sources, list) and len(raw_sources) > 0:
                merged: List[Dict[str, Any]] = []
                for item in raw_sources:
                    if not isinstance(item, Mapping):
                        continue
                    ds_id = item.get("id")
                    if not ds_id or not isinstance(ds_id, str):
                        continue
                    part = await self._query_data_source(
                        ds_id.strip(), filter_properties=filter_properties
                    )
                    merged.extend(part)
                logger.info(
                    "Récupération de %s pages (data_sources, base %s)",
                    len(merged),
                    database_id,
                )
                return merged

        all_pages = await self._query_database_legacy(database_id, filter_properties)
        logger.info(
            "Récupération de %s pages depuis la base de données %s (legacy query)",
            len(all_pages),
            database_id,
        )
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

