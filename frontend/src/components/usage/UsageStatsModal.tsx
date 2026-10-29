/**
 * Modal pour afficher les statistiques d'utilisation LLM.
 */
import { UsageDashboard } from './UsageDashboard'
import { theme } from '../../theme'
import { useNarrowInlineSize } from '../../hooks/useNarrowInlineSize'
import { modalTypography } from '../../theme/responsiveChrome'

interface UsageStatsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function UsageStatsModal({ isOpen, onClose }: UsageStatsModalProps) {
  const { ref: panelRef, isNarrow } = useNarrowInlineSize(720)
  const typo = isNarrow ? modalTypography.narrow : modalTypography.comfortable
  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: theme.background.elevated,
          borderRadius: '8px',
          width: '90%',
          maxWidth: '1400px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
        ref={panelRef}
      >
        {/* Header */}
        <div
          style={{
            padding: isNarrow ? '0.9rem' : '1.5rem',
            borderBottom: `1px solid ${theme.border.primary}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <h2 style={{ margin: 0, color: theme.text.primary, fontSize: `${typo.titleFontRem}rem` }}>
            Statistiques d'utilisation LLM
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: theme.text.secondary,
              fontSize: `${typo.titleFontRem}rem`,
              cursor: 'pointer',
              padding: '0.25rem 0.5rem',
            }}
          >
            ×
          </button>
        </div>
        {/* Content */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: isNarrow ? '0.9rem' : '1.5rem',
          }}
        >
          <UsageDashboard />
        </div>
      </div>
    </div>
  )
}




