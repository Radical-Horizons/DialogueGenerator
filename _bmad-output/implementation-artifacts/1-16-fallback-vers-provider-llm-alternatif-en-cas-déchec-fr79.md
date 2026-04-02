# Story 1.16: Fallback vers provider LLM alternatif en cas d'échec (FR79)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur générant des dialogues**,
I want **que le système bascule automatiquement vers un provider LLM alternatif si le provider principal échoue**,
so that **mes générations ne sont pas interrompues par des pannes temporaires d'un provider**.

## Acceptance Criteria

1. **Given** j'ai configuré OpenAI comme provider principal et Mistral comme fallback  
   **When** OpenAI API échoue (erreur 500, timeout, quota dépassé)  
   **Then** le système bascule automatiquement vers Mistral  
   **And** la génération continue sans interruption visible pour l'utilisateur  
   **And** un message informatif s'affiche "OpenAI indisponible - bascule vers Mistral"

2. **Given** le fallback vers Mistral est activé  
   **When** la génération réussit avec Mistral  
   **Then** le nœud est généré normalement (même format Unity JSON)  
   **And** le log de génération indique "Provider: Mistral (fallback depuis OpenAI)"  
   **And** le coût Mistral est tracké séparément (voir Story 1.13)

3. **Given** les deux providers (OpenAI et Mistral) échouent  
   **When** la génération est tentée  
   **Then** la génération échoue avec message "Tous les providers LLM sont indisponibles"  
   **And** aucun coût n'est facturé (pas de tentative facturée)  
   **And** l'utilisateur peut réessayer manuellement plus tard

4. **Given** je configure les providers de fallback dans les paramètres  
   **When** je définis l'ordre de fallback (ex: OpenAI → Mistral → Anthropic)  
   **Then** l'ordre est sauvegardé dans la config backend  
   **And** le système respecte cet ordre lors des fallbacks automatiques

5. **Given** un fallback est déclenché  
   **When** je consulte les logs de génération  
   **Then** le log affiche clairement "Fallback: OpenAI → Mistral" avec raison (ex: "Timeout OpenAI")  
   **And** les métriques de fallback sont trackées (nombre de fallbacks par provider)

## Tasks / Subtasks

**Convention TDD :** À chaque tâche, appliquer le cycle TDD : (1) Écrire les tests d'abord (red), (2) Implémenter le minimum pour les faire passer (green), (3) Refactorer si besoin.

- [x] Task 1 : Config — Chaîne de fallback (AC: #4)
  - **TDD :** Écrire test unitaire : charger `llm_config.json` avec clé `fallback_chain` (liste d'api_identifier), vérifier que le service de config expose cette liste (ou fichier dédié `config/llm_fallback.json`).
  - [x] Ajouter dans `config/llm_config.json` une clé optionnelle `fallback_chain`: `["gpt-5.2", "labs-mistral-small-creative"]` (ordre de tentative). Si absente, comportement actuel (aucun fallback).
  - [x] Exposer la chaîne via `ConfigurationService` (ex: `get_llm_fallback_chain() -> list[str]` ou lecture depuis `get_llm_config().get("fallback_chain", [])`). Pas de config sensible en localStorage (backend uniquement).
  - **TDD :** Test : fallback_chain vide ou absent → pas de fallback ; avec 2 modèles → ordre respecté.

- [x] Task 2 : Backend — Wrapper ou factory avec retry + fallback (AC: #1, #2, #3)
  - **TDD :** Écrire tests unitaires : (a) client principal échoue 3 fois → fallback client utilisé ; (b) client principal réussit → pas d'appel fallback ; (c) tous les clients échouent → exception "Tous les providers LLM sont indisponibles" ; (d) fallback utilisé → usage tracké avec indication fallback.
  - [x] Introduire une logique de retry (3 tentatives, backoff exponentiel) via api.utils.retry (existant) sur l'appel au client principal avant de passer au suivant.
  - [x] Implémenter FallbackLLMClient (core/llm/fallback_client.py) et LLMClientFactory.create_client_with_fallback. Signature create_client inchangée.
  - [x] Intégrer le wrapper dans UnityDialogueOrchestrator et api/routers/graph.py (generate-node, regenerate).
  - **TDD :** Tests unitaires FallbackLLMClient (tests/core/llm/test_fallback_client.py) ; tests existants verts.

- [x] Task 3 : Backend — Tracking fallback dans LLMUsageService (AC: #2, #5)
  - **TDD :** Test track_usage avec fallback_from/fallback_reason (tests/services/test_llm_usage_service.py).
  - [x] Étendre LLMUsageRecord : fallback_from, fallback_reason. Étendre track_usage().
  - [x] _FallbackUsageWrapper injecte fallback_from/fallback_reason lors d'un fallback réussi.

- [x] Task 4 : Frontend — Toast informatif fallback (AC: #1)
  - [x] Métadonnées streaming : used_fallback, fallback_from, fallback_to dans l'event metadata (orchestrator + api/routers/streaming.py).
  - [x] useSSEStreaming : à la réception de metadata.used_fallback, affichage toast info (fallback_from indisponible - bascule vers fallback_to).

- [x] Task 5 : Message d'erreur "Tous les providers indisponibles" (AC: #3)
  - [x] AllLLMProvidersUnavailableError (api/exceptions.py) → 503. Levée par FallbackLLMClient quand tous échouent. graph.py re-raise pour réponse 503.
  - [x] Aucun track_usage(success=True) pour une génération qui n'a jamais réussi.

- [x] Task 6 : Tests et non-régression (AC: tous)
  - [x] tests/test_llm_factory.py, test_unity_dialogue_orchestrator, test_graph_generate_node verts (fallback_chain défensif si mock sans get_llm_fallback_chain).
  - [x] tests/core/llm/test_fallback_client.py, tests/services/test_configuration_service_llm_fallback.py, test_track_usage_with_fallback_from_reason.
  - [x] Pas de régression : comportement sans fallback (chaîne vide ou 1 modèle) inchangé.

## Dev Notes

### Contexte Epic et dépendances

- **Epic 1 :** Amélioration et peaufinage de la génération de dialogues. **Story 1.16 — Priorité C (Nice-to-have)** : fallback vers provider LLM alternatif pour robustesse (NFR-R4, NFR-I2).
- **FR79** : Fallback provider. **Références** : Epic 0 Story 0.3 (Multi-Provider LLM), NFR-R4 (Error Recovery LLM >95%), NFR-I2 (LLM API Reliability >99%).
- Pas de dépendance bloquante sur Story 1.14/1.15 pour le tracking : `LLMUsageRecord` a déjà `error_message` ; on ajoute `fallback_from` / `fallback_reason` pour clarté. Les logs de génération (1.15) pourront afficher ces champs.

### Vérification codebase existant

- **`factories/llm_factory.py`** : `LLMClientFactory.create_client(model_id, config, available_models, usage_service, request_id, endpoint)` existe. Retourne `DummyLLMClient` si modèle non trouvé, clé API manquante, ou exception. **Aucune** méthode `create_client_with_fallback` ni logique de retry/fallback. Décision : ajouter un wrapper `FallbackLLMClient` (ou équivalent) et une méthode factory qui le construit à partir de `fallback_chain`, sans modifier la signature de `create_client` pour éviter les régressions.
- **`services/unity_dialogue_orchestrator.py`** : Appelle `LLMClientFactory.create_client(request_data.llm_model_identifier, ...)` une seule fois (l.190). C'est le point d'intégration : si `get_llm_fallback_chain()` retourne une liste avec au moins 2 modèles et que le premier est le modèle demandé, utiliser le client avec fallback ; sinon comportement actuel.
- **`api/routers/graph.py`** : Crée le client LLM via factory (l.394, l.956) pour generate-node et autres. Utiliser la même logique que l'orchestrator (idéalement : toute la logique "obtenir client LLM avec fallback" dans un seul lieu, ex. dépendance ou helper, pour éviter duplication).
- **`config/llm_config.json`** : Contient `api_key_env_var`, `mistral_api_key_env_var`, `default_model`, `available_models`. Pas de clé `fallback_chain` → à ajouter (optionnelle).
- **`models/llm_usage.py`** : `LLMUsageRecord` a `error_message`, `dialogue_id`, `node_id`. Ajouter `fallback_from: Optional[str] = None`, `fallback_reason: Optional[str] = None` pour les logs (AC #5).
- **`services/llm_usage_service.py`** : `track_usage(...)` à étendre avec `fallback_from`, `fallback_reason`.
- **Tenacity** : Mentionné dans project-context (Tenacity 8.2+) ; utiliser pour retry avec backoff sur l'appel au client LLM (generate_variants ou generate_variants_streaming).

### Architecture et patterns

- **Source de vérité pour le client** : Un seul point d'appel pour "créer client LLM pour cette requête" (orchestrator ou helper injecté), pour que le fallback soit appliqué partout (generate-node, batch, regenerate).
- **Ne pas exposer de config fallback au frontend** : L'ordre de fallback reste en `config/` côté backend (sécurité, cohérence). Le frontend reçoit uniquement une indication "fallback utilisé" + from/to pour afficher le toast.
- **Coût** : Seul le provider effectivement utilisé (après fallback) est tracké avec `track_usage(success=True)` ; les tentatives échouées peuvent être trackées avec `success=False` et `estimated_cost=0` si souhaité pour analytics.

### Project Structure Notes

- Config : `config/llm_config.json` (clé optionnelle `fallback_chain`).
- Factory / wrapper : `factories/llm_factory.py` (méthode `create_client_with_fallback` ou classe `FallbackLLMClient` dans `core/llm/` ou `factories/`).
- Modèle : `models/llm_usage.py` (champs `fallback_from`, `fallback_reason`).
- Service : `services/llm_usage_service.py` (`track_usage` étendu).
- Orchestrator : `services/unity_dialogue_orchestrator.py` (utilisation du client avec fallback).
- API : `api/routers/graph.py` (même logique si création client en dehors de l'orchestrator).
- Frontend : composant qui gère le streaming (ex. `AIGenerationPanel.tsx`) + toast ; pas de nouvelle page de config fallback (config backend uniquement).

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-01.md — Story 1.16]
- [Source: _bmad-output/project-context.md — Technology Stack, Tenacity 8.2+]
- [Source: factories/llm_factory.py — create_client, DummyLLMClient fallback]
- [Source: services/unity_dialogue_orchestrator.py — create_client appel]
- [Source: api/routers/graph.py — create_client pour generate-node]
- [Source: models/llm_usage.py — LLMUsageRecord]
- [Source: services/llm_usage_service.py — track_usage]
- [Source: config/llm_config.json — available_models, api_key_env_var]

## Dev Agent Record

### Agent Model Used

(à remplir par l’agent d’implémentation)

### Debug Log References

### Completion Notes List

- Task 1: fallback_chain dans llm_config.json (optionnel) ; ConfigurationService.get_llm_fallback_chain() ; tests test_configuration_service_llm_fallback.py.
- Task 2: FallbackLLMClient (retry 3x via api.utils.retry) + create_client_with_fallback ; intégration orchestrator + graph (generate-node, regenerate) ; défensive isinstance(fallback_chain, list) pour mocks.
- Task 3: LLMUsageRecord.fallback_from, fallback_reason ; track_usage étendu ; _FallbackUsageWrapper pour injecter les champs lors d'un fallback.
- Task 4: metadata event avec used_fallback, fallback_from, fallback_to ; useSSEStreaming toast info.
- Task 5: AllLLMProvidersUnavailableError (503) ; re-raise dans graph.py.
- Task 6: tests unitaires fallback + usage ; non-régression vérifiée.
- Code review (2026-03-06): corrections HIGH/MEDIUM appliquées — get_generation_logs et get_dialogue_costs exposent fallback_from/fallback_reason ; schémas API (GenerationLogEntry, NodeCostEntry) mis à jour ; test d’intégration track_usage avec fallback ajouté ; commentaire superflu supprimé (configuration_service).

### File List

- config/llm_config.json
- services/configuration_service.py
- models/llm_usage.py
- services/llm_usage_service.py
- api/exceptions.py
- core/llm/fallback_client.py
- factories/llm_factory.py
- services/unity_dialogue_orchestrator.py
- api/routers/graph.py
- api/routers/streaming.py
- frontend/src/hooks/useSSEStreaming.ts
- tests/services/test_configuration_service_llm_fallback.py
- tests/services/test_llm_usage_service.py
- tests/core/llm/test_fallback_client.py
- api/schemas/llm_usage.py
- _bmad-output/implementation-artifacts/1-16-fallback-vers-provider-llm-alternatif-en-cas-déchec-fr79.md
- _bmad-output/implementation-artifacts/code-review-1-16-fallback-fr79.md
