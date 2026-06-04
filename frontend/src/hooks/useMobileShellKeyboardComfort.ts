import { useVisualViewportBottomInsetPx } from './useVisualViewportBottomInsetPx'

/**
 * Inset bas (px) pour padding shell Dashboard quand le clavier réduit le visual viewport.
 * Le `scrollIntoView` sur focus est centralisé dans `useShellKeyboardFocusScroller` (monté par `MainLayout`).
 */
export function useMobileShellKeyboardComfort(enabled: boolean): { bottomInsetPx: number } {
  const bottomInsetPx = useVisualViewportBottomInsetPx(enabled)
  return { bottomInsetPx }
}
