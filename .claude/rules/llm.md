---
description: "LLM/OpenAI — invariants modèles, Responses API, sampling. Procédure : skill llm-model-update."
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
- **Un `client_type: openrouter` ajouté à `llm_config.json` entre d'office dans la whitelist Unity** (`get_unity_structured_output_allowed_models`). Vérifier `structured_outputs` + `tools` sur `openrouter.ai/api/v1/models` avant de l'ajouter : sinon la génération Unity est autorisée pour un modèle qui ne sait pas la produire. **Confirmé en production** : `aion-labs/aion-2.0` n'annonce que `response_format`, pas `structured_outputs`, et a rendu 3 réponses vides sur 3 au bench du 2026-08-08. Corollaire pour les tests : un identifiant censé être *hors* whitelist ne doit pas être un slug OpenRouter.
- **`minItems` / `maxItems` ne sont pas garantis hors OpenAI.** OpenAI les applique côté serveur ; via OpenRouter, un modèle peut rendre un JSON bien formé mais sous la borne (fragment d'un seul panneau observé sur `mistralai/mistral-medium-3-5`). Toujours revalider en Pydantic à la réception — c'est ce que fait `generate_dialogue_fragment`, qui lève alors `UnityStructuredOutputError`.
- **Un identifiant se vérifie au catalogue du fournisseur, pas au fichier de config.** `labs-mistral-small-creative` a vécu des mois dans `llm_config.json` sans exister chez Mistral (53 modèles listés, aucun de ce nom) — remplacé par `mistralai/mistral-medium-3-5` (OpenRouter) en août 2026, avec entrée dans `LEGACY_MODEL_ID_MAP`.
- Secrets via env (`OPENAI_API_KEY`) ; tests sans réseau (`DummyLLMClient`).
- Doc détaillée : `docs/architecture/OPENAI_API_GPT5.md`.
