/**
 * Comparaison des clés de sections GDD entre deux nœuds (Story 3.7, AC#5).
 */
import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import * as llmUsageApi from '../../api/llmUsage'
import type { ContextSectionUsageReport } from '../../api/llmUsage'
import { getErrorMessage } from '../../types/errors'
import { theme } from '../../theme'

function sectionKeysOf(report: ContextSectionUsageReport | null): Set<string> {
  const s = new Set<string>()
  if (!report) return s
  for (const g of report.entity_groups) {
    for (const sec of g.sections) {
      s.add(sec.section_key)
    }
  }
  return s
}

export interface ContextComparisonViewProps {
  dialogueId: string
  nodeIdA: string
  nodeIdB: string
}

export function ContextComparisonView({
  dialogueId,
  nodeIdA,
  nodeIdB,
}: ContextComparisonViewProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [repA, setRepA] = useState<ContextSectionUsageReport | null>(null)
  const [repB, setRepB] = useState<ContextSectionUsageReport | null>(null)

  useEffect(() => {
    if (!dialogueId || !nodeIdA || !nodeIdB || nodeIdA === nodeIdB) {
      setRepA(null)
      setRepB(null)
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const [a, b] = await Promise.all([
          llmUsageApi.getNodeContextSectionUsage(dialogueId, nodeIdA),
          llmUsageApi.getNodeContextSectionUsage(dialogueId, nodeIdB),
        ])
        if (!cancelled) {
          setRepA(a)
          setRepB(b)
        }
      } catch (e) {
        if (!cancelled) {
          if (axios.isAxiosError(e) && e.response?.status === 404) {
            setError('Données d’usage introuvables pour un des nœuds.')
          } else {
            setError(getErrorMessage(e))
          }
          setRepA(null)
          setRepB(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [dialogueId, nodeIdA, nodeIdB])

  const { common, onlyA, onlyB } = useMemo(() => {
    const ka = sectionKeysOf(repA)
    const kb = sectionKeysOf(repB)
    const common: string[] = []
    const onlyA: string[] = []
    const onlyB: string[] = []
    for (const k of ka) {
      if (kb.has(k)) common.push(k)
      else onlyA.push(k)
    }
    for (const k of kb) {
      if (!ka.has(k)) onlyB.push(k)
    }
    common.sort()
    onlyA.sort()
    onlyB.sort()
    return { common, onlyA, onlyB }
  }, [repA, repB])

  if (!nodeIdB || nodeIdA === nodeIdB) {
    return (
      <div
        data-testid="context-comparison-idle"
        style={{ fontSize: '0.8rem', color: theme.text.secondary }}
      >
        Choisissez un second nœud différent du premier.
      </div>
    )
  }

  if (loading) {
    return (
      <div data-testid="context-comparison-loading" style={{ fontSize: '0.8rem' }}>
        Chargement…
      </div>
    )
  }

  if (error) {
    return (
      <div
        data-testid="context-comparison-error"
        style={{ fontSize: '0.8rem', color: theme.state.error.color }}
      >
        {error}
      </div>
    )
  }

  return (
    <div data-testid="context-comparison-view" style={{ fontSize: '0.8rem' }}>
      <div style={{ marginBottom: '0.5rem', fontWeight: 600 }}>Sections (clés)</div>
      <div data-testid="context-comparison-common" style={{ marginBottom: '0.35rem' }}>
        <span style={{ color: theme.text.secondary }}>Communes : </span>
        {common.length ? common.join(', ') : '—'}
      </div>
      <div data-testid="context-comparison-only-a" style={{ marginBottom: '0.35rem' }}>
        <span style={{ color: theme.text.secondary }}>Uniquement {nodeIdA.slice(0, 12)}… : </span>
        {onlyA.length ? onlyA.join(', ') : '—'}
      </div>
      <div data-testid="context-comparison-only-b">
        <span style={{ color: theme.text.secondary }}>Uniquement {nodeIdB.slice(0, 12)}… : </span>
        {onlyB.length ? onlyB.join(', ') : '—'}
      </div>
    </div>
  )
}
