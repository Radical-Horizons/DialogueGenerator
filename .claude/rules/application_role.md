---
description: Rôle et objectif principal de l'application DialogueGenerator
globs: []
alwaysApply: true
---

- **Rôle**: Outil de génération de dialogues IA pour jeux de rôle (LLM + GDD → JSON Unity).
- **Architecture**: React (frontend) + FastAPI (backend) + Services Python réutilisables.
- **Données**: GDD depuis `data/GDD_categories/` (lien symbolique) et `import/Bible_Narrative/Vision.json`.
- **Références**: `README.md` ; suivi / ADRs : `_bmad-output/` ; détails techniques : `docs/` (ex. `Spécification technique.md`).
