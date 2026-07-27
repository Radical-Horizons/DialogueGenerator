/**
 * Modale d'aperçu « première ligne » d'une base Notion (même pipeline que la sync).
 */
import { theme } from '../../theme'
import type { GddNotionPreviewDatabaseResponse } from '../../api/gddNotionSync'
import { buttonStyle } from './gddNotionSyncStyles'

export interface GddNotionSyncPreviewModalProps {
  previewForFile: string | null
  previewLoading: boolean
  previewError: string | null
  previewData: GddNotionPreviewDatabaseResponse | null
  onClose: () => void
}

export function GddNotionSyncPreviewModal({
  previewForFile,
  previewLoading,
  previewError,
  previewData,
  onClose,
}: GddNotionSyncPreviewModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gdd-preview-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2150,
        backgroundColor: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 'min(920px, 100vw - 2rem)',
          maxHeight: 'min(85vh, 720px)',
          borderRadius: '10px',
          padding: '1.25rem 1.5rem',
          backgroundColor: theme.background.panel,
          border: `1px solid ${theme.border.primary}`,
          boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        <h3 id="gdd-preview-title" style={{ margin: 0, color: theme.text.primary }}>
          Test Notion — {previewForFile ?? 'base'}
        </h3>
        <p style={{ margin: 0, color: theme.text.secondary, fontSize: '0.88rem' }}>
          Première ligne de la base, même pipeline que la sync (query → get_page → mapping). Aucune écriture sur
          le GDD.
        </p>
        {previewLoading && (
          <p style={{ margin: 0, color: theme.text.secondary }}>Chargement…</p>
        )}
        {previewError && (
          <p style={{ margin: 0, color: theme.state.error.color, fontSize: '0.9rem' }}>{previewError}</p>
        )}
        {previewData && !previewLoading && (
          <>
            <ul
              style={{
                margin: 0,
                paddingLeft: '1.2rem',
                color: theme.text.secondary,
                fontSize: '0.82rem',
                lineHeight: 1.5,
              }}
            >
              <li>
                Data sources (API 2025-09-03) : <strong>{previewData.data_sources_count}</strong>
              </li>
              <li>Lignes retournées par query : {previewData.query_total_rows}</li>
              <li>Clés propriétés (ligne query / get_page) : {previewData.property_keys_from_query_row.length} /{' '}
                {previewData.property_keys_from_get_page.length}</li>
              <li>
                Colonnes dans <code style={{ fontSize: '0.85em' }}>values</code> (hors titre) :{' '}
                {previewData.mapped_record &&
                typeof previewData.mapped_record === 'object' &&
                previewData.mapped_record !== null &&
                'values' in previewData.mapped_record &&
                typeof previewData.mapped_record.values === 'object' &&
                previewData.mapped_record.values !== null
                  ? Object.keys(previewData.mapped_record.values as object).length
                  : 0}
              </li>
              <li>Mode compact table : {previewData.compact_table ? 'oui' : 'non'}</li>
            </ul>
            <pre
              style={{
                margin: 0,
                flex: 1,
                minHeight: '200px',
                overflow: 'auto',
                padding: '0.65rem',
                fontSize: '0.75rem',
                lineHeight: 1.35,
                backgroundColor: theme.background.secondary,
                borderRadius: '6px',
                border: `1px solid ${theme.border.primary}`,
                color: theme.text.primary,
              }}
            >
              {JSON.stringify(previewData.mapped_record ?? previewData, null, 2)}
            </pre>
          </>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            disabled={previewLoading}
            onClick={onClose}
            style={buttonStyle(previewLoading)}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
