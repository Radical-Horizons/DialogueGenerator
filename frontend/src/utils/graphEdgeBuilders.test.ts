/**
 * Tests unitaires pour graphEdgeBuilders
 */
import { describe, it, expect } from 'vitest'
import {
  CHOICE_LABEL_MAX_LENGTH,
  TEST_RESULT_EDGE_CONFIG,
  CHOICE_EDGE_COLOR,
  NEXT_EDGE_COLOR,
  truncateChoiceLabel,
  choiceEdgeId,
  choiceToTestEdgeId,
  buildChoiceEdge,
  buildTestResultEdge,
  edgeStrokeFromSourceHandle,
  edgeStrokeFromSource,
} from './graphEdgeBuilders'

describe('truncateChoiceLabel', () => {
  it('should return fallback "Choix N" when choiceText is undefined', () => {
    expect(truncateChoiceLabel(undefined, 0)).toBe('Choix 1')
    expect(truncateChoiceLabel(undefined, 2)).toBe('Choix 3')
  })

  it('should return choiceText as-is when shorter than max length', () => {
    const short = 'Court texte'
    expect(truncateChoiceLabel(short, 0)).toBe(short)
    expect(truncateChoiceLabel('A', 0)).toBe('A')
  })

  it('should truncate to 30 chars + "..." when longer than max length', () => {
    const long = 'A'.repeat(40)
    expect(truncateChoiceLabel(long, 0)).toBe('A'.repeat(30) + '...')
    expect(truncateChoiceLabel(long, 0).length).toBe(33)
  })

  it('should use CHOICE_LABEL_MAX_LENGTH for truncation', () => {
    const exactly31 = 'B'.repeat(31)
    expect(truncateChoiceLabel(exactly31, 0)).toBe('B'.repeat(30) + '...')
  })
})

describe('choiceEdgeId', () => {
  it('should return canonical id for choice → target', () => {
    expect(choiceEdgeId('node-1', 0, 'node-2')).toBe('node-1-choice0->node-2')
    expect(choiceEdgeId('dialogue-1', 2, 'manual-xyz')).toBe(
      'dialogue-1-choice2->manual-xyz'
    )
  })
})

describe('choiceToTestEdgeId', () => {
  it('should return canonical id for choice → TestNode', () => {
    expect(choiceToTestEdgeId('node-1', 0)).toBe('node-1-choice-0-to-test')
    expect(choiceToTestEdgeId('dialogue-1', 2)).toBe('dialogue-1-choice-2-to-test')
  })
})

describe('buildChoiceEdge', () => {
  it('should build edge with label, sourceHandle (stable id ADR-008), type smoothstep', () => {
    const edge = buildChoiceEdge({
      sourceId: 'src',
      targetId: 'tgt',
      choiceIndex: 0,
      choiceText: 'Mon choix',
    })
    expect(edge.id).toBe('e:src:choice:__idx_0')
    expect(edge.source).toBe('src')
    expect(edge.target).toBe('tgt')
    expect(edge.sourceHandle).toBe('choice:__idx_0')
    expect(edge.type).toBe('smoothstep')
    expect(edge.label).toBe('Mon choix')
    expect(edge.style).toEqual({ stroke: CHOICE_EDGE_COLOR })
    expect(edge.data).toEqual({ edgeType: 'choice', choiceIndex: 0 })
  })

  it('should use choice:choiceId and stable edge id when choiceId provided', () => {
    const edge = buildChoiceEdge({
      sourceId: 'NODE_A',
      targetId: 'NODE_B',
      choiceIndex: 0,
      choiceText: 'Ok',
      choiceId: 'accept',
    })
    expect(edge.sourceHandle).toBe('choice:accept')
    expect(edge.id).toBe('e:NODE_A:choice:accept')
    expect(edge.data).toMatchObject({ choiceId: 'accept' })
  })

  it('should use custom edgeId when provided', () => {
    const edge = buildChoiceEdge({
      sourceId: 'src',
      targetId: 'test-node-src-choice-0',
      choiceIndex: 0,
      edgeId: 'src-choice-0-to-test',
    })
    expect(edge.id).toBe('src-choice-0-to-test')
    expect(edge.label).toBe('Choix 1')
  })

  it('should truncate long choice text in label', () => {
    const edge = buildChoiceEdge({
      sourceId: 'src',
      targetId: 'tgt',
      choiceIndex: 0,
      choiceText: 'A'.repeat(50),
    })
    expect(edge.label).toBe('A'.repeat(CHOICE_LABEL_MAX_LENGTH) + '...')
  })
})

describe('buildTestResultEdge', () => {
  it('should build edge with id, sourceHandle, label, style', () => {
    const edge = buildTestResultEdge(
      'test-node-1',
      'node-success',
      'success',
      'Réussite',
      '#27AE60'
    )
    expect(edge.id).toBe('test-node-1-success-node-success')
    expect(edge.source).toBe('test-node-1')
    expect(edge.target).toBe('node-success')
    expect(edge.sourceHandle).toBe('success')
    expect(edge.type).toBe('smoothstep')
    expect(edge.label).toBe('Réussite')
    expect(edge.style).toEqual({ stroke: '#27AE60' })
  })
})

describe('edgeStrokeFromSourceHandle', () => {
  it('maps choice and test handles to expected colors', () => {
    expect(edgeStrokeFromSourceHandle('choice:accept')).toBe(CHOICE_EDGE_COLOR)
    expect(edgeStrokeFromSourceHandle('success')).toBe('#27AE60')
    expect(edgeStrokeFromSourceHandle('critical-success')).toBe('#0088FF')
    expect(edgeStrokeFromSourceHandle(undefined)).toBeUndefined()
  })
})

describe('edgeStrokeFromSource', () => {
  it('maps nextNode/suivant to next handle color', () => {
    expect(edgeStrokeFromSource({ connectionType: 'nextNode' })).toBe(NEXT_EDGE_COLOR)
    expect(edgeStrokeFromSource({ edgeLabel: 'Suivant' })).toBe(NEXT_EDGE_COLOR)
  })
})

describe('TEST_RESULT_EDGE_CONFIG', () => {
  it('should have 4 result entries with field, handleId, label, color', () => {
    expect(TEST_RESULT_EDGE_CONFIG).toHaveLength(4)
    const fields = TEST_RESULT_EDGE_CONFIG.map((r) => r.field)
    expect(fields).toEqual([
      'testCriticalFailureNode',
      'testFailureNode',
      'testSuccessNode',
      'testCriticalSuccessNode',
    ])
    TEST_RESULT_EDGE_CONFIG.forEach((r) => {
      expect(r.handleId).toBeDefined()
      expect(r.label).toBeDefined()
      expect(r.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
    })
  })
})
