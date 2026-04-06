import { describe, expect, it } from 'vitest'
import type { Edge, Node } from 'reactflow'
import {
  summarizeGraphValidationWarnings,
  visibleCycleHighlightNodeIds,
} from '../utils/graphValidationSummary'
import type { ValidationErrorDetail } from '../types/graph'

const emptyGraph = { nodes: [] as Node[], edges: [] as Edge[] }

describe('summarizeGraphValidationWarnings (FR41 cycles)', () => {
  it('compte les cycle_detected visibles après filtre intentionnel', () => {
    const warnings: ValidationErrorDetail[] = [
      {
        type: 'cycle_detected',
        severity: 'warning',
        message: 'c1',
        cycle_id: 'a',
        cycle_nodes: ['n1', 'n2'],
        cycle_path: 'n1 → n2',
      },
      {
        type: 'cycle_detected',
        severity: 'warning',
        message: 'c2',
        cycle_id: 'b',
        cycle_nodes: ['n2', 'n3'],
        cycle_path: 'n2 → n3',
      },
    ]
    const summary = summarizeGraphValidationWarnings(
      emptyGraph.nodes,
      emptyGraph.edges,
      warnings,
      ['a']
    )
    expect(summary.cycleCount).toBe(1)
    expect(summary.visibleWarnings.filter((w) => w.type === 'cycle_detected')).toHaveLength(1)
    expect(summary.visibleWarnings[0]?.cycle_id).toBe('b')
  })

  it('zéro cycle visible : cycleCount à 0 et pas de cycle dans visibleWarnings', () => {
    const warnings: ValidationErrorDetail[] = [
      {
        type: 'cycle_detected',
        severity: 'warning',
        message: 'c1',
        cycle_id: 'x',
        cycle_nodes: ['n1'],
        cycle_path: 'n1',
      },
    ]
    const summary = summarizeGraphValidationWarnings(
      emptyGraph.nodes,
      emptyGraph.edges,
      warnings,
      ['x']
    )
    expect(summary.cycleCount).toBe(0)
    expect(summary.visibleWarnings.some((w) => w.type === 'cycle_detected')).toBe(false)
  })
})

describe('visibleCycleHighlightNodeIds', () => {
  it('exclut les nœuds des cycles marqués intentionnels', () => {
    const errors: ValidationErrorDetail[] = [
      {
        type: 'cycle_detected',
        severity: 'warning',
        message: 'c',
        cycle_id: 'a',
        cycle_nodes: ['n1', 'n2'],
        cycle_path: 'n1 → n2',
      },
    ]
    expect(visibleCycleHighlightNodeIds(errors, ['a'])).toEqual([])
    expect(visibleCycleHighlightNodeIds(errors, [])).toEqual(['n1', 'n2'])
  })
})
