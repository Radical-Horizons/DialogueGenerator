# Story 1.15: Afficher logs de génération (prompts, réponses, coûts) (FR78)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur générant des dialogues**,
I want **consulter les logs de génération (prompts, réponses LLM, coûts) pour chaque nœud**,
so that **je peux analyser l'historique des générations et comprendre les patterns de coûts/qualité**.

## Acceptance Criteria

1. **Given** j'ai généré plusieurs nœuds dans un dialogue  
   **When** j'ouvre le panneau "Logs de génération"  
   **Then** je vois une liste chronologique de toutes les générations (plus récent → plus ancien)  
   **And** chaque entrée affiche : timestamp, nœud généré, coût (€), tokens, provider, statut (succès/échec)

2. **Given** je consulte les logs de génération  
   **When** je clique sur une entrée de log  
   **Then** les détails s'affichent : prompt complet, réponse LLM brute, coût détaillé, durée génération  
   **And** je peux voir le prompt (voir Story 1.14) et la réponse formatée

3. **Given** je filtre les logs par période (aujourd'hui, cette semaine, ce mois)  
   **When** je sélectionne une période  
   **Then** seuls les logs de cette période sont affichés  
   **And** un résumé s'affiche "X générations, Y€ total"

4. **Given** je filtre les logs par provider (OpenAI vs Mistral)  
   **When** je sélectionne un provider  
   **Then** seuls les logs de ce provider sont affichés  
   **And** un résumé s'affiche "X générations OpenAI, Y€ total"

5. **Given** une génération a échoué (erreur LLM API)  
   **When** je consulte le log de cette génération  
   **Then** le statut affiche "Échec" avec message d'erreur détaillé  
   **And** le coût affiché est 0€ (pas de coût pour génération échouée)  
   **And** je peux voir la tentative de prompt (si disponible)

6. **Given** j'exporte les logs de génération  
   **When** je clique sur "Exporter logs" (CSV ou JSON)  
   **Then** un fichier est téléchargé avec tous les logs (format structuré)  
   **And** les logs incluent : timestamp, nœud, prompt, réponse, coût, tokens, provider, statut

## Tasks / Subtasks

**Convention TDD :** À chaque tâche, appliquer le cycle TDD : (1) Écrire les tests d’abord (red), (2) Implémenter le minimum pour les faire passer (green), (3) Refactorer si besoin. Ne pas commencer l’implémentation d’une sous-étape sans avoir écrit les tests correspondants.

- [x] Task 1 : Backend — Schéma et persistance prompt/réponse (AC: #1, #2, #5)
  - **TDD :** Écrire tests unitaires sur le modèle et le repository (sauvegarde/lecture avec prompt/response) avant toute modification.
  - [x] Étendre `LLMUsageRecord` (`models/llm_usage.py`) : ajouter `prompt: Optional[str] = None`, `response: Optional[str] = None`. Conserver rétrocompatibilité (champs optionnels, anciens fichiers JSON sans ces champs restent valides).
  - [x] Adapter `FileLLMUsageRepository._load_records_for_date` pour accepter les champs optionnels ; `model_dump` les inclura automatiquement à l’écriture.
  - [x] Étendre `LLMUsageService.track_usage()` pour accepter `prompt: Optional[str] = None`, `response: Optional[str] = None` et les passer au `LLMUsageRecord`.
  - **TDD :** Tests d’intégration : sauvegarder un record avec prompt/response, recharger, vérifier valeurs.

- [x] Task 2 : Backend — Propagation prompt/réponse dans le flux generate-node (AC: #1, #2)
  - **TDD :** Écrire test d’intégration : appeler generate-node (mock LLM), puis récupérer le record par dialogue_id/node_id et vérifier que prompt et response sont renseignés.
  - [x] Dans les clients LLM (`core/llm/openai/client.py`, `core/llm/mistral_client.py`) : passer `prompt` et `response` à `usage_service.track_usage(...)` après chaque appel API. Coût 0€ en cas d’échec (success=False).
  - [x] Gérer le cas échec : enregistrer quand même un record (success=False, cost=0), avec prompt si disponible et error_message.
  - **TDD :** Test d’intégration échec LLM : vérifier record avec success=False, estimated_cost=0, error_message présent.

- [x] Task 3 : Backend — Endpoint GET generation-logs par dialogue (AC: #1, #3, #4)
  - **TDD :** Écrire tests d’intégration API : GET `/api/v1/llm-usage/dialogue/{id}/generation-logs` avec query params `start_date`, `end_date`, `model_name` (provider) ; vérifier format réponse et filtrage.
  - [x] Ajouter endpoint `GET /api/v1/llm-usage/dialogue/{dialogue_id}/generation-logs` dans `api/routers/llm_usage.py` avec query params optionnels : `start_date`, `end_date`, `model_name` (provider). Réponse : liste d’enregistrements (avec prompt, response, timestamp, node_id, coût, tokens, success, error_message), triés par timestamp décroissant.
  - [x] Schéma de réponse dédié (ex. `GenerationLogEntry` ou réutiliser `LLMUsageRecordResponse` étendu avec prompt/response optionnels) dans `api/schemas/llm_usage.py`.
  - **TDD :** Tests : 200 avec filtres, 200 + liste vide si aucun log ; pagination si nécessaire.

- [x] Task 4 : Frontend — Panneau Logs de génération (AC: #1, #2, #3, #4, #5)
  - **TDD :** Écrire tests unitaires (Vitest + RTL) : rendu liste vide, rendu avec N entrées, clic sur une entrée affiche détail (prompt, réponse, coût), filtres période/provider mettent à jour la liste.
  - [x] Composant `GenerationLogsPanel.tsx` dans `frontend/src/components/usage/` : liste chronologique (plus récent en premier), colonnes timestamp, nœud, coût, tokens, provider, statut. Clic sur une ligne → détail (prompt, réponse, durée, message d’erreur si échec).
  - [x] Filtres : période (aujourd’hui, cette semaine, ce mois) et provider (tous, OpenAI, Mistral). Résumé "X générations, Y€ total" mis à jour selon filtres.
  - [x] Client API : fonction `getGenerationLogs(dialogueId, params)` dans `frontend/src/api/llmUsage.ts` appelant `GET /api/v1/llm-usage/dialogue/{id}/generation-logs`.
  - **TDD :** Tests E2E (Playwright) optionnels : ouvrir un dialogue, ouvrir le panneau logs, vérifier présence d’entrées après une génération.

- [x] Task 5 : Frontend — Export logs CSV/JSON (AC: #6)
  - **TDD :** Écrire test unitaire : boutons Exporter JSON/CSV désactivés quand liste vide, activés quand entrées présentes.
  - [x] Boutons "Exporter JSON" et "Exporter CSV" dans `GenerationLogsPanel` : construire côté client le fichier à partir des données déjà chargées (filtres appliqués) ; déclencher téléchargement (blob + URL.createObjectURL).
  - **TDD :** Vérifier que les logs exportés incluent bien prompt et response (si présents).

- [x] Task 6 : Tests et non-régression (AC: tous)
  - **TDD :** S’assurer que tous les tests existants restent verts (pytest, Vitest).
  - [x] Tests unitaires repository et service pour prompt/response déjà ajoutés en Task 1–2.
  - [x] Pas de régression : pytest (llm_usage, graph) 55 tests OK ; Vitest GenerationLogsPanel 6 tests OK. (Échecs Vitest dans CostEstimationBadge préexistants.)

## Dev Notes

### Contexte Epic et dépendances

- **Epic 1 :** Amélioration et peaufinage de la génération de dialogues. **Story 1.15 — Priorité B** : logs de génération (prompts, réponses, coûts) pour transparence et debug.
- **FR78** : Afficher logs de génération. Cette story est un **prérequis fonctionnel** pour Story 1.14 (prompt transparency) : 1.14 consomme le prompt stocké par 1.15.
- **Relation 1.14 / 1.15 :** Story 1.14 (Voir le prompt) lit les données depuis le même stockage. Une fois 1.15 livré, 1.14 pourra afficher le prompt exact historique ; sans 1.15, 1.14 ne peut proposer qu’une variante "reconstruit".

### Vérification codebase existant

- **`models/llm_usage.py`** : `LLMUsageRecord` a déjà `dialogue_id`, `node_id`, `deleted`. Il **manque** `prompt` et `response` → à ajouter (Optional[str], default=None).
- **`services/llm_usage_service.py`** : `track_usage()` ne prend pas encore prompt/response ; `annotate_usage()` met à jour dialogue_id/node_id sur un record déjà sauvegardé. Option : soit étendre `track_usage()` pour accepter prompt/response (et les passer au record dès la première sauvegarde), soit sauvegarder d’abord puis appeler une méthode `update_usage_prompt_response(request_id, prompt, response)` pour mettre à jour le record. La première option évite un double write.
- **`api/routers/graph.py`** : Après génération, `usage_service.track_usage(...)` est appelé (via l’orchestrateur) puis `annotate_usage(request_id, dialogue_id, first_node_id)`. Le prompt et la réponse sont disponibles dans l’orchestrateur / le flux de génération ; il faut les remonter jusqu’à `track_usage` ou faire un update après coup.
- **`api/routers/llm_usage.py`** : Existe avec `/history`, `/statistics`, `/dialogue/{id}/costs`. Ajouter `GET /dialogue/{id}/generation-logs` avec filtres période et model_name (provider).
- **Frontend** : Pas de `GenerationLogsPanel.tsx`. Référence : `UsageDashboard.tsx`, `UsageHistoryTable.tsx` dans `frontend/src/components/usage/` ; même style et appels API via `api/llmUsage.ts`.

### Project Structure Notes

- Backend : modèle dans `models/llm_usage.py`, repository dans `services/repositories/llm_usage_repository.py`, service dans `services/llm_usage_service.py`, endpoint dans `api/routers/llm_usage.py`, schémas dans `api/schemas/llm_usage.py`.
- Frontend : `frontend/src/components/usage/GenerationLogsPanel.tsx`, client dans `frontend/src/api/llmUsage.ts`. Alignement avec `_bmad-output/project-context.md` et `.cursor/rules/frontend.mdc`.

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-01.md — Story 1.15]
- [Source: _bmad-output/implementation-artifacts/1-14-afficher-prompt-transparency-prompt-exact-envoyé-au-llm-fr77.md — Relation 1.14/1.15]
- [Source: _bmad-output/project-context.md — Technology Stack, Critical Implementation Rules]
- [Source: models/llm_usage.py — LLMUsageRecord]
- [Source: services/llm_usage_service.py — track_usage, annotate_usage]
- [Source: api/routers/graph.py — generate-node, annotate_usage]
- [Source: api/routers/llm_usage.py — history, dialogue costs]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Task 1–3 (backend) : LLMUsageRecord étendu prompt/response ; track_usage étendu ; clients OpenAI/Mistral passent prompt/response ; estimated_cost=0 si success=False ; endpoint GET generation-logs + schémas GenerationLogEntry/GenerationLogsResponse ; tests unitaires et API ajoutés.
- Task 4–5 (frontend) : GenerationLogsPanel avec liste, détail au clic, filtres période/provider, résumé X générations / Y€ ; getGenerationLogs dans llmUsage.ts ; export JSON/CSV côté client. Tests Vitest : liste vide, N entrées, détail, export boutons.
- Code review (AI) : Correctifs MEDIUM appliqués — (1) core/llm/openai/client.py : initialisation explicite prompt_tokens/completion_tokens/total_tokens=0 en début de boucle, suppression de locals() ; (2) GenerationLogsPanel.tsx : export CSV conforme RFC 4180 (csvEscape pour virgules, retours à la ligne, guillemets) ; (3) Story Completion Status aligné sur statut réel puis passé à done.

### Developer Context (guardrails)

- **Objectif :** Permettre la consultation des logs de génération (prompts, réponses, coûts) par dialogue. Étendre le schéma et le flux pour persister prompt/réponse ; exposer un endpoint et une UI avec filtres et export. **TDD à chaque étape** : tests avant implémentation.
- **Pièges à éviter :** (1) Casser la rétrocompatibilité des fichiers JSON existants (usage_YYYY-MM-DD.json) — champs prompt/response optionnels. (2) Stocker des prompts/réponses énormes sans limite (envisager troncature ou limite de taille si nécessaire). (3) Exposer des données sensibles dans les réponses API sans contrôle. (4) Oublier d’alimenter prompt/response dans le flux generate-node (single et batch).

### Technical Requirements

- **Backend :** Modèle `LLMUsageRecord` étendu avec `prompt`, `response` (Optional[str]). Service `track_usage` étendu ; flux generate-node doit passer prompt et response au tracking. Endpoint `GET /api/v1/llm-usage/dialogue/{dialogue_id}/generation-logs` avec filtres `start_date`, `end_date`, `model_name`. Réponse : liste d’entrées avec timestamp, node_id, prompt, response, coût, tokens, success, error_message.
- **Frontend :** Composant `GenerationLogsPanel` : liste + détail au clic, filtres période/provider, résumé X générations / Y€, export CSV/JSON côté client.
- **Sécurité :** Pas de secret dans les logs ; CORS et validation des entrées inchangés. Les prompts peuvent contenir du contexte métier ; accès réservé à l’utilisateur du dialogue (autorisation existante).

### Architecture Compliance

- **API :** Versioning `/api/v1/`, routers dans `api/routers/`, schémas dans `api/schemas/`. Injection via `Depends(get_llm_usage_service)`.
- **Frontend :** Logique dans `frontend/src/`, appels API via `api/llmUsage.ts`. Pas de logique métier dans le panneau ; tout passe par l’API REST.

### Library / Framework Requirements

- **Backend :** Python 3.10+, FastAPI, Pydantic 2. Aucune nouvelle dépendance lourde.
- **Frontend :** React 18, TypeScript. Pas de librairie obligatoire pour l’export (blob + téléchargement natif).

### File Structure Requirements

- Modèle : `models/llm_usage.py` (étendre LLMUsageRecord).
- Repository / Service : `services/repositories/llm_usage_repository.py`, `services/llm_usage_service.py` (étendre).
- Router / Schémas : `api/routers/llm_usage.py`, `api/schemas/llm_usage.py` (nouvel endpoint et schéma de réponse).
- Frontend : `frontend/src/components/usage/GenerationLogsPanel.tsx`, `frontend/src/api/llmUsage.ts` (nouvelle fonction getGenerationLogs).

### Testing Requirements

- **Backend :** Unit : modèle avec prompt/response optionnels ; repository load/save avec ces champs ; service track_usage avec prompt/response. Integration : endpoint GET generation-logs (200, filtres, 404), flux generate-node enregistre prompt/response (mock LLM).
- **Frontend :** Unit (Vitest + RTL) : rendu liste, détail, filtres, export. E2E (Playwright) optionnel : ouvrir panneau logs après génération.
- **Règle :** Tous les tests existants restent verts. TDD : écrire les tests avant d’implémenter chaque sous-étape.

### Project Context Reference

- **Fichier bible :** `_bmad-output/project-context.md` — Technology Stack, Critical Implementation Rules, Language/Framework rules, Testing rules, Don’t-Miss rules.
- **Imports Python :** Utiliser `from core.*` (pas racine). Config via `ConfigurationService`. Pas de secret en dur.

### Story Completion Status

- **Status :** done
- **Note :** Code review complétée ; correctifs MEDIUM appliqués (openai client token init, CSV RFC 4180, Story Completion Status). Livraison de 1.15 débloque la valeur complète de 1.14 (prompt exact historique).

### File List

- models/llm_usage.py
- services/llm_usage_service.py
- services/repositories/llm_usage_repository.py (aucune modif code, rétrocompat)
- core/llm/openai/client.py
- core/llm/mistral_client.py
- api/routers/llm_usage.py
- api/schemas/llm_usage.py
- tests/repositories/test_llm_usage_repository.py
- tests/services/test_llm_usage_service.py
- tests/services/test_llm_usage_service_cost_integration.py
- tests/api/test_llm_usage.py
- frontend/src/api/llmUsage.ts (getGenerationLogs, types GenerationLogEntry, GenerationLogsResponse)
- frontend/src/components/usage/GenerationLogsPanel.tsx
- frontend/src/components/usage/GenerationLogsPanel.css
- frontend/src/components/usage/GenerationLogsPanel.test.tsx
