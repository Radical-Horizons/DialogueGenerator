/**
 * Layout liste Unity + zone d’édition / graphe (colonne centrale).
 *
 * Collections est intégré dans la toolbar de la liste (un seul volet) :
 * les bornes ciblent uniquement la largeur utile de la bibliothèque.
 */
import type { CSSProperties } from 'react'
import { theme } from '../theme'

/** Plancher lisibilité liste (recherche + filtres + cartes). */
export const UNITY_DIALOGUE_LIST_MIN_WIDTH_PX = 240

/** Plafond absolu sur très grands écrans. */
export const UNITY_DIALOGUE_LIST_MAX_WIDTH_CAP_PX = 340

/** Part max de la rangée pour la liste (le reste pour l’éditeur / graphe). */
export const UNITY_DIALOGUE_LIST_MAX_FRACTION = 0.28

/** Colonne liste : flex-shrink prioritaire, largeur bornée par % du parent. */
export const unityDialogueListColumnStyle: CSSProperties = {
  boxSizing: 'border-box',
  flex: `0 1 ${UNITY_DIALOGUE_LIST_MAX_FRACTION * 100}%`,
  maxWidth: `min(${UNITY_DIALOGUE_LIST_MAX_FRACTION * 100}%, ${UNITY_DIALOGUE_LIST_MAX_WIDTH_CAP_PX}px)`,
  minWidth: UNITY_DIALOGUE_LIST_MIN_WIDTH_PX,
  borderRight: `2px solid ${theme.border.secondary}`,
  overflow: 'hidden',
  backgroundColor: theme.background.panel,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
}

/** Colonne éditeur / graphe : absorbe l’espace restant. */
export const unityDialogueWorkspaceColumnStyle: CSSProperties = {
  boxSizing: 'border-box',
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
  backgroundColor: theme.background.panel,
}
