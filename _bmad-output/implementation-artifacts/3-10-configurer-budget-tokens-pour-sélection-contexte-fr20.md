# Story 3.10 : Configurer budget tokens pour sélection contexte (FR20)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur créant des dialogues**,
I want **configurer un budget de tokens pour la sélection de contexte GDD**,
so that **je contrôle la taille du bloc contexte dans le prompt et je peux mieux maîtriser les coûts LLM**.

## Acceptance Criteria

1. **Given** l’utilisateur est dans le flux de sélection de contexte (panneau contexte / paramètres associés) **When** il ouvre la zone « Budget tokens contexte » **Then** il peut définir un **plafond** (nombre entier positif, ex. 4000) **And** l’UI affiche clairement **tokens contexte utilisés / budget** (ou équivalent lisible : barre + valeurs numériques).

2. **Given** un budget est défini **When** la sélection courante (entités + modes complet/extrait + instructions scène prises en compte pour le calcul) est estimée **Then** un **compteur** reflète l’usage (ex. « 2500 / 4000 ») **And** si l’usage **dépasse** le budget, un **avertissement non bloquant** s’affiche (ex. « Budget dépassé — réduire la sélection ») **And** l’édition / navigation reste possible (pas de modal bloquante obligatoire).

3. **Given** le budget est dépassé **When** l’utilisateur consulte l’UI **Then** une **invitation** à optimiser la sélection est visible, alignée sur la story **3.11** (ex. bouton ou lien « Optimiser le contexte » ou texte explicite renvoyant à cette capacité) **And** tant que **3.11** n’est pas implémentée, le comportement acceptable est : CTA présent mais action soit **désactivée avec tooltip** « Disponible après optimisation automatique (FR21) », soit renvoi vers réduction manuelle — **à trancher en Dev Notes** sans mentir sur une optimisation auto livrée dans 3.10.

4. **Given** l’utilisateur **réduit** le budget (ex. 4000 → 2000) **When** la sélection actuelle dépasse le nouveau plafond **Then** un **warning** explicite apparaît **And** la génération peut rester autorisée selon politique produit : soit **soft** (warning seul), soit **hard** (blocage avec message) — **choisir une politique cohérente** avec Story 1.11 / coûts et la documenter dans les critères de test.

5. **Given** l’utilisateur ouvre « Détails tokens » (ou section équivalente dans le même panneau) **When** les données sont disponibles **Then** un **breakdown** indique la contribution **par type d’entité** (personnages, lieux, objets, etc.) **And** distingue **complet vs extrait** là où le modèle de sélection le permet **And** le total du breakdown est **cohérent** avec le total « contexte » affiché (écart documenté si une partie du prompt hors contexte GDD n’est pas incluse dans le budget contexte).

## Tasks / Subtasks

- [ ] Task 1 : Persistance et source de vérité du budget utilisateur (AC: #1, #4)
  - [ ] 🔴 Test échoue : sans budget persisté, l’UI applique une **valeur par défaut** documentée ; après modification, un rechargement de page / remount conserve le plafond (selon mécanisme retenu : ex. `localStorage`, slice Zustand persist partiel, ou champ document — **ne pas inventer** un backend « user settings » s’il n’existe pas ; vérifier le repo).
  - [ ] 🟢 Implémenter stockage + exposition dans le store / hooks contexte (voir Dev Notes pour l’option retenue).
  - [ ] 🔵 Refactor : isoler clés de stockage et constantes par défaut dans un petit module (éviter magic strings dispersés) ; nommage aligné domaine « contextTokenBudget ».

- [ ] Task 2 : Estimation tokens contexte branchée sur l’existant (AC: #1, #2, #5)
  - [ ] 🔴 Test échoue : pour des sélections mockées, le front affiche un total cohérent avec la réponse API (ou avec le découpage agrégé) ; cas limite sélection vide → 0 ou comportement défini.
  - [ ] 🟢 Réutiliser **`POST /api/v1/context/estimate-tokens`** (`api/routers/context.py`) et le client front existant ; étendre schéma **Pydantic + types TS** si besoin pour un **breakdown** (par type + mode). Côté backend, réutiliser `ContextBuilder.build_context_json` + comptage tokens (déjà utilisé dans l’endpoint) — éviter un second service « TokenBudgetService » dupliqué ; factoriser si extraction utile dans `services/`.
  - [ ] 🔵 Refactor : si la logique « construire texte contexte + compter » est dupliquée ailleurs, centraliser derrière une fonction/service unique appelée par l’endpoint.

- [ ] Task 3 : UI budget + compteur + warnings non bloquants (AC: #1, #2, #4)
  - [ ] 🔴 Test échoue : avec budget 100 et total estimé 200, warning visible ; avec total &lt; budget, pas de fausse alerte ; réduction de budget déclenche warning si dépassement.
  - [ ] 🟢 Composer l’UI dans le **panneau contexte** (`ContextSelector` / zone paramètres associée) en réutilisant les patterns visuels de `frontend/src/components/generation/TokenBudgetBar.tsx` si pertinent (cohérence UX).
  - [ ] 🔵 Refactor : mutualiser styles/accessibilité (titres, `aria-live` pour le compteur si le warning change) avec autres indicateurs contexte.

- [ ] Task 4 : CTA optimisation / lien Story 3.11 (AC: #3)
  - [ ] 🔴 Test échoue : lorsque dépassement, la présence du CTA (ou message) est asser­tionnée ; si désactivé, tooltip ou texte indique la dépendance FR21.
  - [ ] 🟢 Implémenter le lien produit vers 3.11 sans casser les tests quand 3.11 n’existe pas encore.
  - [ ] 🔵 Refactor : constante ou feature flag lisible pour retirer l’état « désactivé » quand `/api/v1/context/optimize` sera livré (3.11).

- [ ] Task 5 : Intégration génération / build contexte (AC: #2, #4)
  - [ ] 🔴 Test échoue : lorsque le budget est appliqué au **build** (si politique hard ou `max_tokens` passé au backend), une requête de génération ou `build` respecte le plafond ou retourne erreur attendue — **un seul comportement** testé, documenté dans la story.
  - [ ] 🟢 Brancher `max_tokens` / `max_context_tokens` (champs existants dans `BuildContextRequest` / `EstimateTokensRequest`) de façon cohérente avec le budget utilisateur ; ne pas diverger silencieusement entre estimation et build.
  - [ ] 🔵 Refactor : point unique front qui mappe « budget UI » → payload API.

## Dev Notes

### Architecture guardrails

- Backend : logique dans `services/` ou extension de `ContextBuilder` / construction existante ; routes `api/routers/context.py`, schémas `api/schemas/` ; injection `api/container.py`.
- Ne pas dupliquer le comptage tokens : `ContextTruncator` / `ContextBuilder._count_tokens` / tiktoken déjà présents (`services/context_truncator.py`).
- **Ne pas** réintroduire d’endpoints parallèles si `estimate-tokens` suffit — **étendre** la réponse ou ajouter un sous-chemin clair documenté.
- Performance : éviter rafales d’appels (story 3.9 review) — **debounce** les recalculs quand la sélection change.

### What to reuse

- `api/routers/context.py` — `estimate_context_tokens`, `build_context`.
- `frontend/src/hooks/useTokenEstimation.ts`, `useEstimation.ts`, patterns `estimateTokens` dialogues si overlap.
- `frontend/src/components/generation/TokenBudgetBar.tsx` — inspiration UX barre/limites.
- `frontend/src/store/contextStore.ts` — sélections et modes ; budget peut vivre ici avec persist partiel **ou** localStorage dédié.
- Story **3.11** (backlog) : optimisation auto — 3.10 prépare l’UX et les données, pas l’algorithme.

### Quality bar

- Tests pytest pour tout nouveau champ schéma / breakdown agrégé ; Vitest + RTL pour compteur et warnings.
- Pas de données GDD réelles dans les tests (fixtures minimales).

### Refactor bar (defaults)

- Critères dev-story : ~300 lignes max par fichier source touché par tâche, ~60 lignes par fonction, etc.

### Conventions

- Types TS alignés `frontend/src/types/api.ts` sur Pydantic.
- Windows-first, UTF-8, pas de secrets en dur.

### Project Structure Notes

- Vérifier avant d’ajouter un **nouveau** fichier `TokenBudgetPanel.tsx` vs section dans `ContextSelector.tsx` : préférer composant enfant si le fichier parent dépasse déjà ~300 lignes.

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-03.md` — Story 3.10, FR20]
- [Source: `api/routers/context.py` — estimate-tokens, build]
- [Source: `_bmad-output/project-context.md` — stack, tests, API]

## Technical Requirements

- Budget utilisateur persisté (même session navigateur minimum ; idéalement entre sessions si persist Zustand/localStorage).
- Estimation tokens contexte alignée endpoint existant ; extension breakdown optionnelle mais requise pour AC#5.
- Warnings non bloquants ; politique hard/soft pour génération documentée.
- Préparation intégration 3.11 (CTA / placeholder honnête).

## Architecture Compliance

- FastAPI + ServiceContainer ; React consommateur API ; logique métier hors composants sauf orchestration.

## Library / Framework Requirements

- Tiktoken déjà via backend ; pas de nouvelle dépendance lourde sans justification.

## File Structure Requirements

- Fichiers sous `api/`, `services/`, `frontend/src/components/context/`, `frontend/src/hooks/`, `tests/` en miroir.

## Testing Requirements

- pytest + Vitest ; mocks API ; pas d’entités lore réelles.

## Previous Story Intelligence

- **3.9 (FR19)** : fingerprint / staleness / historique GDD — attention **charge** lors d’estimations répétées ; réutiliser patterns debounce et ne pas scanner tout le GDD côté client.
- Fichiers et suivis review 3.9 : compléter les follow-ups **hors périmètre 3.10** ne fait pas partie de cette story ; éviter les régressions sur `ContextSelector` / `generationSlice` lors du branchement budget.
- Story 3.9 Dev Agent Record liste `context.py`, `generationSlice`, `ContextSelector` — points sensibles pour tout nouveau state.

## Git Intelligence Summary

- Travaux récents : sync Notion GDD, usage contexte LLM, règles contexte par type de dialogue — la suite **budget contexte** est cohérente avec la roadmap Epic 3.

## Latest Tech Information

- Comptage tokens : encodage **cl100k_base** (déjà utilisé côté `ContextTruncator` / PromptEngine) — rester cohérent pour que chiffres UI ≈ backend.

## Project Context Reference

- `_bmad-output/project-context.md` : chemins GDD, interdiction tests sur entités réelles, injection DI, règles FastAPI/React.

## Dev Agent Record

### Agent Model Used

_(à remplir par l’agent dev)_

### Debug Log References

### Completion Notes List

### File List

## Story Completion Status

- **Statut** : ready-for-dev
- **Note** : Ultimate context engine — story générée via workflow create-story (sprint auto-discover 3-10).
