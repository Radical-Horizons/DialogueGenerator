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
- `is_essential` : Indicateur "champ essentiel" (★) et boutons de sélection

## Ce qui n'entre jamais dans le prompt

- **Propriétés de production** (`values.Actes effectifs`, `Date de création`, `Slug`, `Niveau d’IA`, `Référence visuelle`…) : liste `_ADMIN_VALUE_KEYS` de `services/context_serializer/deduplicator.py`. Une nouvelle propriété Notion de suivi s'y ajoute.
- **Balisage Notion** dans les valeurs : `services/context_value_cleaner.py`, appelé par `ContextOrganizer._extract_field_value`. Images, pièces jointes, bases intégrées et URL disparaissent ; mentions et champs relation deviennent des noms via l'index global des relations.
- L'index des relations doit être passé à **tout** `ContextOrganizer`, cache de précompilation compris : sans lui, les UUID sortent bruts. Tout changement du rendu d'une fiche bumpe `SCHEMA_VERSION` de `services/gdd_context_precompile.py`.

## Budget du contexte

Au-delà de `max_context_tokens`, `services/context_budget_allocator.py` répartit le budget avant la troncature : PNJ qui parle, PJ, lieux et exemples de dialogue d'abord (partage max-min), le reste ensuite ; chaque fiche trop longue est coupée par la fin. Avant (2026-11-18), la première fiche longue mangeait tout le budget.
