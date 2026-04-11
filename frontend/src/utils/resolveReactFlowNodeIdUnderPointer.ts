/**
 * Identifie l'id du nœud React Flow sous le pointeur (fin de drag de connexion, etc.).
 *
 * Utilisé quand la lib ne déclenche pas ``onConnect`` (curseur hors rayon de la poignée
 * cible) alors que l'utilisateur a lâché au-dessus du corps du nœud.
 */

const UI_SELECTORS_BLOCKING_NODE_RESOLVE = [
  '.react-flow__controls',
  '.react-flow__minimap',
  '.react-flow__panel',
] as const

/**
 * @param event — événement souris ou tactile (``changedTouches[0]`` pour touch end).
 * @param container — ancêtre DOM du canvas (ex. ref du wrapper autour de ``<ReactFlow>``).
 * @returns ``data-id`` du nœud sous le pointeur, ou ``null``.
 */
export function resolveReactFlowNodeIdUnderPointer(
  event: MouseEvent | TouchEvent,
  container: HTMLElement | null
): string | null {
  if (!container || typeof document === 'undefined') {
    return null
  }

  let clientX: number
  let clientY: number
  if ('changedTouches' in event && event.changedTouches.length > 0) {
    clientX = event.changedTouches[0].clientX
    clientY = event.changedTouches[0].clientY
  } else {
    clientX = (event as MouseEvent).clientX
    clientY = (event as MouseEvent).clientY
  }

  const el = document.elementFromPoint(clientX, clientY)
  if (!el || !container.contains(el)) {
    return null
  }

  for (const sel of UI_SELECTORS_BLOCKING_NODE_RESOLVE) {
    if (el.closest(sel)) {
      return null
    }
  }

  const nodeEl = el.closest('.react-flow__node') as HTMLElement | null
  const id = nodeEl?.getAttribute('data-id')?.trim()
  return id || null
}
