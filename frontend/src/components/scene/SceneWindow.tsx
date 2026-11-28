/**
 * Fenêtres ouvertes depuis la fiche de scène. Le focus y entre, y tourne, puis revient à
 * ce qui les a ouvertes ; ÉCHAP ferme la plus proche. Leurs frappes ne vont pas au graphe.
 */
import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { theme } from '../../theme'
import {
  redesignHairline,
  redesignRadius,
  redesignSpacing,
  redesignText,
} from '../../theme/redesignTokens'
import { buttonStyle } from './sceneStyles'

const FOCUSABLE = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

function keepKeysInside(event: ReactKeyboardEvent): void {
  // ÉCHAP reste lu par les fenêtres existantes, qui écoutent la page.
  if (event.key !== 'Escape') event.stopPropagation()
}

export function SceneWindowFocus({
  trigger,
  onEscape,
  children,
}: {
  trigger: RefObject<HTMLElement>
  /** Absent quand la fenêtre gère elle-même ÉCHAP. */
  onEscape?: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const escapeRef = useRef(onEscape)
  escapeRef.current = onEscape

  useEffect(() => {
    const container = ref.current
    if (!container) return
    const opener = trigger.current
    const dialogs = () => [...container.querySelectorAll<HTMLElement>('[role="dialog"]')]
    const controls = (root: Element) => [...root.querySelectorAll<HTMLElement>(FOCUSABLE)]
    if (!container.contains(document.activeElement)) controls(dialogs()[0] ?? container)[0]?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      const open = dialogs()
      const top = open[open.length - 1]
      if (!top) return
      if (event.key === 'Escape') {
        // Permissions ouvertes depuis les métadonnées : elles se ferment seules.
        const nestedClose =
          open.length > 1
            ? top.querySelector<HTMLElement>('[data-testid="dialogue-permissions-close"]')
            : null
        if (!nestedClose && !escapeRef.current) return
        event.preventDefault()
        event.stopImmediatePropagation()
        if (nestedClose) nestedClose.click()
        else escapeRef.current?.()
        return
      }
      if (event.key !== 'Tab') {
        // Focus retombé sur la page (clic dans le texte, commande disparue) : le graphe
        // ne doit pas agir derrière la fenêtre.
        if (event.target === document.body) event.stopPropagation()
        return
      }
      event.stopPropagation()
      const items = controls(top)
      if (items.length === 0) return
      const at = items.indexOf(document.activeElement as HTMLElement)
      if (at !== -1 && at !== (event.shiftKey ? 0 : items.length - 1)) return
      event.preventDefault()
      items[event.shiftKey ? items.length - 1 : 0].focus()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      if (opener?.isConnected) opener.focus()
    }
  }, [trigger])

  return createPortal(
    <div ref={ref} onKeyDown={keepKeysInside} style={{ display: 'contents' }}>
      {children}
    </div>,
    document.body,
  )
}

export function SceneDialog({
  title,
  trigger,
  onClose,
  children,
}: {
  title: string
  trigger: RefObject<HTMLElement>
  onClose: () => void
  children: ReactNode
}) {
  const titleId = useId()
  return (
    <SceneWindowFocus trigger={trigger} onEscape={onClose}>
      <div
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose()
        }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          backgroundColor: 'rgba(0, 0, 0, 0.45)',
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          style={{
            width: 'min(560px, 100%)',
            maxHeight: 'calc(100vh - 2rem)',
            overflowY: 'auto',
            boxSizing: 'border-box',
            padding: redesignSpacing.lg,
            borderRadius: redesignRadius.frame,
            border: `1px solid ${redesignHairline.strong}`,
            backgroundColor: theme.background.elevated,
            color: redesignText.body,
            boxShadow: theme.shadow.card,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: redesignSpacing.md,
              marginBottom: redesignSpacing.md,
            }}
          >
            <h2
              id={titleId}
              style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: redesignText.strong }}
            >
              {title}
            </h2>
            <button type="button" onClick={onClose} style={buttonStyle}>
              Fermer
            </button>
          </div>
          {children}
        </div>
      </div>
    </SceneWindowFocus>
  )
}
