# Story 5.3: Valider JSON exporté contre schéma Unity custom (FR51)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur exportant des dialogues**,
I want **valider le JSON exporté contre le schéma Unity custom avec des erreurs compréhensibles et des règles GDD**,
so that **je peux garantir 100 % de conformité avant intégration Unity**.

## Acceptance Criteria

1. **Given** un dialogue (graphe ouvert ou document persisté) est prêt à exporter, **When** la validation schéma est lancée (manuelle via panneau ou automatique avant export/batch), **Then** le JSON Unity est validé contre le schéma strict v1.2.0 (`docs/resources/dialogue-format.schema.json`), **And** les règles GDD bloquantes s'appliquent en plus du JSON Schema (notamment : aucun `RepPalier*` dans `dialogueFlags`), **And** le verdict est identique pour `validate-schema`, `write_unity_dialogue_to_file` et export batch (une seule source de vérité).
2. **Given** le JSON contient une erreur de type schéma (ex. type incorrect, champ manquant, `choiceId` absent), **When** la validation est lancée, **Then** chaque erreur bloquante s'affiche au format lisible « Erreur schéma Unity : champ 'X' a type incorrect (attendu Y, reçu Z) » ou équivalent français pour les autres codes, **And** le nœud concerné est identifié quand le chemin JSON le permet (`nodeId` ou index résolu), **And** un clic sur l'erreur focalise le nœud dans l'éditeur (comportement existant `handleSchemaErrorClick` étendu si besoin).
3. **Given** le JSON est conforme au schéma et aux règles GDD bloquantes, **When** la validation est lancée, **Then** le panneau affiche « Schéma Unity : 100 % conforme » (badge vert), **And** l'export peut être lancé sans risque d'erreur de format.
4. **Given** plusieurs erreurs de schéma sont détectées, **When** la validation est lancée, **Then** toutes les erreurs sont listées avec résumé « X erreur(s) de schéma détectée(s) », **And** chaque entrée expose au minimum : message utilisateur, chemin/champ, nœud si résolvable.
5. **Given** un dialogue dépasse les seuils GDD de maintenabilité (> 1000 nœuds, > 10 flags conversationnels, ou > 3 compteurs dans `dialogueFlags`), **When** la validation est lancée, **Then** des **avertissements non bloquants** sont retournés et affichés séparément des erreurs (section « Avertissements »), **And** l'export reste autorisé si aucune erreur bloquante.
6. **Given** je consulte le schéma Unity de référence depuis l'éditeur, **When** j'ouvre « Schéma Unity de référence » (depuis le panneau validation ou menu associé), **Then** une vue lisible présente : version du schéma, champs requis principaux, types autorisés, lien vers la source canonique, **And** je peux fermer la vue sans quitter l'éditeur.
7. **Given** un dialogue est listé dans la bibliothèque sans être ouvert dans le graphe, **When** je lance une validation document (endpoint document par `document_id`), **Then** le même pipeline de validation s'applique au JSON persisté sur disque, **And** le resultat utilise le même format d'erreurs/avertissements que la validation graphe.
8. **Tests** : pytest validateur enrichi + endpoint document + non-régression validate-schema/export/batch ; Vitest panneau (messages FR, avertissements, viewer schéma) ; lint frontend 0 régression.

## Tasks / Subtasks

- [x] Task 1 : Pipeline de validation export unifié avec règles GDD bloquantes (AC: #1, #2)
  - [x] 🔴 Test échoue : document avec `dialogueFlags[{ flagId: "RepPalierHostilite", ... }]` → `is_valid=false`, erreur code `reputation_palier_runtime_only` ; document avec choice sans `choiceId` → message utilisateur contient « Erreur schéma Unity » et mentionne le champ ; même fixture → `validate-schema`, `write_unity_dialogue_to_file` et batch export (validation on) retournent le même verdict
  - [x] 🟢 Centraliser la validation export dans un service dédié (ex. `services/unity_export_validation_service.py`) qui compose `validate_unity_json_structured` + `validate_dialogue_flags_do_not_store_rep_palier` + formatage messages FR (voir Dev Notes)
  - [x] 🔵 Refactor : extraire le formatage jsonschema → message français dans un module pur testable (`unity_schema_error_formatter.py` ou helpers dans le service) ; éviter de gonfler `unity_schema_validator.py` au-delà de ~250 L — déplacer la composition GDD hors du validateur bas niveau

- [x] Task 2 : Avertissements GDD non bloquants séparés des erreurs (AC: #5)
  - [x] 🔴 Test échoue : document avec 11 flags conversationnels ou 4 compteurs → `is_valid=true`, `warnings` non vide mentionnant le seuil dépassé ; document avec 1001 nœuds → avertissement performance/maintenabilité ; export batch avec warnings seuls → fichier écrit quand validation active
  - [x] 🟢 Étendre la réponse API validation avec `warnings: [{code, message, path?}]` en réutilisant `dialogue_flag_thresholds` et un seuil nœuds documenté (1000) — warnings n'empêchent pas l'export
  - [x] 🔵 Refactor : aligner constantes seuils frontend `dialogueFlagThresholds.ts` avec le service backend (une source documentée, pas de troisième copie magique) ; nommer les cas pytest par comportement (`test_validation_warns_when_flag_count_exceeds_gdd_threshold`)

- [x] Task 3 : Endpoint validation document persisté (AC: #7)
  - [x] 🔴 Test échoue : `POST /api/v1/dialogues/{document_id}/validate-schema` sur fixture JSON valide → `is_valid=true` ; même document corrompu (type invalide) → `is_valid=false` + erreurs formatées ; `document_id` inconnu → 404
  - [x] 🟢 Ajouter route + schémas Pydantic dans `api/routers/dialogues.py` (handler ≤ 30 L) lisant le blob document via le helper existant (`_read_document_blob` ou équivalent batch 5.2)
  - [x] 🔵 Refactor : factoriser lecture document + appel validateur entre batch export et validate-document dans le service (éviter triplication dans `batch_export_service.py`)

- [x] Task 4 : Panneau validation — erreurs enrichies, résumé et avertissements (AC: #2, #3, #4, #5)
  - [x] 🔴 Test échoue : `SchemaValidationPanel` avec erreurs formatées FR → résumé « 2 erreurs de schéma détectées », liste cliquable ; avec `warnings` seuls → section avertissements visible, badge vert ; `isValid=true` sans warnings → texte « Schéma Unity : 100 % conforme »
  - [x] 🟢 Étendre `ValidateSchemaResponse` (types TS + Pydantic) et `SchemaValidationPanel` pour consommer `errors` structurés + `warnings` ; conserver rétrocompat (`errors: string[]` dérivé ou champ parallèle selon contrat API choisi)
  - [x] 🔵 Refactor : extraire la liste d'erreurs/avertissements dans un sous-composant `SchemaValidationIssueList.tsx` pour garder `SchemaValidationPanel` < 200 L ; étendre `handleSchemaErrorClick` pour résoudre `nodeId` explicite en plus du pattern `[nodes.N]`

- [x] Task 5 : Viewer « Schéma Unity de référence » (AC: #6)
  - [x] 🔴 Test échoue : clic « Schéma Unity de référence » dans le panneau → modal/drawer affiche version schéma (ex. 1.2.0), sections clés (nodes, choices, visibilityConditions) et bouton fermer ; fermeture → panneau validation toujours accessible
  - [x] 🟢 Implémenter `UnitySchemaReferencePanel.tsx` + endpoint léger `GET /api/v1/unity-dialogues/schema` (métadonnées + extrait structuré) **ou** chargement statique documenté du fichier schéma — préférer endpoint si schéma absent en prod (voir `schema_exists()`)
  - [x] 🔵 Refactor : réutiliser `GraphToolFloatingShell` ou pattern drawer existant Epic 17 ; éviter d'embarquer les 400+ lignes JSON brutes dans le bundle — afficher table des sections + lien fichier source

## Dev Notes

### Écart actuel vs cible (ne pas réinventer)

| Composant | État actuel (Stories 4.13, 5.1, 5.2) | Delta Story 5.3 |
|-----------|--------------------------------------|-----------------|
| `validate_unity_json()` | JSON Schema + messages techniques `[path] message` | **Enrichir** format FR + composition GDD |
| `validate_unity_json_structured()` | Existe, utilisé PUT documents | **Brancher** sur pipeline export + API graphe |
| `POST .../graph/validate-schema` | Retourne `is_valid`, `errors: string[]`, `error_count` | **Étendre** avec `warnings`, erreurs structurées |
| `SchemaValidationPanel` | Badge vert/rouge, liste strings, clic → focus nœud | **Ajouter** résumé FR, warnings, lien schéma référence |
| `validate_dialogue_flags_do_not_store_rep_palier` | Existe dans `game_systems_reputation.py`, utilisé diagnostics | **Intégrer** au pipeline validation export (bloquant) |
| `dialogue_flag_thresholds` | Constantes 10 flags / 3 compteurs | **Émettre warnings** non bloquants |
| Export / batch | Validation bloquante schéma JSON uniquement | **Même pipeline** enrichi (erreurs + warnings) |
| `POST /dialogues/{id}/validate-schema` | **N'existe pas** | **Créer** pour bibliothèque / batch hors graphe |
| Viewer schéma référence | **N'existe pas** | **Créer** (AC epic 5.3) |

**Anti-scope :** ne pas recréer `SchemaValidationPanel` from scratch ; ne pas dupliquer la logique FR94 (skill checks, réputation) — seulement brancher les validateurs existants.

### Architecture guardrails

- **Source de vérité unique** : tout chemin export (`validate-schema`, `write_unity_dialogue_to_file`, `BatchExportService`) doit appeler le **même** service de validation export — pas de divergence validateur.
- **Erreurs vs avertissements** : seules les erreurs bloquent l'export ; warnings informatifs (seuils GDD, volumétrie).
- **Handlers API** : ≤ 30 lignes dans `dialogues.py` / `graph_validation.py` ; logique dans `services/`.
- **Documents vs graphe** : validation graphe = convertir puis valider ; validation document = lire blob `{schemaVersion, nodes}` directement.
- **Schéma fichier** : `docs/resources/dialogue-format.schema.json` v1.2.0 ; `load_unity_schema()` peut retourner `None` en prod — le viewer et l'API doivent gérer ce cas (message « schéma indisponible » + repli renderer).

### What to reuse

- **Backend** : `api/utils/unity_schema_validator.py` (`validate_unity_json_structured`, `load_unity_schema`, `schema_exists`), `services/game_systems_reputation.validate_dialogue_flags_do_not_store_rep_palier`, `services/dialogue_flag_thresholds`, `services/unity_dialogue_export_service.write_unity_dialogue_to_file` (injecter validateur enrichi), `services/batch_export_service.py` (remplacer appel validateur direct)
- **Frontend** : `SchemaValidationPanel`, `useGraphToolbar.handleToggleSchemaValidation`, `handleSchemaErrorClick`, `useUnityExport` (ouvrir panneau sur échec export), `graphApiErrors.ts` pour libellés batch, `buildGraphApiPayload.ts`
- **Patterns UI** : `GraphToolFloatingShell`, drawers Epic 17 si viewer large sur narrow

### Quality bar

- pytest : RepPalier bloquant ; message FR sur type incorrect ; warnings seuils ; endpoint document ; non-régression `test_unity_export_story_5_1` + `test_batch_export_*` + `TestValidateSchemaEndpoint`
- Vitest : panneau erreurs/warnings ; viewer schéma ouvert/fermé ; pas de données GDD réelles nommées
- Parité : si `errors` structurés ajoutés, le frontend doit afficher le message utilisateur, pas le brut jsonschema

### Refactor bar (defaults)

- ~300 lignes max par fichier touché ; ~60 lignes par fonction
- Nouveau code validation dans `services/unity_export_validation_service.py`, pas dans routers

### Fichiers chauds

| Fichier | Taille actuelle | Contrainte |
|---------|-----------------|------------|
| `frontend/src/hooks/useGraphToolbar.ts` | **527 L** | Pas de logique validation inline — extraire `useSchemaValidation.ts` si les états dépassent ~15 L ajoutées |
| `api/routers/dialogues.py` | **645 L** | Handler validate-document ≤ 30 L ; déléguer au service |
| `frontend/src/components/graph/GraphEditorHeader.tsx` | **1577 L** | **Aucun** nouveau bouton ici — lien schéma vit dans `SchemaValidationPanel` |
| `api/utils/unity_schema_validator.py` | 177 L | Garder validateur bas niveau ; composition GDD dans service dédié |

### Conventions

- Messages UI en français ; codes machine stables (`reputation_palier_runtime_only`, `schema_type_mismatch`, `gdd_flag_threshold_exceeded`)
- snake_case backend / camelCase frontend
- Tests nommés par comportement observable

### Project Structure Notes

- Nouveau probable : `services/unity_export_validation_service.py`, `tests/services/test_unity_export_validation_service.py`, `tests/api/test_validate_schema_document_story_5_3.py`
- Frontend : `UnitySchemaReferencePanel.tsx`, `SchemaValidationIssueList.tsx` (optionnel), types dans `frontend/src/types/graph.ts`, client API `graph.ts` / `dialogues.ts`
- Endpoint schéma : `api/routers/unity_dialogues.py` ou `graph_validation.py` selon regroupement existant

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-05.md` — Story 5.3, FR51, règles GDD]
- [Source: `_bmad-output/implementation-artifacts/4-13-valider-conformité-schéma-json-unity-100-fr48.md` — validate-schema, SchemaValidationPanel baseline]
- [Source: `_bmad-output/implementation-artifacts/5-1-exporter-dialogue-single-vers-format-unity-json-fr49.md` — validateur unifié export]
- [Source: `_bmad-output/implementation-artifacts/5-2-exporter-batch-plusieurs-dialogues-vers-unity-json-fr50.md` — batch + skip_validation]
- [Source: `docs/resources/dialogue-format.schema.json` — schéma v1.2.0]
- [Source: `services/game_systems_reputation.py` — `validate_dialogue_flags_do_not_store_rep_palier`]
- [Source: `services/dialogue_flag_thresholds.py` — seuils 10/3]
- [Source: `.cursor/rules/game_systems_integration.mdc` — interdit RepPalier dans dialogueFlags]
- [Source: `_bmad-output/project-context.md` — documents canoniques, injection DI]

### Previous story intelligence (Story 5.2 — prérequis direct)

- Batch utilise `validate_unity_json` par item ; option `skip_validation` en localStorage.
- `formatBatchExportFailureLabel` / `graphApiErrors.ts` — étendre pour erreurs formatées FR51.
- `preserve_source_fields=True` sur écriture batch — la validation doit lire le document **avant** transformation si champs racine (`dialogueFlags`) requis pour règles GDD.
- Ne pas toucher `GraphEditorHeader` pour batch — idem pour viewer schéma (dans panneau validation).

### Git intelligence (commits récents)

- Branche `Epic/05-unity-export` ; Stories 5.1 et 5.2 **done** ; travail récent orienté CI/stabilisation tests — exécuter pytest/Vitest ciblés post-implémentation.

### Latest tech information

- Schéma **v1.2.0** (visibilityConditions structurées, FR94) — pas de migration schéma dans cette story.
- `jsonschema` Draft-07 déjà utilisé ; formater `ValidationError.validator` / `instance` / `schema` pour messages « attendu Y, reçu Z ».
- Pas de nouvelle dépendance npm requise pour le viewer (fetch API schéma ou import JSON statique conditionnel).

### Project context reference

- `_bmad-output/project-context.md` — format document `{schemaVersion, nodes}`, handlers courts, tests sans GDD réel.

## Dev Agent Record

### Agent Model Used

claude-4.6-sonnet-medium-thinking (Amelia / dev-story)

### Debug Log References

- RED Task 1 : `ModuleNotFoundError: services.unity_export_validation_service` — attendu avant impl.
- Fixtures GDD warnings : nodes invalides sans `targetNode` → corrigé dans tests (choice + targetNode END, extra nodes avec nextNode).

### Completion Notes List

- Pipeline unifié `validate_unity_export_document` : JSON Schema structuré + RepPalier bloquant + warnings seuils (10 flags / 3 compteurs / 1000 nœuds).
- Formatage FR extrait dans `unity_schema_error_formatter.py` ; validateur bas niveau inchangé en taille.
- API : `ValidateSchemaResponse` étendu (`warnings`, `structured_errors`) ; graphe + document + export/batch alignés.
- Endpoint `POST /api/v1/dialogues/{document_id}/validate-schema` + `GET /api/v1/unity-dialogues/schema`.
- UI : `SchemaValidationIssueList`, `UnitySchemaReferencePanel`, `handleSchemaIssueClick` (node_id + path).
- 🔵 Refactor Task 1 : composition GDD hors `unity_schema_validator.py` → `unity_export_validation_service.py`.
- 🔵 Refactor Task 4 : liste erreurs/avertissements extraite ; panel ~175 L.
- Tests : pytest 22 verts (service + document + batch non-régression) ; Vitest SchemaValidationPanel 7/7 ; lint 0 warning.
- Code review [1] 2026-06-18 : dialogue_flags sur validate-schema/save-and-write graphe ; UI « Valider schéma » bibliothèque ; warnings export Unity ; unity_persisted_document_io ; handler document ≤30 L ; focus nœud via index Unity.

### File List

- `services/unity_export_validation_service.py` (new)
- `services/unity_schema_error_formatter.py` (new)
- `services/dialogue_flag_thresholds.py` (modified)
- `services/unity_dialogue_export_service.py` (modified)
- `services/batch_export_service.py` (modified)
- `api/routers/graph_validation.py` (modified)
- `api/routers/dialogues.py` (modified)
- `api/routers/unity_dialogues.py` (modified)
- `api/schemas/graph.py` (modified)
- `api/schemas/dialogue.py` (modified)
- `tests/services/test_unity_export_validation_service.py` (new)
- `tests/api/test_validate_schema_document_story_5_3.py` (new)
- `frontend/src/types/graph.ts` (modified)
- `frontend/src/constants/dialogueFlagThresholds.ts` (modified)
- `frontend/src/api/dialogues.ts` (modified)
- `frontend/src/api/unityDialogues.ts` (modified)
- `frontend/src/components/graph/SchemaValidationPanel.tsx` (modified)
- `frontend/src/components/graph/SchemaValidationIssueList.tsx` (new)
- `frontend/src/components/graph/UnitySchemaReferencePanel.tsx` (new)
- `frontend/src/components/graph/GraphEditor.tsx` (modified)
- `frontend/src/hooks/useGraphToolbar.ts` (modified)
- `frontend/src/__tests__/SchemaValidationPanel.test.tsx` (modified)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)
- `services/unity_persisted_document_io.py` (new — code review)
- `api/utils/validate_schema_api.py` (new — code review)
- `frontend/src/hooks/useDocumentSchemaValidation.ts` (new — code review)
- `frontend/src/utils/unityNodeIndexMap.ts` (new — code review)
- `frontend/src/components/unityDialogues/UnityDialogueList.tsx` (modified — lint deps, validation bibliothèque)

## Change Log

- 2026-06-18 : Code review — dialogueFlags graphe, UI validate document, warnings export, refactor IO/handler.
- 2026-06-18 : Story 5.3 — validation export unifiée FR51 (pipeline service, warnings GDD, endpoint document, viewer schéma, UI enrichie).

## Story Completion Status

- **Status:** done
- **Completion note:** Implémentation complète FR51 + correctifs code-review (dialogueFlags graphe, UI bibliothèque, warnings export, IO partagé).
