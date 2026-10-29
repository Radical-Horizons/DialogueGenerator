---
title: 'Endpoints contexte GDD non-bloquants pour la boucle asyncio'
type: 'bugfix'
created: '2026-08-13'
status: 'done'
review_loop_iteration: 2
context: []
baseline_commit: '916e5200a8b4d459bf3eb22b352f61abac755f3c'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `ContextBuilder.build_context_json()`/`load_gdd_files()` (`core/context/context_builder.py`) sont synchrones, appelées depuis de nombreux handlers `async def` FastAPI. Sur la boucle asyncio mono-thread, ce travail bloque toute autre requête HTTP en vol pendant son exécution. v1 (RLock + 3 endpoints déportés) et v2 (11 endpoints) ont chacune été revertées après revue à 3 lentilles (adversarial, edge-case-hunter, verification-gap) ayant trouvé des appelants supplémentaires non couverts — le pattern « chasser chaque site un par un » ne convergeait pas, et un verrou bloquant classique aggravait le bug (boucle event elle-même bloquée en attente du verrou).

**Approche (v3)** : deux mécanismes indépendants, plutôt qu'une seule liste de sites à chasser.
1. **Verrou asymétrique sur `ContextBuilder`** : `load_gdd_files()` (écriture, mutation multi-étapes non atomique) reste strictement bloquant. `build_context_json()` (lecture) passe en `acquire(timeout=0.2s)` + repli **sans verrou** si contesté — ferme structurellement le risque « boucle event bloquée sur le verrou », quel que soit l'appelant, présent ou futur.
2. **Garde-fou runtime** dans les deux méthodes : si exécutées alors qu'une boucle asyncio tourne sur le thread appelant (détecté via `asyncio.get_running_loop()`, silencieux sous pytest via `"pytest" in sys.modules`), log ERROR throttlé avec stack — rend visible toute future régression au lieu de la laisser geler l'app en silence.
3. **Déport `asyncio.to_thread`** sur l'inventaire complet vérifié des appelants synchrones directs (voir Code Map) — ferme le problème initial (travail CPU-bound sur la boucle) pour tous les sites connus aujourd'hui.

Reproduction réelle effectuée avant cette spec (sync GDD complète réelle + requêtes concurrentes mesurées) : latences 0.2-2.9s pendant la sync, jamais 90-140s — confirme que le verrou non bloquant + déport ciblé est proportionné ; une refonte async complète (chiffrée à 66 fichiers, ~29 signatures, 2 ponts thread↔event-loop) n'est pas justifiée.

## Boundaries & Constraints

**Always:** `load_gdd_files()` reste bloquant sans timeout (correction). `build_context_json()` utilise le repli sans verrou en cas de contention — jamais d'attente illimitée sur la boucle event. Le garde-fou ne lève jamais d'exception, seulement un log.

**Ask First:** Si un appelant synchrone supplémentaire de ces deux méthodes est découvert en cours d'implémentation, au-delà de la liste de la Code Map, HALT et demander avant de l'ajouter.

**Never:** Ne pas rendre `build_context_json`/`load_gdd_files` `async def` (refonte écartée). Ne pas restructurer le mécanisme coopératif pause/annulation de la sync complète — déporter uniquement l'appel synchrone concerné. Ne pas introduire de queue/job pour les endpoints requête-réponse.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Lecture concurrente à une écriture | `load_gdd_files()` en cours dans un thread, `build_context_json()` appelée ailleurs | Repli sans verrou après 0.2s, pas d'attente prolongée | N/A |
| Appelant futur non déporté | Un code non listé appelle `build_context_json` directement sur la boucle event | Log ERROR throttlé visible (hors pytest), pas de crash | N/A |
| Requête légère concurrente à un calcul lourd déporté | `/estimate-tokens` en thread + `GET /health` arrive | `/health` répond sans attendre | N/A |

</frozen-after-approval>

## Code Map

- `core/context/context_builder.py` — `threading.RLock` (init ~163) ; `load_gdd_files()` (248) bloquant classique ; `build_context_json()` (739) `acquire(timeout=0.2)` + repli sans verrou ; fonctions module-level `_is_test_environment()` + `_warn_if_running_on_event_loop(operation)` appelées en 1re ligne des deux méthodes
- `api/routers/context_build.py` — `build_context` (171), `estimate_context_tokens` (318, couvrir aussi l'appel `compute_context_selection_token_metrics` L353), `optimize_context` (410) : corps entier en fonction imbriquée déportée
- `api/routers/dialogues.py` — `preview_prompt` (371), `estimate_tokens` (476, tout le `try` 497-567 — couvre `_build_prompt_from_request` ET `compute_context_selection_token_metrics`, oubli de v2), `get_raw_json_context` (1336)
- `api/routers/config.py` — `preview_context` (1073)
- `api/routers/gdd_notion_sync.py` — `restore_gdd_notion_archive` (397) : déport de l'appel `svc.restore_gdd_archive(...)`
- `api/routers/context_staleness.py` — `post_gdd_content_fingerprint` (27) : déport de l'appel `compute_gdd_content_fingerprint`
- `api/routers/graph_generation.py` — `generate_node` (184) : déport de l'appel `fingerprint_for_selections_safe` (L253)
- `api/routers/graph_node_history.py` — `regenerate_node` (266) : même pattern (L336)
- `api/routers/graph_validation.py` — `validate_lore_explicit` (159) : déport de l'appel `merge_lore_facts_with_context_builder` (L175)
- `api/routers/graph_cost.py` — `estimate_cost` (168, via `fingerprint_for_selections_safe` L57)
- `services/unity_dialogue_orchestrator.py` — `generate_with_events` (générateur async, 131) : un seul appel déporté (L206), ne pas déporter la fonction entière
- `services/gdd_notion_sync_service.py` — `_sync_body` (~1547, appel `_promote_and_finalize`), `_sync_entity_by_name_locked` (~1082-1107, tail synchrone), `_apply_staging_despite_errors` (1323-1452, corps entier — couvre aussi le second appel redondant au hook ~1436-1437), `_sync_one_source` (tail ~2002-2077, `_append_entity_history` L2061 — site trouvé lors de cette replanification)
- `services/batch_node_generation_service.py` — `generate_batch` (159), point d'exécution de `fingerprint_for` (L246)
- `tests/api/test_context_endpoints_non_blocking.py`, `tests/test_context_builder_event_loop_guard.py`, `tests/test_context_builder_concurrency.py` — nouveaux fichiers de test

Hors périmètre (vérifié, ne pas toucher) : `precomputed_entity_tokens` (chemin différent), `api/routers/presets.py`/`services/preset_service.py`/`api/container.py:374` (déjà auto-threadpoolés par Starlette, endpoints `def` non-async).

## Tasks & Acceptance

**Execution:**
- [x] `core/context/context_builder.py` — verrou asymétrique + garde-fou runtime (voir Code Map et Intent)
- [x] `api/routers/context_build.py`, `dialogues.py`, `config.py`, `gdd_notion_sync.py`, `context_staleness.py`, `graph_generation.py`, `graph_node_history.py`, `graph_validation.py`, `graph_cost.py` — déport `asyncio.to_thread` par site (voir Code Map). Note : `graph_cost.py::estimate_cost` n'appelle plus `fingerprint_for_selections_safe` dans le code actuel (le code a bougé depuis l'écriture du plan) — aucun appel `ContextBuilder` synchrone dans cette fonction, donc rien à déporter. Vérifié par lecture complète du fichier.
- [x] `services/unity_dialogue_orchestrator.py`, `services/gdd_notion_sync_service.py`, `services/batch_node_generation_service.py` — déport `asyncio.to_thread` par site (voir Code Map)
- [x] `tests/api/test_context_endpoints_non_blocking.py` — recréé (design v2 : `threading.Event` pour synchronisation déterministe, `httpx.AsyncClient(ASGITransport)`, `/health` concurrent < moitié du sleep simulé) + étendu avec `POST /context/gdd-content-fingerprint` (2e site nouvellement déporté)
- [x] `tests/test_context_builder_event_loop_guard.py` — 4 cas du garde-fou (log si hors-pytest+boucle active, silence en pytest, silence sans boucle, throttling) + 1 cas additionnel (throttling par clé d'opération)
- [x] `tests/test_context_builder_concurrency.py` — écriture bloquante classique, lecture avec timeout + repli mesuré
- [x] Revue à 3 lentilles post-implémentation (adversarial, edge-case-hunter, verification-gap) : 2 bugs réels trouvés et corrigés — `api/main.py:149` (faux positif du garde-fou au démarrage, `get_context_builder()` non déporté dans le lifespan ASGI) et une race condition sur `previous_dialogue_preview` (état mutable partagé sur le `ContextBuilder` singleton, set+lecture non atomiques une fois déportées en thread réel — nouveau verrou dédié `_previous_dialogue_lock` + méthodes `build_context_json_with_previous_dialogue`/`set_previous_dialogue_context_locked`, test de régression dédié). Findings mineurs restants consignés dans `deferred-work.md`.

**Acceptance Criteria:**
- Given tout appelant (connu ou futur non déporté) de `build_context_json`, when un writer détient le verrou, then aucune attente illimitée sur la boucle event (timeout 0.2s + repli)
- Given un appelant non déporté hors pytest, when il s'exécute sur la boucle event, then un log ERROR visible est émis
- Given les endpoints modifiés, when appelés avec les fixtures existantes, then même payload qu'avant (suites listées en Verification toujours vertes)

## Design Notes

Reproduction Phase 0 (sync GDD complète réelle + requêtes concurrentes) : latences mesurées 0.2-2.9s, jamais 90-140s — voir plan approuvé `C:\Users\ecali\.claude\plans\moonlit-plotting-swing.md` pour le détail du chiffrage comparatif (refonte async complète : 66 fichiers, ~29 signatures, 2 ponts thread↔event-loop, écartée).

## Verification

**Commands:**
- `node scripts/getPythonPath.js -m pytest tests/api/test_context.py tests/api/test_context_optimize.py tests/api/test_context_estimate_tokens_perf.py tests/api/test_context_endpoints_non_blocking.py tests/api/test_dialogues.py tests/api/test_config.py tests/test_context_builder_event_loop_guard.py tests/test_context_builder_concurrency.py -v` -- expected: tous verts (71 passed, confirmé)
- `node scripts/getPythonPath.js -m pytest tests/ -k "context_builder or gdd_notion_sync or lore_contradiction or gdd_context_fingerprint or graph_generation or graph_node_history" -v` -- expected: verts (187 passed, 2137 deselected, confirmé)

## Suggested Review Order

**Verrou asymétrique + garde-fou runtime**

- Point d'entrée : verrou de rechargement (écriture bloquante), verrou dédié previous-dialogue, garde-fou runtime déclarés ensemble.
  [`context_builder.py:296`](../../core/context/context_builder.py#L296)

- `load_gdd_files()` (écriture) reste strictement bloquant sous `_reload_lock`, sans timeout — mutation multi-étapes non atomique.
  [`context_builder.py:341`](../../core/context/context_builder.py#L341)

- `build_context_json()` (lecture) : `acquire(timeout=0.2s)` + repli sans verrou si contesté, jamais d'attente illimitée sur la boucle event.
  [`context_builder.py:926`](../../core/context/context_builder.py#L926)

- `_warn_if_running_on_event_loop` : log ERROR throttlé si appel synchrone direct sur une boucle active, silencieux sous pytest.
  [`context_builder.py:69`](../../core/context/context_builder.py#L69)

**Race condition previous-dialogue (corrigée après revue, pas dans le plan initial)**

- `build_context_json_with_previous_dialogue` : set + build atomiques sous `_previous_dialogue_lock`, dédié — évite l'entrelacement de deux threads concurrents sur ce `ContextBuilder` singleton.
  [`context_builder.py:745`](../../core/context/context_builder.py#L745)

- `set_previous_dialogue_context_locked` : écriture seule verrouillée, pour le site où elle n'est pas immédiatement suivie d'un build.
  [`context_builder.py:729`](../../core/context/context_builder.py#L729)

- 3 sites `dialogues.py` migrés vers la méthode atomique.
  [`dialogues.py:325`](../../api/routers/dialogues.py#L325) · [`dialogues.py:531`](../../api/routers/dialogues.py#L531) · [`dialogues.py:1381`](../../api/routers/dialogues.py#L1381)

- Orchestrateur SSE : set + build combinés dans le même `asyncio.to_thread`, jamais le set seul sur la boucle event.
  [`unity_dialogue_orchestrator.py:209`](../../services/unity_dialogue_orchestrator.py#L209)

**Faux positif garde-fou au démarrage (corrigé après revue, empiriquement reproduit puis vérifié)**

- `get_context_builder()` déporté dans le lifespan ASGI — sinon déclenche le garde-fou à chaque démarrage/déploiement.
  [`main.py:149`](../../api/main.py#L149)

**Déport `asyncio.to_thread` — endpoints routeurs**

- 3 endpoints, corps entier en fonction imbriquée déportée.
  [`context_build.py:189`](../../api/routers/context_build.py#L189) · [`context_build.py:346`](../../api/routers/context_build.py#L346) · [`context_build.py:436`](../../api/routers/context_build.py#L436)

- `preview_context`, corps entier déporté.
  [`config.py:1091`](../../api/routers/config.py#L1091)

- Fingerprint GDD, appel unique déporté.
  [`context_staleness.py:37`](../../api/routers/context_staleness.py#L37)

- Restauration d'archive, appel unique déporté (I/O disque bloquant).
  [`gdd_notion_sync.py:407`](../../api/routers/gdd_notion_sync.py#L407)

- `generate_node`/`regenerate_node`, fingerprint post-génération déporté.
  [`graph_generation.py:253`](../../api/routers/graph_generation.py#L253) · [`graph_node_history.py:337`](../../api/routers/graph_node_history.py#L337)

- Validation lore explicite, corps entier déporté.
  [`graph_validation.py:166`](../../api/routers/graph_validation.py#L166)

**Déport `asyncio.to_thread` — services**

- 3 sites sync GDD : finalisation entité, application staging après erreurs, écriture par source.
  [`gdd_notion_sync_service.py:1082`](../../services/gdd_notion_sync_service.py#L1082) · [`gdd_notion_sync_service.py:1343`](../../services/gdd_notion_sync_service.py#L1343) · [`gdd_notion_sync_service.py:2047`](../../services/gdd_notion_sync_service.py#L2047)

- Promotion finale du staging, déportée depuis `_sync_body`.
  [`gdd_notion_sync_service.py:1556`](../../services/gdd_notion_sync_service.py#L1556)

- Fingerprint dans la boucle de génération batch.
  [`batch_node_generation_service.py:248`](../../services/batch_node_generation_service.py#L248)

**Tests**

- Non-blocage bout en bout : `threading.Event` déterministe, `httpx.AsyncClient(ASGITransport)`, 2 sites couverts.
  [`test_context_endpoints_non_blocking.py:1`](../../tests/api/test_context_endpoints_non_blocking.py#L1)

- Garde-fou runtime : 5 cas (log actif, silence pytest, silence sans boucle, throttling).
  [`test_context_builder_event_loop_guard.py:1`](../../tests/test_context_builder_event_loop_guard.py#L1)

- Verrou asymétrique + régression race previous-dialogue : écriture bloquante, lecture avec repli, entrelacement à deux threads.
  [`test_context_builder_concurrency.py:1`](../../tests/test_context_builder_concurrency.py#L1)
