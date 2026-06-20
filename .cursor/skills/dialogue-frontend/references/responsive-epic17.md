# Responsive Epic 17 — référence détaillée

Référence produit : FR118–121, stories **17.1–17.11**, artifacts `_bmad-output/implementation-artifacts/17-*`. Epic 17 **in-progress** jusqu’à clôture **17.11**.

## Deux axes de mesure

| Axe | Mécanisme | Usage |
|-----|-----------|--------|
| **Viewport** | `useViewportMode()` — mobile &lt;768px, tablette &lt;1024px, desktop ≥1024px | `useNarrowSidePanels`, drawers, `useMobileShellKeyboardComfort`, shell mobile |
| **Conteneur** | `useNarrowInlineSize(seuilPx, options?)` | Colonne, toolbar, rail segmenté, modale — indépendant de la fenêtre |

Colonne après resize `ResizablePanels` → conteneur. Mobile/tablette overlay → viewport + `Dashboard` / `NarrowOverlayDrawer`.

## Seuils (`responsiveChrome.ts`)

| Constante | px | Rôle |
|-----------|-----|------|
| `SEGMENTED_CHROME_COMFORT_MIN_WIDTH_PX` | 480 | Rail onglets segmentés |
| `PANEL_COMFORT_MIN_WIDTH_PX` / `GRAPH_TOOLBAR_COMFORT_MIN_WIDTH_PX` | 640 | Génération, Unity, toolbar narrow |
| Modales | 520 | `useNarrowInlineSize(520)` + `modalTypography` |
| `contextGddTabChrome.relaxToBalancedMinWidthPx` | 480 | Repasse `balanced` après `tight` |
| Viewport desktop | 1024 | `useNarrowSidePanels` |
| Viewport mobile | 768 | `useViewportMode` → `mobile` |

**Tokens** : `segmentedTabTypography`, `panelHeaderTitleTypography`, `generationPanelChrome`, `graphToolbarChrome`, `unityDialogueEditorChrome`, `contextGddTabChrome`, `drawerPanelTabChrome`, `modalTypography`, `shellSafeAreaCssVars`.

**Tactile** : `TOUCH_TARGET_MIN_PX` (44) dans `constants.ts` ; `graphToolbarChrome.touchMinPx`.

**Stratégie** : bascule narrow/confort en JS + hook (pas `@container` seul) — parité runtime / Vitest.

## Patterns par zone

| Zone | Pattern |
|------|---------|
| Shell | `Dashboard` : `useNarrowSidePanels`, `NarrowOverlayDrawer`, `centerColumnRef` + `measureParentClientWidth: true` |
| Onglets | `Tabs` segmented ; shell/centre `segmentedSize="touch"` ; drawers `drawer-aligned` (~37px) |
| Toolbar graphe | `GraphEditorHeader` + `useGraphToolbarLayoutMode` (17.10) ; `measureParentClientWidth: true` ; `useGraphToolbar` |
| Dialogues narrow | `DialogueCombobox` + `useDialogueListData` (17.7) |
| Contexte GDD | `balanced` → `tight` si `scrollWidth > clientWidth` |
| Génération | `generationPanelChrome` selon `isNarrow` |
| Modales | ref + `useNarrowInlineSize(520)` + `modalTypography` |
| Graphe | `GRAPH_VIEWPORT_INTERACTION_OPTIONS` — garder pan/zoom/pinch |
| Clic droit | `useGraphContextMenuLongPress` ou menu visible |
| Montage tardif | Hook dans composant qui monte le DOM ou callback ref 17.8 |
| Clavier narrow | `useMobileShellKeyboardComfort` + scroller `MainLayout` |
| Safe areas | `shellSafeAreaCssVars` + `App.css` (`env` via variables CSS) |
| Layout narrow | Deux layouts explicites — pas seulement `overflow: hidden` |

## Epic 17 → ancrages tests

| Story | Exigence | Ancrages |
|-------|----------|----------|
| 17.1 FR118 | Pas de scroll horizontal document | `MainLayout`, `Dashboard.test.tsx` |
| 17.2 FR119 | 44px, pan/zoom, équivalent clic droit | `fr119-touch.chrome.test.tsx`, `graphViewportInteraction.ts`, `useGraphContextMenuLongPress` |
| 17.3 FR120 | Drawers &lt;1024, fermeture, flux génération | `NarrowOverlayDrawer`, `Dashboard.test.tsx` |
| 17.4 | Clavier + safe areas | `useMobileShellKeyboardComfort`, `index.html` |
| 17.5 FR121 | PWA | `npm run test:e2e:pwa` si manifest/SW |
| 17.6 | Typo/densité | `responsiveChrome.ts` |
| 17.7 | Combobox toolbar | `DialogueCombobox.test.tsx` |
| 17.8 | Callback ref hook | `useNarrowInlineSize.test.tsx` |
| 17.9 | Extraction UI toolbar | sous-composants ; tests toolbar existants |
| 17.10 | Hook layout binaire | `useGraphToolbarLayoutMode` + tests contrat (640px) |
| 17.11 | Hardening tests | anti double-mount `SaveStatusIndicator`, fixture partagée, preuve UI |

Coordination : Epic 14 (ARIA), Epic 12 (raccourcis desktop), `graph_editor.mdc` + `mergeNodeFormIntoStoreData`.

## Pièges

- `localStorage` `resizable_dashboard_panels` : normaliser en narrow
- `minSizes` desktop : pas de 3 colonnes illisibles — drawers
- Graphe : `keepAliveTabIds` sur `Tabs`
- `whiteSpace: nowrap` + padding fixes → overflow horizontal

## Checklist nouveau chrome

1. Axe + seuil
2. Tokens comfortable/narrow
3. Touch 44px ou variante documentée + test
4. Libellés : `title` / ellipsis
5. Drawer/modale : fermeture + focus
6. Tests narrow + confort
7. Preuve UI si visible
