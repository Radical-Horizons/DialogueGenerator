import { describe, it, expect } from 'vitest'
import { pruneGraphValidationDiagnostics } from '../utils/pruneGraphValidationDiagnostics'

describe('pruneGraphValidationDiagnostics (FR40)', () => {
  it('retire les entrées dont node_id pointe vers un nœud supprimé', () => {
    const state = {
      validationErrors: [
        { type: 'orphan_node', node_id: 'gone', message: 'x', severity: 'warning' as const },
        { type: 'orphan_node', node_id: 'keep', message: 'y', severity: 'warning' as const },
        { type: 'missing_start', message: 'z', severity: 'error' as const },
      ],
      highlightedNodeIds: ['gone', 'keep'],
      highlightedCycleNodes: ['gone'],
    }
    const next = pruneGraphValidationDiagnostics(state, new Set(['keep']))
    expect(next.validationErrors).toHaveLength(2)
    expect(next.validationErrors.some((e) => e.node_id === 'gone')).toBe(false)
    expect(next.highlightedNodeIds).toEqual(['keep'])
    expect(next.highlightedCycleNodes).toEqual([])
  })
})
