/**
 * Timeline + diff MVP pour l'historique local d'une entité GDD (Story 3.9).
 */
import { useCallback, useState } from 'react'
import { getGddEntityHistory } from '../../api/gddContextStale'
import type { GddEntityHistoryResponse, GddEntityHistoryEvent } from '../../api/gddContextStale'
import { theme } from '../../theme'
import { remSize } from '../../theme/uiTypography'

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
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getGddEntityHistory(categoryStem, entityName, {
        includeSnapshots: true,
      })
      setData(res)
      setSelectedIndex(res.events.length > 0 ? res.events.length - 1 : null)
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

  const selected: GddEntityHistoryEvent | null =
    data !== null && selectedIndex !== null && data.events[selectedIndex] !== undefined
      ? data.events[selectedIndex]!
      : null

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
          fontSize: remSize('accent'),
          fontWeight: 600,
          padding: 0,
        }}
        aria-expanded={open}
      >
        Historique des modifications (GDD){open ? ' ▲' : ' ▼'}
      </button>
      {open && (
        <div style={{ marginTop: '0.5rem', fontSize: remSize('body'), color: theme.text.secondary }}>
          {loading && <p>Chargement…</p>}
          {error && <p style={{ color: theme.state.error.color }}>{error}</p>}
          {!loading && !error && data && (
            <>
              {data.events.length === 0 ? (
                <p>Aucun historique local (après sync Notion, les mises à jour apparaîtront ici).</p>
              ) : (
                <>
                  <ul style={{ margin: '0.25rem 0 0 0', padding: 0, listStyle: 'none' }}>
                    {data.events.map((ev, i) => (
                      <li key={`${ev.at}-${i}`} style={{ marginBottom: 4 }}>
                        <button
                          type="button"
                          onClick={() => setSelectedIndex(i)}
                          aria-pressed={selectedIndex === i}
                          style={{
                            background:
                              selectedIndex === i ? theme.background.secondary : 'transparent',
                            border: `1px solid ${theme.border.primary}`,
                            borderRadius: 4,
                            color: theme.text.primary,
                            cursor: 'pointer',
                            fontSize: remSize('small'),
                            padding: '4px 8px',
                            textAlign: 'left',
                            width: '100%',
                          }}
                        >
                          <strong>{ev.at}</strong> — {ev.source}: {ev.summary}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {selected && (
                    <div
                      role="region"
                      aria-label="Détail de la version sélectionnée"
                      style={{ marginTop: 10 }}
                    >
                      {selected.diff_from_previous != null && selected.diff_from_previous.length > 0 && (
                        <div>
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>Diff vs version précédente</div>
                          <pre
                            style={{
                              maxHeight: 160,
                              overflow: 'auto',
                              background: theme.background.primary,
                              padding: 8,
                              borderRadius: 4,
                              fontSize: remSize('caption'),
                              whiteSpace: 'pre-wrap',
                            }}
                          >
                            {selected.diff_from_previous}
                          </pre>
                        </div>
                      )}
                      {selected.snapshot != null && (
                        <div style={{ marginTop: selected.diff_from_previous ? 8 : 0 }}>
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>Snapshot (JSON)</div>
                          <pre
                            style={{
                              maxHeight: 200,
                              overflow: 'auto',
                              background: theme.background.primary,
                              padding: 8,
                              borderRadius: 4,
                              fontSize: remSize('caption'),
                              whiteSpace: 'pre-wrap',
                            }}
                          >
                            {JSON.stringify(selected.snapshot, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </>
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
                    fontSize: remSize('caption'),
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
