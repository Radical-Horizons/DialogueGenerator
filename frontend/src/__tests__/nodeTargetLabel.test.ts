import { describe, it, expect } from 'vitest'
import type { Node } from 'reactflow'
import {
  formatTargetOptionLabel,
  deriveAutoDisplayName,
  nodeHasStructuralDisplayName,
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

describe('nodeHasStructuralDisplayName', () => {
  it('accepte displayName, title ou label', () => {
    expect(nodeHasStructuralDisplayName({ displayName: 'A' })).toBe(true)
    expect(nodeHasStructuralDisplayName({ title: 'T' })).toBe(true)
    expect(nodeHasStructuralDisplayName({ label: 'L' })).toBe(true)
    expect(nodeHasStructuralDisplayName({ line: 'only line' })).toBe(false)
  })
})

describe('deriveAutoDisplayName', () => {
  it('propose première ligne de line ou id', () => {
    expect(deriveAutoDisplayName(n('n1', { line: 'Bonjour\nsuite' }))).toBe('Bonjour')
    expect(deriveAutoDisplayName(n('fallback-id', {}))).toBe('fallback-id')
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
