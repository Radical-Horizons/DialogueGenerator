/**
 * Dialog de sélection du format d'export (PNG ou SVG).
 * Extrait de GraphEditor pour isoler ce bloc JSX auto-suffisant.
 */
import { theme } from '../../theme'

interface GraphExportFormatDialogProps {
  onExportPNG: () => Promise<void>
  onExportSVG: () => Promise<void>
  onClose: () => void
}

export function GraphExportFormatDialog({
  onExportPNG,
  onExportSVG,
  onClose,
}: GraphExportFormatDialogProps) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10001,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: theme.background.panel,
          borderRadius: '8px',
          padding: '1.5rem',
          maxWidth: '400px',
          width: '90%',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
          border: `1px solid ${theme.border.primary}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0, marginBottom: '1rem', color: theme.text.primary }}>
          Choisir le format d'export
        </h2>
        <p style={{ marginBottom: '1.5rem', color: theme.text.secondary, lineHeight: 1.6 }}>
          Sélectionnez le format dans lequel vous souhaitez exporter le graphe :
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexDirection: 'column' }}>
          <button
            onClick={() => void onExportPNG()}
            style={{
              padding: '0.75rem 1rem',
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '6px',
              backgroundColor: theme.button.default.background,
              color: theme.button.default.color,
              cursor: 'pointer',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              justifyContent: 'center',
            }}
          >
            <span>📷</span>
            <span>PNG (Image raster)</span>
          </button>
          <button
            onClick={() => void onExportSVG()}
            style={{
              padding: '0.75rem 1rem',
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '6px',
              backgroundColor: theme.button.default.background,
              color: theme.button.default.color,
              cursor: 'pointer',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              justifyContent: 'center',
            }}
          >
            <span>🎨</span>
            <span>SVG (Vectoriel)</span>
          </button>
        </div>
        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            justifyContent: 'flex-end',
            marginTop: '1.5rem',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '4px',
              backgroundColor: theme.button.default.background,
              color: theme.button.default.color,
              cursor: 'pointer',
            }}
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  )
}
