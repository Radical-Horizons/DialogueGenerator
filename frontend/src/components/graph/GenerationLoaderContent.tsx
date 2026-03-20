/**
 * Bloc spinner + libellé "Génération en cours…" partagé entre
 * DropChoiceModal (génération après drop d’un handle) et overlay clic droit TestNode.
 */
import { memo } from 'react'
import { theme } from '../../theme'

export const GenerationLoaderContent = memo(function GenerationLoaderContent() {
  return (
    <>
      <div
        style={{
          width: 32,
          height: 32,
          border: `3px solid ${theme.border.primary}`,
          borderTopColor: theme.button.primary.background,
          borderRadius: '50%',
          animation: 'generation-spin 0.8s linear infinite',
        }}
      />
      <span style={{ fontSize: '0.875rem', color: theme.text.secondary }}>
        Génération en cours…
      </span>
      <style>{`
        @keyframes generation-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  )
})
