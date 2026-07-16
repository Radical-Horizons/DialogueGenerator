---
name: llm-model-update
description: >-
  Ajoute ou remplace des modèles LLM (OpenAI GPT, Mistral) dans DialogueGenerator :
  doc officielle, config, pricing, constants, validateurs, parameter_builder,
  UI reasoning, migration legacy, tests. Use when adding GPT models, migrating
  Sol/Terra/Luna or any new slug, updating llm_config/llm_pricing, or fixing
  temperature/top_p/reasoning.effort API 400 errors.
paths:
  - "constants.py"
  - "config/llm_config.json"
  - "config/llm_pricing.json"
  - "frontend/src/constants.ts"
  - "core/llm/**"
  - "factories/llm_factory.py"
  - "api/schemas/dialogue.py"
  - "api/schemas/graph.py"
---

# Mise à jour des modèles LLM

Rule courte (invariants) : [`.cursor/rules/llm.mdc`](../../rules/llm.mdc)  
Doc technique : [`docs/architecture/OPENAI_API_GPT5.md`](../../../docs/architecture/OPENAI_API_GPT5.md)  
Touchpoints détaillés : [`references/touchpoints.md`](references/touchpoints.md)

## Quand appliquer

- Nouveaux slugs OpenAI/Mistral, remplacement d'une famille (ex. GPT-5.2 → 5.6)
- Erreurs API `Unsupported parameter` (`temperature`, `top_p`, …)
- Désalignement UI / `llm_config` / whitelist Unity / expand-tree

## Sources autorisées (uniquement)

| OK | Interdit |
|----|----------|
| `developers.openai.com/api/docs/models/{slug}` | Blogs, OpenRouter, agrégateurs |
| `developers.openai.com/api/docs/guides/latest-model` | Guides tiers / tweets |
| `developers.openai.com/api/docs/guides/reasoning` | Extrapolation depuis une génération précédente |
| Doc Mistral officielle (`docs.mistral.ai`) | |

**Ne jamais** recopier les capacités d'un ancien modèle (« 5.2 acceptait X donc 5.6 aussi »).

## Workflow (ordre strict)

Copier et cocher :

```text
Progress:
- [ ] 1. Doc officielle lue (page modèle + latest-model / reasoning)
- [ ] 2. Fiche capacités remplie (ci-dessous)
- [ ] 3. Config + pricing + constants backend/frontend
- [ ] 4. Gates parameter_builder + MODELS_WITHOUT_*
- [ ] 5. Validateurs Unity / expand-tree / LEGACY_MODEL_ID_MAP
- [ ] 6. UI reasoning (effort values) + defaults
- [ ] 7. Tests ciblés + preuve (log ou appel)
- [ ] 8. llm.mdc + OPENAI_API_GPT5.md alignés si comportement change
```

### 1 — Lire la doc

Pour chaque slug :

1. Ouvrir `https://developers.openai.com/api/docs/models/{slug}`
2. Ouvrir le guide modèle courant (`latest-model`) et `reasoning`
3. Noter : ID API, alias, context / max output, pricing, structured outputs, `reasoning.effort` **et défaut si omis**, support **réel** de `temperature` / `top_p`, endpoint (Responses vs Chat)

### 2 — Fiche capacités (obligatoire avant code)

```text
slug:
alias:
structured_outputs: yes|no
reasoning_effort_values:
reasoning_effort_default_if_omitted:
temperature_supported: yes|no|conditional → details
top_p_supported: yes|no|conditional → details
max_output_tokens:
context_window:
input_usd_per_1M: / output_usd_per_1M:
unity_whitelist: yes|no
expand_tree_candidate: yes|no  # cheap high-volume only
```

Si `temperature_supported` est inconnu ou douteux → **ne pas envoyer** tant qu'un appel réel / log 400 n'a pas tranché.

### 3 — Fichiers à aligner (atomic)

| Fichier | Action |
|---------|--------|
| `config/llm_config.json` | `available_models`, `default_model`, `fallback_chain` |
| `config/llm_pricing.json` | prix + description ; `last_updated` |
| `app_config.json` | miroir si encore utilisé |
| `constants.py` `ModelNames` | slugs, `LEGACY_MODEL_ID_MAP`, `UNITY_*`, `MODELS_WITHOUT_CUSTOM_TEMPERATURE`, `Defaults.MODEL_ID` |
| `frontend/src/constants.ts` | miroir `MODEL_NAMES`, `REASONING_*`, `DEFAULT_MODEL` |
| `factories/llm_factory.py` | `normalize_model_id` déjà via `ModelNames` |
| `core/llm/openai/parameter_builder.py` | gates temperature / top_p / effort |
| `api/schemas/dialogue.py` | whitelist Unity + Literal effort |
| `api/schemas/graph.py` | expand-tree (slug cheap imposé) |
| `frontend/.../GenerationPanel.tsx` | options effort ; pas d'hypothèses mini/nano périmées |
| Presets `data/presets/*.json`, E2E | nouveaux slugs |
| `.cursor/rules/llm.mdc` | faits courants (pas toute la procédure) |

### 4 — Gate sampling (CRITIQUE)

Avant d'inclure `temperature` ou `top_p` dans Responses API :

1. Vérifier la fiche capacités (étape 2)
2. **`None` ≠ `none`** : effort omis peut valoir un défaut API (ex. GPT-5.6 → `medium`)
3. Implémenter dans `should_include_temperature` / `should_include_top_p` — ne pas brancher « effort absent ⇒ temperature OK »
4. Famille actuelle GPT-5.6 : **jamais** envoyer temperature/top_p (preuve 400 runtime)

### 5 — Migration legacy

- Remplir `ModelNames.LEGACY_MODEL_ID_MAP` (anciens slugs → nouveaux)
- Validateurs Unity : `normalize_model_id` puis whitelist
- Factory : même normalisation
- Ne pas laisser l'UI proposer d'anciens IDs absents de `llm_config.json`

### 6 — Tests & preuve

```powershell
# Backend ciblé
.\.venv\Scripts\python.exe -m pytest tests/core/llm/openai/test_parameter_builder.py tests/api/test_graph_expand_tree.py tests/test_llm_factory.py -q --tb=short

# Frontend ciblé
cd frontend; npx vitest run src/utils/generationConfigNormalization.test.ts src/__tests__/ModelSelector.test.tsx --reporter=dot
```

Après déploiement local : une génération réelle + lecture `data/logs/logs_YYYY-MM-DD.json` (params envoyés, pas de 400 sampling).

## Anti-patterns

- Bulk-replace naïf (`gpt-5.2` → casse `gpt-5.2-mini` en `…-terra-mini`)
- Vider `MODELS_WITHOUT_CUSTOM_TEMPERATURE` « parce que tous supportent none »
- Mapper UI « Aucun » → `reasoning_effort: null` si le défaut API n'est pas `none`
- Mettre Mistral dans la whitelist Unity sans structured outputs validés
- Affirmer « green » sans sortie pytest/Vitest
