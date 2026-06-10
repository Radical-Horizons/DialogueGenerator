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
