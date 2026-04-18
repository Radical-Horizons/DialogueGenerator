# Story 9.3: Définir effets déclenchés par choix joueur (set variable, unlock flag)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur créant des dialogues**,
I want **définir des effets déclenchés quand le joueur sélectionne un choix**,
So that **je peux modifier l'état du jeu (variables, flags) en fonction des choix du joueur**.

## Acceptance Criteria

1. **Given** un choix joueur dans un nœud **When** je sélectionne le choix et ouvre « Effets » **Then** un panneau affiche la liste « Effets déclenchés » **And** je peux ajouter des effets par catégorie : « Modifier flag » / « Modifier Réputation » (distinct des deltas legacy `respectDelta` / influence si encore présents — voir Dev Notes).
2. **Given** un effet sur flag `bool` **When** il est sauvegardé **Then** la représentation stockée encode « flag catalogue → valeur bool » **And** un résumé lisible s’affiche sur le choix (ex. `[→ Flag_… = true]`).
3. **Given** un effet sur flag `compteur` **When** il est sauvegardé **Then** les opérateurs `= N`, `+= N`, `-= N` sont supportés **And** la valeur reste clampée entre Min/Max du catalogue après application simulée.
4. **Given** un effet sur flag `enum` **When** il est sauvegardé **Then** seules les valeurs enum ordonnées du catalogue sont sélectionnables **And** la sémantique est « assigner la valeur cible » (pas d’arithmétique sur enum).
5. **Given** un effet Réputation (axe × faction × delta) **When** il est sauvegardé **Then** il est distinct d’un flag bool/compteur/enum **And** les plages d’édition respectent le repère GDD (ex. Prestige ±5 à ±15, Respect ±5 à ±20 — à caler sur constantes ou config, pas des nombres magiques dispersés).
6. **Given** plusieurs effets sur un même choix **When** ils sont ordonnés dans l’UI **Then** l’ordre est persisté **And** un résumé concaténé non vide est affiché (aperçu local ; exécution séquentielle complète = Story 9.4).
7. **Given** le graphe ouvert **When** un choix porte des effets **Then** il est identifiable sans ouvrir chaque panneau (icône ou style cohérent avec Story 9.2 pour les conditions).
8. **Given** le document dialogue **When** je sauvegarde **Then** les effets passent par la validation document (catalogue + bornes + références cohérentes avec `dialogueFlags` Story 9.1 où applicable) **And** aucune perte silencieuse au reload GET/PUT.

## Tasks / Subtasks

- [x] Task 1 : Modèle canon + schéma JSON — effets structurés sur **choix** (réutiliser patterns 9.2) (AC: #1–#4, #8)
  - [x] 🔴 Test échoue : document avec effets sur au moins un choix ; round-trip GET/PUT ; rejet si opérateur incompatible avec type de flag ; enum hors liste ; compteur qui violerait Min/Max après opération ; pas de perte silencieuse au reload.
  - [x] 🟢 Étendre `docs/resources/dialogue-format.schema.json`, types Pydantic (`api/schemas/`), types frontend (`UnityDialogueChoice` / schémas Zod) avec un bloc structuré dédié (nom final au dev : ex. `choiceEffects` ou alignement epic « actions » — une seule source de vérité dans le schéma). Conserver les champs legacy pertinents pour Unity/export ; documenter la stratégie legacy vs structuré dans Dev Notes.
  - [x] 🔵 Refactor : isoler le « shape » effet (union discriminée par kind/type) dans un module unique schéma JSON + types TS alignés Pydantic, comme pour `visibilityConditions`, pour éviter divergence à trois dialectes.

- [x] Task 2 : Validation / « parsing » métier — catalogue flags + réputation (AC: #3–#5, #8)
  - [x] 🔴 Test échoue : pour chaque type (bool assign, compteur +=/-/=, enum assign, réputation delta), entrées valides acceptées ; entrées hors bornes ou ID inconnus rejetées avec message contextualisé ; cohérence avec `FlagCatalogService` et règles déjà utilisées par `dialogue_flag_validation` / Story 9.2.
  - [x] 🟢 Implémenter un service dans `services/` (ex. `EffectValidationService` ou extension du pattern `VisibilityConditionValidationService`) branché sur `PUT /documents` après les validations existantes ; router mince via `api/container.py`.
  - [x] 🔵 Refactor : factoriser avec Story 9.2 les primitives « ID flag dans catalogue », « valeur enum ∈ liste », « compteur dans bornes » pour éviter duplication ; garder handlers API ≤ ~30 lignes.

- [x] Task 3 : UI « Effets » — liste ordonnée + éditeurs typés (AC: #1, #2, #6)
  - [x] 🔴 Test échoue : depuis un choix sélectionné, ajout d’un effet bool + sauvegarde déclenche PUT document ; réordonnancement (drag ou boutons haut/bas) reflété dans le JSON ; tests RTL sans dépendre du pixel-perfect.
  - [x] 🟢 Implémenter `EffectEditor.tsx` (ou équivalent) branché sur `ChoiceEditor` / flux document ; réutiliser listes/catalogue comme `ConditionEditor` / API flags ; ne pas fusionner avec `InGameFlagsModal`.
  - [x] 🔵 Refactor : **ne pas** faire grossir `NodeEditorPanel.tsx` (~1227 L) — composer depuis enfants/hooks ; si logique commune avec `ConditionEditor`, extraire uniquement ce qui est réellement partagé (sélecteurs catalogue, formatage résumé).

- [x] Task 4 : Graphe — marqueurs choix porteurs d’effets (AC: #2, #7)
  - [x] 🔴 Test échoue : choix avec effets affiche un indicateur distinct du badge « condition » ; tooltip ou libellé accessible résume au moins un effet ou « N effets ».
  - [x] 🟢 Étendre `DialogueNode.tsx` (handles de choix) pour icône/style « effets » cohérent avec accessibilité (title/aria).
  - [x] 🔵 Refactor : centraliser `formatEffectSummary` / liste dans `frontend/src/utils/` avec tests unitaires légers — même principe que `formatConditionSummary` en 9.2.

- [x] Task 5 : Simulation minimale — appliquer effets à l’état « jeu » simulé dans l’éditeur (AC: #6, préparation 9.4)
  - [x] 🔴 Test échoue : avec état simulé initial (flags/réputation fictifs), application d’un choix avec effets met à jour l’état de simulation de façon prévisible ; ordre des effets respecté ; compteur clampé.
  - [x] 🟢 Implémenter une fonction pure `applyChoiceEffects(state, effects)` testée + branchement léger dans le store vue (`graphViewStore` ou équivalent) sans implémenter `POST /preview` complet (Story 9.4).
  - [x] 🔵 Refactor : un seul moteur d’application d’effets pour panneau + graphe ; éviter de dupliquer la sémantique clamp / enum assign entre fichiers.

## Dev Notes

- **Garde-fous architecture** : logique métier et validation dans `services/` ; routers minces ; injection `api/container.py`. Document canonique `/api/v1/documents/{id}` — persistance via GET/PUT avec révision ; ne pas reconstruire le document depuis le graphe seul.
- **Décision à trancher en implémentation** : le schéma epic mentionne `actions` sur `UnityDialogueChoice` et `consequences` sur le nœud. Aujourd’hui `docs/resources/dialogue-format.schema.json` définit `consequences` au niveau **nœud** (flag narratif Unity legacy) et **pas** encore de bloc d’effets catalogue sur les choix. La story ajoute un bloc **structuré** sur les choix pour les effets catalogue (bool/compteur/enum/réputation). Ne pas confondre avec `respectDelta` / `influenceDelta` existants — soit mapping export, soit coexistence documentée.
- **Réutiliser** : `FlagCatalogService`, `data/UnityData/FlagCatalog.csv`, patterns Story 9.1 (`dialogueFlags`) et Story 9.2 (`visibilityConditions`, validation au PUT, `ConditionEditor`, `evaluateVisibilityConditions`).
- **Réputation** : même approche que 9.2 pour les IDs stables axe × faction ; deltas bornés selon GDD dans la validation.
- **Story 9.4** : pas d’obligation d’endpoint preview complet ici ; livrer état simulé local + fonctions pures réutilisables par `DialoguePreviewService` plus tard.
- **Story 9.5** : anticiper la traversée des effets pour références de flags (sans implémenter toute la validation transversale ici).
- **Qualité / tests** : pytest services + tests API documents ; Vitest RTL `EffectEditor` + utils résumé ; pas de données GDD réelles dans les tests.
- **Refactor bar** : défauts dev-story (~300 lignes par fichier touché par tâche, fonctions ~60 lignes) sauf exception nommée.
- **Fichiers chauds** :
  - `frontend/src/components/graph/NodeEditorPanel.tsx` (~1227 L) — **contrainte** : section Effets via composants enfants / hooks ; pas d’empilement massif dans ce fichier.
  - `api/routers/documents.py` (~650 L) — **contrainte** : ajouts minimes ; validation dans les services.
- **Conventions** : types TS alignés `frontend/src/types/api.ts` ; schémas Pydantic `api/schemas/` ; UTF-8 et `ensure_ascii=False` pour exports JSON inchangés par cette story sauf extension documentée.

### Project Structure Notes

- Point d’entrée UI : choix sélectionné dans `ChoiceEditor` / panneau nœud existant ; section « Effets » distincte de « Conditions » (9.2) et « Variables et flags » dialogue (9.1).
- Export Unity : vérifier impact sur `exportToUnity` / sérialisation si le runtime attend encore uniquement des champs legacy — documenter mapping ou phase de compilation des effets structurés vers le format Unity attendu.

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-09.md` — Story 9.3, FR91, contraintes GDD effets / réputation]
- [Source: `_bmad-output/implementation-artifacts/9-2-définir-conditions-de-visibilité-sur-nœuds-si-variable-x-y-afficher-nœud-fr90.md` — patterns Conditions, fichiers touchés, simulation minimale]
- [Source: `_bmad-output/project-context.md` — documents canoniques, stack, tests]
- [Source: `docs/resources/dialogue-format.schema.json` — `choices[]`, `visibilityConditions`, `consequences` nœud]

## Technical Requirements

- Backend : validation des effets au PUT document ; services testables ; pas de logique métier dans les routers.
- Frontend : éditeur d’effets ordonnés ; marqueurs sur graphe ; fonction pure d’application pour simulation.
- Schéma : mise à jour JSON Schema + alignement Pydantic/TS/Zod ; stratégie legacy vs structuré documentée.
- Tests : unit (validation, apply effects), intégration (PUT document), RTL (éditeur + graphe).

## Architecture Compliance

- FastAPI + `ServiceContainer` ; pas de singletons ; `ConfigurationService` pour chemins ; compatibilité export Unity et révisions documents.

## Library / Framework Requirements

- Stack existante uniquement (FastAPI, Pydantic v2, React 18, Zustand, React Flow) — pas de nouvelle dépendance majeure sauf justification explicite (ex. DnD léger déjà utilisé ailleurs).

## File Structure Requirements

- Nouveau code privilégié : `services/` pour validation effets, `api/schemas/` pour types, `frontend/src/components/graph/effects/` ou voisinage `conditions/`, `frontend/src/utils/` pour résumés/application pure, tests miroir sous `tests/` et `frontend/src/**/*.test.ts(x)`.

## Testing Requirements

- Pytest : validation bornes, ordre effets, intégrité PUT/GET document.
- Vitest : EffectEditor, résumés, non-régression flush choix (`mergeDialogueNodeFormIntoStoreData` / connexions).
- E2E : optionnel si RTL + API suffisent pour cette story.

## Previous Story Intelligence

- **9.2** a livré `visibilityConditions` structurées (nœud + choix), validation catalogue au PUT, `ConditionEditor`, `evaluateVisibilityConditions`, badges/tooltips graphe, simulation locale dans `ConditionEditor` / `graphViewStore`. Réutiliser les mêmes patterns pour les effets (shape discriminated, utils testés, éviter second moteur).
- Points de review 9.2 : centraliser formatage ; distinguer visuellement conditions vs effets sur les handles ; warnings API non silencieux.

## Git Intelligence Summary

- Commits récents epic 9 : visibilité structurée (`visibilityConditions`), dialogueFlags, FlagCatalog versionné — garder cohérence fichiers et conventions de commit.

## Latest Tech Information

- Pas de mise à niveau de framework requise pour cette story ; versions figées dans `_bmad-output/project-context.md`.

## Project Context Reference

- `_bmad-output/project-context.md` — règles critiques (documents vs graphe, injection, tests).

## Senior Developer Review (AI)

_Date : 2026-04-18 — Revue adversariale (workflow code-review)._

### Synthèse

- **Git vs File List** : aligné (working tree propre au moment de la revue).
- **AC** : couverts après correctifs ci-dessous (validation PUT, UI, ordre, résumés, marqueur graphe, round-trip).

### Findings traités (post-revue)

| Sev | Sujet | Action |
|-----|--------|--------|
| MEDIUM | Simulation store : `applyChoiceEffectsSimulation` n’injectait pas le catalogue → clamp compteur pouvait diverger du backend | `graphViewStore` + `EffectEditor` passent `catalogById` à `applyChoiceEffectsToEvalState` |
| MEDIUM | Task 3 : tests RTL `EffectEditor` manquants (seuls utils) | Ajout `frontend/src/components/graph/effects/EffectEditor.test.tsx` |
| LOW | Delta « Crainte » : littéral `±25` dupliqué | Constante `CRAINTE_DELTA_ABS_MAX` dans `choiceEffects.ts` (aligné Python) |

### Reste (LOW, non bloquant)

- Pas de résolution catalogue des paires axe×faction réputation (AC5 exige bornes delta, pas d’exhaustivité d’IDs).

### Verdict

**Approuvé** — statut final **done** (pas d’HIGH/MEDIUM ouverts).

## Story Completion Status

- **done** — Code review 2026-04-18 : correctifs simulation + RTL ; story 9.3 close.

---

## Dev Agent Record

### Agent Model Used

Composer (Cursor) — session dev-story 2026-04-18

### Debug Log References

_(Aucun incident bloquant — CSV enum `EnumValues` : vérifier le nombre de séparateurs pour éviter colonne décalée.)_

### Completion Notes List

- **Schéma** : `choiceEffects[]` sur chaque choix (`set_bool`, `adjust_counter`, `set_enum`, `reputation_delta`) dans `dialogue-format.schema.json` ; Pydantic `api/schemas/choice_effects.py` ; Zod `choiceEffectsSchema.ts` ; `UnityDialogueChoice.choiceEffects`.
- **Validation** : `ChoiceEffectValidationService` + `PUT /documents` (après visibility + dialogueFlags) ; bornes réputation `services/reputation_effect_bounds.py` ; compteur simulé vs `dialogueFlags` + bornes catalogue.
- **Legacy** : `respectDelta` / `influenceDelta` inchangés ; effets catalogue sont un canal distinct (Story / AC5).
- **🔵 Refactor** : index catalogue partagé `services/flag_catalog_index.py` (Story 9.2 + 9.3) ; résumés/formatage dans `frontend/src/utils/choiceEffects.ts` avec Vitest ; `applyChoiceEffectsSimulation` dans `graphViewStore`.
- **Code review** : passage catalogue → simulation ; tests RTL `EffectEditor.test.tsx` ; constante Crainte nommée côté TS.

### File List

- `docs/resources/dialogue-format.schema.json`
- `api/schemas/choice_effects.py`
- `services/reputation_effect_bounds.py`
- `services/choice_effect_validation.py`
- `services/flag_catalog_index.py`
- `services/visibility_condition_validation.py`
- `api/dependencies.py`
- `api/routers/documents.py`
- `tests/api/test_documents_choice_effects.py`
- `tests/services/test_choice_effect_validation.py`
- `frontend/src/types/choiceEffects.ts`
- `frontend/src/schemas/choiceEffectsSchema.ts`
- `frontend/src/schemas/nodeEditorSchema.ts`
- `frontend/src/utils/choiceEffects.ts`
- `frontend/src/utils/choiceEffects.test.ts`
- `frontend/src/utils/mergeNodeEditorForm.ts`
- `frontend/src/types/api.ts`
- `frontend/src/store/graphViewStore.ts`
- `frontend/src/components/graph/effects/EffectEditor.tsx`
- `frontend/src/components/graph/effects/EffectEditor.test.tsx`
- `frontend/src/components/graph/ChoiceEditor.tsx`
- `frontend/src/components/graph/nodes/DialogueNode.tsx`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
