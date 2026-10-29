---
description: Récupération complète fiches Notion (corps + propriétés) — sync GDD et imports
paths:
  - "services/notion_api_client.py"
  - "services/notion_import_service.py"
---
- **Corps de page (besoin central)** : utiliser uniquement `NotionAPIClient.get_page_content` pour obtenir tout le texte du corps (markdown enrichi `GET /v1/pages/{id}/markdown`, `Notion-Version: 2026-03-11`, puis repli arbre blocs). Ne pas ajouter de parcours « racine = seulement `blocks/.../children` » pour un export complet de page.
- **Fiche base de données → enregistrement GDD** : `get_page` + `get_page_content` + `notion_page_to_gdd_record_merge_body_and_properties` ; ne pas omettre le mapper si des colonnes `rich_text` doivent alimenter les sections.
- **Sync bases sans corps** : `GddNotionSyncService` peut omettre `get_page_content` sur le reste des lignes si les 3 premières (ordre query) n’ont pas de corps ; `get_page` et colonnes restent synchronisés. Voir `docs/guides/GDD_NOTION_SYNC.md`.
- **Titres dans markdown Notion** (`<callout>`, `<span>**…**</span>`) : la normalisation avant découpe vit dans `normalize_notion_enhanced_markdown_for_section_split` ; toute évolution du découpage « sections » doit rester cohérente avec ce flux.
- **Référence** : `docs/notion_public_api_block_gap.md`.
