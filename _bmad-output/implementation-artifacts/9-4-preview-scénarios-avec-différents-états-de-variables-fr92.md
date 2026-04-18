# Story 9.4: Preview scénarios avec différents états de variables

Status: review



## Story

As a **utilisateur créant des dialogues**,
I want **prévisualiser des scénarios avec différents états de variables**,
So that **je peux tester comment le dialogue se comporte selon les valeurs des flags et variables**.

## Acceptance Criteria

1. **Given** un dialogue avec conditions (Story 9.2) et effets (Story 9.3) sur les flags **When** j’ouvre « Preview scénario » depuis l’éditeur graphe **Then** un panneau dédié s’affiche avec la liste des flags pertinents au dialogue (`dialogueFlags` / catalogue) **And** je peux définir les valeurs initiales simulées (bool, compteur dans bornes, enum, axes réputation utilisés dans conditions/effets).
2. **Given** un état initial défini **When** le preview est actif **Then** le graphe reflète la visibilité : nœuds et choix évalués via les mêmes règles que `evaluateVisibilityConditions` **And** les éléments dont les conditions ne sont pas satisfaites sont distingués (grisés ou style équivalent + information accessible).
3. **Given** le preview actif **When** une bannière ou indicateur global est visible **Then** il est clairement libellé comme mode simulation (ex. « Preview — état simulé ») **And** il résume au moins un extrait d’état utile (ex. nombre de flags non défaut ou hash léger), sans exposer de secrets.
4. **Given** je navigue dans le preview en sélectionnant des choix **When** un choix porte des effets (`choiceEffects`) **Then** l’état simulé est mis à jour avec `applyChoiceEffectsToEvalState` (ordre conservé, compteurs clampés catalogue) **And** un historique lisible enregistre les effets appliqués (ex. « Flag X : 2 → 3 »).
5. **Given** la navigation par choix **Then** les nœuds et choix suivants se réévaluent avec le nouvel état **And** le rapport « X nœuds accessibles / Y masqués ou inaccessibles par conditions » peut être obtenu (panneau ou section dédiée).
6. **Given** je modifie les valeurs initiales dans le panneau **When** je change une valeur (ex. compteur ou enum) **Then** la vue du graphe se met à jour sans rechargement complet **And** aucune donnée persistée du document n’est écrite par cette manipulation seule.
7. **Given** je quitte le preview **When** je désactive le mode ou ferme le panneau **Then** le graphe revient à l’affichage éditeur normal (tous les nœuds/choix éditables visibles selon les règles habituelles hors simulation) **And** l’état simulé en mémoire est abandonné ou réinitialisé — **aucun** impact sur le JSON document sauvé.
8. **Comparaison deux scénarios côte à côte** (AC epic « Comparer scénarios ») : **hors périmètre MVP** — reporter explicitement (Story ultérieure ou opt-in si temps restant) ; ne pas bloquer la livraison des AC 1–7.

## Tasks / Subtasks

- Task 1 : Mode preview — entrée/sortie sans persistance (AC: #1 début, #3, #7)
  - [x] 🔴 Tests : `graphViewStore` preview + `useDialoguePreview.test.tsx` (entrée/sortie état) ; UI `btn-dialogue-preview`, `dialogue-preview-banner`, `dialogue-preview-panel` (test IDs).
  - [x] 🟢 `graphViewStore` : `enterDialoguePreview` / `exitDialoguePreview`, historique, catalogue preview ; `DialoguePreviewPanel`, `DialoguePreviewBanner`, bouton `GraphEditorHeader`, layout `GraphEditor`.
  - [x] 🔵 Refactor : hook `useDialoguePreview` (`frontend/src/hooks/useDialoguePreview.ts`) — état initial depuis `dialogueFlagBindings` + clés collectées sur le graphe.
- Task 2 : Panneau état initial — flags + réputation simulée (AC: #1, #6)
  - [x] 🔴 Comportement couvert par intégration panneau + store (pas de PUT document dans ce flux).
  - [x] 🟢 `DialoguePreviewPanel` + `listFlags` → `previewCatalogById` ; contrôles typés ; `collectPreviewKeys` pour réputation référencée ; clamp compteur via métadonnées catalogue.
  - [x] 🔵 Refactor : `clampCounter` local aligné bornes catalogue (même principe que `choiceEffects` / EffectEditor).
- Task 3 : Rendu graphe — visibilité et accessibilité en simulation (AC: #2, #5)
  - [x] 🔴 `dialoguePreviewStats.test.ts` — comptages accessibles / masqués.
  - [x] 🟢 `DialogueNode` : mode `visibilityEvalMode` (preview OU simulation existante) ; `evaluateVisibilityConditions` inchangé.
  - [x] 🔵 Bannière `DialoguePreviewBanner` extraite du canvas (réduit bruit dans `GraphEditor`).
- Task 4 : Navigation par choix — effets + historique + réévaluation (AC: #4, #5)
  - [x] 🔴 `previewEffectHistory.test.ts` + store `appendPreviewEffectHistory`.
  - [x] 🟢 Poignées choix : `onPointerDown` en preview → `applyChoiceEffectsSimulation` + lignes via `linesForAppliedChoiceEffects` ; `isConnectable={false}` en preview pour éviter nouvelles arêtes.
  - [x] 🔵 Refactor : `previewEffectHistory.ts` centralise résumés alignés sur `applyChoiceEffectsToEvalState`.
- Task 5 : Service preview backend + endpoint document (AC epic technique, NFR perf)
  - [x] 🔴 `tests/api/test_documents_preview.py` (200 + 409 revision) ; `tests/services/test_dialogue_preview_eval.py`.
  - [x] 🟢 `DialoguePreviewService`, `dialogue_preview_eval.py`, schémas `api/schemas/dialogue_preview.py`, `POST /{document_id}/preview`, container + `get_dialogue_preview_service`.
  - [x] 🔵 Logique pure dans `services/dialogue_preview_eval.py` ; router délègue au service (~30 lignes).
- Task 6 (stretch / hors MVP) : Comparaison A vs B — optionnel (AC #8)
  - [x] 🔴 Skip documenté (AC #8 hors MVP pour cette livraison).
  - [x] 🟢 Report explicite : comparateur side-by-side → story / epic ultérieure.
  - [x] 🔵 N/A (pas d’impl comparateur).

## Dev Notes

- **Garde-fous architecture** : document canonique `GET/PUT /api/v1/documents/{id}` ; pas de reconstruction document depuis le graphe seul ; logique métier dans `services/` ; injection `api/container.py`. L’epic mentionne `/api/v1/dialogues/...` — **adapter** au contrat documents du projet (aligné `project-context.md`).
- **Réutiliser sans réinventer** : `frontend/src/utils/visibilityConditions.ts` (`evaluateVisibilityConditions`), `frontend/src/utils/choiceEffects.ts` (`applyChoiceEffectsToEvalState`), état `visibilityEvalState` / simulation dans `graphViewStore.ts`, catalogues `FlagCatalogService` / API flags, patterns 9.2 `ConditionEditor`, 9.3 `EffectEditor`.
- **Ne pas persister** : le preview est une simulation — les seules écritures document restent les flux utilisateur explicites (édition + sauvegarde), jamais le simple fait de simuler.
- **Performance** : cible epic <200ms pour dialogues <100 nœuds côté API ; côté client, éviter re-render complet React Flow à chaque frappe — débouncer ou mémoïser l’évaluation.
- **Qualité bar** : pytest sur service preview + parité sémantique avec utils TS (jeux de tests communs ou équivalents) ; Vitest sur hook preview + comptages ; pas de données GDD réelles dans les tests.
- **Refactor bar** : critères dev-story par défaut (~300 lignes par fichier touché par tâche, fonctions ~60 lignes) sauf exception nommée ici.
- **Fichiers chauds** :
  - `frontend/src/components/graph/NodeEditorPanel.tsx` (**1227 L**) — **contrainte** : point d’entrée preview via header / layout graphe ou panneau latéral dédié ; pas de centaines de lignes ajoutées inline.
  - `api/routers/documents.py` (**666 L**) — **contrainte** : route preview ≤ ~30 lignes, délégation service.
- **Conventions** : types TS alignés `frontend/src/types/api.ts` ; schémas Pydantic `api/schemas/` pour le corps POST preview ; UTF-8.

### Project Structure Notes

- Point d’entrée UX cohérent avec `GraphEditorHeader` / toolbar existante (icône « œil » ou libellé Preview).
- Le backend preview sert de vérité serveur pour tests perf et futurs clients ; le client peut d’abord consommer les utilitaires locaux puis appeler l’API pour validation croisée si besoin.

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-09.md` — Story 9.4, FR92, NFR-P3]
- [Source: `_bmad-output/implementation-artifacts/9-3-définir-effets-déclenchés-par-choix-joueur-set-variable-unlock-flag-fr91.md` — simulation effets, fichiers touchés]
- [Source: `_bmad-output/project-context.md` — documents vs graphe, stack, tests]
- [Source: `frontend/src/store/graphViewStore.ts` — `visibilityEvalState`, `applyChoiceEffectsSimulation`]

## Technical Requirements

- Frontend : mode preview + panneau état + rendu graphe conditionnel + navigation à effets + historique ; isolation état simulation.
- Backend : `DialoguePreviewService` + POST sous ressource documents ; réponses structurées pour visibilité / métadonnées ; pas de logique métier dans le router.
- Alignement epic : évaluation conditions et exécution effets alignées sur les services existants ; temps de réponse conforme aux ordres de grandeur epic pour petits graphes.

## Architecture Compliance

- FastAPI + `ServiceContainer` ; pas de singletons ; `ConfigurationService` pour chemins ; compatibilité schéma document Unity / révisions.

## Library / Framework Requirements

- Stack existante (FastAPI, Pydantic v2, React 18, Zustand, React Flow) — pas de nouvelle dépendance majeure sans justification (ex. chart lib pour comparateur stretch).

## File Structure Requirements

- Nouveau code : `services/` (preview), `api/schemas/` (requête/réponse preview), `frontend/src/components/graph/preview/` ou équivalent à côté de `conditions/` et `effects/` ; tests miroir `tests/services/`, `tests/api/`, `frontend/src/**/*.test.ts(x)`.

## Testing Requirements

- Pytest : service preview (états limites, ordre effets, perf grossière sur fixture).
- Vitest : hook / store preview, comptage nœuds accessibles, non-régression flush graphe.
- E2E : optionnel si couverture RTL + API suffisante ; sinon smoke navigation preview.

## Previous Story Intelligence

- **9.3** a livré `choiceEffects`, validation `ChoiceEffectValidationService`, `EffectEditor`, `applyChoiceEffectsToEvalState`, marqueurs graphe, simulation locale branchée sur le catalogue — le preview doit **composer** ces briques plutôt que réimplémenter la sémantique effets.
- **9.2** a livré `visibilityConditions`, `evaluateVisibilityConditions`, badges conditions — le preview doit **réutiliser** la même fonction d’évaluation pour la vérité terrain UI.
- Revue 9.3 : passage catalogue obligatoire pour clamp compteur ; tests RTL `EffectEditor` — garder la même rigueur pour le panneau preview.

## Git Intelligence Summary

- Travaux récents epic 9 : effets (`choiceEffects`, `graphViewStore`), conditions structurées, documents PUT — commits à prolonger avec fichiers distincts preview pour faciliter review.

## Latest Tech Information

- Pas de mise à niveau framework requise ; versions dans `_bmad-output/project-context.md`. Vérifier React Flow 11 interactions « sélection choix » en mode lecture pour accessibilité.

## Project Context Reference

- `_bmad-output/project-context.md` — règles critiques (documents canoniques, injection, tests sans GDD réel).

## Story Completion Status

- **review** — Implémentation + tests ; prête pour code-review.

---

## Dev Agent Record

### Agent Model Used

Composer (agent session dev-story)

### Debug Log References

Aucun incident bloquant ; pytest / Vitest / ESLint exécutés avec succès sur périmètre story.

### Completion Notes List

- Preview scénario : état simulé dans `graphViewStore`, pas de persistance document ; sortie via `exitDialoguePreview` réinitialise flags/réputation simulés et historique.
- Backend `POST /api/v1/documents/{id}/preview` : agrégats + listes masquées ; `409` si `revision` stale.
- AC #8 (comparaison deux scénarios côte à côte) explicitement non livré — hors périmètre MVP (Task 6).

### File List

- `frontend/src/store/graphViewStore.ts`
- `frontend/src/hooks/useDialoguePreview.ts`
- `frontend/src/hooks/useDialoguePreview.test.tsx`
- `frontend/src/utils/collectPreviewKeys.ts`
- `frontend/src/utils/dialoguePreviewStats.ts`
- `frontend/src/utils/dialoguePreviewStats.test.ts`
- `frontend/src/utils/previewEffectHistory.ts`
- `frontend/src/utils/previewEffectHistory.test.ts`
- `frontend/src/components/graph/preview/DialoguePreviewPanel.tsx`
- `frontend/src/components/graph/preview/DialoguePreviewBanner.tsx`
- `frontend/src/components/graph/GraphEditor.tsx`
- `frontend/src/components/graph/GraphEditorHeader.tsx`
- `frontend/src/components/graph/nodes/DialogueNode.tsx`
- `frontend/src/hooks/useGraphToolbar.ts`
- `frontend/src/types/documents.ts`
- `frontend/src/api/documents.ts`
- `frontend/src/__tests__/graphViewStore.test.ts`
- `frontend/src/__tests__/GraphEditorHeader.undoRedo.test.tsx`
- `frontend/src/__tests__/GraphEditor.loreValidationPanel.test.tsx`
- `api/schemas/dialogue_preview.py`
- `api/routers/documents.py`
- `api/dependencies.py`
- `api/container.py`
- `services/dialogue_preview_service.py`
- `services/dialogue_preview_eval.py`
- `tests/services/test_dialogue_preview_eval.py`
- `tests/api/test_documents_preview.py`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-04-18 : Story 9.4 — mode Preview scénario (UI + store + API documents preview), tests pytest/vitest.