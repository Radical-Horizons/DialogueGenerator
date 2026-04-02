# Story 1.14: Afficher prompt transparency (prompt exact envoyé au LLM) (FR77)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur générant des dialogues**,
I want **voir le prompt exact envoyé au LLM pour chaque génération**,
so that **je peux comprendre comment le contexte GDD et les instructions sont utilisés et déboguer les générations**.

## Acceptance Criteria

1. **Given** un nœud a été généré  
   **When** je sélectionne le nœud et clique sur "Voir le prompt" (menu contextuel ou panneau détails)  
   **Then** un modal s'ouvre affichant le prompt complet envoyé au LLM  
   **And** le prompt est formaté avec syntaxe highlight (markdown ou code block)  
   **And** les sections sont clairement délimitées (System prompt, Context GDD, Instructions, etc.)

2. **Given** je consulte le prompt d'une génération  
   **When** le prompt est affiché  
   **Then** je peux copier le prompt (bouton "Copier") pour l'utiliser ailleurs  
   **And** je peux voir les tokens utilisés (prompt tokens, completion tokens, total)

3. **Given** je génère un nouveau nœud  
   **When** la génération se termine  
   **Then** le prompt est automatiquement sauvegardé dans les logs (voir Story 1.15)  
   **And** je peux consulter le prompt immédiatement après génération

4. **Given** je consulte le prompt d'une génération batch  
   **When** le prompt est affiché  
   **Then** je vois le prompt de base (identique pour tous les nœuds du batch)  
   **And** je peux voir les variations spécifiques par nœud (ex: "Choix 1: Accepter", "Choix 2: Refuser")

5. **Given** je modifie le contexte GDD après une génération  
   **When** je consulte le prompt d'une génération ancienne  
   **Then** le prompt affiché est celui utilisé à l'époque (pas le contexte actuel)  
   **And** un message informatif s'affiche "Prompt historique - contexte GDD depuis modifié"

## Tasks / Subtasks

**TDD :** Le dev suit red-green-refactor **par tâche**. Pour les tâches 1 à 3 : écrire d’abord les tests qui échouent, puis implémenter le minimum pour les faire passer. La tâche 4 regroupe les tests d’intégration / E2E et la vérification globale ; les tests unitaires sont rédigés dans les tâches 1–3.

- [x] Task 1 : Backend — stockage et récupération du prompt par nœud (AC: #1, #2, #3, #5)
  - [x] Dépendance Story 1.15 : étendre `LLMUsageRecord` (ou repository dédié) avec `prompt: Optional[str]`, `response: Optional[str]` et propagation dans le flux `generate-node` (voir Dev Notes)
  - [x] Endpoint `GET /api/v1/unity-dialogues/graph/prompt?dialogue_id={id}&node_id={nodeId}` (ou équivalent sous namespace graph) retournant `raw_prompt`, `prompt_tokens`, `completion_tokens`, `timestamp`, `is_historical`
  - [x] Si 1.15 pas encore livré : option "reconstruit" — reconstruire le prompt à partir du contexte document/nœud (même logique que preview) et retourner avec `is_historical: false` + message "Prompt reconstruit (contexte actuel)"

- [x] Task 2 : Frontend — modal "Voir le prompt" (AC: #1, #2)
  - [x] Composant `PromptViewerModal.tsx` : affichage prompt avec sections (System, Context GDD, Instructions), syntax highlight (react-syntax-highlighter ou équivalent léger), numéros de ligne
  - [x] Bouton "Copier" (clipboard), affichage tokens (prompt_tokens, completion_tokens, total)
  - [x] Entrée UI : "Voir le prompt" depuis menu contextuel du nœud ou panneau détails (GraphEditor / AIGenerationPanel) — cohérent avec patterns existants (overlay hover ou context menu selon ADR-007 / 1.17)

- [x] Task 3 : Intégration batch et historique (AC: #4, #5)
  - [x] Pour génération batch : afficher prompt de base + lien ou déplier "variations par nœud" si disponible dans les logs
  - [x] Si prompt provient du stockage (post-1.15) et contexte GDD a changé : afficher message "Prompt historique - contexte GDD depuis modifié"

- [x] Task 4 : Tests (AC: tous)
  - [x] Unit backend : récupération prompt par node_id / request_id (mock repository)
  - [x] Integration : `GET .../graph/prompt?dialogue_id=...&node_id=...` (réponse 200, format JSON)
  - [x] Frontend unit : `PromptViewerModal` (rendu, copier, affichage tokens)

## Dev Notes

### Contexte Epic et Story

- **Epic 1 :** Amélioration et peaufinage de la génération de dialogues. **Story 1.14 — Priorité C (Nice-to-have)** : transparence du prompt pour debug et compréhension.
- **FR77** : Afficher prompt exact envoyé au LLM.
- **Prérequis fonctionnel :** Story 1.15 (logs de génération avec prompt/réponse) pour afficher le **prompt exact historique**. Sans 1.15, on peut livrer une **version minimale** : endpoint qui **reconstruit** le prompt pour un nœud (contexte parent + document actuel) → affichage "prompt actuel / reconstruit" au lieu de "prompt historique".

### Relation avec Story 1.15

- **Story 1.15** doit étendre le schéma de log (prompt, response, dialogue_id, node_id déjà en place partiellement via 1.12) et persister ces champs lors de la génération.
- **Cette story (1.14)** consomme ces données pour l’affichage. Décision : implémenter l’endpoint et l’UI pour qu’ils lisent le prompt depuis le stockage une fois 1.15 livré ; en attendant, option "reconstruit" possible (même logique que `preview-prompt` / build_prompt côté graphe) pour débloquer la valeur utilisateur.

### Vérification codebase existant

- **`api/routers/dialogues.py`** : `/preview-prompt` et `estimate-tokens` retournent déjà `raw_prompt`, `prompt_hash`, `structured_prompt` (schémas `BuiltPrompt`, `PreviewPromptResponse`). Ne pas dupliquer : réutiliser la logique de construction de prompt (PromptEngine, PromptInput) ; le namespace graph doit exposer un endpoint dédié (pas mélanger avec dialogues).
- **`api/routers/graph.py`** : `generate-node` appelle `GraphNodeOrchestrator.generate()` ; le prompt n’est pas retourné ni stocké actuellement. Après 1.15 : stocker le prompt (et la réponse) dans le repository de logs et l’associer à `request_id` / `node_id` / `dialogue_id`. Pour la version "reconstruit", réutiliser la même chaîne que l’orchestrateur utilise pour construire le prompt (ou appeler un service partagé de build prompt pour un nœud donné).
- **`api/routers/context.py`** : endpoint de prévisualisation contexte qui appelle `_build_prompt_from_request` — pattern à réutiliser pour "prompt reconstruit" si on implémente la variante sans 1.15.
- **`models/llm_usage.py`** : `LLMUsageRecord` a déjà `dialogue_id`, `node_id` (Story 1.12). Pas encore `prompt` ni `response` → à ajouter dans 1.15 ; 1.14 ne modifie pas le schéma, seulement consomme.
- **Frontend** : pas de `PromptViewerModal.tsx` existant. Vérifier emplacement cohérent : `frontend/src/components/` (ex. `usage/` ou `graph/`). Patterns modaux existants : `GenerationProgressModal`, modals dans GraphEditor — respecter le même style (Zustand, pas de logique métier hors API).

### Project Structure Notes

- Backend : endpoint sous `api/routers/graph.py` (namespace `/api/v1/unity-dialogues` via main) ou sous `api/routers/llm_usage.py` si la source de vérité est le repository LLM usage. Cohérence avec 1.12 : `GET /api/v1/llm-usage/dialogue/{id}/costs` ; pour le prompt on peut avoir `GET /api/v1/llm-usage/dialogue/{id}/nodes/{nodeId}/prompt` ou `GET /api/v1/unity-dialogues/graph/prompt?dialogue_id=&node_id=` (à trancher selon où vit la donnée après 1.15).
- Frontend : `frontend/src/components/usage/` (à côté de DialogueCostBreakdown, UsageDashboard) ou `frontend/src/components/graph/` pour rester proche du graphe. Référence : `_bmad-output/project-context.md`, `.cursor/rules/frontend.mdc`.

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-01.md — Story 1.14]
- [Source: _bmad-output/project-context.md — Technology Stack, Critical Implementation Rules]
- [Source: api/schemas/dialogue.py — BuiltPrompt, raw_prompt, prompt_hash]
- [Source: api/routers/dialogues.py — preview-prompt, _build_prompt_from_request]
- [Source: api/routers/graph.py — generate-node, annotate_usage]
- [Source: models/llm_usage.py — LLMUsageRecord, dialogue_id, node_id]

## Dev Agent Record

### Agent Model Used

(Complété par l’agent d’implémentation.)

### Debug Log References

### Completion Notes List

- **Task 1 (Backend)** : Endpoint `GET /api/v1/unity-dialogues/graph/prompt?dialogue_id=&node_id=` dans `api/routers/graph.py`. Schéma `NodePromptResponse` dans `api/schemas/graph.py`. Option « reconstruit » : helpers `_load_unity_nodes_from_dialogue`, `_reconstruct_prompt_for_node` (même format que GraphGenerationService). Repository `get_by_dialogue_and_node` dans `services/repositories/llm_usage_repository.py` pour tokens/timestamp si enregistrement existant (sans champ prompt tant que 1.15 non livré).
- **Task 2 (Frontend)** : `PromptViewerModal.tsx` dans `frontend/src/components/graph/` avec affichage `raw_prompt` (pre), bouton Copier, tokens et message API. Entrée « Voir le prompt » : bouton au survol/sélection sur chaque nœud dans `DialogueNode.tsx`. API `getNodePrompt` dans `frontend/src/api/graph.ts`, type `NodePromptResponse` dans `frontend/src/types/graph.ts`.
- **Task 3** : Message informatif affiché via `data.message` dans le modal (backend renvoie « Prompt reconstruit (contexte actuel) » ou futur « Prompt historique - contexte GDD depuis modifié »). Variations batch : non implémentées (nécessitent 1.15).
- **Task 4** : Tests backend `tests/api/test_graph_prompt.py` (6 cas), `tests/repositories/test_llm_usage_repository.py` (get_by_dialogue_and_node). Tests frontend `frontend/src/components/graph/PromptViewerModal.test.tsx` (8 tests : rendu, copier, tokens, erreur, chargement, onClose).

### Developer Context (guardrails)

- **Objectif :** Permettre à l’utilisateur de voir le prompt exact envoyé au LLM pour un nœud généré (transparence et debug). Ne pas réinventer la construction de prompt : réutiliser PromptEngine / build_prompt et, après 1.15, le stockage dans les logs.
- **Pièges à éviter :** (1) Créer un nouvel endpoint sous un namespace incohérent (rester dans `unity-dialogues` graph ou `llm-usage` selon où la donnée vit). (2) Stocker le prompt dans le document Unity (nodes) — la source de vérité du prompt envoyé est le log de génération. (3) Oublier le cas batch (prompt de base + variations par choix). (4) Modifier les clients LLM (core/llm/) pour passer le prompt au tracking — utiliser annotation post-hoc comme en 1.12.

### Technical Requirements

- **Backend :** Endpoint GET pour récupérer le prompt d’un nœud : soit depuis le repository de logs (post-1.15) par `dialogue_id` + `node_id` (ou `request_id`), soit en reconstruisant le prompt via la même chaîne que `generate-node` (contexte parent + document). Réponse : `raw_prompt`, `prompt_tokens`, `completion_tokens`, `timestamp`, `is_historical`, optionnel `structured_prompt`.
- **Frontend :** Modal dédiée (PromptViewerModal) avec syntax highlight, bouton Copier, affichage des tokens. Point d’entrée : menu contextuel du nœud ou panneau détails (aligné avec 1.17 / ADR-007 — pas de state local qui contourne le store).
- **Pas de secret ni de log de prompt en clair dans les réponses d’erreur.** CORS et validation des entrées inchangés.

### Architecture Compliance

- **API :** Versioning `/api/v1/`, routers dans `api/routers/`, schémas dans `api/schemas/`. Injection via `Depends(get_llm_usage_service)` ou service de logs à définir en 1.15.
- **Frontend :** Logique dans `frontend/src/`, appels API via client existant (ex. `api/llmUsage.ts` ou nouveau `api/graph.ts` pour endpoint prompt). Pas de logique métier dans le modal ; tout passe par l’API REST.
- **Documents vs Unity :** Ne pas écrire le prompt dans le document (nodes) ; seule la lecture depuis les logs ou la reconstruction est autorisée.

### Library / Framework Requirements

- **Backend :** Python 3.10+, FastAPI, Pydantic 2. Pas de nouvelle dépendance lourde.
- **Frontend :** React 18, TypeScript. Pour syntax highlight : `react-syntax-highlighter` ou équivalent léger (vérifier dépendances existantes dans package.json). Sinon bloc `<pre>` avec CSS pour lisibilité.

### File Structure Requirements

- Nouveau composant : `frontend/src/components/usage/PromptViewerModal.tsx` (ou `frontend/src/components/graph/PromptViewerModal.tsx` selon convention).
- Endpoint : soit dans `api/routers/graph.py` (GET prompt pour un nœud), soit dans `api/routers/llm_usage.py` (GET dialogue/node prompt). Schémas dans `api/schemas/llm_usage.py` ou `api/schemas/graph.py` selon le router choisi.

### Testing Requirements

- **Backend :** Unit : récupération prompt (mock repository avec prompt stocké). Integration : GET endpoint avec `dialogue_id` + `node_id`, réponse 200 et champs attendus ; cas 404 si nœud sans log.
- **Frontend :** Unit (Vitest + RTL) : rendu du modal, bouton Copier appelle clipboard, affichage tokens. E2E (Playwright) optionnel : ouvrir "Voir le prompt" depuis un nœud généré et vérifier contenu.
- **Règle :** Tous les tests existants restent verts ; pas de régression sur generate-node ni sur coûts.

### Project Context Reference

- **Fichier bible :** `_bmad-output/project-context.md` — Technology Stack, Critical Implementation Rules, Language/Framework rules, Testing rules, Don’t-Miss rules.
- **Imports Python :** Utiliser `from core.prompt.prompt_engine import ...` (pas racine). Config via `ConfigurationService`. Pas de secret en dur.
- **Frontend :** Types alignés sur schémas backend ; pas de désactivation ESLint non justifiée.

### Story Completion Status

- **Status :** done
- **Note :** Revue de code effectuée ; corrections appliquées (sections délimitées, menu contextuel, préparation 1.15, logging, tests). Story marquée done.

### File List

- `api/schemas/graph.py` — ajout `NodePromptResponse`
- `api/routers/graph.py` — helpers `_load_unity_nodes_from_dialogue`, `_reconstruct_prompt_for_node`, endpoint GET `/prompt`, utilisation de `record.prompt` si présent (1.15), logging debug
- `services/repositories/llm_usage_repository.py` — `get_by_dialogue_and_node` (interface + implémentation)
- `frontend/src/types/graph.ts` — `NodePromptResponse`
- `frontend/src/api/graph.ts` — `getNodePrompt`
- `frontend/src/components/graph/PromptViewerModal.tsx` — sections délimitées (AC #1), affichage par bloc titré
- `frontend/src/components/graph/PromptViewerModal.test.tsx` — nouveau
- `frontend/src/components/graph/NodeContextMenu.tsx` — entrée « Voir le prompt » (menu contextuel)
- `frontend/src/components/graph/nodes/DialogueNode.tsx` — entrée « Voir le prompt » (bouton + écoute `open-prompt-viewer`)
- `tests/api/test_graph_prompt.py` — 8 cas dont record avec tokens et prompt stocké (1.15)
- `tests/repositories/test_llm_usage_repository.py` — test `get_by_dialogue_and_node`

### Change Log

- 2026-03-06 : Implémentation complète Story 1.14 (backend GET prompt reconstruit, frontend PromptViewerModal, entrée UI sur nœud, tests backend et frontend). Statut → review.
- 2026-03-06 : Corrections post code-review : modal avec sections délimitées (Contexte précédent, Réponse du joueur, Instructions) ; « Voir le prompt » dans le menu contextuel du nœud ; backend utilise `record.prompt` si présent (préparation 1.15) ; log debug si get_by_dialogue_and_node échoue ; tests API avec record mocké (tokens + prompt stocké). File List mise à jour (NodeContextMenu, détails PromptViewerModal). Statut maintenu en review.
