---
description: >-
  Classification champs GDD — métadonnées vs contexte narratif (Introduction/sections),
  champs essentiels ESSENTIAL_* / MINIMAL_FIELDS. Apply when editing context_field_detector,
  context_organizer, context_construction_service, ContextFieldSelector, contextConfigStore,
  or config API/schemas for GDD field tabs and essential-field UI.
paths:
  - "core/context/**"
  - "services/context_*.py"
  - "frontend/src/components/context/**"
---
# Classification des champs GDD

## Deux critères distincts

### 1. Métadonnées vs Contexte narratif (`is_metadata`)

- **Export classique** : métadonnées = clés **avant "Introduction"** ; contexte = "Introduction" et la suite.
- **Fiches shard Notion** (racine avec `sections`) : métadonnées = clés **avant `sections`** ; `sections` et descendants = contexte.

Détection : `_is_metadata_field()` utilise d’abord `Introduction` si présent, sinon `sections`, sinon l’heuristique historique sans ces clés.

### 2. Champs essentiels (`is_essential`)

- **Contexte narratif** : Définis dans `context_organizer.ESSENTIAL_CONTEXT_FIELDS`
- **Métadonnées** : Définis dans `context_organizer.ESSENTIAL_METADATA_FIELDS`

## Usage

- `is_metadata` : Filtrage onglets (Métadonnées vs Contexte)
- `is_essential` : Indicateur "champ essentiel" (⭐) et boutons de sélection
