/**
 * État de disposition de l'UI (refonte 2026).
 *
 * `inspectorTab` remplace les booléens indépendants `showValidationPanel`,
 * `showQualityLlmPanel`, `showAiSlopPanel`, `showSchemaValidationPanel` et
 * `showCostBreakdown` de `useGraphToolbar` : un seul onglet actif à la fois, donc
 * plus aucun empilement de panneaux au-dessus du canvas (écran 2e du handoff).
 *
 * Réf. `docs/design/refonte-ui-2026/etats-2a-2e.dc.html`, bloc `2e`.
 */
import { create } from 'zustand'

/** Onglets de l'inspecteur droit de l'éditeur de graphe. */
export type InspectorTab = 'node' | 'health' | 'quality' | 'cost'

/** Sections applicatives, présentées dans la barre supérieure (écran 1c). */
export type CenterPanelTab = 'generation' | 'edition' | 'graph'

interface UiLayoutState {
  /**
   * Section active. Dans la maquette la navigation vit dans la barre supérieure,
   * à côté du logo — pas au-dessus de la colonne de lecture. L'état est donc
   * partagé entre `Header` (qui l'affiche) et `Dashboard` (qui rend le contenu).
   */
  centerPanelTab: CenterPanelTab
  setCenterPanelTab: (tab: CenterPanelTab) => void
  /** Onglet actif de l'inspecteur ; `null` = inspecteur replié. */
  inspectorTab: InspectorTab | null
  setInspectorTab: (tab: InspectorTab | null) => void
  /** Bascule un onglet : re-cliquer l'onglet actif replie l'inspecteur. */
  toggleInspectorTab: (tab: InspectorTab) => void
  /**
   * Mode écriture (écran 2c) : `Ctrl+\` replie les deux panneaux latéraux et passe
   * la colonne de lecture à 760px / brief 17px. Rien n'est supprimé — les rails
   * gardent leurs compteurs et un clic ramène chaque panneau.
   */
  writingMode: boolean
  setWritingMode: (on: boolean) => void
  toggleWritingMode: () => void
}

export const useUiLayoutStore = create<UiLayoutState>()((set) => ({
  centerPanelTab: 'generation',
  setCenterPanelTab: (tab) => set({ centerPanelTab: tab }),

  inspectorTab: 'node',

  setInspectorTab: (tab) => set({ inspectorTab: tab }),

  toggleInspectorTab: (tab) =>
    set((state) => ({ inspectorTab: state.inspectorTab === tab ? null : tab })),

  writingMode: false,
  setWritingMode: (on) => set({ writingMode: on }),
  toggleWritingMode: () => set((state) => ({ writingMode: !state.writingMode })),
}))
