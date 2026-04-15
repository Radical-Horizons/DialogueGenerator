"""Client pour l'API Notion officielle."""
import json
import os
import logging
from typing import List, Dict, Any, Optional, Mapping, Tuple
import httpx

from services.gdd_notion_sync_utils import normalize_notion_id

logger = logging.getLogger(__name__)

# Pages / blocs : version stable historique.
NOTION_VERSION_LEGACY = "2022-06-28"
# Bases au modèle multi-sources : découverte + query via data_sources (Notion 2025-09-03).
NOTION_VERSION_DATA_SOURCES = "2025-09-03"
# Lecture du corps de page en markdown enrichi (alternative à l’arbre ``blocks/.../children``).
# Réf. : https://developers.notion.com/reference/retrieve-page-markdown
NOTION_VERSION_PAGE_MARKDOWN = "2026-03-11"

# Types de blocs pouvant porter des enfants même si ``has_children`` est faux (API / clients).
_STRUCTURAL_BLOCKS_TRY_CHILDREN: frozenset[str] = frozenset(
    {
        "column_list",
        "column",
        "table",
        "toggle",
        "template",
    }
)

_MAX_PAGE_EMBED_DEPTH = 6


class NotionAPIClient:
    """Client pour l'API Notion officielle.

    Pour le **corps complet** d'une page (sync GDD, imports), utiliser
    :meth:`get_page_content` plutôt qu'un parcours ad hoc des blocs racine.
    """
    
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

    async def _try_get_page_markdown(self, page_id: str) -> Optional[str]:
        """Récupère le corps de page via ``GET /v1/pages/{id}/markdown`` (API 2026-03-11).

        Notion expose ce chemin pour un markdown enrichi **complet**, là où
        ``GET /v1/blocks/{id}/children`` récursif peut omettre du contenu présent
        dans certains callouts / mises en page.

        Returns:
            Markdown non vide, ou ``None`` si indisponible (4xx attendu, réseau, JSON invalide).
        """
        url = f"{self.base_url}/pages/{page_id}/markdown"
        headers = self._headers_with_version(NOTION_VERSION_PAGE_MARKDOWN)
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.get(url, headers=headers)
                response.raise_for_status()
                data = response.json()
        except httpx.HTTPStatusError as e:
            code = e.response.status_code
            if code in (400, 401, 404, 405):
                logger.info(
                    "GET /pages/%s/markdown → %s : repli sur l’arbre de blocs",
                    page_id,
                    code,
                )
                return None
            logger.error(
                "GET /pages/%s/markdown erreur HTTP %s : %s",
                page_id,
                code,
                (e.response.text or "")[:500],
            )
            raise
        except (httpx.RequestError, ValueError, TypeError) as e:
            logger.warning("GET /pages/%s/markdown indisponible (%s), repli blocs", page_id, e)
            return None

        if not isinstance(data, dict):
            return None
        raw_md = data.get("markdown")
        if not isinstance(raw_md, str):
            return None
        md = raw_md.strip()
        if not md:
            return None
        if data.get("truncated"):
            logger.warning(
                "Page markdown tronquée (page_id=%s…) unknown_block_ids=%s",
                str(page_id)[-12:],
                data.get("unknown_block_ids"),
            )
        return md

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
                logger.warning(
                    "GET database (data_sources discovery) %s → %s : %s",
                    database_id,
                    e.response.status_code,
                    (e.response.text or "")[:800],
                )
                return None
            except (httpx.RequestError, ValueError) as e:
                logger.warning(
                    "GET database (data_sources discovery) %s erreur réseau/parse: %s",
                    database_id,
                    e,
                )
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

    @staticmethod
    def _rich_text_array_to_plain(rich: Any) -> str:
        """Extrait le texte brut d’un tableau ``rich_text`` Notion."""
        if not isinstance(rich, list):
            return ""
        parts: List[str] = []
        for t in rich:
            if not isinstance(t, Mapping):
                continue
            pt = t.get("plain_text")
            if isinstance(pt, str) and pt:
                parts.append(pt)
                continue
            inner = t.get("text")
            if isinstance(inner, Mapping):
                c = inner.get("content")
                if isinstance(c, str) and c:
                    parts.append(c)
        return "".join(parts).strip()

    @classmethod
    def _database_title_plain(cls, db_meta: Mapping[str, Any]) -> str:
        """Titre affiché de la base (GET database), texte plat."""
        title = db_meta.get("title")
        if isinstance(title, list):
            return cls._rich_text_array_to_plain(title)
        if isinstance(title, str):
            return title.strip()
        return ""

    @staticmethod
    def _data_source_entries_from_meta(raw_sources: Any) -> List[Tuple[str, str]]:
        """Liste ``(data_source_id, nom_affiché)`` depuis ``data_sources`` du GET database."""
        out: List[Tuple[str, str]] = []
        if not isinstance(raw_sources, list):
            return out
        for item in raw_sources:
            if isinstance(item, str) and item.strip():
                out.append((item.strip(), ""))
                continue
            if isinstance(item, Mapping):
                ds_id = item.get("id")
                if not (isinstance(ds_id, str) and ds_id.strip()):
                    continue
                name_raw = item.get("name")
                name_s = ""
                if isinstance(name_raw, str):
                    name_s = name_raw.strip()
                elif isinstance(name_raw, list):
                    name_s = NotionAPIClient._rich_text_array_to_plain(name_raw)
                out.append((ds_id.strip(), name_s))
        return out

    @staticmethod
    def _notion_ids_equivalent(a: str, b: str) -> bool:
        """True si deux identifiants Notion désignent le même UUID."""
        try:
            return normalize_notion_id(a) == normalize_notion_id(b)
        except ValueError:
            return False

    @classmethod
    def _resolve_data_source_ids_to_query(
        cls,
        entries: List[Tuple[str, str]],
        db_meta: Mapping[str, Any],
        explicit: Optional[List[str]],
    ) -> List[str]:
        """Choisit les ``data_source`` à interroger (évite les vues inline type « récompenses »).

        Ordre : ``explicit`` (config) → titre base = nom de source → exclusion heuristique
        (nom contenant récompens/reward) → première entrée.
        """
        ids_in_meta = [e[0] for e in entries]
        if explicit:
            chosen: List[str] = []
            seen: set[str] = set()
            for raw in explicit:
                if not isinstance(raw, str) or not str(raw).strip():
                    continue
                for eid in ids_in_meta:
                    if cls._notion_ids_equivalent(eid, raw) and eid not in seen:
                        chosen.append(eid)
                        seen.add(eid)
                        break
            if chosen:
                return chosen
            logger.warning(
                "notion_data_source_ids %s ne correspond à aucun data_source connu "
                "(base %s) — repli heuristique",
                explicit,
                db_meta.get("id"),
            )
        if not entries:
            return []
        if len(entries) == 1:
            return [entries[0][0]]
        db_title = cls._database_title_plain(db_meta).lower().strip()
        if db_title:
            same = [
                eid
                for eid, name in entries
                if name.strip().lower() == db_title
            ]
            if len(same) == 1:
                return same
        block_substr = ("récompens", "recompens", "reward")
        filtered = [
            (eid, name)
            for eid, name in entries
            if not any(s in name.lower() for s in block_substr)
        ]
        if len(filtered) == 1:
            return [filtered[0][0]]
        if len(filtered) > 1:
            logger.warning(
                "Base %s : %d data_source(s) après exclusion heuristique ; "
                "seule la première est interrogée : %s",
                db_meta.get("id"),
                len(filtered),
                filtered[0][0],
            )
            return [filtered[0][0]]
        if entries:
            logger.warning(
                "Base %s : toutes les data_sources correspondent à l’exclusion "
                "« récompens/reward » ; repli sur la première entrée.",
                db_meta.get("id"),
            )
            return [entries[0][0]]
        return []

    async def _query_database_via_data_sources(
        self,
        database_id: str,
        filter_properties: Optional[List[str]],
        data_source_ids: Optional[List[str]] = None,
    ) -> Optional[List[Dict[str, Any]]]:
        """Interroge la base via ``POST /data_sources/.../query`` si le GET expose des IDs.

        Returns:
            Liste de pages si au moins un data source a été interrogé avec succès, sinon
            ``None`` pour indiquer qu'il faut tenter le chemin legacy.
        """
        db_meta = await self._retrieve_database_for_data_sources(database_id)
        if db_meta is None:
            return None
        raw_sources = db_meta.get("data_sources")
        entries = self._data_source_entries_from_meta(raw_sources)
        ds_ids = self._resolve_data_source_ids_to_query(
            entries, db_meta, data_source_ids
        )
        if not ds_ids:
            logger.warning(
                "GET database %s (API %s) : aucun data_source_id exploitable "
                "(data_sources=%r, clés=%s)",
                database_id,
                NOTION_VERSION_DATA_SOURCES,
                raw_sources,
                list(db_meta.keys())[:40],
            )
            return None
        merged: List[Dict[str, Any]] = []
        for ds_id in ds_ids:
            part = await self._query_data_source(
                ds_id, filter_properties=filter_properties
            )
            merged.extend(part)
        logger.info(
            "Récupération de %s pages via %d data_source(s) (base %s) ids=%s",
            len(merged),
            len(ds_ids),
            database_id,
            ds_ids,
        )
        return merged
    
    async def query_database(
        self,
        database_id: str,
        filter_properties: Optional[List[str]] = None,
        data_source_ids: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """Interroge une base de données Notion.
        
        Utilise d'abord le modèle **data sources** (Notion API ``2025-09-03``) lorsque
        la base expose des ``data_sources`` ; sinon retombe sur ``POST .../databases/.../query``
        (``2022-06-28``). Sans cela, les bases migrées renvoient une erreur du type
        « does not contain any data sources accessible by this API bot » alors que
        l'intégration a bien accès.

        Les bases multi-vues Notion peuvent exposer plusieurs ``data_sources`` (ex. vue
        principale + base inline). Par défaut, une heuristique limite la requête ;
        ``data_source_ids`` permet de forcer la liste.

        Args:
            database_id: ID de la base de données.
            filter_properties: Liste des propriétés à récupérer (optionnel).
            data_source_ids: UUIDs de data sources à interroger (optionnel, sinon auto).

        Returns:
            Liste des pages de la base de données.
        """
        via_ds = await self._query_database_via_data_sources(
            database_id, filter_properties, data_source_ids=data_source_ids
        )
        if via_ds is not None:
            return via_ds

        try:
            all_pages = await self._query_database_legacy(
                database_id, filter_properties
            )
        except httpx.HTTPStatusError as e:
            # Notion peut répondre 400 pour les bases multi-sources sans mentionner
            # explicitement « data source » (libellés localisés ou messages génériques).
            if e.response.status_code == 400:
                retry = await self._query_database_via_data_sources(
                    database_id,
                    filter_properties,
                    data_source_ids=data_source_ids,
                )
                if retry is not None:
                    return retry
            raise
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
    
    async def get_page_content(self, page_id: str, *, _embed_depth: int = 0) -> str:
        """Point d’entrée **canonique** pour le corps complet d’une page Notion (hors colonnes).

        Stratégie robuste (alignée MCP / markdown enrichi Notion) :

        1. ``GET /v1/pages/{page_id}/markdown`` avec ``Notion-Version: 2026-03-11`` ;
        2. repli sur l’arbre ``GET /v1/blocks/{id}/children`` + extraction récursive si le
           markdown est indisponible (4xx attendus, réseau, etc.).

        Toute fonctionnalité qui doit « tout le texte de la page » (sync GDD, import guide,
        sous-pages ``child_page``) doit s’appuyer sur cette méthode — **ne pas** dupliquer
        un parcours racine blocs-seul pour le corps entier.

        Args:
            page_id: ID de la page Notion (ou page enfant pour récursion ``child_page``).
            _embed_depth: Profondeur d'imbrication pour les sous-pages (``child_page``) ;
                limite interne pour éviter les boucles.
            
        Returns:
            Markdown de la page (enrichi ou reconstruit depuis les blocs).
        """
        if _embed_depth > _MAX_PAGE_EMBED_DEPTH:
            logger.warning(
                "get_page_content: profondeur d'embed max (%s) atteinte pour page %s",
                _MAX_PAGE_EMBED_DEPTH,
                page_id,
            )
            return ""
        # Chemin prioritaire : markdown enrichi (même famille que MCP / agents Notion).
        md_fast = await self._try_get_page_markdown(page_id)
        if md_fast is not None:
            return md_fast

        # Repli : arbre de blocs + récursion (API classique).
        all_blocks = await self._get_all_blocks(page_id)
        
        # Inclure ``child_page`` : le corps peut vivre dans des sous-pages liées.
        blocks = [b for b in all_blocks if b.get("type") != "child_database"]
        
        # Transformer les blocs en texte markdown (récursif)
        content_parts = []
        for block in blocks:
            text = await self._extract_block_text_recursive(
                block, embed_depth=_embed_depth
            )
            if text:
                content_parts.append(text)
        out = "\n\n".join(content_parts)
        return out
    
    async def _get_all_blocks(
        self, block_id: str, *, notion_version: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Récupère tous les blocs d'une page (avec pagination).
        
        Args:
            block_id: ID de la page ou du bloc parent.
            notion_version: Si défini, en-tête ``Notion-Version`` explicite (ex. test 2025-09-03).
            
        Returns:
            Liste de tous les blocs.
        """
        url = f"{self.base_url}/blocks/{block_id}/children"
        req_headers = (
            self._headers_with_version(notion_version)
            if notion_version
            else self.headers
        )
        
        all_blocks = []
        has_more = True
        start_cursor = None

        async with httpx.AsyncClient(timeout=30.0) as client:
            while has_more:
                params = {}
                if start_cursor:
                    params["start_cursor"] = start_cursor

                try:
                    response = await client.get(url, headers=req_headers, params=params)
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
    
    async def _extract_block_text_recursive(
        self, block: Dict[str, Any], *, embed_depth: int = 0
    ) -> Optional[str]:
        """Extrait le texte d'un bloc Notion de manière récursive (avec enfants).
        
        Inspiré de la fonction transform_block de main.py.
        
        Args:
            block: Bloc Notion.
            embed_depth: Profondeur courante pour résolution des ``child_page``.
            
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

        # Lignes de tableau : le texte est dans ``table_row.cells`` (pas dans ``rich_text``).
        if block_type == "table_row":
            row_cells = block_data.get("cells") or []
            parts: List[str] = []
            for cell in row_cells:
                if isinstance(cell, list):
                    cell_plain = "".join(
                        x.get("plain_text", "") for x in cell if isinstance(x, dict)
                    ).strip()
                    parts.append(cell_plain)
            line = " | ".join(parts).strip()
            return line if line else None

        # Sous-page : l'ID du bloc est celui de la page enfant (API Notion).
        if block_type == "child_page":
            cp = block.get("child_page") or {}
            title = str(cp.get("title") or "").strip()
            nested_id = block.get("id")
            if not nested_id:
                return f"## {title}" if title else None
            try:
                inner = await self.get_page_content(
                    str(nested_id), _embed_depth=embed_depth + 1
                )
            except httpx.HTTPStatusError as e:
                logger.debug(
                    "child_page %s : échec get_page_content → %s",
                    nested_id,
                    e.response.status_code,
                )
                return f"## {title}" if title else None
            inner = (inner or "").strip()
            if title and inner:
                return f"## {title}\n\n{inner}"
            if inner:
                return inner
            return f"## {title}" if title else None

        # Bloc synchronisé : contenu souvent dupliqué depuis ``synced_from.block_id``.
        if block_type == "synced_block":
            synced_from = block_data.get("synced_from") or {}
            src_id: Optional[str] = None
            if isinstance(synced_from, dict) and synced_from.get("type") == "block_id":
                raw_src = synced_from.get("block_id")
                if raw_src:
                    src_id = str(raw_src)
            child_blocks_sb: List[Dict[str, Any]] = []
            if block.get("has_children"):
                child_blocks_sb = await self._get_all_blocks(block["id"])
            elif src_id:
                try:
                    child_blocks_sb = await self._get_all_blocks(src_id)
                except httpx.HTTPStatusError:
                    child_blocks_sb = []
            else:
                child_blocks_sb = []
            parts_sync: List[str] = []
            for cb in child_blocks_sb:
                chunk_sb = await self._extract_block_text_recursive(
                    cb, embed_depth=embed_depth
                )
                if chunk_sb:
                    parts_sync.append(chunk_sb)
            merged_sb = "\n\n".join(parts_sync).strip()
            return merged_sb if merged_sb else None
        
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
            
            # Récupérer les enfants : toujours GET /blocks/{id}/children pour les callouts.
            # Notion renvoie souvent ``has_children: false`` alors que des paragraphes enfants
            # existent ; un second essai avec ``Notion-Version: 2025-09-03`` peut les exposer.
            children_text = ""
            raw_callout_children = await self._get_all_blocks(block["id"])
            child_blocks = list(raw_callout_children)
            if not child_blocks:
                try:
                    retry_raw = await self._get_all_blocks(
                        block["id"], notion_version=NOTION_VERSION_DATA_SOURCES
                    )
                    child_blocks = list(retry_raw)
                except httpx.HTTPStatusError as e:
                    logger.debug(
                        "GET block children (2025-09-03) %s → %s",
                        block.get("id"),
                        e.response.status_code,
                    )
                    child_blocks = []

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
                child_text = await self._extract_block_text_recursive(
                    cb, embed_depth=embed_depth
                )
                if child_text:
                    if cb.get("type") == "bulleted_list_item":
                        child_texts.append(f"• {child_text}")
                    else:
                        child_texts.append(child_text)
            children_text = "\n".join(child_texts) if child_texts else ""
            
            # Formater le résultat
            if subtitle:
                # Extraire le texte sans le sous-titre (si le sous-titre était dans le rich_text)
                text_without_subtitle = ""
                used_rt = False
                for rt in rich:
                    ann = rt.get("annotations", {})
                    if not used_rt and ann.get("bold") and ann.get("color") != "default":
                        used_rt = True
                        continue
                    text_without_subtitle += rt.get("plain_text", "") + " "
                text_without_subtitle = text_without_subtitle.strip()
                # Titres en ``##`` pour :func:`split_sections_general_text` (sync GDD).
                if children_text:
                    return f"## {subtitle}\n\n{children_text}"
                if text_without_subtitle:
                    return f"## {subtitle}\n\n{text_without_subtitle}"
                return f"## {subtitle}"
            else:
                # Callout simple sans sous-titre détecté
                if children_text:
                    # Si on a des enfants mais pas de sous-titre, utiliser le texte principal comme titre
                    if main_text:
                        return f"## {main_text}\n\n{children_text}"
                    return children_text
                return main_text if main_text else None
        
        # Gérer les autres types de blocs.
        # Ne pas court-circuiter si ``has_children`` : ``column_list``, ``column``, ``table``,
        # toggles vides, etc. n'ont souvent pas de ``rich_text`` au nœud racine mais portent
        # tout le contenu dans leurs enfants (cas typique des callouts Espèces sur Notion).
        if (
            not main_text
            and not block.get("has_children")
            and block_type not in _STRUCTURAL_BLOCKS_TRY_CHILDREN
        ):
            return None
        
        # Récupérer les enfants si présents (ou types structurels : tentative même si flag faux).
        children_texts = []
        try_fetch_children = bool(block.get("has_children")) or (
            block_type in _STRUCTURAL_BLOCKS_TRY_CHILDREN
        )
        if try_fetch_children:
            child_blocks = await self._get_all_blocks(block["id"])
            child_blocks = [
                b for b in child_blocks if b.get("type") != "child_database"
            ]
            for child_block in child_blocks:
                child_text = await self._extract_block_text_recursive(
                    child_block, embed_depth=embed_depth
                )
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

