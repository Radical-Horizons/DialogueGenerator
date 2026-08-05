/**
 * Tiroir bas « Ce qui part au modèle » (écran 2d, ≤ 1200 px).
 *
 * Sous cette largeur, une troisième colonne verticale rogne la colonne de lecture
 * sans rien gagner : le décompte quitte la droite et devient une barre repliée
 * au-dessus de la barre d'action. **Le total reste toujours visible**, seul le
 * détail se déplie — plafonné à 60 % de la hauteur pour ne jamais manger l'écran.
 */
import { useState, type ReactNode } from 'react'
import { redesignFont, redesignHairline, redesignSurface, redesignText } from '../../theme/redesignTokens'

/** Le détail ne dépasse jamais cette part de la hauteur visible (annotation 2d). */
export const PROMPT_DRAWER_MAX_HEIGHT = '60vh'

export interface PromptBudgetBottomDrawerProps {
  /** Total de tokens du prompt — toujours affiché, même replié. */
  totalTokens: number | null
  /** Détail (répartition par section) affiché une fois déplié. */
  children: ReactNode
  /** Ouvert par défaut ? Replié dans la maquette. */
  defaultOpen?: boolean
}

export function PromptBudgetBottomDrawer({
  totalTokens,
  children,
  defaultOpen = false,
}: PromptBudgetBottomDrawerProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div
      data-testid="prompt-budget-bottom-drawer"
      data-open={open ? 'true' : 'false'}
      style={{
        flexShrink: 0,
        borderTop: `1px solid ${redesignHairline.strong}`,
        backgroundColor: redesignSurface.panel,
      }}
    >
      <button
        type="button"
        data-testid="prompt-budget-drawer-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          padding: '9px 18px',
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          borderBottom: open ? `1px solid ${redesignHairline.standard}` : undefined,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
          <span aria-hidden style={{ fontSize: 11, color: redesignText.label }}>
            {open ? '▾' : '▴'}
          </span>
          <span style={{ fontSize: '12.5px', color: redesignText.body, whiteSpace: 'nowrap' }}>
            Ce qui part au modèle
          </span>
        </span>
        <span
          data-testid="prompt-budget-drawer-total"
          style={{
            fontFamily: redesignFont.mono,
            fontSize: '11px',
            color: redesignText.secondary,
            whiteSpace: 'nowrap',
          }}
        >
          {totalTokens != null ? totalTokens.toLocaleString('fr-FR') : '—'}
        </span>
      </button>

      {open && (
        <div
          data-testid="prompt-budget-drawer-detail"
          style={{ maxHeight: PROMPT_DRAWER_MAX_HEIGHT, overflowY: 'auto' }}
        >
          {children}
        </div>
      )}
    </div>
  )
}
