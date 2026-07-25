---
description: LLM/OpenAI — invariants modèles, Responses API, sampling. Procédure : skill llm-model-update.
globs: ["llm_client.py", "llm_client/**/*.py", "factories/**/*.py", "core/llm/**/*.py", "prompt_engine.py", "constants.py", "frontend/src/constants.ts", "config/**/llm*.json", "llm_config.json", "api/schemas/dialogue.py"]
alwaysApply: false
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
- Doc détaillée : `docs/architecture/OPENAI_API_GPT5.md`.
