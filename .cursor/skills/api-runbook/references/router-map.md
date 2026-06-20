# Router map — prefix → code → client → tests

Enregistrement dans [`api/main.py`](../../../api/main.py). OpenAPI live : `GET /api/openapi.json` (dev).

| Prefix API | Router(s) | Client TS | Tests pytest (exemples) |
|------------|-----------|-----------|-------------------------|
| `/api/v1/auth` | `auth.py` | `auth.ts` | `test_auth.py` |
| `/api/v1/dialogues` | `dialogues.py`, `streaming.py` | `dialogues.ts` | `test_dialogues.py`, `test_streaming_router.py` |
| `/api/v1/unity-dialogues` | `unity_dialogues.py` | `unityDialogues.ts` | `test_unity_dialogues*.py` |
| `/api/v1/unity-dialogues/graph` | `graph_*.py` (7 modules) | `graph.ts` | `test_graph_*.py` |
| `/api/v1/documents` | `documents.py` | `documents.ts` | `test_documents*.py` |
| `/api/v1/context` | `context.py` | `context.ts`, `gddContextStale.ts` | `test_context*.py`, `test_precomputed_entity_tokens.py` |
| `/api/v1/config` | `config.py` | `config.ts` | `test_config*.py` |
| `/api/v1/llm-usage` | `llm_usage.py` | `llmUsage.ts` | `test_llm_usage.py` |
| `/api/v1/costs` | `costs.py` | `costs.ts` | `test_costs.py` |
| `/api/v1/logs` | `logs.py` | (frontend logs util) | `test_logs.py` |
| `/api/vocabulary` | `vocabulary.py` | `vocabulary.ts` | `test_vocabulary.py` |
| `/api/narrative-guides` | `narrative_guides.py` | `vocabulary.ts` | `test_narrative_guides_api.py` |
| `/api/v1/mechanics/flags` | `mechanics_flags.py` | `flags.ts` | `test_mechanics_flags.py` |
| `/api/v1/mechanics/systems` | `mechanics_systems.py` | `gameSystemsIntegration.ts` | `test_mechanics_systems_integration.py` |
| `/api/v1/validation/rules` | `validation_rules.py` | (via graph validate) | `test_validation_rules_*.py` |
| `/api/v1/presets` | `presets.py` | `presets.ts` | `test_presets*.py` |
| `/api/v1/gdd-notion-sync` | `gdd_notion_sync.py` | `gddNotionSync.ts` | `test_gdd_notion_sync.py` |
| `/health`, `/api/v1/healthcheck` | `main.py` | — | `test_health*.py` |

**Note** : `/api/v1/interactions/*` supprimé — utiliser documents / unity-dialogues.

**Graph** : tous les routers `graph_*.py` partagent le prefix `/api/v1/unity-dialogues/graph` (auth JWT sauf `DISABLE_AUTH`).
