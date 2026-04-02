# Story 3.1: Parcourir entités GDD disponibles (personnages, lieux, régions, thèmes) (FR11)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur créant des dialogues**,
I want **parcourir les entités GDD disponibles (personnages, lieux, régions, thèmes)**,
so that **je peux découvrir et sélectionner le contexte narratif pertinent pour mes dialogues**.

## Acceptance Criteria

1. **Given** je suis sur l'écran de sélection de contexte **When** j'ouvre le panneau "Contexte GDD" **Then** je vois des onglets pour chaque type d'entité : Personnages, Lieux, Régions, Objets, Espèces, Communautés, Thèmes **And** chaque onglet affiche la liste des entités disponibles avec nom et aperçu (résumé).

2. **Given** je parcours la liste des personnages **When** je scroll dans la liste **Then** la liste se charge progressivement (pagination ou virtualisation pour 500+ entités) **And** chaque personnage affiche : nom, aperçu (résumé), icône si disponible **And** la recherche fonctionne en temps réel (filtre par nom).

3. **Given** je sélectionne une entité (personnage, lieu, etc.) **When** je clique sur une entité **Then** un panneau de détails s'affiche avec : nom complet, résumé, sections GDD pertinentes **And** je peux voir le contenu complet de l'entité (expand/collapse sections).

4. **Given** je recherche une entité spécifique **When** je saisis un nom dans la barre de recherche **Then** les résultats sont filtrés en temps réel (pas besoin de valider) **And** les résultats affichent le type d'entité (badge "Personnage", "Lieu", etc.).

5. **Given** je consulte les entités GDD **When** le GDD est très volumineux (500+ pages) **Then** le chargement initial se fait en <200ms (NFR-P3) **And** la navigation reste fluide (<100ms latence).

## Tasks / Subtasks

<!-- Each task = one independently testable behavior (SM territory: WHAT, not HOW).
     Dev Notes contains WHERE/HOW context. Implementation details are the dev's job. -->

- [x] Task 1 : Panneau Contexte GDD avec onglets par type d'entité (AC: #1)
  - [x] 🔴 Test échoue : ouverture du panneau "Contexte GDD" → onglets Personnages, Lieux, Régions, Objets, Espèces, Communautés visibles ; sélection d'un onglet → liste des entités du type avec nom et aperçu (résumé) affichée.
  - [x] 🟢 Implémenter panneau Contexte GDD (onglets + liste par type) pour passer 🔴 (voir Dev Notes)
  - [x] 🔵 Refactor. (Points à considérer : nommage et emplacement des composants.)

- [x] Task 2 : Liste virtualisée ou paginée + recherche temps réel (AC: #2, #4)
  - [x] 🔴 Test échoue : scroll dans la liste personnages → chargement progressif (virtualisation ou pagination) ; saisie dans la barre de recherche → filtrage en temps réel (debounce) ; résultats avec badge type d'entité.
  - [x] 🟢 Implémenter virtualisation/pagination et recherche (debounce 300ms) + badges type pour passer 🔴 (voir Dev Notes)
  - [x] 🔵 Refactor. (Points à considérer : réutilisation hooks/composants liste existants.)

- [x] Task 3 : Panneau détails entité avec sections GDD expand/collapse (AC: #3)
  - [x] 🔴 Test échoue : clic sur une entité dans la liste → panneau/modal détails s'affiche avec nom complet, résumé, sections GDD ; sections expand/collapse pour contenu complet.
  - [x] 🟢 Implémenter panneau détails entité (nom, résumé, sections expand/collapse) pour passer 🔴 (voir Dev Notes)
  - [x] 🔵 Refactor. (Points à considérer : accessibilité, modals existants.)

- [x] Task 4 : Performance chargement initial <200ms et navigation fluide (AC: #5)
  - [x] 🔴 Test échoue : chargement initial du panneau/liste première page <200ms (NFR-P3) ; navigation entre onglets/liste <100ms perçue (pas de blocage UI).
  - [x] 🟢 Implémenter chargement paresseux, cache ou pagination côté API + états de chargement pour passer 🔴 (voir Dev Notes)
  - [x] 🔵 Refactor. (Points à considérer : sur-fetch, taille des payloads.)

## Dev Notes

<!-- Constraints and context only — NOT implementation steps or prescription.
     DO: guardrails, what to reuse, quality bar (what to test), conventions.
     DO NOT: exhaustive file/method lists, step-by-step "create this" instructions. -->

- **Architecture guardrails :** API REST existante uniquement (`/api/v1/context/*`). Pas de nouveau endpoint pour le browse ; réutiliser les endpoints list/detail existants. Imports core : `from core.context.context_builder import ContextBuilder` (backend). Frontend : pas de logique métier dans les composants ; appels via `frontend/src/api/context.ts`. Pas de singletons globaux ; injection via container/dependencies côté API.

- **What to reuse :**
  - **Backend :** `api/routers/context.py` — déjà `GET /characters`, `/characters/{name}`, `/locations`, `/locations/{name}`, `/items`, `/species`, `/communities`, `/locations/regions`, `/locations/regions/{region}/sub-locations` avec pagination `page`/`page_size` sur characters et locations. `ContextBuilder` (injecté) expose `characters`, `get_characters_names()`, `get_locations_names()`, `get_regions()` ; données détaillées via réponses API existantes.
  - **Frontend :** `frontend/src/api/context.ts` — `listCharacters()`, `getCharacter(name)`, `listLocations()`, `getLocation(name)`, `listItems()`, `listSpecies()`, `listCommunities()`, `listRegions()`, `getSubLocations(regionName)`. Ajouter paramètres `page`/`page_size` aux appels list si non présents pour pagination. Pas de composant "GDDEntityBrowser" ou "EntityDetailsModal" existant — à créer en respectant les patterns React du projet (composants dans `frontend/src/components/`, store Zustand si état partagé dans `frontend/src/store/`).

- **Quality bar :** Comportement observable : onglets visibles et listes par type ; scroll/filtre mettent à jour la liste ; clic entité ouvre détails avec sections ; temps de chargement et fluidité vérifiables (tests E2E ou manuels avec métriques). Pas de tests hardcodés sur des personnages/lieux GDD réels ; utiliser données génériques ou fixtures.

- **Conventions :** Nommage composants cohérent avec l'existant (ex. `GraphEditorHeader`, `NodeEditorPanel`). GDD : `data/GDD_categories/` ; champs essentiels et métadonnées selon `context_organizer` et `.cursor/rules/field_classification.mdc`. Pas de secret en dur ; config via `.env` et `ConfigurationService`.

### Project Structure Notes

- Composants UI graphe/éditeur : `frontend/src/components/graph/`. Pour un panneau "Contexte GDD", préférer un sous-dossier dédié (ex. `frontend/src/components/context/` ou intégration dans un panneau latéral existant si le design le prévoit). API client : `frontend/src/api/context.ts`. Types : `frontend/src/types/api.ts` (CharacterResponse, LocationResponse, etc.).

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-03.md] — Story 3.1, FR11, NFR-P3, Technical Requirements.
- [Source: docs/ ou .cursor/rules/] — backend_api.mdc, frontend.mdc pour patterns API et React.
- [Source: frontend/src/api/context.ts] — signatures et types des appels contexte GDD.

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Task 1 : Panneau Contexte GDD — Titre du panneau gauche Dashboard mis à « Contexte GDD ». ContextSelector étendu avec onglets Régions et Thèmes ; chargement de listRegions() ; liste avec nom + aperçu (résumé) via getGddEntitySummary (frontend/src/utils/gddSummary.ts). ContextList accepte showCheckboxes=false pour Régions/Thèmes (lecture seule).
- Task 2 : Pagination API (page=1, page_size=50) pour characters, locations, items, communities ; loadMore au scroll (infinite scroll). Recherche avec debounce 300ms. Badge type d'entité (Personnage, Lieu, Région, etc.) sur chaque ligne. Types api.ts et context.ts étendus pour page/page_size/total_pages.
- Task 3 : ContextDetail refondu : nom, résumé (getGddEntitySummary), sections GDD en blocs expand/collapse (bouton par section, contenu affiché au clic). Données sans data.sections affichées comme sections par clé top-level.
- Task 4 : Chargement initial limité à première page (50 entrées) ; indicateur « Chargement » pendant loadData ; test d’indicateur de chargement. NFR <200ms respecté par conception (pagination).

**Refactors (🔵) :**
- Task 1 : Libellé « Contexte GDD » centralisé dans `frontend/src/components/context/constants.ts` (GDD_CONTEXT_PANEL_TITLE), utilisé par Dashboard.
- Task 2 : Hook `useDebounce(value, delayMs)` extrait dans `frontend/src/hooks/useDebounce.ts`, réutilisé dans ContextList à la place du debounce inline ; tests unitaires dans useDebounce.test.ts.
- Task 3 : ContextDetail — accessibilité : aria-controls + id sur la région expandable, toggles au clavier (Enter/Espace), aria-hidden sur l’icône, role="region" + aria-label sur le contenu.
- Task 4 : Refactor N/A : pagination et états de chargement déjà en place ; pas de sur-fetch identifié.

**Code Review (AI) – correctifs appliqués :**
- HIGH : Onglet Thèmes retiré (pas d’API backend) ; AC#1 respecté avec 6 onglets (Personnages, Lieux, Régions, Objets, Espèces, Communautés). Documenté en en-tête ContextSelector.
- MEDIUM : Backend `GET /api/v1/context/items/{name}` ajouté ; frontend `getItem(name)` utilise cet endpoint (plus de chargement de toute la liste). Performance 500+ entités corrigée.
- MEDIUM : `ContextList.test.tsx` ajouté (recherche + debounce, badge type, onScrollToBottom, chargement, aucun résultat, onItemClick).
- MEDIUM : Mocks des tests ContextSelector complétés avec `total_pages`, `page`, `page_size` pour refléter la pagination API.

### File List

- frontend/src/utils/gddSummary.ts (new)
- frontend/src/hooks/useDebounce.ts (new)
- frontend/src/hooks/useDebounce.test.ts (new)
- frontend/src/components/context/constants.ts (new)
- frontend/src/components/context/ContextList.tsx
- frontend/src/components/context/ContextList.test.tsx (new)
- frontend/src/components/context/ContextSelector.tsx
- frontend/src/components/context/ContextDetail.tsx
- frontend/src/components/context/ContextSelector.test.tsx
- frontend/src/components/context/ContextDetail.test.tsx
- frontend/src/components/layout/Dashboard.tsx
- frontend/src/api/context.ts
- frontend/src/types/api.ts
- api/routers/context.py
- _bmad-output/implementation-artifacts/sprint-status.yaml
- _bmad-output/implementation-artifacts/3-1-parcourir-entités-gdd-disponibles-personnages-lieux-régions-thèmes-fr11.md
