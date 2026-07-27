---
description: Génération dialogues Unity — modèles Pydantic, champs techniques, structured output
globs: ["models/dialogue_structure/**/*.py", "services/unity_dialogue_generation_service.py", "prompt_engine.py"]
alwaysApply: false
---

- **Modèles Pydantic** (`models/dialogue_structure/unity_dialogue_node.py`) : Ne jamais exposer les champs techniques à l'IA. L'IA génère uniquement le contenu créatif (displayName, text, speaker, line, test, traitRequirements, condition, etc.).
- **displayName** : champ créatif obligatoire côté produit ; le LLM doit le fournir. `enrich_with_ids()` / `resolve_generated_display_name()` complètent en secours (title → première ligne de `line` → id).
- **Champs techniques exclus** : `targetNode`, `nextNode`, `successNode`, `failureNode`, `testSuccessNode`, `testFailureNode` ne doivent PAS être dans les modèles Pydantic exposés à l'IA.
- **Gestion automatique** : `enrich_with_ids()` ajoute toujours `targetNode: "END"` pour chaque choix (champ technique géré par l'application, pas par l'IA).
- **"END" comme placeholder temporaire** : Le nœud "END" est un placeholder temporaire utilisé par défaut car on génère un fragment de dialogue sans savoir ce qui suivra. Si on génère la suite plus tard, les `targetNode` seront mis à jour pour pointer vers les vrais nœuds suivants. Le nœud "END" peut aussi être la fin définitive (scène d'au revoir), mais c'est l'auteur qui décide, pas le logiciel.
- **Prompt** : Ne jamais mentionner ces champs techniques dans les instructions à l'IA. Le prompt doit indiquer que ces champs sont gérés automatiquement.
- **Structured Output** : Utiliser `UnityDialogueGenerationResponse` comme `response_model` pour garantir que l'IA ne génère que le contenu créatif.
