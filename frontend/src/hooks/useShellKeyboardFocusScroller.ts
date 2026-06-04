import { useEffect } from 'react'

function shouldScrollFocusedField(el: EventTarget | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/**
 * Scroll du champ focalisé dans la zone utile (clavier logiciel, story 17.4).
 * Monté une seule fois au niveau `MainLayout` pour couvrir Dashboard, drawers et `CommandPalette`.
 */
export function useShellKeyboardFocusScroller(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return

    const onFocusIn = (ev: FocusEvent) => {
      const t = ev.target
      if (!shouldScrollFocusedField(t)) return
      const inDashboard = t.closest('[data-dashboard-shell="true"]')
      const inDrawer = t.closest('[data-narrow-drawer-root="true"]')
      const inShellKeyboardZone = t.closest('[data-shell-keyboard-zone="true"]')
      if (!inDashboard && !inDrawer && !inShellKeyboardZone) return
      t.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }

    document.addEventListener('focusin', onFocusIn, true)
    return () => document.removeEventListener('focusin', onFocusIn, true)
  }, [enabled])
}
