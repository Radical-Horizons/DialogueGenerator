import { describe, it, expect } from 'vitest'
import type { Node } from 'reactflow'
import {
  formatTargetOptionLabel,
  nodeTargetDisplayLabel,
} from '../utils/nodeTargetLabel'

function n(id: string, data: Record<string, unknown> = {}): Pick<Node, 'id' | 'data'> {
  return { id, data }
}

describe('nodeTargetDisplayLabel', () => {
  it('priorise title, puis displayName, puis première ligne de line, puis id', () => {
    expect(nodeTargetDisplayLabel(n('a', { title: 'T', displayName: 'D', line: 'L' }))).toBe('T')
    expect(nodeTargetDisplayLabel(n('a', { displayName: 'D', line: 'L1\nL2' }))).toBe('D')
    expect(nodeTargetDisplayLabel(n('a', { line: 'First\nSecond' }))).toBe('First')
    expect(nodeTargetDisplayLabel(n('only-id', {}))).toBe('only-id')
  })

  it('ignore title / displayName vides après trim', () => {
    expect(nodeTargetDisplayLabel(n('x', { title: '   ', displayName: 'Ok' }))).toBe('Ok')
  })
})

describe('formatTargetOptionLabel', () => {
  it('whenDistinct: pas de suffixe si le libellé est déjà l’id', () => {
    expect(formatTargetOptionLabel(n('same', {}), { showId: 'whenDistinct' })).toBe('same')
  })

  it('whenDistinct: suffixe id si libellé distinct', () => {
    expect(formatTargetOptionLabel(n('id1', { title: 'Visible' }), { showId: 'whenDistinct' })).toBe(
      'Visible (id1)'
    )
  })

  it('always: conserve id seul si base === id', () => {
    expect(formatTargetOptionLabel(n('solo', {}), { showId: 'always' })).toBe('solo')
  })

  it('always: affiche base (id) si distinct', () => {
    expect(formatTargetOptionLabel(n('nid', { line: 'Hi' }), { showId: 'always' })).toBe('Hi (nid)')
  })
})
