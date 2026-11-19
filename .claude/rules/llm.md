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
- **`None` ≠ `none`** : effort omis sur GPT-5.6 ⇒ défaut API **`medium`**.
- **GPT-5.6 Sol/Terra/Luna** : ne pas envoyer `temperature` ni `top_p` (400 runtime). Gate : `OpenAIParameterBuilder` + `ModelNames.MODELS_WITHOUT_CUSTOM_TEMPERATURE`.
- Famille courante : `gpt-5.6-sol` (alias `gpt-5.6`), `gpt-5.6-terra`, `gpt-5.6-luna` — Responses API si le nom contient `gpt-5`.
- Secrets via env (`OPENAI_API_KEY`) ; tests sans réseau (`DummyLLMClient`).
- **Cache de prompt GPT-5.6** : le point de cache implicite tombe en fin du dernier message ; un prompt unique qui change à chaque appel est **écrit** (1,25 × le prix d'entrée) sans jamais être relu. `core/llm/openai/prompt_cache.py` coupe donc le message avant `<scene_instructions>` avec `prompt_cache_breakpoint` : tout ce qui précède doit rester identique d'un nœud à l'autre (pas d'horodatage, pas de tirage aléatoire non seedé, pas de consigne propre au nœud dans le contrat ou le contexte). Usage : `cached_tokens` / `cache_write_tokens` ; tarif : `cached_input_rate` / `cache_write_rate` dans `config/llm_pricing.json`.
- Doc détaillée : `docs/architecture/OPENAI_API_GPT5.md`.
