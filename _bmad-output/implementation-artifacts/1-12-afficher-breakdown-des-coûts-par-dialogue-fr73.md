# Story 1.12: Afficher breakdown des coûts par dialogue (FR73)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur générant des dialogues**,
I want **voir le breakdown détaillé des coûts par dialogue (coût total, coût par nœud)**,
so that **je peux analyser où mes coûts LLM sont concentrés et optimiser mes générations**.

## Acceptance Criteria

1. **Given** j'ai généré plusieurs nœuds dans un dialogue  
   **When** j'ouvre le panneau "Coûts" du dialogue  
   **Then** je vois : coût total dialogue (€), nombre de nœuds générés, coût moyen par nœud  
   **And** un graphique montre la distribution des coûts (bar chart par nœud)

2. **Given** je consulte le breakdown de coûts  
   **When** je clique sur un nœud dans le graphique  
   **Then** les détails du nœud s'affichent : tokens prompt, tokens completion, coût exact, timestamp génération  
   **And** le node_id correspondant est visible

3. **Given** j'ai plusieurs dialogues dans le système  
   **When** je compare les coûts entre dialogues  
   **Then** je peux trier les dialogues par coût total (plus cher → moins cher)  
   **And** un indicateur visuel montre les dialogues les plus coûteux (rouge = cher, vert = économique)

4. **Given** je génère un nouveau nœud dans un dialogue existant  
   **When** le nœud est généré  
   **Then** le breakdown de coûts est mis à jour automatiquement  
   **And** le coût total dialogue augmente du coût du nouveau nœud

5. **Given** je supprime un nœud d'un dialogue  
   **When** le nœud est supprimé  
   **Then** le coût du nœud supprimé reste dans l'historique (pas supprimé du breakdown)  
   **And** un indicateur "Nœud supprimé" s'affiche à côté du coût dans le breakdown

## Tasks / Subtasks

- [x] Task 1 : Extension minimale du schéma `LLMUsageRecord` (AC: #1, #2, #4)
  - [x] Ajouter `dialogue_id: Optional[str] = None` et `node_id: Optional[str] = None` à `models/llm_usage.py` (champs optionnels, non-breaking)
  - [x] Mettre à jour `services/repositories/llm_usage_repository.py` pour persister/lire ces nouveaux champs
  - [x] Étendre la signature de `LLMUsageService.track_usage()` avec `dialogue_id` et `node_id` optionnels
  - [x] Mettre à jour `api/schemas/llm_usage.py` : ajouter `dialogue_id` / `node_id` dans `LLMUsageRecordResponse`
  - [x] Mettre à jour `frontend/src/api/llmUsage.ts` : ajouter `dialogue_id?` / `node_id?` dans `LLMUsageRecord`

- [x] Task 2 : Propagation du contexte dialogue/nœud dans le flux de génération (AC: #4)
  - [x] Identifier le point d'injection dans `api/routers/graph.py` (endpoint `/generate-node`) : après génération réussie, appeler une méthode `annotate_usage(request_id, dialogue_id, node_id)` sur `LLMUsageService`
  - [x] Ajouter `LLMUsageService.annotate_usage(request_id, dialogue_id, node_id)` : retrouve l'enregistrement par `request_id` et met à jour ses champs `dialogue_id` / `node_id`
  - [x] ⚠️ Ne pas modifier `core/llm/openai/client.py` ni `core/llm/mistral_client.py` : ces clients ne connaissent pas le contexte dialogue — utiliser le pattern post-hoc annotation via le `request_id` qui est déjà disponible dans le router

- [x] Task 3 : Endpoint API `GET /api/v1/llm-usage/dialogue/{dialogue_id}/costs` (AC: #1, #2, #3)
  - [x] Ajouter dans `api/routers/llm_usage.py` l'endpoint `GET /dialogue/{dialogue_id}/costs`
  - [x] Retourner : `dialogue_id`, `total_cost_eur`, `node_count`, `avg_cost_per_node_eur`, `breakdown: list[NodeCostEntry]`
  - [x] `NodeCostEntry` : `node_id`, `timestamp`, `model_name`, `prompt_tokens`, `completion_tokens`, `cost_eur`, `success`, `deleted: bool = False`
  - [x] Ajouter schémas `DialogueCostResponse` et `NodeCostEntry` dans `api/schemas/llm_usage.py`
  - [x] Conversion USD → EUR avec `_USD_TO_EUR_RATE = 0.92` (pattern établi en Story 1.11)
  - [x] Ajouter méthode `LLMUsageService.get_dialogue_costs(dialogue_id: str)` → agrégation + tri par timestamp

- [x] Task 4 : Composant frontend `DialogueCostBreakdown.tsx` (AC: #1, #2, #3, #5)
  - [x] Créer `frontend/src/components/usage/DialogueCostBreakdown.tsx`
  - [x] Afficher : coût total (€), nœuds générés, coût moyen ; bar chart CSS (même pattern que UsageDashboard.tsx — pas de nouvelle dépendance)
  - [x] Clic sur barre → tooltip détails nœud (tokens, coût, timestamp, model_name)
  - [x] Indicateur couleur : vert (<0.01€/nœud), orange (0.01–0.05€), rouge (>0.05€)
  - [x] Ajouter `getDialogueCosts(dialogueId: string)` dans `frontend/src/api/llmUsage.ts`

- [x] Task 5 : Intégration dans l'UI dialogue (AC: #1, #4)
  - [x] Ajouter bouton "💰 Coûts" dans la toolbar de `GraphEditor.tsx` (panneau overlay en bas à gauche)
  - [x] Utiliser `useQuery` (TanStack React Query) pour `getDialogueCosts(dialogueId)` avec refetch après génération

- [x] Task 6 : Tests (AC: tous)
  - [x] Unit backend : `LLMUsageService.get_dialogue_costs()` (agrégation, coûts, conversion EUR)
  - [x] Unit backend : `LLMUsageService.annotate_usage()` (mise à jour record par request_id)
  - [x] Integration : `GET /api/v1/llm-usage/dialogue/{id}/costs` (réponse format, coûts agrégés)
  - [x] Frontend unit : `DialogueCostBreakdown.tsx` (rendu, click tooltip, indicateurs couleur)

## Dev Notes

### Contexte Epic et Story

**Epic 1 : Amélioration et peaufinage de la génération de dialogues**
- **Objectif :** Réduire la friction dans le workflow de génération, améliorer la qualité et donner plus de contrôle à l'utilisateur.
- **Story 1.12 — Priorité C (Nice-to-have)** : Analytics coûts par dialogue. Utile pour optimisation budgétaire, pas critique pour workflow principal.
- **FR73** : Afficher breakdown des coûts par dialogue.

### ⚠️ Prérequis Critique — Relation avec Story 1.15

**Story 1.15** doit ultimement ajouter `dialogue_id`, `node_id`, `prompt`, `response` à `LLMUsageRecord` et étendre `track_usage()`. **Cette story (1.12) implémente le sous-ensemble minimal** (`dialogue_id`, `node_id`) pour ne pas bloquer et éviter la duplication de travail ultérieur.

**Decision :** Plutôt que de modifier les LLM clients (`core/llm/openai/client.py`, `core/llm/mistral_client.py`) — qui ne connaissent pas le contexte dialogue — on utilise une **annotation post-hoc** via `request_id` :
1. Le LLM client appelle `track_usage(request_id=...)` sans dialogue/node context (inchangé)
2. Le router graph (`/generate-node`) possède `dialogue_id` et `node_id` → appelle `usage_service.annotate_usage(request_id, dialogue_id, node_id)` juste après la génération
3. Cette approche préserve l'architecture existante (les clients LLM restent sans dépendance sur le domaine dialogue)

**Risque :** Si le `request_id` n'est pas retrouvable dans le repository (ex. déjà flush sur disque), `annotate_usage()` doit gérer ce cas silencieusement (log warning, no-op).

### Vérification Codebase Existant

**✅ À Étendre (non-breaking) :**

1. **`models/llm_usage.py`** (EXISTE)
   - Ajouter `dialogue_id: Optional[str] = None` et `node_id: Optional[str] = None`
   - Champs optionnels → rétrocompatibilité totale avec données existantes

2. **`services/llm_usage_service.py`** (EXISTE)
   - `track_usage()` : ajouter `dialogue_id: Optional[str] = None`, `node_id: Optional[str] = None` à la signature
   - Ajouter `annotate_usage(request_id, dialogue_id, node_id)` : retrouve l'enregistrement du jour, met à jour les champs
   - Ajouter `get_dialogue_costs(dialogue_id: str) -> dict` : agrège les enregistrements filtrés par `dialogue_id`

3. **`services/repositories/llm_usage_repository.py`** (EXISTE — chemin à vérifier)
   - Vérifier si la sérialisation JSON des records inclut automatiquement les nouveaux champs (Pydantic v2 → oui avec `model_dump()`)
   - Ajouter méthode `get_by_dialogue_id(dialogue_id: str) -> List[LLMUsageRecord]`

4. **`api/routers/llm_usage.py`** (EXISTE)
   - Ajouter endpoint `GET /dialogue/{dialogue_id}/costs`
   - Namespace déjà préfixé `/api/v1/llm-usage` dans `api/main.py`

5. **`api/schemas/llm_usage.py`** (EXISTE — à vérifier)
   - Ajouter `DialogueCostResponse`, `NodeCostEntry`
   - Ajouter `dialogue_id?: string`, `node_id?: string` dans `LLMUsageRecordResponse`

6. **`api/routers/graph.py`** (EXISTE)
   - Après génération réussie de nœud : appeler `usage_service.annotate_usage(request_id, dialogue_id, node_id)`
   - `dialogue_id` et `node_id` sont déjà dans le body de `GenerateNodeRequest`

7. **`frontend/src/api/llmUsage.ts`** (EXISTE)
   - Étendre `LLMUsageRecord` : ajouter `dialogue_id?: string`, `node_id?: string`
   - Ajouter fonction `getDialogueCosts(dialogueId: string): Promise<DialogueCostResponse>`

**❌ À Créer :**

1. **`frontend/src/components/usage/DialogueCostBreakdown.tsx`** (NOUVEAU)
   - Composant de breakdown par dialogue avec graphique + détails

**⚠️ Ne pas créer :**
- `CostTrackingService` : n'existe pas dans le projet, ne pas créer — utiliser `LLMUsageService` (existant)
- Namespace `/api/v1/dialogues/{id}/costs` : mauvais namespace — utiliser `/api/v1/llm-usage/dialogue/{id}/costs`

### Architecture et Patterns

**Backend — Conversion USD → EUR :**
- Utiliser `_USD_TO_EUR_RATE = 0.92` (pattern établi dans `api/routers/graph.py` Story 1.11, `EstimateCostResponse`)
- Le champ `estimated_cost` dans `LLMUsageRecord` est en USD → convertir à la volée dans `get_dialogue_costs()`

**Backend — Injection dépendance :**
- `get_llm_usage_service` déjà exposé dans `api/dependencies.py` → réutiliser dans le nouveau endpoint
- Pour l'appel `annotate_usage()` dans `graph.py` : injecter `LLMUsageService` via `Depends(get_llm_usage_service)` (déjà disponible ou à ajouter à la liste des dépendances du router)

**Frontend — Bibliothèque graphique :**
- Vérifier `frontend/package.json` pour `recharts` (utilisé dans `UsageDashboard.tsx`)
- Si absent : utiliser Chart.js (`chart.js` + `react-chartjs-2`) — déjà référencé dans les CDN du projet
- Privilégier la bibliothèque déjà installée pour éviter une nouvelle dépendance

**Frontend — TanStack Query :**
- Pattern établi : `useQuery({ queryKey: ['dialogue-costs', dialogueId], queryFn: () => getDialogueCosts(dialogueId) })`
- Invalider via `queryClient.invalidateQueries(['dialogue-costs', dialogueId])` dans le callback de succès de génération

**Risque bug nœuds invisibles (1.17) :** Aucun — cette US ne modifie pas l'affichage des nœuds dans le graphe (uniquement endpoint API + composant dashboard coûts).

### Intelligence Story Précédente (1.11)

Learnings clés à réutiliser :
- Pattern conversion `_USD_TO_EUR_RATE = 0.92` déjà en place dans `api/routers/graph.py`
- `LLMPricingService` (`services/llm_pricing_service.py`) réutilisable pour afficher les prix du modèle
- Pattern `useCostGovernance()` pour afficher warning budget si coût dialogue approche la limite
- `UsageDashboard.tsx` est le composant de référence pour les graphiques de coûts (pattern, style, bibliothèques utilisées) — inspecter avant de créer `DialogueCostBreakdown.tsx`
- Les tests d'intégration pour les endpoints `llm-usage` se trouvent dans `tests/api/` — suivre le même pattern que `test_graph_estimate_cost.py`

### Git Intelligence

Derniers commits pertinents :
- `ea442b0 feat: enhance cost estimation features and frontend integration` → Story 1.11 terminée ; `CostEstimationBadge.tsx` et `AIGenerationPanel.tsx` mis à jour
- `4c3e63a feat: implement cost estimation for LLM generation` → `TokenEstimationService`, `EstimateCostRequest/Response`, patterns de test

Ces commits établissent les patterns pour les schemas de coût et les tests d'intégration à suivre.

### Project Structure Notes

- **Backend :** `models/llm_usage.py`, `services/llm_usage_service.py`, `services/repositories/llm_usage_repository.py`, `api/routers/llm_usage.py`, `api/schemas/llm_usage.py`, `api/routers/graph.py` (ajout `annotate_usage`)
- **Frontend :** `frontend/src/components/usage/DialogueCostBreakdown.tsx` (nouveau), `frontend/src/api/llmUsage.ts` (étendu), composant d'intégration dans l'éditeur graphe (emplacement à déterminer)
- **Tests :** `tests/services/test_llm_usage_service.py` (étendre), `tests/api/test_llm_usage.py` (nouveau ou étendre)
- **Alignement :** Namespace `/api/v1/llm-usage` respecté ; pas de nouveau router

### Testing Standards

- **Unit backend :** `LLMUsageService.get_dialogue_costs()` — mock repository, vérifier agrégation coûts + conversion EUR
- **Unit backend :** `LLMUsageService.annotate_usage()` — vérifier mise à jour champs `dialogue_id`/`node_id` par `request_id`
- **Integration :** `GET /api/v1/llm-usage/dialogue/{id}/costs` — body valide, réponse conforme schéma, cas vide (0 records)
- **Frontend :** `DialogueCostBreakdown.test.tsx` — rendu (données vides, données valides), clic barre → tooltip, indicateurs couleur
- **Règles :** Tous tests existants doivent rester verts. Mocker `LLMUsageService` dans tests router. Pas de dépendance sur personnages/lieux GDD réels.

### References

- **FR73 :** Afficher breakdown des coûts par dialogue
- **Epic 0 Story 0.7 :** Cost governance (budget, warning, blocage) — `CostGovernanceService`
- **Story 1.11 :** Estimation coût (patterns USD→EUR, `CostEstimationBadge`, tests intégration)
- **Story 1.13 :** Coûts cumulatifs (Done) — `UsageDashboard.tsx` référence graphique
- **Story 1.15 :** Logs génération (sera implémentée après ; étendra le schéma avec `prompt`/`response` sur la base des champs `dialogue_id`/`node_id` créés ici)
- **[Source: _bmad-output/planning-artifacts/epics/epic-01.md#story-112]**
- **[Source: _bmad-output/project-context.md]**

## Dev Agent Record

### Agent Model Used

Bob (SM Agent) — workflow create-story (yolo mode).
Amelia (Dev Agent) — workflow dev-story, 2026-03-06.

### Debug Log References

Aucun blocage critique. Note: `recharts` absent du `package.json` — bar chart CSS réutilisé depuis `UsageDashboard.tsx` (aucune nouvelle dépendance).

### Completion Notes List

- **Task 1** : `dialogue_id`, `node_id` et `deleted` ajoutés comme champs optionnels/par défaut dans `LLMUsageRecord`, `LLMUsageRecordResponse`, `FileLLMUsageRepository` (avec `get_by_request_id`, `update`, `get_by_dialogue_id`, `mark_node_deleted`, `get_all_by_dialogue_ids`), `LLMUsageService.track_usage()` et frontend `LLMUsageRecord`.
- **Task 2** : `annotate_usage()` implémenté. Fix critique : `request_id` maintenant passé à `LLMClientFactory.create_client()` dans `generate_node` et `regenerate_node` — sans ce fix, l'annotation était non-fonctionnelle en production (LLM client utilisait `"unknown"` comme request_id).
- **Task 3** : Endpoint `GET /api/v1/llm-usage/dialogue/{dialogue_id}/costs` avec schémas `DialogueCostResponse` et `NodeCostEntry`. Nouveaux endpoints : `GET /dialogues/costs` (AC#3 multi-dialogue) et `POST /nodes/{node_id}/mark-deleted` (AC#5). Conversion USD→EUR.
- **Task 4** : `DialogueCostBreakdown.tsx` avec vue single-dialogue et vue comparaison multi-dialogues (AC#3). `AllDialoguesComparison` : liste triée par coût desc, indicateurs couleur vert/orange/rouge par dialogue. `markNodeDeleted` appelé depuis `rejectNode` (AC#5 — deleted=True dans le breakdown).
- **Task 5** : Bouton "💰 Coûts" dans toolbar `GraphEditor.tsx`. `invalidateQueries(['dialogue-costs', ...])` ajouté dans le callback `onGenerated` pour rafraîchissement automatique (AC#4 fix). `useQueryClient` importé.
- **Task 6** : 23 tests backend (unit + intégration) — tous verts. Fix M2 : endpoint history expose désormais `dialogue_id`/`node_id`.

### File List

- `models/llm_usage.py` — ajout `dialogue_id`, `node_id`, `deleted`
- `services/llm_usage_service.py` — extension `track_usage()`, ajout `annotate_usage()`, `get_dialogue_costs()`, `mark_node_deleted()`, `get_all_dialogues_costs()`
- `services/repositories/llm_usage_repository.py` — ajout `get_by_request_id()`, `update()`, `get_by_dialogue_id()`, `mark_node_deleted()`, `get_all_by_dialogue_ids()` (interface + implémentation)
- `api/schemas/llm_usage.py` — ajout `NodeCostEntry`, `DialogueCostResponse`, `DialogueCostSummaryEntry`, `AllDialoguesCostResponse`, champs `dialogue_id`/`node_id` dans `LLMUsageRecordResponse`
- `api/schemas/graph.py` — ajout `dialogue_id` dans `GenerateNodeRequest`
- `api/routers/llm_usage.py` — endpoints `GET /dialogue/{id}/costs`, `GET /dialogues/costs`, `POST /nodes/{id}/mark-deleted`; fix history expose dialogue_id/node_id
- `api/routers/graph.py` — fix `request_id` passé à `LLMClientFactory`, appel `annotate_usage` post-génération
- `frontend/src/api/llmUsage.ts` — ajout `NodeCostEntry`, `DialogueCostResponse`, `DialogueCostSummaryEntry`, `AllDialoguesCostResponse`, `getDialogueCosts()`, `getAllDialoguesCosts()`, `markNodeDeleted()`
- `frontend/src/types/graph.ts` — ajout `dialogue_id` dans `GenerateNodeRequest`
- `frontend/src/store/slices/generationSlice.ts` — passage `dialogue_id` dans `generateNode()`, appel `markNodeDeleted` dans `rejectNode`
- `frontend/src/components/usage/DialogueCostBreakdown.tsx` — composant single-dialogue + vue comparaison `AllDialoguesComparison` (AC#3)
- `frontend/src/components/usage/DialogueCostBreakdown.css` — styles du composant + styles vue comparaison
- `frontend/src/components/usage/DialogueCostBreakdown.test.tsx` — 11 tests
- `frontend/src/components/graph/GraphEditor.tsx` — bouton "💰 Coûts", `useQueryClient`, `invalidateQueries` post-génération
- `tests/services/test_llm_usage_service.py` — 10 nouveaux tests
- `tests/api/test_llm_usage.py` — 7 nouveaux tests
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `1-12-...` → `done`
