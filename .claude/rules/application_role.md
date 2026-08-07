---
description: Rôle et objectif principal de l'application DialogueGenerator
---
- **Rôle**: Outil de génération de dialogues IA pour jeux de rôle (LLM + GDD → JSON Unity).
- **Architecture**: React (frontend) + FastAPI (backend) + Services Python réutilisables.
- **Données**: GDD depuis `data/GDD_categories/` (lien symbolique) et `data/Vision.json`. Détail : `.claude/rules/gdd_paths.md`.
- **Références**: `README.md` ; suivi / ADRs : `_bmad-output/` ; détails techniques : `docs/` (ex. `Spécification technique.md`).
