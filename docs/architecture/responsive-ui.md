# UI responsive et PWA (Epic 17)

**Statut** : livré (FR118–121, stories 17.1–17.8).  
**Source de vérité code** : `frontend/src/theme/responsiveChrome.ts`, hooks sous `frontend/src/hooks/`, shell dans `frontend/src/components/layout/`.

Ce document décrit l’architecture responsive du frontend React. Pour le suivi produit détaillé, voir `_bmad-output/planning-artifacts/epics/epic-17.md` et les artifacts `17-*` dans `_bmad-output/implementation-artifacts/`.

---

## Deux axes de mesure

Le layout ne repose pas uniquement sur des media queries CSS. Deux mécanismes complémentaires pilotent le chrome :

| Axe | Mécanisme | Usage typique |
|-----|-----------|---------------|
| **Viewport** | `useViewportMode()` — mobile &lt;768px, tablette &lt;1024px, desktop ≥1024px | Drawers latéraux (`useNarrowSidePanels`), clavier logiciel mobile, shell |
| **Conteneur** | `useNarrowInlineSize(seuilPx, options?)` — `ResizeObserver` + mesure `readLayoutWidthPx` | Colonne ResizablePanels, toolbar graphe, modales, rails segmentés |

**Pourquoi JS et non `@container` seul** : parité entre le navigateur et Vitest/jsdom, où les container queries et `cqw` sont peu fiables. Les tokens de `responsiveChrome.ts` restent la source unique des seuils et densités.

---

## Seuils principaux

| Constante (`responsiveChrome.ts`) | px | Rôle |
|-----------------------------------|-----|------|
| `SEGMENTED_CHROME_COMFORT_MIN_WIDTH_PX` | 480 | Rails d’onglets segmentés |
| `PANEL_COMFORT_MIN_WIDTH_PX` / `GRAPH_TOOLBAR_COMFORT_MIN_WIDTH_PX` | 640 | Panneau génération, Unity, toolbar narrow |
| Modales | 520 | `useNarrowInlineSize(520)` + `modalTypography` |
| `contextGddTabChrome.relaxToBalancedMinWidthPx` | 480 | Repasse `balanced` après `tight` sur les onglets GDD |
| Viewport desktop | 1024 | `useNarrowSidePanels` dans `Dashboard` |
| Viewport mobile | 768 | `useViewportMode` → `mobile` |

**Cibles tactiles** : `TOUCH_TARGET_MIN_PX` (44) dans `frontend/src/constants.ts` ; `graphToolbarChrome.touchMinPx` pour la toolbar graphe.

---

## Layout shell (`Dashboard`)

### Desktop (≥1024px)

Layout **3 colonnes** redimensionnables (`ResizablePanels`) : Contexte GDD | Génération / Graphe | Détails. Voir aussi [`current-ui-structure.md`](../features/current-ui-structure.md).

### Tablette et mobile (&lt;1024px)

- `useNarrowSidePanels = viewportMode !== 'desktop'`.
- Panneaux latéraux en **drawers overlay** (`NarrowOverlayDrawer`) au lieu de colonnes fixes.
- Colonne centrale pleine largeur ; pills de réouverture des panneaux latéraux.
- `useMobileShellKeyboardComfort` : inset bas quand le clavier logiciel réduit la zone utile ; scroller `MainLayout`.
- `shellSafeAreaCssVars` + `App.css` : marges `env(safe-area-inset-*)` via variables CSS (évite `env()` inline rejeté par jsdom).

**Piège** : `localStorage` `resizable_dashboard_panels` — les tailles desktop sont normalisées en mode narrow pour éviter des colonnes illisibles.

---

## Patterns par zone

| Zone | Fichiers clés | Pattern |
|------|---------------|---------|
| Onglets segmentés | `Tabs.tsx` | `segmentedSize="touch"` sur shell ; `drawer-aligned` (~37px) dans drawers |
| Toolbar graphe | `GraphEditorHeader.tsx`, `useGraphToolbar.ts` | Narrow / confortable ; `useNarrowInlineSize` avec `measureParentClientWidth: true` |
| Sélecteur dialogue narrow | `DialogueCombobox.tsx` | Story 17.7 : remplace la colonne liste Unity en toolbar narrow |
| Contexte GDD | `ContextSelector.tsx` | Densité `balanced` → `tight` si `scrollWidth > clientWidth` |
| Génération | `GenerationPanel.tsx` | Tokens `generationPanelChrome` selon `isNarrow` |
| Unity | `UnityDialogueEditor.tsx` | `unityDialogueEditorChrome` ; alignement header/contenu (story 17.7) |
| Modales | Divers | `ref` + `useNarrowInlineSize(520)` + `modalTypography` |
| Graphe tactile | `graphViewportInteraction.ts`, `useGraphContextMenuLongPress` | Pan/zoom/pinch conservés ; équivalent clic droit par appui long |
| Montage tardif DOM | `useNarrowInlineSize.ts` | **Callback ref** (story 17.8) : `ResizeObserver` s’attache quand le nœud apparaît (onglet inactif, drawer) |

### Toolbar graphe — narrow / confortable

`GraphEditorHeader` bascule selon la largeur conteneur (`GRAPH_TOOLBAR_COMFORT_MIN_WIDTH_PX`, 640px) :

1. **Narrow** (`width < 640px`) : grille verticale, libellés raccourcis, sélecteur dialogue injecté via `headerSelector`.
2. **Confortable** (`≥ 640px`) : une seule rangée horizontale.

Tokens : `graphToolbarChrome.comfortable` / `.narrow`.

---

## PWA (story 17.5)

Installabilité **sans** mode offline-first.

| Élément | Emplacement |
|---------|-------------|
| Manifeste | `frontend/public/manifest.webmanifest` (source de vérité) |
| Plugin Vite | `vite-plugin-pwa` dans `frontend/vite.config.ts` |
| Icônes | `frontend/public/icons/` (PNG 192/512 ; SVG sources via `frontend/scripts/generate-pwa-icons.mjs`) |
| Lien HTML | `frontend/index.html` — `rel="manifest"` |

**Comportement** :

- `registerType: 'autoUpdate'`, `injectRegister: 'auto'`.
- **Dev** : PWA désactivée (`devOptions.enabled: false`) pour éviter les pièges de cache.
- **Workbox** : `/api` exclu du cache (`navigateFallbackDenylist`, handler `NetworkOnly`) — le backend reste dynamique.

**Vérification** :

```bash
# Vitest (manifest, index.html, config Vite)
cd frontend && npx vitest run src/__tests__/pwa.*.test.ts --reporter=dot

# E2E installabilité (build + preview sur :4173)
npm run test:e2e:pwa
```

Config Playwright dédiée : `playwright.pwa.config.ts` (non incluse dans `npm run test:e2e:verify`).

---

## Tests et preuve

### Vitest ciblé (T1)

| Domaine | Fichiers exemple |
|---------|------------------|
| Shell / drawers | `Dashboard.test.tsx`, `MainLayout.responsive.test.tsx` |
| Hook conteneur | `useNarrowInlineSize.test.tsx` |
| Toolbar graphe | `GraphEditorHeader.desktopToolbar.test.tsx` |
| Génération narrow | `GenerationPanelControls.narrow.test.tsx`, `UnityDialogueEditor.narrow.test.tsx` |
| Tactile FR119 | `GraphCanvas.touchLongPress.test.tsx`, `fr119-touch.chrome.test.tsx` |
| PWA | `src/__tests__/pwa.*.test.ts` |

### Preuve UI manuelle

1. `npm run dev`
2. Redimensionner à **≥320px** de large (DevTools device mode).
3. Vérifier : pas de scroll horizontal document, drawers &lt;1024px, toolbar graphe aux trois états.

Référence agents : `.cursor/skills/dialogue-frontend/SKILL.md` et `.cursor/rules/responsive_frontend.mdc`.

---

## Checklist — nouveau chrome responsive

1. Choisir l’axe (viewport vs conteneur) et le seuil — réutiliser `responsiveChrome.ts`.
2. Ajouter ou étendre les tokens `comfortable` / `narrow` (pas de magic numbers dispersés).
3. Respecter 44px tactile ou documenter une variante.
4. Libellés longs : `title` + ellipsis.
5. Drawer/modale : fermeture clavier + focus trap.
6. Test Vitest narrow + confort ; preuve navigateur si changement visible.
7. Desktop ≥1024 : ne pas régresser le layout 3 colonnes.

---

## Pièges connus

- **Spread formulaire graphe** : utiliser `mergeNodeFormIntoStoreData()` au flush — pas `{ ...nodeData, ...formValues }` (écrase `choices[N].targetNode`). Voir [`GRAPH_EDITOR.md`](./GRAPH_EDITOR.md).
- **`whiteSpace: nowrap` + padding fixes** → overflow horizontal en narrow.
- **Graphe** : conserver `keepAliveTabIds` sur `Tabs` pour éviter la perte d’état au changement d’onglet.
- **Stale closure** : dans les callbacks store, préférer `useRef` pour lire l’état courant (ex. `ContextSelector`).
