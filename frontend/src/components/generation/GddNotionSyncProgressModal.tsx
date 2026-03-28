/**
 * Overlay de progression pendant une sync GDD Notion (longue durée).
 */
import type { CSSProperties } from 'react'
import type { GddNotionSyncProgressResponse } from '../../api/gddNotionSync'
import { theme } from '../../theme'

export interface GddNotionSyncProgressModalProps {
  open: boolean
  modeFull: boolean
  progress: GddNotionSyncProgressResponse | null
  elapsedSeconds: number
  /** Sync vue comme active côté client (requête longue en cours). */
  syncActive: boolean
  onPause: () => void
  onUnpause: () => void
  onCancel: () => void
}

function formatMmSs(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

export function GddNotionSyncProgressModal({
  open,
  modeFull,
  progress,
  elapsedSeconds,
  syncActive,
  onPause,
  onUnpause,
  onCancel,
}: GddNotionSyncProgressModalProps) {
  if (!open) {
    return null
  }

  const p = progress
  const pagesTotal = p?.pages_total_known ?? 0
  const pagesDone = p?.pages_processed ?? 0
  const pageRatio = pagesTotal > 0 ? Math.min(1, pagesDone / pagesTotal) : null

  const sourcesTotal = p?.sources_total ?? 0
  const sourcesDone = p?.sources_completed ?? 0

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gdd-notion-sync-progress-title"
      style={overlayStyle}
    >
      <div style={cardStyle}>
        <h3
          id="gdd-notion-sync-progress-title"
          style={{ margin: '0 0 0.75rem 0', color: theme.text.primary }}
        >
          Synchronisation GDD en cours
        </h3>
        <p style={{ margin: '0 0 1rem 0', color: theme.text.secondary, fontSize: '0.9rem' }}>
          Mode :{' '}
          <strong style={{ color: theme.text.primary }}>
            {modeFull
              ? 'Sync complète (sauvegarde automatique puis remplacement des cibles par Notion)'
              : 'Synchroniser (incrémental)'}
          </strong>
          . Ne fermez pas l’onglet.
        </p>

        <dl style={dlStyle}>
          <dt>Temps écoulé</dt>
          <dd style={ddStyle}>{formatMmSs(elapsedSeconds)}</dd>
          <dt>Phase</dt>
          <dd style={{ ...ddStyle, textTransform: 'capitalize' }}>{p?.phase ?? '—'}</dd>
          <dt>Sources</dt>
          <dd style={ddStyle}>
            {sourcesTotal > 0
              ? `${sourcesDone} / ${sourcesTotal} terminée(s)`
              : p?.active
                ? 'Calcul du périmètre…'
                : '—'}
          </dd>
          <dt>Pages Notion</dt>
          <dd style={ddStyle}>
            {pagesTotal > 0
              ? `${pagesDone} / ${pagesTotal} traitée(s)`
              : p?.active
                ? 'Volume en cours de découverte (augmente à chaque nouvelle source)'
                : 'En attente du serveur…'}
          </dd>
          {p?.current_category_file ? (
            <>
              <dt>Fichier cible</dt>
              <dd style={{ ...ddStyle, fontFamily: 'monospace', fontSize: '0.82rem' }}>
                {p.current_category_file}
              </dd>
            </>
          ) : null}
          {p && p.pages_in_current_source > 0 ? (
            <>
              <dt>Page dans cette source</dt>
              <dd style={ddStyle}>
                {p.current_page_in_source} / {p.pages_in_current_source}
                {p.current_page_id_short ? ` (…${p.current_page_id_short})` : ''}
              </dd>
            </>
          ) : null}
        </dl>

        <div style={{ marginBottom: '0.5rem' }}>
          <div style={trackStyle}>
            {pageRatio === null ? (
              <div
                style={{
                  height: '100%',
                  width: '100%',
                  backgroundColor: theme.border.focus,
                  opacity: 0.35,
                }}
              />
            ) : (
              <div
                style={{
                  ...fillStyle,
                  width: `${Math.round(pageRatio * 100)}%`,
                }}
              />
            )}
          </div>
          <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.78rem', color: theme.text.secondary }}>
            {p?.message || 'Connexion au serveur…'}
          </p>
        </div>

        <p style={{ margin: 0, fontSize: '0.78rem', color: theme.text.secondary }}>
          Le total « pages » augmente au fil des sources : ce n’est pas un bug.
        </p>

        {syncActive ? (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.5rem',
              marginTop: '1rem',
              paddingTop: '0.75rem',
              borderTop: `1px solid ${theme.border.primary}`,
            }}
          >
            {!p?.paused ? (
              <button
                type="button"
                onClick={onPause}
                style={modalButtonStyle}
              >
                Pause
              </button>
            ) : (
              <button
                type="button"
                onClick={onUnpause}
                style={modalButtonStylePrimary}
              >
                Continuer
              </button>
            )}
            <button
              type="button"
              onClick={onCancel}
              style={modalButtonStyleDanger}
            >
              Annuler la sync
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

const modalButtonStyle: CSSProperties = {
  padding: '0.45rem 0.85rem',
  borderRadius: '6px',
  border: `1px solid ${theme.border.primary}`,
  backgroundColor: theme.background.secondary,
  color: theme.text.primary,
  cursor: 'pointer',
  fontSize: '0.88rem',
}

const modalButtonStylePrimary: CSSProperties = {
  ...modalButtonStyle,
  borderColor: theme.border.focus,
  backgroundColor: theme.border.focus,
  color: theme.background.panel,
}

const modalButtonStyleDanger: CSSProperties = {
  ...modalButtonStyle,
  borderColor: theme.state.error.color,
  color: theme.state.error.color,
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 2000,
  backgroundColor: 'rgba(0,0,0,0.65)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1rem',
}

const cardStyle: CSSProperties = {
  width: '100%',
  maxWidth: '440px',
  borderRadius: '10px',
  padding: '1.25rem 1.5rem',
  backgroundColor: theme.background.panel,
  border: `1px solid ${theme.border.primary}`,
  boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
}

const dlStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gap: '0.35rem 1rem',
  margin: '0 0 1rem 0',
  fontSize: '0.88rem',
  color: theme.text.secondary,
}

const ddStyle: CSSProperties = {
  margin: 0,
  textAlign: 'right' as const,
  color: theme.text.primary,
  fontWeight: 600,
}

const trackStyle: CSSProperties = {
  height: '10px',
  borderRadius: '5px',
  backgroundColor: theme.background.secondary,
  border: `1px solid ${theme.border.primary}`,
  overflow: 'hidden',
  position: 'relative',
}

const fillStyle: CSSProperties = {
  height: '100%',
  backgroundColor: theme.border.focus,
  borderRadius: '4px',
  transition: 'width 0.2s ease-out',
}
