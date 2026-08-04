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

interface UiLayoutState {
  /** Onglet actif de l'inspecteur ; `null` = inspecteur replié. */
  inspectorTab: InspectorTab | null
  setInspectorTab: (tab: InspectorTab | null) => void
  /** Bascule un onglet : re-cliquer l'onglet actif replie l'inspecteur. */
  toggleInspectorTab: (tab: InspectorTab) => void
}

export const useUiLayoutStore = create<UiLayoutState>()((set) => ({
  inspectorTab: 'node',

  setInspectorTab: (tab) => set({ inspectorTab: tab }),

  toggleInspectorTab: (tab) =>
    set((state) => ({ inspectorTab: state.inspectorTab === tab ? null : tab })),
}))
