---
description: Structured Output OpenAI — principe, garanties, usage dans le projet
globs: ["llm_client.py", "models/dialogue_structure/**/*.py", "services/unity_dialogue_generation_service.py", "prompt_engine.py"]
alwaysApply: false
---

- **Principe** : Le Structured Output garantit que la réponse du LLM respecte un schéma JSON prédéfini (via function calling avec `tools` et `tool_choice` dans OpenAI API).
- **Implémentation** : Modèle Pydantic → `model_json_schema()` → schéma JSON dans `tool_definition` → `response_model` passé au client LLM.
- **Garanties du Structured Output** :
  - Structure JSON (champs, types, champs requis)
  - Conformité au schéma (pas de champs hors schéma)
  - Types corrects (string, int, bool, etc.)
- **Non-garanties** (nécessitent des instructions explicites dans le prompt) :
  - Logique métier (ex: "un seul nœud", "réplique PNJ + choix joueur")
  - Formats spécifiques (ex: "AttributeType+SkillId:DD" même si dans `Field.description`)
  - Contexte dynamique (qui est le speaker, qui est le joueur)
  - Qualité du contenu créatif
- **Prompt** : Ne JAMAIS inclure d'instructions redondantes avec le schéma (ex: "ne génère pas d'IDs", "utilise nextNode") car ces champs n'existent pas dans le schéma. Inclure uniquement la logique métier et les formats spécifiques.
- **Référence** : Voir `docs/STRUCTURED_OUTPUT_EXPLANATION.md` pour détails et exemples.
