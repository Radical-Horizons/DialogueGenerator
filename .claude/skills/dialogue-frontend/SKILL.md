---
name: dialogue-frontend
description: >-
  Développe et modifie l'UI React/TypeScript de DialogueGenerator (Vite, Zustand,
  API REST, graphe React Flow, responsive Epic 17 FR118–121). Utiliser pour tout
  travail sous frontend/, composants, hooks, thème, tests Vitest UI, layout mobile,
  cibles tactiles, drawers ou preuve navigateur.
---

## Périmètre

Ce skill couvre :
- `frontend/**`

# DialogueGenerator — frontend

## Quand utiliser ce skill

- Ajout ou modification de composants, hooks, styles, store Zustand côté `frontend/`
- Layout, chrome, modales, toolbar, onglets, panneaux, graphe
- Régression responsive (320px–1024px, colonnes `ResizablePanels`)
- Tests Vitest / RTL / preuve UI après changement visible

**Règles complémentaires (lire si besoin)** : `.claude/rules/frontend.md`, `.claude/rules/responsive_frontend.md`, `.claude/rules/frontend_testing.md`, `.claude/rules/graph_editor.md`, `.claude/rules/workflow.md`

⚠️ **Refonte UI 2026** — si la tâche touche un écran de la maquette (1c, 2a–2e) : lire d'abord
`.claude/rules/ui_redesign_2026.md` et **relever les valeurs dans le HTML** de
`docs/design/refonte-ui-2026/` (`npm run design:refs`). Ne pas approximer depuis une capture.

---

## Garde-fous architecture

| Sujet | Règle |
|-------|--------|
| Logique métier | API `/api/v1/*` + services backend — pas de duplication métier dans le front |
| Déterminisme | Liaison parent→nœud via choix utilisateur = **front** (`connectNodes`, `target_choice_index`), pas suggestion API |
| État | Zustand (`frontend/src/store/`) ; graphe = store contrôlé (ADR-007), pas de `useState` local pour nodes/edges |
| Positions graphe | Backend layout uniquement — **pas** de positions dans `localStorage` |
| Types | `frontend/src/types/api.ts` alignés Pydantic |
| Auth dev | Ne pas durcir `DISABLE_AUTH` / mock admin sans demande explicite (voir `CLAUDE.md`) |

---

## Workflow responsive (résumé)

**Détail complet** → [references/responsive-epic17.md](references/responsive-epic17.md)

1. **Identifier l’axe** : viewport (`useViewportMode` &lt;768 / &lt;1024) **ou** conteneur (`useNarrowInlineSize` + seuils `responsiveChrome.ts`).
2. **Tokens** : importer depuis `frontend/src/theme/responsiveChrome.ts` — pas de magic numbers.
3. **Patterns existants** : `Dashboard.tsx` (drawers FR120), `Tabs` (`segmentedSize`), `GraphEditorHeader` (tri-state), `DialogueCombobox` (narrow).
4. **Montage tardif** : callback ref du hook (17.8) — jamais `useEffect([ref.current])`.
5. **Tactile** : `TOUCH_TARGET_MIN_PX` (44) + `fr119-touch.chrome.test.tsx` pour nouveau chrome.
6. **Tests** : narrow **et** confort si `isNarrow` change le rendu ; seuils = constantes importées.
7. **Preuve UI** : `npm run dev` — ≥320px, ~480px ou colonne étroite (voir `workflow.md`).

**Interdits rapides** : MQ CSS seule pour comportement critique sans test jsdom ; dupliquer des tokens inline ; masquer une action graphe sans alternative tactile ; casser desktop ≥1024 (3 colonnes).

---

## Tests et commandes

```bash
cd frontend && npx vitest run src/chemin/Fichier.test.tsx --reporter=dot
cd frontend && npx eslint . --ext ts,tsx
```

| Zone touchée | Tests de régression typiques |
|--------------|----------------------------|
| Shell / drawers | `src/components/layout/Dashboard.test.tsx` |
| FR119 chrome | `src/__tests__/fr119-touch.chrome.test.tsx` |
| Toolbar graphe | `src/__tests__/GraphEditorHeader.*.test.tsx` |
| Hook mesure | `src/hooks/useNarrowInlineSize.test.tsx` |
| Sélecteur dialogue | `src/components/unityDialogues/DialogueCombobox.test.tsx` |

Hooks DOM : voir `frontend_testing.md` (callback ref 17.8, `style.width` en RTL).

**Ne pas conclure « done »** sans sortie Vitest/eslint **et** preuve UI si changement visible.

---

## Fichiers pivots

- `frontend/src/theme/responsiveChrome.ts` — seuils + tokens chrome
- `frontend/src/hooks/useNarrowInlineSize.ts`, `useViewportMode.ts`, `useMobileShellKeyboardComfort.ts`
- `frontend/src/components/layout/Dashboard.tsx`, `NarrowOverlayDrawer.tsx`
- `frontend/src/components/graph/GraphEditorHeader.tsx`, `graphViewportInteraction.ts`
- Spec produit : `_bmad-output/planning-artifacts/ux-design-specification/responsive-design-accessibility.md`
- Epic : `_bmad-output/planning-artifacts/epics/epic-17.md`
