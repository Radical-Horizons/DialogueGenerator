# Story 1.16: Fallback vers provider LLM alternatif en cas d'échec (FR79)

Status: ready-for-dev

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

- [ ] Task 1 : Config — Chaîne de fallback (AC: #4)
  - **TDD :** Écrire test unitaire : charger `llm_config.json` avec clé `fallback_chain` (liste d'api_identifier), vérifier que le service de config expose cette liste (ou fichier dédié `config/llm_fallback.json`).
  - [ ] Ajouter dans `config/llm_config.json` une clé optionnelle `fallback_chain`: `["gpt-5.2", "labs-mistral-small-creative"]` (ordre de tentative). Si absente, comportement actuel (aucun fallback).
  - [ ] Exposer la chaîne via `ConfigurationService` (ex: `get_llm_fallback_chain() -> list[str]` ou lecture depuis `get_llm_config().get("fallback_chain", [])`). Pas de config sensible en localStorage (backend uniquement).
  - **TDD :** Test : fallback_chain vide ou absent → pas de fallback ; avec 2 modèles → ordre respecté.

- [ ] Task 2 : Backend — Wrapper ou factory avec retry + fallback (AC: #1, #2, #3)
  - **TDD :** Écrire tests unitaires : (a) client principal échoue 3 fois → fallback client utilisé ; (b) client principal réussit → pas d'appel fallback ; (c) tous les clients échouent → exception "Tous les providers LLM sont indisponibles" ; (d) fallback utilisé → usage tracké avec indication fallback.
  - [ ] Introduire une logique de retry (3 tentatives, backoff exponentiel) via Tenacity (déjà en dépendances, voir project-context) sur l'appel au client principal avant de passer au suivant.
  - [ ] Implémenter soit : **(A)** un wrapper `FallbackLLMClient` (implémente `ILLMClient`) qui reçoit la liste ordonnée de `model_id`, crée les clients via `LLMClientFactory.create_client` et exécute génération en essayant chaque client (retry puis next), soit **(B)** une méthode `LLMClientFactory.create_client_with_fallback(primary_model_id, fallback_model_ids, config, available_models, usage_service, ...)` qui retourne ce wrapper. Éviter de casser la signature existante de `create_client`.
  - [ ] Intégrer le wrapper dans `UnityDialogueOrchestrator` : si `fallback_chain` contient au moins 2 modèles, utiliser le client avec fallback ; sinon garder `create_client` actuel.
  - [ ] Même intégration dans `api/routers/graph.py` pour les endpoints qui créent le client LLM (generate-node, regenerate, etc.) : utiliser la même logique (orchestrator ou helper partagé).
  - **TDD :** Tests d'intégration : appel generate-node avec mock primary qui lève, mock fallback qui réussit → 200 et nœud généré ; tous les mocks échouent → 503 ou 500 avec message explicite.

- [ ] Task 3 : Backend — Tracking fallback dans LLMUsageService (AC: #2, #5)
  - **TDD :** Écrire test : `track_usage(..., error_message="Fallback: gpt-5.2 -> labs-mistral-small-creative (reason: Timeout)")` ou champ dédié `fallback_from: Optional[str]` ; vérifier que le record contient l'info.
  - [ ] Étendre `LLMUsageRecord` (`models/llm_usage.py`) : ajouter `fallback_from: Optional[str] = None` (model_id du provider initial en échec). Optionnel : `fallback_reason: Optional[str] = None` (ex: "Timeout", "503").
  - [ ] Étendre `LLMUsageService.track_usage()` : accepter `fallback_from: Optional[str] = None`, `fallback_reason: Optional[str] = None` et les enregistrer dans le record.
  - [ ] Dans le wrapper/orchestrator : lors d'un fallback réussi, appeler `track_usage` avec le modèle effectivement utilisé (Mistral) et `fallback_from=model_id_principal`, `fallback_reason=raison_échec`.
  - **TDD :** Test d'intégration : génération avec fallback → record avec `model_name` = fallback, `fallback_from` = primary, `success=True`.

- [ ] Task 4 : Frontend — Toast informatif fallback (AC: #1)
  - **TDD :** Écrire test (Vitest + RTL ou mock SSE) : lorsque l'API retourne un champ indiquant fallback (ex. `used_fallback: true`, `fallback_from: "gpt-5.2"` dans la réponse streaming ou dans un header/metadata), le frontend affiche un toast "OpenAI indisponible - bascule vers Mistral" (ou texte dérivé). Si pas de fallback, pas de toast.
  - [ ] Définir un champ dans la réponse (event streaming ou body final) : ex. `generation_metadata.used_fallback`, `generation_metadata.fallback_from`, `generation_metadata.fallback_to` pour que le frontend sache afficher le bon message.
  - [ ] Dans le composant qui consomme le streaming (ex. `AIGenerationPanel` ou équivalent) : à la réception d'un event indiquant fallback, afficher un toast non bloquant (5 s timeout). Réutiliser le mécanisme de toast existant (s'il existe) ou un composant simple (ex. react-hot-toast, ou state + div fixe).
  - **TDD :** E2E optionnel : lancer une génération avec primary mocké en échec et fallback en succès → toast visible puis génération terminée.

- [ ] Task 5 : Message d'erreur "Tous les providers indisponibles" (AC: #3)
  - **TDD :** Test API : quand tous les clients de la chaîne échouent, réponse 503 (ou 500) avec body contenant message "Tous les providers LLM sont indisponibles" ; pas d'appel `track_usage` avec success=True (coût 0 pour les tentatives échouées, optionnellement track des échecs avec success=False).
  - [ ] Dans le wrapper/orchestrator : si tous les providers ont échoué, lever une exception dédiée (ex. `AllLLMProvidersUnavailableError`) avec message clair ; handler dans `api/routers/graph.py` → 503 + message.
  - [ ] S'assurer qu'aucun coût n'est enregistré pour une génération qui n'a jamais réussi (pas de track_usage success=True).

- [ ] Task 6 : Tests et non-régression (AC: tous)
  - **TDD :** S'assurer que tous les tests existants restent verts : `tests/test_llm_factory.py`, `tests/services/test_unity_dialogue_orchestrator.py`, `tests/api/test_graph_generate_node.py`. Ne pas casser le cas "pas de fallback" (fallback_chain vide ou un seul modèle).
  - [ ] Ajouter tests unitaires pour le wrapper FallbackLLMClient (ou la factory étendue) : retry 3x, puis fallback ; tous échouent ; pas de fallback si succès au premier coup.
  - [ ] Ajouter test d'intégration API : generate-node avec fallback_chain configuré, primary en échec, fallback en succès → 200 et corps conforme.
  - [ ] Pas de régression sur Epic 0 Story 0.7 (cost governance) ni Story 1.13 (coûts cumulatifs).

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

### File List
