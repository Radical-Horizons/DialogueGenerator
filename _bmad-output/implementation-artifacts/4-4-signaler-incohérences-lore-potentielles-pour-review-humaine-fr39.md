# Story 4.4 : Signaler incohérences lore potentielles pour review humaine (FR39)

Status: done

<!-- Note : validation optionnelle. Exécuter validate-create-story avant dev-story si besoin. -->

## Story

As a **utilisateur créant des dialogues**,
I want **être averti des incohérences lore potentielles (non explicites) et pouvoir les traiter en review**,
so that **je peux les examiner manuellement et décider si une correction est nécessaire, sans bloquer le flux**.

## Acceptance Criteria

1. **Given** un dialogue avec contexte GDD, **When** je lance la validation lore (même flux qu’en 4.3), **Then** les **incohérences potentielles** enrichies (ambiguïtés référentielles, références vagues pouvant viser plusieurs entités GDD) sont remontées en **warnings** non bloquants, **distincts** des erreurs `lore_contradiction_explicit` ; **And** le contrat API reste **rétrocompatible** (champs existants 4.3 inchangés ; nouveaux types / métadonnées **additivement**).
2. **Given** un texte mentionne une entité ou lieu **sous une forme vague** (ex. « le port ») et le GDD / sélection de contexte permet d’identifier **plusieurs** candidats plausibles, **When** validation lore, **Then** un warning actionnable liste les **candidats** (nom + trace GDD minimale : catégorie / chemin ou identifiant stable déjà utilisé côté 4.3) ; **And** le **nœud** source est identifiable pour navigation UI.
3. **Given** un warning potentiel affiché, **When** je l’actionne, **Then** je peux le marquer **« Examiné »** ou **« Ignoré »** ; **And** l’état est **persisté** pour ce dialogue (au minimum **localStorage** par clé stable dérivée du graphe + id warning) ; **And** une voie d’extension **backend** est documentée dans les Dev Notes si aucun endpoint d’équipe n’existe encore (pas d’invention d’URL sans vérifier `api/routers`).
4. **Given** un warning marqué **« Ignoré »**, **When** je relance la validation lore, **Then** il **n’apparaît plus** dans la liste active par défaut ; **And** je peux **réafficher** les ignorés via un contrôle UI (toggle / section « Ignorés ») sans perdre la possibilité de les **réactiver**.
5. **Given** plusieurs warnings potentiels (types hétérogènes : ex. ambiguïté, référence implicite, héritage 4.3 `lore_contradiction_potential`), **When** le panneau affiche les résultats, **Then** un **résumé** du type « X incohérences potentielles » reflète le **nombre affiché** (hors ignorés par défaut) ; **And** je peux **filtrer** par **type / catégorie** de warning (au moins une dimension utile, pas un filtre décoratif).
6. **Tests** : pytest sur heuristiques et filtrage « ignoré » (données **synthétiques**, jamais de personnages/lieux réels du GDD) ; tests API si le contrat évolue ; Vitest (RTL) sur filtre, toggle ignorés, actions Examiné/Ignoré et navigation nœud si applicable.
7. **Non-régression** : les erreurs **explicites** 4.3, le surlignage lore existant, et la fusion `loreKept` / `validateGraph` **restent** fonctionnels ; pas de duplication massive de logique lore côté client.

## Tasks / Subtasks

- [x] **Task 1** : Heuristiques « potentielles » enrichies + contrat API additif (AC: #1, #2, #6, #7)  
  - [x] 🔴 Test échoue : pour un jeu de nœuds + faits / contexte **mockés**, au moins un nouveau warning de type stable (ex. `lore_potential_ambiguity` ou extension documentée de `lore_contradiction_potential` avec champ `subtype`) est émis quand une mention vague matche **≥2** entités GDD pertinentes ; **And** aucune erreur `lore_contradiction_explicit` n’est produite pour ce seul cas.  
  - [x] 🟢 Étendre la couche **`services/`** (réutiliser `graph_dialogue_text`, patterns de `lore_contradiction_validator`) et brancher la réponse sur **`POST .../validate-lore-explicit`** ou endpoint **dédié** seulement si l’équipe préfère séparer — dans ce cas documenter le choix dans les notes de complétion ; schémas **`api/schemas/graph.py`** mis à jour de façon **additive**.  
  - [x] 🔵 Refactor : extraire ou clarifier la frontière « explicite vs potentiel » (fonctions pures + types nominaux) pour éviter que les nouvelles heuristiques ne relisent plusieurs fois le même texte sans nécessité ; réduire la duplication de normalisation de noms avec les helpers existants.

- [x] **Task 2** : Persistance états Examiné / Ignoré + filtrage par défaut (AC: #3, #4, #5, #6)  
  - [x] 🔴 Test échoue : après marquage « Ignoré » d’un warning identifié par une **clé stable**, un second passage de filtrage / sélecteur de liste **exclut** ce warning du jeu « actif » par défaut ; réactivation via flag utilisateur le réintègre.  
  - [x] 🟢 Couche **frontend** (store Zustand et/ou module dédié sous `frontend/src/`) : persistance **localStorage** scoping par dialogue (id document / filename aligné sur le reste du graphe) ; pas de logique métier lore dupliquée — seulement **filtrage / état UI** sur la réponse API.  
  - [x] 🔵 Refactor : regrouper la logique de **dédup / clé warning** dans un petit module testable (éviter dispersion dans le panneau) ; noms de clés localStorage **préfixés** et versionnés si migration d’état.

- [x] **Task 3** : UX panneau validation — résumé, filtres, actions (AC: #2, #3, #4, #5, #7)  
  - [x] 🔴 Test échoue : le panneau affiche le **résumé** filtré, un **contrôle de filtre** par type change la liste visible, et une action « Ignorer » met à jour l’affichage **sans** recharger toute la page ; navigation vers nœud inchangée par rapport aux patterns 4.3.  
  - [x] 🟢 Étendre **`GraphValidationPanel` / listes associées** et **`validationPanelLabels`** pour les nouveaux libellés ; réutiliser les patterns de **focus nœud** et sévérités existants.  
  - [x] 🔵 Refactor : si le panneau dépasse la barre de lignes du projet, extraire une sous-liste « Lore potentiel » ou hook `useLorePotentialWarnings` **sans** casser les tests existants du panneau.

## Dev Notes

- **Garde-fous architecture** : logique déterministe et données GDD dans **`services/`** ; routers FastAPI minces ; injection via **`ServiceContainer` / `Depends`** ; pas de singletons globaux. Réutiliser **`ContextBuilder`** / structure de contexte déjà consommée par 4.3.
- **Réutiliser (ne pas réinventer)** : `services/lore_contradiction_validator.py`, `services/graph_dialogue_text.py`, `POST /api/v1/unity-dialogues/graph/validate-lore-explicit`, fusion store **`loreKept`** après `validateGraph`, surlignage **`getValidationHighlightKind`** / thème `state.lore`. Vérifier les chemins réels dans `api/routers/graph.py` avant toute nouvelle route.
- **Extension backend (FR39)** : aucun endpoint d’équipe pour persister « Examiné / Ignoré » au moment de l’implémentation — persistance **localStorage** uniquement. Candidat futur : route sous `api/routers/graph.py` (même préfixe `/api/v1/unity-dialogues/graph/…`, auth alignée sur les routes graphe existantes), payload typé `{ document_id, lore_warning_key, disposition }` + table ou fichier côté service — hors périmètre 4.4 sauf story dédiée.
- **Frontière 4.3 / 4.4** : 4.3 = contradictions **explicites** (erreurs) + **MVP** warnings potentiels vitalité / GDD contradictoire. **4.4** = enrichissement **heuristique** (ambiguïtés, review humaine), **filtres**, **cycle de vie** warning (ignoré / examiné). Ne pas dégrader les types ni la sémantique des erreurs explicites.
- **Qualité tests** : interdit de figer des entités du GDD réel ; jeux de données minimaux en mémoire. Respect **`project-context.md`** et `.cursor/rules/tests.mdc`.
- **Perf** : garder une complexité raisonnable sur gros graphes (éviter produits cartésiens entités × phrases sur tout le texte) ; documenter dans docstring si nouvelles passes sont O(·).

### Project Structure Notes

- Backend : `services/`, `api/schemas/`, `api/routers/graph.py`, tests miroir `tests/services/`, `tests/api/`.
- Frontend : `frontend/src/components/graph/`, `frontend/src/store/`, `frontend/src/api/graph.ts`, `frontend/src/types/graph.ts`.
- Données GDD : chemins via **`ConfigurationService`** / env — pas d’hypothèses POSIX.

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-04.md` — Story 4.4, FR39, frontière 4.3]  
- [Source: `_bmad-output/implementation-artifacts/4-3-détecter-contradictions-lore-explicites-faits-gdd-conflictuels-fr38.md` — endpoint réel, types, store, non-régression]  
- [Source: `_bmad-output/project-context.md` — Unity dialogues, tests sans GDD réel, couches API/services]

### Architecture Compliance

- Séparation **React / FastAPI / services** ; auth comme le reste des routes graphe ; pas de validation lore « fictive » entièrement côté client.

### Library / Framework Requirements

- Pas de nouvelle dépendance lourde pour l’ambiguïté référentielle MVP (heuristiques + données structurées). Si un jour NLP externe est nécessaire, ce serait une story ultérieure explicite.

### File Structure Requirements

- Nouveaux modules préférés sous `services/` ou extension contrôlée du validateur existant ; éviter les fichiers > ~300 lignes sans extraction (barre dev-story, sauf exception documentée).

### Testing Requirements

- `pytest` ciblé sur nouvelles fonctions + non-régression lore 4.3 ; `npm --prefix frontend run lint` ; Vitest sur panneau / store concernés ; commandes npm du dépôt après modification (voir `AGENTS.md` / T0–T3).

### Previous Story Intelligence

- **4.3 (review)** : API canon **`validate-lore-explicit`** ; types `lore_contradiction_explicit` / `lore_contradiction_potential` ; réponse avec compteurs et `summary` ; UI dans **`GraphValidationPanel`** avec badge Lore ; **`graphStore.loreValidation`** ; texte nœuds centralisé dans **`graph_dialogue_text`**. Les revues AI ont insisté sur **stabilité des warnings**, **résumé explicite**, **doc perf** — appliquer le même niveau de rigueur aux extensions 4.4.
- Ne pas brancher la validation lore enrichie sur **`runValidationAfterPersist`** sauf décision produit explicite (aligné 4.3 : lore à la demande).

### Git Intelligence Summary

- Commits récents : `feat(validation): lore explicite/potentiel, panneau UX, API graphe` — zones chaudes `services/lore_contradiction_validator.py`, `api/routers/graph.py`, `GraphValidationPanel*`, `graphStructuralValidation.ts`, `uiSlice` / persistance.

### Latest Tech Information

- Stack inchangée (FastAPI, Pydantic v2, React 18, Zustand) — pas d’upgrade imposé pour FR39 ; vérifier compatibilité types TypeScript avec schémas Pydantic après extension additive des réponses.

### Project Context Reference

- `_bmad-output/project-context.md` — règles documents Unity, tests, imports Python canoniques.

## Dev Agent Record

### Agent Model Used

Composer (session dev-story / Amelia).

### Debug Log References

_(aucun incident bloquant)_

### Completion Notes List

- **FR39** : type `lore_potential_ambiguity` + champs additifs `lore_subtype`, `lore_warning_key`, `ambiguity_candidates` ; compteurs API `ambiguity_warnings_count` / `nodes_with_ambiguity_warnings_count` ; résumé texte enrichi.
- **Post–code-review [1]** : champ API additif `summary_explicit_only` + `build_lore_summary_explicit_only` ; bandeau UI = explicite seul ; `summary` agrégé inchangé pour traçabilité ; libellé « Contradictions lore explicites » ; description Pydantic `warnings` étendue ; story fichier stagé git.
- **Choix endpoint** : enrichissement sur `POST /api/v1/unity-dialogues/graph/validate-lore-explicit` (pas de route nouvelle).
- **🔵 Refactor Task 1** : extraction `services/lore_vague_reference.py` — avant : monolithe validator ; après : ambiguïtés + extraction entités hors-personnage dans module dédié ; `merge_lore_facts_with_context_builder` retourne `(facts, vitality_ctx, ambiguity_entities)`.
- **🔵 Refactor Task 2** : `frontend/src/utils/loreWarningUi.ts` — clés stables, filtres, préfixe stockage `dg.loreWarnDispo.v1` ; hook `useLoreWarningPanelState.ts`.
- **🔵 Refactor Task 3** : `LoreWarningFilterBar.tsx` pour alléger `GraphValidationPanel.tsx`.
- **Tests** : `pytest tests/services/test_lore_contradiction_validator.py tests/api/test_graph_validate_lore_explicit.py` ; Vitest `GraphValidationPanel`, `loreWarningUi`, `graphStructuralValidation`, `graphStore.loreValidation` ; `npm --prefix frontend run lint` ; `npm run test:backend:smoke`.

### File List

- `services/lore_vague_reference.py`
- `services/lore_contradiction_validator.py`
- `api/schemas/graph.py`
- `api/routers/graph.py`
- `tests/services/test_lore_contradiction_validator.py`
- `tests/api/test_graph_validate_lore_explicit.py`
- `frontend/src/types/graph.ts`
- `frontend/src/store/slices/uiSlice.ts`
- `frontend/src/utils/graphStructuralValidation.ts`
- `frontend/src/utils/loreWarningUi.ts`
- `frontend/src/hooks/useLoreWarningPanelState.ts`
- `frontend/src/components/graph/validationPanelLabels.ts`
- `frontend/src/components/graph/GraphValidationPanel.tsx`
- `frontend/src/components/graph/LoreWarningFilterBar.tsx`
- `frontend/src/components/graph/GraphValidationPanelLists.tsx`
- `frontend/src/components/graph/nodes/DialogueNode.tsx`
- `frontend/src/components/graph/GraphEditor.tsx`
- `frontend/src/__tests__/GraphValidationPanel.test.tsx`
- `frontend/src/__tests__/loreWarningUi.test.ts`
- `frontend/src/__tests__/graphStructuralValidation.test.ts`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/4-4-signaler-incohérences-lore-potentielles-pour-review-humaine-fr39.md`

## Change Log

- 2026-04-06 : Implémentation FR39 (ambiguïtés, API additif, UI filtre/ignoré/examiné, tests).
- 2026-04-06 : Correctifs post-revue [1] — `summary_explicit_only`, bandeau explicite seul, Pydantic `warnings`, story stagée git.
- 2026-04-06 : Statut story + sprint → **done** (alignement workflow code-review après fix HIGH/MEDIUM ; pas de statut « review » résiduel).

**Note SM :** `_bmad/core/tasks/validate-workflow.xml` absent du dépôt — validation checklist « validate-create-story » manuelle ou restauration du fichier si le workflow le requiert.

---

## Senior Developer Review (AI)

**Revue :** Amelia (Dev + workflow `code-review` BMAD) — **Marc** — 2026-04-06  
**Outcome (initial) :** Changes Requested — follow-ups HIGH/MEDIUM.  
**Outcome (post-fix [1]) :** **Done** — AC #5 bandeau vs compteur potentiel : bandeau = contradictions explicites uniquement (`summary_explicit_only`) ; résumé agrégé conservé dans `summary` (API). Statut final corrigé (done, pas « review » résiduel).

**Preuves revue initiale :**

- `pytest tests/services/test_lore_contradiction_validator.py tests/api/test_graph_validate_lore_explicit.py` → 19 passed  
- `npx vitest run src/__tests__/loreWarningUi.test.ts src/__tests__/GraphValidationPanel.test.tsx` → 13 passed  

**Preuves post-fix [1] :**

- `pytest` (mêmes modules) → 19 passed  
- Vitest : `graphStore.loreValidation`, `GraphEditor.loreValidationPanel`, `GraphValidationPanel`, `loreWarningUi` → 16 passed  
- `npm --prefix frontend run lint` → OK  

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] **AC #5 — cohérence résumé / liste** : champ additif `summary_explicit_only` + store lit ce champ pour le bandeau ; résumé agrégé inchangé (`summary`).  
- [x] [AI-Review][MEDIUM] **Libellé bandeau** : « Contradictions lore explicites » (`GraphValidationPanel.tsx`).  
- [x] [AI-Review][MEDIUM] **Contrat Pydantic** : description `warnings` + `summary` / `summary_explicit_only` documentés (`api/schemas/graph.py`).  
- [x] [AI-Review][MEDIUM] **Hygiène git** : `git add` story 4-4 (stagé avec le lot).  
- [ ] [AI-Review][LOW] **Stabilité clé fallback** : `resolveLoreWarningKey` — optionnel.  
- [ ] [AI-Review][LOW] **Couverture catégories GDD** : `_category_is_ambiguity_scope` — optionnel.

## Story Completion Status

**done** — HIGH/MEDIUM traités ; LOW optionnels ; merge / clôture selon process équipe.
