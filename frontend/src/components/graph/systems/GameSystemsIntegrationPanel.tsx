import { useEffect, useState } from 'react'

import { getGameSystemsIntegrationCatalog } from '../../../api/gameSystemsIntegration'
import { theme } from '../../../theme'
import type { GameSystemsIntegrationCatalog } from '../../../types/gameSystemsIntegration'

interface GameSystemsIntegrationPanelProps {
  catalog?: GameSystemsIntegrationCatalog
  onClose: () => void
}

export function GameSystemsIntegrationPanel({
  catalog: providedCatalog,
  onClose,
}: GameSystemsIntegrationPanelProps) {
  const [catalog, setCatalog] = useState<GameSystemsIntegrationCatalog | undefined>(providedCatalog)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (providedCatalog) {
      setCatalog(providedCatalog)
      setError(null)
      return
    }

    let cancelled = false
    void (async () => {
      try {
        const response = await getGameSystemsIntegrationCatalog()
        if (cancelled) return
        setCatalog(response)
        setError(null)
      } catch (err) {
        if (cancelled) return
        console.warn('[GameSystemsIntegrationPanel] catalog unavailable', err)
        setError(
          'Catalogue systèmes indisponible : édition locale toujours possible avec la preview simulée.',
        )
      }
    })()

    return () => {
      cancelled = true
    }
  }, [providedCatalog])

  return (
    <aside
      data-testid="game-systems-integration-panel"
      aria-label="Intégration systèmes de jeu"
      style={{
        width: 'min(380px, 94vw)',
        borderLeft: `1px solid ${theme.border.primary}`,
        backgroundColor: theme.background.secondary,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '10px 12px',
          borderBottom: `1px solid ${theme.border.primary}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
          Intégration systèmes de jeu
        </span>
        <button
          type="button"
          data-testid="game-systems-integration-close"
          onClick={onClose}
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            border: `1px solid ${theme.border.primary}`,
            background: theme.button.default.background,
            cursor: 'pointer',
          }}
        >
          Fermer
        </button>
      </div>

      <div style={{ padding: '10px 12px', overflowY: 'auto', flex: 1 }}>
        {error ? (
          <div
            role="alert"
            style={{
              marginBottom: 12,
              padding: '8px 10px',
              borderRadius: 6,
              fontSize: '0.82rem',
              backgroundColor: theme.state.warning?.background ?? 'rgba(241, 196, 15, 0.15)',
              border: `1px solid ${theme.border.primary}`,
              color: theme.text.primary,
            }}
          >
            {error}
          </div>
        ) : null}

        {catalog ? (
          <>
            <section style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Familles disponibles</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {catalog.families.map((family) => (
                  <article
                    key={family.id}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: `1px solid ${theme.border.primary}`,
                      backgroundColor: theme.background.panel,
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>{family.label}</div>
                    <div style={{ fontSize: '0.84rem', color: theme.text.secondary }}>
                      {family.description}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                {catalog.runtime_source.label}
              </div>
              <div
                role="status"
                style={{
                  padding: '8px 10px',
                  borderRadius: 6,
                  fontSize: '0.84rem',
                  backgroundColor: catalog.runtime_source.editing_blocked
                    ? theme.state.error.background
                    : theme.state.warning?.background ?? 'rgba(241, 196, 15, 0.15)',
                  border: `1px solid ${theme.border.primary}`,
                  color: theme.text.primary,
                }}
              >
                {catalog.runtime_source.message}
              </div>
              {!catalog.runtime_source.editing_blocked ? (
                <div style={{ marginTop: 8, fontSize: '0.84rem', color: theme.text.secondary }}>
                  Édition locale disponible
                </div>
              ) : null}
            </section>
          </>
        ) : (
          <div style={{ fontSize: '0.85rem', color: theme.text.secondary }}>
            Chargement du catalogue systèmes...
          </div>
        )}
      </div>
    </aside>
  )
}
