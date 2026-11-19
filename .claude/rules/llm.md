---
description: "LLM/OpenAI — invariants modèles, Responses API, sampling. Procédure : skill llm-model-update."
paths:
  - "core/llm/**"
  - "factories/**"
  - "constants.py"
  - "config/llm_config.json"
---
# LLM / OpenAI — invariants

**Ajout ou migration de modèles** → skill **`/llm-model-update`** (`.claude/skills/llm-model-update/SKILL.md`). Ne pas improviser hors de ce workflow.

## Contraintes persistantes

- Sources : **uniquement** doc API fournisseur (`developers.openai.com/api/docs/models/…`, `latest-model`, `reasoning`). Pas blogs / agrégateurs.
- Ne **jamais** extrapoler les paramètres d'une génération précédente (ex. temperature GPT-5.2 ≠ GPT-5.6).
- **`None` ≠ `none`** : effort omis ⇒ défaut API **`medium`** (GPT-5.6, GPT-6 Luna). **GPT-6.2 Sol refuse `none`** : ramené à `low` (`MODELS_WITHOUT_REASONING_NONE`), et l'UI ne le propose pas.
- **GPT-5.6 et GPT-6.x** : ne jamais envoyer `temperature` ni `top_p` (400 sur 5.6 ; « omit » dans le guide de migration 6.2). Gate : `OpenAIParameterBuilder` + `ModelNames.is_reasoning_family` / `MODELS_WITHOUT_CUSTOM_TEMPERATURE`.
- **Famille courante (2026-11-19)** : `gpt-6.2-sol` (STANDARD, défaut, le plus capable proposé), `gpt-6.1-terra` (MID), `gpt-6-luna` (ECONOMY, volume / expand-tree) ; chaîne de repli `gpt-6.2-sol` → `gpt-6-luna` (Mistral inutilisable avec l'abonnement actuel : 403/429, 2026-11-19). Le code vise les **rôles** de `ModelNames`, jamais un slug en dur ; les anciens slugs migrent par rôle via `LEGACY_MODEL_ID_MAP`. **`gpt-6.2-astra` retiré du catalogue (2026-11-19, décision utilisateur)** : plus de rôle `FLAGSHIP` ; Astra et les anciens slugs « haut de gamme » (`gpt-5.6-sol`, `gpt-5.4`, `gpt-5.2-pro`…) migrent vers `STANDARD`. Ne pas le réintroduire sans demande explicite. Garde : `tests/core/llm/test_model_catalog_consistency.py` (rôles configurés, prix, repli sans modèle retiré).
- Secrets via env (`OPENAI_API_KEY`) ; tests sans réseau (`DummyLLMClient`).
- **Cache de prompt (GPT-5.6, GPT-6.x)** : le point de cache implicite tombe en fin du dernier message ; un prompt unique qui change à chaque appel est **écrit** (1,25 × le prix d'entrée) sans jamais être relu. `core/llm/openai/prompt_cache.py` coupe donc le message avant `<scene_instructions>` avec `prompt_cache_breakpoint` : tout ce qui précède doit rester identique d'un nœud à l'autre (pas d'horodatage, pas de tirage aléatoire non seedé, pas de consigne propre au nœud dans le contrat ou le contexte). Usage : `cached_tokens` / `cache_write_tokens` ; tarif : `cached_input_rate` / `cache_write_rate` dans `config/llm_pricing.json`.
- Doc détaillée : `docs/architecture/OPENAI_API_GPT5.md`.
