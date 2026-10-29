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
  EDGE_NEUTRAL_COLOR,
  EDGE_STROKE_WIDTH,
  canvasEdgeStroke,
  toRestingCanvasEdge,
  highlightSelectedOutgoingEdges,
} from './graphEdgeBuilders'
import type { Edge } from 'reactflow'
import { theme } from '../theme'
import { redesignAccent, redesignGraphEdge } from '../theme/redesignTokens'

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
    expect(edge.data).toEqual({
      edgeType: 'choice',
      choiceIndex: 0,
      choiceText: 'Mon choix',
    })
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

  it('le lien « suivant » est neutre : le bleu reste réservé à la sélection', () => {
    expect(NEXT_EDGE_COLOR).toBe(redesignGraphEdge.neutral)
    expect(NEXT_EDGE_COLOR).not.toBe(redesignAccent.base)
  })

  it('choix et suite partagent le même trait neutre (maquette 2e)', () => {
    expect(CHOICE_EDGE_COLOR).toBe(EDGE_NEUTRAL_COLOR)
    expect(NEXT_EDGE_COLOR).toBe(EDGE_NEUTRAL_COLOR)
    expect(EDGE_NEUTRAL_COLOR).toBe(redesignGraphEdge.neutral)
    expect(EDGE_STROKE_WIDTH).toBe(1.5)
  })
})

describe('trait des liens du canvas (écran 2e)', () => {
  const choiceEdge: Edge = {
    id: 'e:p:choice:a',
    source: 'p',
    target: 'c',
    sourceHandle: 'choice:a',
    style: { stroke: CHOICE_EDGE_COLOR },
  }
  const nextEdge: Edge = { id: 'p-next-n', source: 'p', target: 'n', data: { edgeType: 'nextNode' } }
  const otherEdge: Edge = { id: 'q-next-r', source: 'q', target: 'r' }
  const successEdge: Edge = {
    id: 'test-p-success-s',
    source: 'test-p',
    target: 's',
    sourceHandle: 'success',
  }

  it('au repos : choix et suite neutres à 1,5 px, issue de test dans sa couleur', () => {
    for (const edge of [choiceEdge, nextEdge, otherEdge]) {
      expect(toRestingCanvasEdge(edge, false).style).toMatchObject({
        stroke: EDGE_NEUTRAL_COLOR,
        strokeWidth: EDGE_STROKE_WIDTH,
      })
    }
    expect(toRestingCanvasEdge(successEdge, false).style).toMatchObject({
      stroke: TEST_RESULT_EDGE_CONFIG[2].color,
      strokeWidth: EDGE_STROKE_WIDTH,
    })
  })

  it('cible cassée : pointillés d’erreur conservés', () => {
    const broken = toRestingCanvasEdge(choiceEdge, true)
    expect(broken.style).toMatchObject({
      stroke: theme.state.error.border,
      strokeDasharray: '8,4',
      opacity: 0.5,
    })
    expect(broken.animated).toBe(false)
  })

  it('sélection : seuls les liens sortants du nœud sélectionné passent à l’accent', () => {
    const resting = [choiceEdge, nextEdge, otherEdge].map((e) => toRestingCanvasEdge(e, false))
    const highlighted = highlightSelectedOutgoingEdges(resting, 'p', new Set())
    expect(highlighted[0].style?.stroke).toBe(redesignAccent.base)
    expect(highlighted[1].style?.stroke).toBe(redesignAccent.base)
    expect(highlighted[0].style?.strokeWidth).toBe(EDGE_STROKE_WIDTH)
    expect(highlighted[2]).toBe(resting[2])
  })

  it('désélection : les liens retrouvent le neutre, sans nouvel objet', () => {
    const resting = [choiceEdge, nextEdge].map((e) => toRestingCanvasEdge(e, false))
    expect(highlightSelectedOutgoingEdges(resting, null, new Set())).toBe(resting)
    expect(resting.every((e) => e.style?.stroke === EDGE_NEUTRAL_COLOR)).toBe(true)
  })

  it('issue de test : garde sa couleur même quand le TestNode est sélectionné', () => {
    expect(canvasEdgeStroke(successEdge, 'test-p')).toBe(TEST_RESULT_EDGE_CONFIG[2].color)
    const resting = [toRestingCanvasEdge(successEdge, false)]
    expect(highlightSelectedOutgoingEdges(resting, 'test-p', new Set())[0]).toBe(resting[0])
  })

  it('cible cassée : la sélection ne recolore pas le pointillé d’erreur', () => {
    const resting = [toRestingCanvasEdge(choiceEdge, true)]
    const highlighted = highlightSelectedOutgoingEdges(resting, 'p', new Set(['c']))
    expect(highlighted[0].style?.stroke).toBe(theme.state.error.border)
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
