/**
 * Timeline + diff MVP pour l'historique local d'une entité GDD (Story 3.9).
 */
import { useCallback, useState } from 'react'
import { getGddEntityHistory } from '../../api/gddContextStale'
import type { GddEntityHistoryResponse } from '../../api/gddContextStale'
import { theme } from '../../theme'

export interface GddEntityHistoryViewerProps {
  categoryStem: string
  entityName: string
}

export function GddEntityHistoryViewer({
  categoryStem,
  entityName,
}: GddEntityHistoryViewerProps) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<GddEntityHistoryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getGddEntityHistory(categoryStem, entityName)
      setData(res)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur chargement historique')
    } finally {
      setLoading(false)
    }
  }, [categoryStem, entityName])

  const toggle = () => {
    if (!open) {
      setOpen(true)
      void load()
    } else {
      setOpen(false)
    }
  }

  return (
    <div style={{ marginTop: '0.75rem', borderTop: `1px solid ${theme.border.primary}`, paddingTop: '0.5rem' }}>
      <button
        type="button"
        onClick={toggle}
        style={{
          background: 'transparent',
          border: 'none',
          color: theme.state.info.color,
          cursor: 'pointer',
          fontSize: '0.85rem',
          fontWeight: 600,
          padding: 0,
        }}
        aria-expanded={open}
      >
        Historique des modifications (GDD){open ? ' ▲' : ' ▼'}
      </button>
      {open && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: theme.text.secondary }}>
          {loading && <p>Chargement…</p>}
          {error && <p style={{ color: theme.state.error.color }}>{error}</p>}
          {!loading && !error && data && (
            <>
              {data.events.length === 0 ? (
                <p>Aucun historique local (après sync Notion, les mises à jour apparaîtront ici).</p>
              ) : (
                <ul style={{ margin: '0.25rem 0 0 1rem', padding: 0 }}>
                  {data.events.map((ev, i) => (
                    <li key={`${ev.at}-${i}`} style={{ marginBottom: 6 }}>
                      <strong>{ev.at}</strong> — {ev.source}: {ev.summary}
                    </li>
                  ))}
                </ul>
              )}
              {data.diff_hint && data.events.length >= 2 && (
                <pre
                  style={{
                    marginTop: 8,
                    maxHeight: 180,
                    overflow: 'auto',
                    background: theme.background.primary,
                    padding: 8,
                    borderRadius: 4,
                    fontSize: '0.72rem',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {data.diff_hint}
                </pre>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
