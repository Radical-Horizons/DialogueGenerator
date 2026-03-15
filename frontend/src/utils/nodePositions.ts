/**
 * Utilitaires pour la persistance des positions des nodes du graphe (localStorage).
 *
 * @deprecated La source de vérité des positions est le layout backend (GET/PUT layout, API documents).
 * Ce module n'est plus utilisé dans le flux principal. Conservé pour migration ou scripts ponctuels.
 */

export interface NodePosition {
  x: number
  y: number
}

export type NodePositions = Record<string, NodePosition>

const POSITIONS_KEY_PREFIX = 'graph_positions:'

/**
 * Génère la clé localStorage pour les positions d'un dialogue
 */
function getPositionsKey(filename: string): string {
  return `${POSITIONS_KEY_PREFIX}${filename}`
}

/**
 * Sauvegarde les positions des nodes pour un dialogue
 */
export function saveNodePositions(filename: string, positions: NodePositions): void {
  try {
    const key = getPositionsKey(filename)
    localStorage.setItem(key, JSON.stringify(positions))
  } catch (error) {
    console.error('Erreur lors de la sauvegarde des positions:', error)
    // Ne pas bloquer l'utilisateur en cas d'erreur localStorage
  }
}

/**
 * Charge les positions sauvegardées pour un dialogue.
 * Essaie la clé exacte puis la variante avec/sans .json pour couvrir les différences liste vs API.
 */
export function loadNodePositions(filename: string): NodePositions | null {
  try {
    const key = getPositionsKey(filename)
    let stored = localStorage.getItem(key)
    if (!stored && /\.json$/i.test(filename)) {
      stored = localStorage.getItem(getPositionsKey(filename.replace(/\.json$/i, '')))
    }
    if (!stored && !/\.json$/i.test(filename)) {
      stored = localStorage.getItem(getPositionsKey(`${filename}.json`))
    }
    if (!stored) return null
    return JSON.parse(stored) as NodePositions
  } catch (error) {
    console.error('Erreur lors du chargement des positions:', error)
    return null
  }
}

/**
 * Supprime les positions sauvegardées pour un dialogue
 */
export function clearNodePositions(filename: string): void {
  try {
    const key = getPositionsKey(filename)
    localStorage.removeItem(key)
  } catch (error) {
    console.error('Erreur lors de la suppression des positions:', error)
  }
}
