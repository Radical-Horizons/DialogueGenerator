# Code Review — Story 1.16 Fallback LLM (FR79)

**Story:** 1-16-fallback-vers-provider-llm-alternatif-en-cas-déchec-fr79  
**Review date:** 2026-03-06  
**Git vs File List:** Aucune incohérence (fichiers story modifiés/créés = File List). Fichiers hors scope (data/notion_cache, test_prompt_output.txt, sprint-status) ignorés.

---

## Résumé

**Problèmes trouvés :** 2 High, 2 Medium, 3 Low (7 au total).

Les AC #1–#4 et la majeure partie de #5 sont implémentés. Il manque l’exposition des champs fallback dans les logs de génération (AC#5) et quelques points de qualité/test.

---

## HIGH

### 1. [HIGH] AC#5 partiel — Les logs de génération n’affichent pas le fallback

**Fichier:** `services/llm_usage_service.py` — `get_generation_logs()` (l.353–370)

**Constat:** AC#5 exige que « le log affiche clairement "Fallback: OpenAI → Mistral" avec raison » et que « les métriques de fallback sont trackées ».  
`LLMUsageRecord` a bien `fallback_from` et `fallback_reason`, et `track_usage()` les enregistre, mais **les `entries` retournées par `get_generation_logs()` ne contiennent pas ces champs**. L’API `GET /api/v1/llm-usage/dialogue/{id}/generation-logs` ne les expose donc pas.

**Action:** Ajouter `fallback_from` et `fallback_reason` dans chaque entrée du dictionnaire `entries` dans `get_generation_logs()` (et les documenter dans le schéma de réponse si présent).

---

### 2. [HIGH] Cohérence — Breakdown coûts par nœud sans info fallback

**Fichier:** `services/llm_usage_service.py` — `get_dialogue_costs()` (l.291–304, `breakdown`)

**Constat:** Le `breakdown` par nœud contient `node_id`, `model_name`, `cost_eur`, etc., mais pas `fallback_from` ni `fallback_reason`. Pour un même dialogue, on ne peut pas savoir dans le détail des coûts si un nœud a été généré via fallback.  
Cohérence avec AC#5 et avec les logs de génération une fois corrigés.

**Action:** Ajouter `fallback_from` et `fallback_reason` (optionnels) dans chaque élément de `breakdown` dans `get_dialogue_costs()`.

---

## MEDIUM

### 3. [MEDIUM] Couverture de test — Pas de test d’intégration fallback → track_usage

**Fichiers:** `tests/core/llm/test_fallback_client.py`, `core/llm/fallback_client.py`

**Constat:** Les tests vérifient : primary success (pas de fallback), primary fail → fallback success, tous échouent → `AllLLMProvidersUnavailableError`, et `get_max_tokens`.  
Ils ne vérifient pas que, lorsqu’un fallback réussit, le `usage_service.track_usage` est appelé avec `fallback_from` et `fallback_reason` (via `_FallbackUsageWrapper`). La signature est testée dans `test_llm_usage_service.test_track_usage_with_fallback_from_reason`, mais pas le flux réel `FallbackLLMClient` → wrapper → `track_usage`.

**Action:** Ajouter un test (ex. dans `test_fallback_client.py`) qui mocke `usage_service.track_usage`, déclenche un fallback (primary en erreur, fallback OK), puis vérifie que `save` a été appelé avec un `LLMUsageRecord` où `fallback_from` et `fallback_reason` sont renseignés.

---

### 4. [MEDIUM] Documentation / schéma API — Réponse generation-logs

**Fichiers:** `api/schemas/llm_usage.py` (si schéma de réponse pour generation-logs), documentation API

**Constat:** Après ajout de `fallback_from` et `fallback_reason` dans `get_generation_logs`, le schéma Pydantic de la réponse (et la doc OpenAPI) doivent les refléter pour que les clients sachent qu’ils peuvent afficher « Fallback: X → Y (raison) ».

**Action:** Mettre à jour le schéma de réponse des generation-logs (et la doc) pour inclure `fallback_from` et `fallback_reason` (optionnels) sur chaque entrée.

---

## LOW

### 5. [LOW] Bruit de commentaire

**Fichier:** `services/configuration_service.py` (l.5)

**Constat:** `# Added Union` en fin de ligne d’import n’apporte pas d’info utile.

**Action:** Supprimer le commentaire ou le remplacer par une doc pertinente si besoin.

---

### 6. [LOW] Story — Dev Agent Record incomplet

**Fichier:** `_bmad-output/implementation-artifacts/1-16-fallback-vers-provider-llm-alternatif-en-cas-déchec-fr79.md`

**Constat:** La section « Agent Model Used » est laissée à « (à remplir par l’agent d’implémentation) ».

**Action:** Renseigner le modèle utilisé pour l’implémentation ou laisser tel quel si non exigé par le processus.

---

### 7. [LOW] Robustesse API — Test 503 tous providers indisponibles

**Fichier:** `tests/api/` (endpoints graph ou llm)

**Constat:** Aucun test API ou E2E ne vérifie que lorsque tous les providers échouent, l’endpoint (ex. `POST .../generate-node`) retourne bien **503** avec `AllLLMProvidersUnavailableError`. Le handler global `APIException` dans `api/main.py` renvoie bien `exc.status_code` (503), mais ce comportement n’est pas couvert par un test.

**Action:** (Optionnel) Ajouter un test API qui mocke tous les clients en échec et vérifie le status 503 et le code d’erreur `ALL_LLM_PROVIDERS_UNAVAILABLE`.

---

## Vérifications effectuées (OK)

- **AC#1** : Toast dynamique `fallback_from` / `fallback_to` dans `useSSEStreaming.ts` ; métadonnées SSE avec `used_fallback`, `fallback_from`, `fallback_to` (orchestrator + streaming.py). OK.
- **AC#2** : Format Unity inchangé ; `_FallbackUsageWrapper` injecte `fallback_from`/`fallback_reason` ; coût Mistral tracké. OK.
- **AC#3** : `AllLLMProvidersUnavailableError` (503) ; pas de `track_usage(success=True)` quand tout échoue. OK.
- **AC#4** : `fallback_chain` dans `llm_config.json`, `get_llm_fallback_chain()`, ordre respecté. OK.
- **Tasks [x]** : Config, FallbackLLMClient, factory, orchestrator, graph (generate-node + regenerate), streaming metadata, toast, exceptions, tests unitaires — tous présents et cohérents.
- **Exception 503** : `api_exception_handler` utilise `exc.status_code` → 503 correct.
- **Retry** : `api.utils.retry.retry_with_backoff` utilisé avec backoff exponentiel (3 tentatives). OK.

---

## Synthèse

| Sévérité | Nombre |
|----------|--------|
| High     | 2      |
| Medium   | 2      |
| Low      | 3      |

Recommandation : corriger les 2 HIGH et les 2 MEDIUM avant de passer la story en *done* ; traiter les LOW selon la priorité du projet.

---

## Corrections appliquées (2026-03-06)

- **HIGH 1** : `get_generation_logs()` — ajout de `fallback_from` et `fallback_reason` dans chaque entrée (`services/llm_usage_service.py`).
- **HIGH 2** : `get_dialogue_costs()` breakdown — ajout de `fallback_from` et `fallback_reason` (`services/llm_usage_service.py`).
- **MEDIUM 3** : Test d’intégration `test_fallback_success_calls_track_usage_with_fallback_from_reason` ajouté dans `tests/core/llm/test_fallback_client.py`.
- **MEDIUM 4** : Schémas `GenerationLogEntry` et `NodeCostEntry` mis à jour avec `fallback_from` et `fallback_reason` (`api/schemas/llm_usage.py`).
- **LOW 5** : Commentaire `# Added Union` supprimé dans `services/configuration_service.py`.

Tous les tests ciblés (39) passent.
