/**
 * Panneau admin — index FTS dialogues (Story 8.6 / FR85).
 */
import { useCallback, useEffect, useState } from 'react'
import * as dialogueSearchAPI from '../../api/dialogueSearch'
import type { DialogueSearchStats } from '../../api/dialogueSearch'
import { theme } from '../../theme'
import { remSize } from '../../theme/uiTypography'
import { getErrorMessage } from '../../types/errors'

/**
 * Affiche les stats d'index et permet de lancer une réindexation.
 */
export function SearchIndexPanel() {
  const [stats, setStats] = useState<DialogueSearchStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isReindexing, setIsReindexing] = useState(false)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setStats(await dialogueSearchAPI.getDialogueSearchStats())
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (stats?.rebuild_status !== 'running') return
    const timer = window.setInterval(() => {
      void refresh()
    }, 1000)
    return () => window.clearInterval(timer)
  }, [stats?.rebuild_status, refresh])

  const handleReindex = async () => {
    setIsReindexing(true)
    setError(null)
    try {
      await dialogueSearchAPI.startDialogueReindex()
      await refresh()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsReindexing(false)
    }
  }

  return (
    <div data-testid="search-index-panel" style={{ padding: '1rem' }}>
      <h2 style={{ color: theme.text.primary, fontSize: remSize('title') }}>
        Index de recherche
      </h2>
      <p style={{ color: theme.text.secondary, fontSize: remSize('body') }}>
        Index FTS5 des dialogues (FR85). Réindexation en arrière-plan.
      </p>
      {error && (
        <div
          data-testid="search-index-error"
          style={{ color: theme.state.error.color, marginBottom: '0.75rem' }}
        >
          {error}
        </div>
      )}
      {isLoading && !stats ? (
        <div style={{ color: theme.text.tertiary }}>Chargement…</div>
      ) : stats ? (
        <dl
          data-testid="search-index-stats"
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '0.35rem 1rem',
            color: theme.text.primary,
            fontSize: remSize('body'),
          }}
        >
          <dt>Documents indexés</dt>
          <dd>{stats.indexed_count}</dd>
          <dt>Dernière réindexation</dt>
          <dd>{stats.last_rebuild_at ?? '—'}</dd>
          <dt>Taille approx.</dt>
          <dd>{stats.index_bytes} octets</dd>
          <dt>Dernière recherche</dt>
          <dd>
            {stats.last_search_ms != null
              ? `${stats.last_search_ms.toFixed(1)} ms`
              : '—'}
          </dd>
          <dt>Statut</dt>
          <dd data-testid="search-index-status">{stats.rebuild_status}</dd>
          {stats.rebuild_error && (
            <>
              <dt>Erreur</dt>
              <dd style={{ color: theme.state.error.color }}>
                {stats.rebuild_error}
              </dd>
            </>
          )}
        </dl>
      ) : null}
      <button
        type="button"
        data-testid="search-index-reindex"
        disabled={isReindexing || stats?.rebuild_status === 'running'}
        onClick={() => {
          void handleReindex()
        }}
        style={{
          marginTop: '1rem',
          padding: '0.45rem 0.8rem',
          border: 'none',
          borderRadius: '6px',
          backgroundColor: theme.button.primary.background,
          color: theme.button.primary.color,
          cursor:
            isReindexing || stats?.rebuild_status === 'running'
              ? 'not-allowed'
              : 'pointer',
        }}
      >
        {stats?.rebuild_status === 'running' || isReindexing
          ? 'Réindexation…'
          : 'Réindexer'}
      </button>
    </div>
  )
}
