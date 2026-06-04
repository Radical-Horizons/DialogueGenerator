/**
 * Position fixe des menus contextuels — reste dans la fenêtre (GraphCanvas).
 */
export function clampContextMenuToViewport(
  clientX: number,
  clientY: number,
  menuWidth: number,
  menuHeight: number,
  padding = 8
): { left: number; top: number } {
  let left = clientX + padding
  let top = clientY + padding
  if (typeof window === 'undefined') {
    return { left, top }
  }
  if (left + menuWidth > window.innerWidth) {
    left = Math.max(padding, window.innerWidth - menuWidth - padding)
  }
  if (top + menuHeight > window.innerHeight) {
    top = Math.max(padding, window.innerHeight - menuHeight - padding)
  }
  if (left < padding) left = padding
  if (top < padding) top = padding
  return { left, top }
}
