/**
 * Panneau « Détails contexte » : sections GDD injectées / détectées (Story 3.7, FR17).
 */
import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import * as llmUsageApi from '../../api/llmUsage'
import type { ContextSectionUsageItem } from '../../api/llmUsage'
import { useGraphStore } from '../../store/graphStore'
import { getErrorMessage } from '../../types/errors'
import { theme } from '../../theme'
import { labelForEntityType } from '../../utils/contextUsageLabels'
import { ContextSectionUsageModal } from './ContextSectionUsageModal'
import { ContextComparisonView } from './ContextComparisonView'

export function ContextUsagePanel() {
  const dialogueId = useGraphStore((s) => s.documentId ?? s.dialogueMetadata.filename ?? null)
  const nodeId = useGraphStore((s) => s.selectedNodeId)
  const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds)
  const nodes = useGraphStore((s) => s.nodes)

  const otherNodeIds = useMemo(
    () =>
      nodes
        .map((n) => String(n.id))
        .filter((id) => id && id !== nodeId),
    [nodes, nodeId]
  )

  const [detail, setDetail] = useState<llmUsageApi.ContextSectionUsageReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  const [compareNodeId, setCompareNodeId] = useState<string>('')
  const [modal, setModal] = useState<{
    title: string
    entityLabel: string
    excerpt: string
  } | null>(null)

  useEffect(() => {
    if (!dialogueId || !nodeId) {
      setDetail(null)
      setMissing(false)
      setError(null)
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      setMissing(false)
      try {
        const d = await llmUsageApi.getNodeContextSectionUsage(dialogueId, nodeId)
        if (!cancelled) setDetail(d)
      } catch (e) {
        if (cancelled) return
        if (axios.isAxiosError(e) && e.response?.status === 404) {
          setDetail(null)
          setMissing(true)
        } else {
          setError(getErrorMessage(e))
          setDetail(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [dialogueId, nodeId])

  useEffect(() => {
    setCompareNodeId('')
  }, [nodeId])

  useEffect(() => {
    if (!nodeId) return
    const ids = selectedNodeIds ?? []
    if (ids.length < 2 || ids[0] !== nodeId) return
    const second = ids[1]
    if (!second || second === nodeId) return
    if (!otherNodeIds.includes(second)) return
    setCompareNodeId((prev) => (prev ? prev : second))
  }, [nodeId, selectedNodeIds, otherNodeIds])

  const openModal = (entityLabel: string, sec: ContextSectionUsageItem) => {
    setModal({
      title: sec.section_title,
      entityLabel,
      excerpt: sec.excerpt,
    })
  }

  if (!dialogueId) {
    return (
      <div
        data-testid="context-usage-panel"
        style={{
          padding: '0.6rem 0.75rem',
          fontSize: '0.8rem',
          color: theme.text.secondary,
          borderTop: `1px solid ${theme.border.primary}`,
        }}
      >
        Chargez ou enregistrez un dialogue pour afficher le détail d’usage du contexte GDD.
      </div>
    )
  }

  if (!nodeId) {
    return (
      <div
        data-testid="context-usage-panel"
        style={{
          padding: '0.6rem 0.75rem',
          fontSize: '0.8rem',
          color: theme.text.secondary,
          borderTop: `1px solid ${theme.border.primary}`,
        }}
      >
        Sélectionnez un nœud pour voir les sections GDD utilisées.
      </div>
    )
  }

  return (
    <div
      data-testid="context-usage-panel"
      style={{
        borderTop: `1px solid ${theme.border.primary}`,
        padding: '0.6rem 0.75rem',
        fontSize: '0.8rem',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>Détails contexte (sections)</div>
      {loading && <div data-testid="context-usage-loading">Chargement…</div>}
      {error && (
        <div style={{ color: theme.state.error.color }} data-testid="context-usage-error">
          {error}
        </div>
      )}
      {missing && !loading && !error && (
        <div data-testid="context-usage-missing" style={{ color: theme.text.secondary }}>
          Aucune donnée d’usage pour ce nœud (générez avec contexte GDD pour remplir).
        </div>
      )}
      {detail && !loading && !error && (
        <>
          {detail.parser_note ? (
            <div
              data-testid="context-usage-parser-note"
              style={{
                marginBottom: '0.45rem',
                fontSize: '0.72rem',
                color: theme.text.secondary,
                lineHeight: 1.35,
              }}
            >
              {detail.parser_note}
            </div>
          ) : null}
          <div
            data-testid="context-usage-counts"
            style={{ marginBottom: '0.5rem', color: theme.text.secondary }}
          >
            Reflétées : {detail.reflected_section_count} · Peu ou pas détectées :{' '}
            {detail.weak_section_count} (seuil {detail.reflected_threshold_percent}%)
          </div>
          {detail.weak_section_count > 0 && (
            <div
              data-testid="context-usage-weak-zone"
              style={{
                marginBottom: '0.65rem',
                padding: '0.45rem',
                background: theme.background.secondary,
                borderRadius: 4,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Peu ou pas détectées</div>
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {detail.weak_sections.map((w) => (
                  <li key={w.section_key}>
                    <span style={{ color: theme.text.secondary }}>
                      {labelForEntityType(w.entity_type)} · {w.entity_label} ·{' '}
                    </span>
                    {w.section_title} ({w.overlap_percent}%)
                  </li>
                ))}
              </ul>
            </div>
          )}
          {detail.entity_groups.map((g) => (
            <details
              key={`${g.entity_type}:${g.entity_label}`}
              data-testid={`context-usage-group-${g.entity_type}`}
              style={{ marginBottom: '0.35rem' }}
            >
              <summary style={{ cursor: 'pointer', fontWeight: 500 }}>
                {labelForEntityType(g.entity_type)} — {g.entity_label}
              </summary>
              <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem', listStyle: 'disc' }}>
                {g.sections.map((sec) => (
                  <li key={sec.section_key}>
                    <button
                      type="button"
                      data-testid={`context-usage-section-${sec.section_key}`}
                      onClick={() => openModal(g.entity_label, sec)}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        color: theme.text.primary,
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        font: 'inherit',
                      }}
                    >
                      {sec.section_title}
                    </button>
                    <span
                      style={{
                        marginLeft: '0.35rem',
                        color:
                          sec.status === 'reflected'
                            ? theme.state.success?.color ?? '#2e7d32'
                            : theme.text.secondary,
                      }}
                    >
                      ({sec.overlap_percent}%)
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
          <details style={{ marginTop: '0.75rem' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 500 }}>
              Comparer avec un autre nœud
            </summary>
            <div style={{ marginTop: '0.5rem' }}>
              <label htmlFor="context-usage-compare-select" style={{ display: 'block', marginBottom: '0.25rem' }}>
                Second nœud
              </label>
              <select
                id="context-usage-compare-select"
                data-testid="context-usage-compare-select"
                value={compareNodeId}
                onChange={(e) => setCompareNodeId(e.target.value)}
                style={{
                  width: '100%',
                  maxWidth: 320,
                  marginBottom: '0.5rem',
                  fontSize: '0.85rem',
                }}
              >
                <option value="">—</option>
                {otherNodeIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
              {compareNodeId ? (
                <ContextComparisonView
                  dialogueId={dialogueId}
                  nodeIdA={nodeId}
                  nodeIdB={compareNodeId}
                />
              ) : null}
            </div>
          </details>
        </>
      )}
      {modal && detail && (
        <ContextSectionUsageModal
          open
          onClose={() => setModal(null)}
          sectionTitle={modal.title}
          entityLabel={modal.entityLabel}
          excerpt={modal.excerpt}
          generatedPlainPreview={detail.generated_plain_preview}
        />
      )}
    </div>
  )
}
