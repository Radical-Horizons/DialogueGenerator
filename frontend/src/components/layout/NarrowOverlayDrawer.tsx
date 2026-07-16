import type { ReactNode } from 'react'
import { useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { theme } from '../../theme'
import { TOUCH_TARGET_MIN_PX } from '../../constants'

/** z-index partagés : au-dessus du chrome Dashboard (rails ~50) */
export const NARROW_DRAWER_Z_BACKDROP = 200
export const NARROW_DRAWER_Z_PANEL = 210

export type NarrowOverlayDrawerProps = {
  open: boolean
  side: 'left' | 'right'
  titleId: string
  title: string
  closeLabel: string
  onClose: () => void
  headerEnd?: ReactNode
  children: ReactNode
  /** Espace réservé au-dessus du clavier logiciel (visual viewport), story 17.4 */
  contentBottomInsetPx?: number
}

/**
 * Drawer plein overlay pour viewports &lt; desktop (FR120).
 * Fermeture : bouton explicite, clic sur le backdrop (en dehors du panneau).
 * Escape est géré par le parent (Dashboard) pour composer avec l’aide clavier.
 */
export function NarrowOverlayDrawer({
  open,
  side,
  titleId,
  title,
  closeLabel,
  onClose,
  headerEnd,
  children,
  contentBottomInsetPx = 0,
}: NarrowOverlayDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useLayoutEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    closeButtonRef.current?.focus({ preventScroll: true })
  }, [open, side])

  if (!open || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <>
      <div
        data-testid="narrow-drawer-backdrop"
        role="presentation"
        aria-hidden="true"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.48)',
          zIndex: NARROW_DRAWER_Z_BACKDROP,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={`narrow-drawer-${side}`}
        data-narrow-drawer-root="true"
        style={{
          position: 'fixed',
          top: 0,
          bottom: 0,
          [side]: 0,
          width: 'min(100vw, 420px)',
          maxWidth: '100%',
          backgroundColor: theme.background.secondary,
          zIndex: NARROW_DRAWER_Z_PANEL,
          display: 'flex',
          flexDirection: 'column',
          boxShadow:
            side === 'left'
              ? '4px 0 24px rgba(0,0,0,0.35)'
              : '-4px 0 24px rgba(0,0,0,0.35)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '0.75rem 0.75rem',
            borderBottom: `1px solid ${theme.border.primary}`,
            backgroundColor: theme.background.panelHeader,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
            flexShrink: 0,
          }}
        >
          <h2
            id={titleId}
            style={{
              fontSize: '0.9rem',
              fontWeight: 700,
              color: theme.text.primary,
              margin: 0,
              flex: 1,
              minWidth: 0,
            }}
          >
            {title}
          </h2>
          {headerEnd}
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            style={{
              flexShrink: 0,
              minHeight: TOUCH_TARGET_MIN_PX,
              minWidth: TOUCH_TARGET_MIN_PX,
              padding: '0 0.75rem',
              borderRadius: 8,
              border: `1px solid ${theme.border.primary}`,
              backgroundColor: theme.button.default.background,
              color: theme.button.default.color,
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem',
            }}
          >
            Fermer
          </button>
        </div>
        <div
          data-testid="narrow-drawer-scroll-slot"
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            paddingBottom: contentBottomInsetPx,
            boxSizing: 'border-box',
          }}
        >
          {children}
        </div>
      </div>
    </>,
    document.body
  )
}
