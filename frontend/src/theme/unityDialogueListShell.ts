/**
 * Layout liste Unity + zone d’édition / graphe (colonne centrale).
 * Priorité produit : le volet droit garde ~75 % de la largeur utile ; la liste ≤ 25 % (plafond px sur grands écrans).
 */
import type { CSSProperties } from 'react'
import { theme } from '../theme'

/** Part max de la rangée pour la liste (le reste pour l’éditeur / graphe). */
export const UNITY_DIALOGUE_LIST_MAX_FRACTION = 0.25

/** Plancher lisibilité liste (peut réduire légèrement la part du droit sur colonnes très étroites). */
export const UNITY_DIALOGUE_LIST_MIN_WIDTH_PX = 120

/** Plafond absolu sur très grands écrans (évite une liste trop large si 25 % est énorme). */
export const UNITY_DIALOGUE_LIST_MAX_WIDTH_CAP_PX = 280

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

/** Colonne éditeur / graphe : absorbe l’espace restant (cible ~75 % quand la liste est à 25 %). */
export const unityDialogueWorkspaceColumnStyle: CSSProperties = {
  boxSizing: 'border-box',
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
  backgroundColor: theme.background.panel,
}
