---
title: 'OpenRouter + modèles admin (Aion 2.0)'
type: 'feature'
created: '2026-07-23'
status: 'done'
baseline_commit: '2f80db7c69de35b08be08ddb42917201034d9743'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics/epic-00.md'
  - '{project-root}/.cursor/skills/llm-model-update/SKILL.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** DialogueGenerator ne parle qu’à OpenAI et Mistral. Les modèles finetuned / narratifs (ex. Aion 2.0 via OpenRouter) ne sont pas sélectionnables pour la génération de dialogues, et il n’existe aucun panneau admin pour gérer le catalogue de modèles.

**Approach:** Ajouter un provider `openrouter` (SDK OpenAI-compatible, clé `OPENROUTER_API_KEY` déjà présente chez l’utilisateur), seed `aion-labs/aion-2.0` dans le catalogue, débloquer la génération Unity pour ces modèles, et livrer un panneau admin CRUD des entrées `available_models` (+ pricing associé).

## Boundaries & Constraints

**Always:**
- `OPENROUTER_API_KEY` via env (documenter dans `.env.example`) — jamais en dur.
- `OpenRouterClient` implémente `ILLMClient` ; factory `client_type: "openrouter"` ; `base_url=https://openrouter.ai/api/v1`.
- Premier modèle seed : `aion-labs/aion-2.0` (display name clair, ex. « Aion 2.0 (OpenRouter) »).
- Génération de dialogue (Unity / graphe node gen) peut sélectionner et exécuter ce modèle.
- Admin-only : ajouter / modifier / supprimer des modèles OpenRouter (et champs pricing nécessaires).
- Streaming SSE + structured output « au mieux » (chemin Chat Completions / tools, pas Responses API GPT-5).
- Coûts : entrée dans `llm_pricing.json` pour Aion (`0.80` / `1.60` $/1M) et upsert pricing depuis l’admin quand un modèle est créé/édité.

**Ask First:**
- Changer le `default_model` global vers Aion (défaut : **ne pas** changer ; l’utilisateur sélectionne Aion).
- Ajouter d’autres providers OpenRouter en masse (catalogue live OpenRouter) — hors scope V1 sauf si demandé.
- Fallback automatique OpenRouter → OpenAI (V1 : erreur claire, bascule manuelle).

**Never:**
- Remplacer OpenAI/Mistral directs.
- Forcer Aion sur expand-tree (reste Luna).
- Stocker la clé OpenRouter dans `llm_config.json` ou la base.
- Utiliser OpenRouter comme source de vérité pour les capacités des modèles OpenAI natifs (skill `llm-model-update`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path gen | `llm_model_identifier=aion-labs/aion-2.0`, clé OK | Client OpenRouter, Unity JSON / stream OK, usage+cost trackés | N/A |
| Clé absente | modèle openrouter sélectionné, env vide | Pas de Dummy silencieux trompeur pour ce type | Erreur explicite « OPENROUTER_API_KEY manquante » |
| Whitelist Unity | request gen avec Aion | Accepté (plus limité aux seuls GPT-5.6) | Autres modèles hors catalogue restent refusés ou Dummy selon factory |
| Admin CRUD | admin POST modèle openrouter + pricing | Persiste `llm_config` + `llm_pricing` ; visible dans `GET …/llm/models` et sélecteurs | 403 guest/writer ; 400 slug/client_type invalides |
| OpenRouter down | API 5xx / model unavailable | Message clair à l’UI | Pas de fallback auto |
| Guest | tente CRUD admin modèles | Refusé | 403 |

</frozen-after-approval>

## Code Map

- `factories/llm_factory.py` -- branche `openrouter` + env `openrouter_api_key_env_var`
- `core/llm/openrouter_client.py` (nouveau) -- ILLMClient via openai SDK + base_url OpenRouter
- `core/llm/openai/client.py` / `mistral_client.py` -- patterns streaming, usage, structured
- `config/llm_config.json` / `config/llm_pricing.json` -- seed Aion + clé env var name
- `services/configuration_service.py` / `services/llm_pricing_service.py` -- persist catalogue & prix
- `api/routers/config.py` -- étendre ou ajouter CRUD admin modèles (require_admin)
- `api/schemas/dialogue.py` + `frontend/src/utils/generationConfigNormalization.ts` + `constants.py` -- élargir whitelist Unity aux modèles openrouter du catalogue
- `frontend/src/components/generation/ModelSelector.tsx` + `store/llmStore.ts` -- optgroup OpenRouter
- `frontend/src/components/admin/LlmModelsPanel.tsx` (nouveau) + `App.tsx` / `Header.tsx` -- route `/admin/llm-models`
- `tests/test_llm_factory.py`, tests client OpenRouter mockés, tests API admin modèles, Vitest panel/selector

## Tasks & Acceptance

**Execution:**
- [x] `core/llm/openrouter_client.py` + `factories/llm_factory.py` -- provider openrouter (Chat Completions, stream, tools/JSON) -- exécuter Aion
- [x] `config/llm_config.json` + `llm_pricing.json` + `.env.example` -- seed Aion + `OPENROUTER_API_KEY` documenté
- [x] `api/schemas/dialogue.py` + `generationConfigNormalization.ts` + `constants.py` -- autoriser modèles `client_type=openrouter` du catalogue pour gen Unity
- [x] `api/routers/config.py` (+ schemas) -- endpoints admin CRUD modèles/pricing (ou RMW sûr sur `available_models`)
- [x] `frontend/.../LlmModelsPanel.tsx` + routes Header -- UI admin add/edit/delete
- [x] `ModelSelector.tsx` + `llmStore.ts` (+ selects graphe si union provider) -- afficher groupe OpenRouter
- [x] Tests pytest/Vitest ciblés -- matrice I/O (factory, whitelist, CRUD 403, pricing)

**Acceptance Criteria:**
- Given `OPENROUTER_API_KEY` et seed Aion, when l’utilisateur choisit Aion dans le sélecteur de génération, then la requête part vers OpenRouter et un nœud/dialogue est produit.
- Given un admin, when il ajoute un modèle openrouter (slug + display + prix), then le modèle apparaît dans `GET /api/v1/config/llm/models` et dans les sélecteurs sans redéployer le code.
- Given guest/writer, when CRUD modèles, then 403.
- Given clé manquante, when génération openrouter, then erreur explicite (pas de succès Dummy).
- Given expand-tree, when modèle forcé, then toujours Luna (inchangé).

## Design Notes

OpenRouter = drop-in OpenAI Chat Completions (`base_url` + Bearer). Ne pas router Aion via Responses API GPT-5. Structured output : tools / json_schema selon ce que le modèle accepte ; si SO strict échoue, message d’erreur actionnable (pas de silence).

Whitelist Unity aujourd’hui = GPT-5.6 only (`dialogue.py` + FE normalization) — **bloquant** pour tester Aion : autoriser tout `api_identifier` présent dans `available_models` avec `client_type=openrouter` (ou liste dérivée du catalogue), sans ouvrir tous les slugs arbitraires.

Admin : miroir `UserManagementPanel` ; préférer endpoints dédiés `POST/PATCH/DELETE …/config/llm/models` plutôt qu’un `PUT /llm` brut qui risque d’écraser la config.

Pricing Aion OpenRouter (juil. 2026) : $0.80 / $1.60 per 1M in/out.

## Verification

**Commands:**
- `node scripts/getPythonPath.js -m pytest tests/test_llm_factory.py tests/core/llm/ -k openrouter -v --tb=short` -- expected: pass
- `node scripts/getPythonPath.js -m pytest tests/api/ -k "llm_model or openrouter or llm_config" -v --tb=short` -- expected: pass
- `cd frontend && npx vitest run src/components/admin src/components/generation/ModelSelector --reporter=dot` -- expected: pass

**Manual checks:**
- Avec clé réelle : sélectionner Aion → générer un nœud → usage/cost non nuls dans les logs.
- Admin `/admin/llm-models` : add → visible dans sélecteur → edit display → delete.

## Suggested Review Order

**Provider OpenRouter**

- Client Chat Completions + tools (pas Responses API GPT-5)
  [`openrouter_client.py:22`](../../core/llm/openrouter_client.py#L22)

- Branche factory `client_type=openrouter` + erreur clé explicite
  [`llm_factory.py:168`](../../factories/llm_factory.py#L168)

- Erreur clé → event SSE utilisable (pas 500 opaque)
  [`unity_dialogue_orchestrator.py:262`](../../services/unity_dialogue_orchestrator.py#L262)

**Whitelist Unity + seed**

- Autorise GPT-5.6 + openrouter du catalogue
  [`dialogue.py:476`](../../api/schemas/dialogue.py#L476)

- Seed Aion 2.0 dans le catalogue
  [`llm_config.json:48`](../../config/llm_config.json#L48)

**Admin CRUD**

- POST/PATCH/DELETE modèles openrouter + pricing
  [`config.py:308`](../../api/routers/config.py#L308)

- Panneau admin add/edit/delete
  [`LlmModelsPanel.tsx:38`](../../frontend/src/components/admin/LlmModelsPanel.tsx#L38)

**Sélecteur génération**

- Optgroup OpenRouter dans le sélecteur
  [`ModelSelector.tsx:62`](../../frontend/src/components/generation/ModelSelector.tsx#L62)
