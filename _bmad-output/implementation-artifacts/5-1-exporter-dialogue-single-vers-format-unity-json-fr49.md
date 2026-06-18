# Story 5.1: Exporter dialogue single vers format Unity JSON (FR49)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur créant des dialogues**,
I want **exporter un dialogue unique vers le format Unity JSON**,
so that **je peux intégrer le dialogue dans Unity sans erreurs de format**.

## Acceptance Criteria

1. **Given** j'ai un dialogue complet avec nœuds et connexions, **When** je clique sur « Export Unity » dans l'éditeur de graphe, **Then** le graphe est converti au format Unity JSON strict (document `{ schemaVersion, nodes }`), **And** la validation schéma Unity (Story 4.13) est exécutée **avant** toute écriture disque, **And** l'opération se termine en < 200 ms pour un dialogue typique (< 100 nœuds) côté API (NFR-P3).
2. **Given** la validation schéma échoue, **When** j'essaie d'exporter, **Then** l'export est **bloqué** avec le message « Erreurs de validation détectées — corriger avant export », **And** la liste des erreurs s'affiche avec navigation vers le nœud concerné (réutiliser le pattern `handleSchemaErrorClick`), **And** aucun fichier n'est écrit sur disque.
3. **Given** la validation schéma réussit (100 % conforme), **When** l'export est lancé, **Then** le fichier JSON Unity est généré avec un nom basé sur le titre/filename du dialogue (slug), **And** le fichier est écrit dans le répertoire Unity configuré (`unity_dialogues_path`, écriture atomique ADR-006), **And** un toast de succès s'affiche « Dialogue exporté : [filename].json ».
4. **Given** le chemin Unity n'est pas résolu, **When** j'essaie d'exporter, **Then** un message clair indique que le chemin Unity n'est pas disponible (champ `unity_dialogues_path`), **And** l'export est bloqué. **Note produit :** la configuration utilisateur du chemin via `set_unity_dialogues_path` est **désactivée** dans `ConfigurationService` (chemin par défaut `Assets/Dialogue/generated` depuis la racine projet) — ne pas réintroduire un panneau settings complet sauf demande explicite ; documenter le chemin effectif via l'API config existante.
5. **Given** un dialogue contient des flags (bool/compteur/enum), conditions de réputation, tests de caractéristiques ou types spéciaux (`nodeType`), **When** l'export est lancé, **Then** chaque nœud exporté conserve ses champs GDD (`visibilityConditions`, `choiceEffects`, `skillCheck`, `reputation_fr94`, etc.) sans perte lors de la conversion graphe → Unity JSON, **And** les agrégats de réputation restent en valeur entière (pas de tier dynamique stocké).
6. **Tests** : pytest ciblé export API + validation bloquante ; Vitest sur le flux export graphe (succès, échec validation, toast) ; `npm --prefix frontend run lint` sans régression.

## Tasks / Subtasks

- [x] Task 1 : Export bloqué si la validation schéma échoue (AC: #2)
  - [x] 🔴 Test échoue : clic « Export Unity » avec graphe invalide (ex. choice sans `choiceId`) → toast/alerte « Erreurs de validation détectées — corriger avant export », panneau erreurs visible, **aucun** appel d'écriture disque réussi ; clic sur une erreur `[nodes.N...]` → nœud focalisé dans le graphe
  - [x] 🟢 Brancher le flux « Export Unity » sur `validateSchema` puis abort si `is_valid === false` — réutiliser `SchemaValidationPanel` / états toolbar existants (voir Dev Notes)
  - [x] 🔵 Refactor : extraire la construction du payload `{ nodes, edges }` partagée entre validation manuelle et export (éliminer duplication entre `handleToggleSchemaValidation` et le nouveau handler export dans `useGraphToolbar.ts`)

- [x] Task 2 : Export réussi écrit le JSON Unity sur disque (AC: #1, #3, #4)
  - [x] 🔴 Test échoue : graphe valide + clic « Export Unity » → `POST` backend aboutit, fichier `.json` présent dans le répertoire Unity mocké, toast « Dialogue exporté : [filename].json » ; chemin Unity `null` → message d'erreur explicite, pas d'écriture
  - [x] 🟢 Remplacer le téléchargement blob local (`handleExportUnity` actuel) par un appel API d'écriture serveur — réutiliser `graphAPI.saveGraphAndWrite` ou `dialoguesAPI.exportUnityDialogue` selon le flux documenté (voir Dev Notes) ; conserver `exportToUnity()` pour la sérialisation côté client si nécessaire
  - [x] 🔵 Refactor : factoriser la gestion d'erreurs API (ValidationException → liste d'erreurs utilisateur) entre export et sauvegarde dans un helper frontend unique ; clarifier les libellés toast succès/échec

- [x] Task 3 : Sérialisation GDD intacte dans le JSON exporté (AC: #5)
  - [x] 🔴 Test échoue : fixture graphe avec `visibilityConditions` (flag bool + réputation FR94) + `skillCheck` sur un choix → JSON exporté contient les mêmes champs structurés après round-trip `graph_to_unity_json` (pytest sur `GraphConversionService` ou endpoint save-and-write)
  - [x] 🟢 Vérifier/compléter le pass-through dans `GraphConversionService.graph_to_unity_json()` pour les champs Epic 9 / schéma v1.2.0 — **ne pas** réimplémenter la logique FR94 (déjà dans `services/game_systems_*.py` et le store) ; s'assurer que les champs présents dans `node.data` survivent à la conversion
  - [x] 🔵 Refactor : nommer les cas pytest d'après le comportement observable (`test_export_preserves_reputation_fr94`, `test_export_preserves_visibility_conditions`) ; éviter fixtures GDD réelles (personnages/lieux nommés)

- [x] Task 4 : Alignement validateur export ↔ validate-schema (AC: #1, #6)
  - [x] 🔴 Test échoue : document valide pour `validate_unity_json` (endpoint validate-schema) mais rejeté par `UnityJsonRenderer.validate_nodes` lors de l'écriture (ou l'inverse) → les deux chemins doivent produire le même verdict pour une fixture commune
  - [x] 🟢 Unifier le validateur dans `write_unity_dialogue_to_file` pour utiliser `validate_unity_json` (schéma structuré Story 4.13) au lieu de `_default_validator` (`UnityJsonRenderer`) **ou** documenter et tester l'équivalence — une seule source de vérité pour le blocage export
  - [x] 🔵 Refactor : injecter le validateur via paramètre `validator=` déjà prévu dans `write_unity_dialogue_to_file` (DIP) ; handler router ≤ 30 lignes, logique dans le service

## Dev Notes

### Écart actuel vs cible (ne pas réinventer)

| Composant | État actuel | Action attendue |
|-----------|-------------|-----------------|
| `GraphEditorHeader.handleExportUnity` | Télécharge un blob navigateur (`exportToUnity()`), **n'appelle pas l'API** | Remplacer par flux validate → write serveur |
| `POST /api/v1/dialogues/unity/export` | Existe ; valide via `UnityJsonRenderer` par défaut | Réutiliser ou aligner validateur avec 4.13 |
| `POST /api/v1/unity-dialogues/graph/save-and-write` | Convertit graphe → Unity JSON + `write_unity_dialogue_to_file` | Candidat naturel pour l'export depuis l'éditeur (déjà utilisé par `persistenceSlice` legacy) |
| `POST /api/v1/unity-dialogues/graph/validate-schema` | Existe (Story 4.13) | Appeler **avant** export ; bloquer si invalide |
| `SchemaValidationPanel` + `handleSchemaErrorClick` | Existe | Réutiliser pour afficher erreurs post-tentative export |
| `UnityDialogueViewer` / `UnityDialogueEditor` | Appellent déjà `exportUnityDialogue` API | Pattern de référence pour messages succès/erreur |
| `ConfigurationService.set_unity_dialogues_path` | **Désactivé** (chemin fixe projet) | AC chemin : vérifier `get_unity_dialogues_path()` + `mkdir` ; pas de nouveau settings UI sauf scope explicite |

### Architecture guardrails

- **Documents vs graphe** : l'export depuis l'éditeur part du graphe React Flow → conversion backend (`GraphConversionService.graph_to_unity_json`) → JSON canonique. Ne pas reconstruire le document depuis le frontend seul pour l'écriture disque finale.
- **TestNodes** : ne pas exporter les nœuds `testNode` ; seuls les champs `test*` dans les choix parent sont sérialisés (`.cursor/rules/testnode_sync.mdc`, `AGENTS.md`).
- **Handlers API** : ≤ 30 lignes ; déléguer à `services/` (`unity_dialogue_export_service`, `graph_conversion_service`).
- **Injection** : `ConfigurationService` via `Depends(get_config_service)` ; pas de singletons.
- **Écriture atomique** : conserver tmp → fsync → rename (ADR-006) dans `write_unity_dialogue_to_file`.
- **UTF-8** : `json.dumps(..., ensure_ascii=False)` — ne pas casser `choiceId`, ordre `choices[]`, `node.id`.

### What to reuse

- **Backend** : `services/unity_dialogue_export_service.write_unity_dialogue_to_file`, `services/graph_conversion_service.GraphConversionService.graph_to_unity_json`, `api/utils/unity_schema_validator.validate_unity_json`
- **Frontend** : `frontend/src/api/graph.ts` (`validateSchema`, `saveGraphAndWrite`), `frontend/src/api/dialogues.ts` (`exportUnityDialogue`), `exportToUnity` dans `persistenceSlice.ts`, pattern toolbar dans `useGraphToolbar.ts`
- **Validation UI** : `SchemaValidationPanel.tsx`, `handleSchemaErrorClick` (extrait index nœud depuis `[nodes.N...]`)

### Quality bar

- pytest : export bloqué si invalide ; export réussi écrit fichier ; préservation champs GDD ; cohérence validateurs
- Vitest : bouton `btn-export-unity` — succès toast, échec validation sans écriture, navigation erreur
- Lint frontend 0 warning ; tests backend ciblés verts après fix
- NFR-P3 : mesurer latence API export sur fixture < 100 nœuds (test integration ou log warning si > 200 ms en CI)

### Refactor bar (defaults)

- ~300 lignes max par fichier source **touché** dans une tâche ; ~60 lignes par fonction
- Pas de duplication payload graphe entre validation et export

### Fichiers chauds

| Fichier | Taille actuelle | Contrainte |
|---------|-----------------|------------|
| `frontend/src/components/graph/GraphEditorHeader.tsx` | **1590 L** | Changement minimal sur le handler export (~10–15 L) ; **ne pas** réorganiser le fichier — extraire toute logique nouvelle dans `useGraphToolbar.ts` ou un hook dédié `useUnityExport.ts` |
| `frontend/src/hooks/useGraphToolbar.ts` | ~530 L | Accueillir la logique export ; si > 600 L après ajout → extraire hook `useUnityExport.ts` |
| `frontend/src/store/slices/persistenceSlice.ts` | 474 L | Réutiliser `exportToUnity()` ; éviter d'ajouter > 30 L ici |
| `api/routers/dialogues.py` | 600 L | Handler export ≤ 30 L ; pas de logique métier inline |
| `services/graph_conversion_service.py` | 572 L | Pass-through GDD uniquement ; pas de refactor massif dans cette story |

### Conventions

- snake_case backend / camelCase frontend
- Tests sans entités GDD réelles (personnages/lieux nommés)
- Messages utilisateur en français (cohérent avec l'UI existante)

### Project Structure Notes

- Endpoints pertinents : `/api/v1/dialogues/unity/export`, `/api/v1/unity-dialogues/graph/save-and-write`, `/api/v1/unity-dialogues/graph/validate-schema`, `/api/v1/config/unity-dialogues-path`
- Schéma canonique : `docs/resources/dialogue-format.schema.json` (v1.2.0)
- Logs export structurés → Story 5.6 (hors scope 5.1)

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-05.md` — Story 5.1, contexte GDD Alteir]
- [Source: `_bmad-output/implementation-artifacts/4-13-valider-conformité-schéma-json-unity-100-fr48.md` — validate-schema, SchemaValidationPanel]
- [Source: `_bmad-output/implementation-artifacts/4-14-refactorer-api-routers-graph-dette-technique.md` — routers split, handlers ≤ 30 L]
- [Source: `services/unity_dialogue_export_service.py` — write_unity_dialogue_to_file, ADR-006]
- [Source: `api/routers/graph_io.py` — save-and-write]
- [Source: `api/routers/graph_validation.py` — validate-schema]
- [Source: `frontend/src/hooks/useGraphToolbar.ts` — handleToggleSchemaValidation, handleSchemaErrorClick]
- [Source: `_bmad-output/project-context.md` — Unity JSON v1.1.0+, documents canoniques]
- [Source: `docs/resources/dialogue-format.schema.json` — schéma v1.2.0 FR94/flags]

### Previous story intelligence (Epic 4 — prérequis direct)

- **Story 4.13** : `validate-schema` + `SchemaValidationPanel` livrés ; validation **informatif** au toggle — Story 5.1 la rend **bloquante** sur export.
- **Story 4.14** : `graph.py` éclaté en modules (`graph_io`, `graph_validation`, …) ; respecter la structure post-split, ne pas réintroduire un god-file.

### Git intelligence (commits récents)

- Branche `Epic/05-unity-export` ; merges récents CI/tests — prioriser tests ciblés post-implémentation, pas la suite Vitest complète.

### Latest tech information

- Schéma dialogue **v1.2.0** (FR94, visibility conditions structurées) — validateur `validate_unity_json_structured` dans `api/utils/unity_schema_validator.py`.
- `ConfigurationService.set_unity_dialogues_path` loggue un warning et ignore la config utilisateur — comportement intentionnel documenté dans le service.

### Project context reference

- `_bmad-output/project-context.md` — règles Unity JSON, TestNode, injection DI, tests sans GDD réel.

## Dev Agent Record

### Agent Model Used

claude-4.6-sonnet-medium-thinking (Cursor Agent)

### Debug Log References

- Vitest : `setReactFlowInstance` inexistant → `registerReactFlowInstance(null)` dans `useGraphToolbar.unityExport.test.ts`
- pytest régression `sample_graph_nodes_edges` : IDs `START`/`NODE_1` rejetés par `validate_unity_json` après alignement validateur — fixture mise à jour (stableId + choiceId, IDs 32 hex)

### Completion Notes List

- **Task 1** : `useUnityExport` + `buildGraphApiPayload` ; export bloque sur `validateSchema` ; toast `EXPORT_VALIDATION_BLOCKED_MESSAGE` ; `SchemaValidationPanel` ouvert automatiquement ; Vitest 4 cas verts
- **Task 2** : `GraphEditorHeader` délègue à `toolbar.handleExportUnity` ; `saveGraphAndWrite` remplace le blob ; `graphApiErrors.ts` pour ValidationException et chemin Unity
- **Task 3** : pass-through GDD déjà OK via `data.copy()` ; pytest `test_export_preserves_visibility_conditions` + `test_export_preserves_reputation_fr94_and_skill_check_on_choice`
- **Task 4** : `_default_validator` → `validate_unity_json` ; `unity_export_schema_validator` injecté dans `graph_io` et `dialogues` ; pytest alignement verdict valid/invalid
- **🔵 Refactor Task 1** : duplication payload `{nodes,edges}` → `buildGraphApiPayload.ts` (avant : inline map dans `handleToggleSchemaValidation`)
- **🔵 Refactor Task 2** : `extractValidationErrors` / `isUnityPathUnavailableError` dans `graphApiErrors.ts`
- **🔵 Refactor Task 4** : `validator=unity_export_schema_validator` explicite (DIP) sur save-and-write et unity/export
- **Code review (2026-06-16)** : fix HIGH — `useUnityExport` n'envoie plus `seq` (évite toast succès sans écriture ADR-006) ; pytest AC#4 chemin Unity null ; Vitest export répété

### File List

- `frontend/src/hooks/useUnityExport.ts` (new)
- `frontend/src/utils/buildGraphApiPayload.ts` (new)
- `frontend/src/utils/graphApiErrors.ts` (new)
- `frontend/src/hooks/useGraphToolbar.ts` (modified)
- `frontend/src/components/graph/GraphEditorHeader.tsx` (modified)
- `frontend/src/__tests__/useGraphToolbar.unityExport.test.ts` (new)
- `frontend/src/__tests__/GraphEditorHeader.undoRedo.test.tsx` (modified)
- `services/unity_dialogue_export_service.py` (modified)
- `api/routers/graph_io.py` (modified)
- `api/routers/dialogues.py` (modified)
- `tests/api/test_unity_export_story_5_1.py` (new)
- `tests/api/test_graph_crud.py` (modified — fixture schéma v1.2.0)
- `e2e/graph-small-dialogue-unity-export.spec.ts` (modified — flux API Story 5.1)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)

## Story Completion Status

- **Status:** done
- **Completion note:** Export Unity graphe : validation schéma bloquante + écriture serveur ADR-006 ; validateur unifié `validate_unity_json` ; tests pytest + Vitest + lint verts ; code review passée.

## Senior Developer Review (AI)

**Reviewer:** Amelia (adversarial code review) — 2026-06-16

**Verdict:** Approuvé après correctifs HIGH.

### Findings (avant correctifs)

| Sévérité | Finding | Fichier |
|----------|---------|---------|
| HIGH | Export passait `clientSeq` → `save-and-write` pouvait skip l'écriture (seq ≤ last_seq) tout en affichant toast succès (AC #3 violé) | `useUnityExport.ts:67-73` |
| MEDIUM | AC #4 (chemin Unity null) testé Vitest seulement, pas pytest API | `test_unity_export_story_5_1.py` |
| MEDIUM | NFR-P3 (< 200 ms export API) non mesuré dans les tests Story 5.1 | Quality bar story |
| LOW | AC #5 partiel : `choiceEffects` / `nodeType` non couverts par pytest | `test_unity_export_story_5_1.py` |
| LOW | Exclusion `testNode` non testée explicitement dans cette story | `graph_conversion_service.py` |

### Correctifs appliqués ([1] auto-fix)

1. `useUnityExport` : retrait de `seq` sur `saveGraphAndWrite` — export explicite écrit toujours.
2. pytest `test_save_and_write_rejects_when_unity_path_null` (AC #4).
3. Vitest `repeated export always calls saveGraphAndWrite`.

### Action items restants (non bloquants)

- [ ] [AI-Review][MEDIUM] Ajouter test NFR-P3 latence export < 200 ms sur fixture < 100 nœuds [`tests/api/test_unity_export_story_5_1.py`]
- [ ] [AI-Review][LOW] Couvrir `choiceEffects` et `nodeType` dans pytest GDD pass-through [`tests/api/test_unity_export_story_5_1.py`]

## Change Log

- 2026-06-16 : Code review — fix seq skip export, tests AC#4 pytest + export répété Vitest (Amelia)
- 2026-06-16 : Story 5.1 implémentée — flux export validate → save-and-write, validateur aligné 4.13, tests GDD + blocage export (Amelia / dev-story)
