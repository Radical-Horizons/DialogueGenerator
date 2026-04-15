# Contenu de page Notion : deux surfaces API publiques

## Objectif produit (sync GDD, imports)

Récupérer **tout le contenu utile des fiches** : **corps de page** le plus complet possible +
**propriétés** (colonnes). Dans ce dépôt :

- **Corps** : toujours via `NotionAPIClient.get_page_content` (markdown API en priorité, blocs en repli). Ne pas contourner cette méthode pour un « full body ».
- **Fiches base → JSON GDD** : `get_page` + `get_page_content` + `notion_page_to_gdd_record_merge_body_and_properties` (les `rich_text` de colonnes sont fusionnés en sections `##` côté mapper).
- **Découpe sections** : après réception du markdown enrichi, `normalize_notion_enhanced_markdown_for_section_split` (dans `gdd_sections_split`) prépare les titres pour `markdown_body_to_sync_sections`.

## Lecture recommandée : `GET /v1/pages/{page_id}/markdown`

Notion expose (à partir de la version d’API **`2026-03-11`**) :

`GET https://api.notion.com/v1/pages/{page_id}/markdown`  
En-tête : `Notion-Version: 2026-03-11`

Réponse typique : objet avec clé **`markdown`** (chaîne markdown enrichi), **`truncated`**, **`unknown_block_ids`**.

Documentation : [Retrieve a page as markdown](https://developers.notion.com/reference/retrieve-page-markdown).

Le client du projet (`NotionAPIClient.get_page_content`) **essaie ce chemin en premier**, puis se replie sur l’arbre de blocs si l’endpoint répond 400/404/405 ou est injoignable.

**Mesure (même page que les tests Espèces « Rêveurs primordiaux »)** :

- Récursion **`GET /v1/blocks/{id}/children`** seule : ~2,6k caractères utiles (callouts sans enfants listés + une section riche).
- **`GET /v1/pages/{id}/markdown`** : ~12,8k caractères, ordre de grandeur **~1500 mots** — aligné avec ce qu’on attend d’une fiche complète et avec les outils type MCP en markdown enrichi.

## Pourquoi l’arbre `blocks/.../children` peut sembler « incomplet »

Ce n’est pas qu’une « mauvaise URL » au sens d’une erreur d’appel : **`Retrieve block children` est bien la méthode documentée historique** pour lire le contenu bloc par bloc ([Working with page content](https://developers.notion.com/docs/working-with-page-content)).

Constat **factuel** sur une fiche Espèces (preuve reproductible avec `scripts/debug_dump_notion_page_blocks.py`) :

- `GET /v1/blocks/{page_id}/children` → 13 blocs racine.
- Pour la majorité des **callouts**, `GET /v1/blocks/{callout_id}/children` → **`results: []`** alors que l’UI affiche un corps sous le titre.
- `GET /v1/blocks/{callout_id}` → `has_children: false`, `callout.rich_text` limité au **titre** du callout.

Donc **pour ce modèle de document**, le graphe renvoyé par l’API blocs **ne matérialise pas** tout le texte visible, alors que l’endpoint **markdown** le matérialise dans une seule chaîne.

## Propriétés de ligne de base

`GET /v1/pages/{page_id}` renvoie les **propriétés** (colonnes), pas le corps des blocs. Sur l’exemple mesuré, seul un champ `rich_text` (« Résumé IA ») apportait un texte long en colonne ; le gros du narratif page venait du markdown page, pas des colonnes.

## Reproduire localement

```bash
python scripts/debug_dump_notion_page_blocks.py
```

Compare avec une requête :

```bash
curl -s "https://api.notion.com/v1/pages/PAGE_UUID/markdown" \
  -H "Authorization: Bearer $NOTION_API_KEY" \
  -H "Notion-Version: 2026-03-11"
```

## Troncature et blocs inconnus

Si `truncated: true`, Notion peut renvoyer des `unknown_block_ids` à recharger (voir la doc officielle). Le client log un avertissement ; une évolution possible est de boucler sur ces IDs.
