/**
 * Menus déroulants de la barre d’outils graphe : au-dessus des panneaux latéraux
 * (ex. NodeEditor dans Dashboard) et hauteur limitée avec scroll si besoin.
 */
export const GRAPH_TOOLBAR_DROPDOWN_Z_INDEX = 10020

/** Limite la hauteur pour petits viewports et active le scroll vertical si beaucoup d’items. */
export const GRAPH_TOOLBAR_DROPDOWN_MAX_HEIGHT = 'min(75vh, 28rem)'

/** Fenêtres outils (qualité, validation…) : au-dessus des menus toolbar. */
export const GRAPH_TOOL_FLOATING_PANEL_Z_INDEX = 11000
