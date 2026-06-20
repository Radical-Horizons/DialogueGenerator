/**
 * Fenêtres outils (qualité, validation…) : au-dessus des overlays graphe standards.
 */
export const GRAPH_TOOL_FLOATING_PANEL_Z_INDEX = 11000

/**
 * Menus déroulants de la barre d’outils graphe : au-dessus des panneaux latéraux
 * et fenêtres outils pour rester actionnables quand un panneau est ouvert.
 */
export const GRAPH_TOOLBAR_DROPDOWN_Z_INDEX = GRAPH_TOOL_FLOATING_PANEL_Z_INDEX + 100

/** Limite la hauteur pour petits viewports et active le scroll vertical si beaucoup d’items. */
export const GRAPH_TOOLBAR_DROPDOWN_MAX_HEIGHT = 'min(75vh, 28rem)'

/** Offsets pour positionner les nœuds créés manuellement sans chevauchement (Story 1.6). */
export const MANUAL_NODE_OFFSET_X = 150
export const MANUAL_NODE_OFFSET_Y = 100
export const MANUAL_NODE_STEP = 40
/** Pas vertical entre nœuds manuels successifs (plus serré que l’axe X). */
export const MANUAL_NODE_STEP_Y = MANUAL_NODE_STEP / 2

/** Au-dessus des modales graphe (10001) : tooltip raccourcis en portail. */
export const GRAPH_SHORTCUTS_TOOLTIP_Z = 10050
export const GRAPH_SHORTCUTS_TOOLTIP_GAP_PX = 6
export const GRAPH_SHORTCUTS_TOOLTIP_ESTIMATE_WIDTH_PX = 320
