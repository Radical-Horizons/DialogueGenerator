/**
 * État de disposition de l'UI (refonte 2026).
 *
 * Sur bureau, `inspectorTab` remplace les booléens indépendants `showValidationPanel`,
 * `showQualityLlmPanel`, `showAiSlopPanel`, `showSchemaValidationPanel` et
 * `showCostBreakdown` de `useGraphToolbar` : un seul onglet actif à la fois, donc
 * plus aucun empilement de panneaux au-dessus du canvas (écran 2e du handoff).
 *
 * Réf. `docs/design/refonte-ui-2026/etats-2a-2e.dc.html`, bloc `2e`.
 */
import { create } from 'zustand'

/** Onglets de l'inspecteur droit de l'éditeur de graphe. */
export type InspectorTab = 'node' | 'health' | 'quality' | 'slop' | 'cost'

/** Sections applicatives, présentées dans la barre supérieure (écran 1c). */
export type CenterPanelTab = 'generation' | 'edition' | 'graph'

/** Affichage des options d'un résultat (écran 2b) : une dépliée, ou toutes côte à côte. */
export type OptionsView = 'list' | 'columns'

/** Paramètre d'adresse qui porte la section active (cf. `useDashboardUrlMirror`). */
export const SECTION_URL_PARAM = 'section'

/**
 * L'adresse ne se lit qu'à la création du store : c'est elle qui fait revenir F5 sur la
 * même section, dès le premier rendu. Ensuite le store fait foi et l'adresse le recopie.
 */
function sectionFromUrl(): CenterPanelTab {
  if (window.location.pathname !== '/') return 'generation'
  const section = new URLSearchParams(window.location.search).get(SECTION_URL_PARAM)
  return section === 'edition' || section === 'graph' ? section : 'generation'
}

/** Drapeaux du prototype de cartes de texte (Story 20.2), lus à la création du store. */
export const TEXT_CARDS_STORAGE_KEY = 'ui.textCardsPrototype'
export const TEXT_CARDS_TEST_BARS_STORAGE_KEY = 'ui.textCardsTestBars'

function readStoredFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function writeStoredFlag(key: string, on: boolean): void {
  try {
    if (on) window.localStorage.setItem(key, '1')
    else window.localStorage.removeItem(key)
  } catch {
    // Stockage indisponible : le drapeau ne vaut que pour la session.
  }
}

interface UiLayoutState {
  /**
   * Prototype de la preuve de performance 20.2 : cartes de texte de 360 px, flux gauche →
   * droite, paliers de zoom. Désactivé par défaut ; sans bouton, il se pose dans
   * `localStorage` puis se prend au rechargement.
   */
  textCardsPrototype: boolean
  setTextCardsPrototype: (on: boolean) => void
  /** Mesure d'information 20.2 : garder les nœuds de test actuels sur le canvas du prototype. */
  textCardsTestBars: boolean
  setTextCardsTestBars: (on: boolean) => void
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
  /**
   * Minimap du graphe. Masquée par défaut : l'écran 2e n'en montre pas, et affichée
   * d'office elle recouvrait le coin bas-droit du canvas, où atterrissent les nœuds
   * générés — elle interceptait les clics sur leurs actions. « CARTE » dans la
   * barrette de zoom la ramène à la demande.
   */
  showGraphMinimap: boolean
  toggleGraphMinimap: () => void
  /**
   * Vue des options générées. Gardée d'un lot à l'autre pendant la session : un
   * auteur qui compare en colonnes ne doit pas rebasculer à chaque génération.
   */
  optionsView: OptionsView
  setOptionsView: (view: OptionsView) => void
}

export const useUiLayoutStore = create<UiLayoutState>()((set) => ({
  textCardsPrototype: readStoredFlag(TEXT_CARDS_STORAGE_KEY),
  setTextCardsPrototype: (on) => {
    writeStoredFlag(TEXT_CARDS_STORAGE_KEY, on)
    set({ textCardsPrototype: on })
  },
  textCardsTestBars: readStoredFlag(TEXT_CARDS_TEST_BARS_STORAGE_KEY),
  setTextCardsTestBars: (on) => {
    writeStoredFlag(TEXT_CARDS_TEST_BARS_STORAGE_KEY, on)
    set({ textCardsTestBars: on })
  },

  centerPanelTab: sectionFromUrl(),
  setCenterPanelTab: (tab) => set({ centerPanelTab: tab }),

  inspectorTab: 'node',

  setInspectorTab: (tab) => set({ inspectorTab: tab }),

  toggleInspectorTab: (tab) =>
    set((state) => ({ inspectorTab: state.inspectorTab === tab ? null : tab })),

  writingMode: false,
  setWritingMode: (on) => set({ writingMode: on }),
  toggleWritingMode: () => set((state) => ({ writingMode: !state.writingMode })),

  showGraphMinimap: false,
  toggleGraphMinimap: () => set((state) => ({ showGraphMinimap: !state.showGraphMinimap })),

  optionsView: 'list',
  setOptionsView: (view) => set({ optionsView: view }),
}))
