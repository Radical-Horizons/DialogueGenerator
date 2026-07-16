# Touchpoints modèles LLM (DialogueGenerator)

Inventaire pour `/llm-model-update`. Mettre à jour cette liste si un nouveau point d'ancrage apparaît.

## Sources de vérité catalogue

| Chemin | Rôle |
|--------|------|
| `config/llm_config.json` | Liste UI/API, défaut, fallback |
| `config/llm_pricing.json` | USD / 1M tokens |
| `constants.py` → `ModelNames`, `Defaults.MODEL_ID` | Slugs + listes de capacités |
| `frontend/src/constants.ts` | Miroir frontend |

## Construction requête OpenAI

| Chemin | Rôle |
|--------|------|
| `core/llm/openai/parameter_builder.py` | temperature / top_p / reasoning |
| `core/llm/openai/client.py` | `default_model`, `get_max_tokens` |
| `factories/llm_factory.py` | Résolution client + legacy map |

## Contrats API

| Chemin | Rôle |
|--------|------|
| `api/schemas/dialogue.py` | Whitelist Unity structured output + effort Literal |
| `api/schemas/graph.py` | Expand-tree : slug cheap imposé |
| `frontend/src/utils/generationConfigNormalization.ts` | Miroir whitelist Unity |

## UI / defaults

| Chemin | Rôle |
|--------|------|
| `frontend/src/components/generation/GenerationPanel.tsx` | Sélecteur effort / top_p |
| `frontend/src/store/llmStore.ts` | Fallback localStorage |
| `frontend/src/components/graph/AIGenerationPanel.tsx` | Modèle graphe |

## Scripts / E2E / presets

| Chemin | Rôle |
|--------|------|
| `scripts/generate_dialogue_tree.py` | CLI expand-tree |
| `e2e/graph-node-accept-reject.spec.ts` | `selectOption` modèle |
| `data/presets/*.json` | `llmModel` persisté |
| `docs/troubleshooting/e2e-llm.md` | Preflight E2E LLM |

## Harnais

| Chemin | Rôle |
|--------|------|
| `.cursor/rules/llm.mdc` | Invariants courts |
| `.cursor/skills/llm-model-update/SKILL.md` | Procédure |
| `docs/architecture/OPENAI_API_GPT5.md` | Doc Responses API |
