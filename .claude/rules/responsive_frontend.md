---
description: Rappel responsive obligatoire sur frontend — renvoie vers le skill dialogue-frontend
globs: ["frontend/**/*.{ts,tsx,css}"]
alwaysApply: false
---

# UI responsive (frontend)

**Déclencheur** : tout changement layout, chrome, modales, formulaires, toolbar, onglets ou panneaux dans `frontend/`.

## Obligation agents

1. **Lire et suivre** le skill projet : `.claude/skills/dialogue-frontend/SKILL.md` (workflow, garde-fous, tests, preuve UI).
2. **Détail Epic 17 / seuils / patterns** : `.claude/skills/dialogue-frontend/references/responsive-epic17.md` — ne pas réinventer de magic numbers hors `responsiveChrome.ts`.
3. **Exécuter** Vitest ciblé + lint si TSX ; **preuve UI** (`npm run dev`, ≥320px) si changement visible — `.claude/rules/workflow.md`.
4. Graphe : `.claude/rules/graph_editor.md` (store contrôlé, flush `mergeNodeFormIntoStoreData`).

## Interdits (rappel)

- Comportement critique narrow/desktop **uniquement** en CSS media query sans test jsdom équivalent.
- Dupliquer des tokens déjà dans `responsiveChrome.ts`.
- Masquer une action graphe sans alternative tactile (FR119).
- Régression desktop ≥1024 (layout 3 colonnes).

Invocation manuelle : `/dialogue-frontend` dans le chat Agent.
