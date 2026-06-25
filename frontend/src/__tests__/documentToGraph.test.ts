/**
 * Tests projection document → nodes/edges avec IDs stables (ADR-008).
 * Story 16.4 Task 2.1.
 */
import { describe, it, expect } from 'vitest'
import {
  documentToGraph,
  graphToDocument,
  buildLayoutFromNodes,
  type UnityDocument,
  type LayoutPositions,
} from '../utils/documentToGraph'
import { normalizeTestBars } from '../utils/graphNormalizers'
import { postGenerationReactFlowGraph } from '../testFixtures/rawPostGeneration'

describe('documentToGraph', () => {
  describe('stable IDs (choiceId present)', () => {
    it('uses node.id as React Flow node id (SCREAMING_SNAKE_CASE)', () => {
      const doc: UnityDocument = {
        schemaVersion: '1.1.0',
        nodes: [
          { id: 'START', line: 'Hi', nextNode: 'END' },
          { id: 'END', line: '' },
        ],
      }
      const layout: LayoutPositions = { nodes: { START: { x: 0, y: 0 }, END: { x: 0, y: 150 } } }
      const { nodes } = documentToGraph(doc, layout)
      const ids = nodes.filter((n) => n.type !== 'testNode').map((n) => n.id);
      expect(ids).toContain('START')
      expect(ids).toContain('END')
    })

    it('uses choice:choiceId for choice sourceHandle and stable edge id e:nodeId:choice:choiceId', () => {
      const doc: UnityDocument = {
        schemaVersion: '1.1.0',
        nodes: [
          {
            id: 'START',
            line: 'Choose',
            choices: [
              { choiceId: 'accept', text: 'Accept', targetNode: 'END' },
              { choiceId: 'refuse', text: 'Refuse', targetNode: 'END' },
            ],
          },
          { id: 'END', line: '' },
        ],
      }
      const layout: LayoutPositions = { nodes: { START: { x: 0, y: 0 }, END: { x: 0, y: 150 } } }
      const { nodes, edges } = documentToGraph(doc, layout)
      const acceptEdge = edges.find(
        (e) => e.source === 'START' && e.target === 'END' && e.data?.choiceId === 'accept'
      )
      expect(acceptEdge).toBeDefined()
      expect(acceptEdge?.sourceHandle).toBe('choice:accept')
      expect(acceptEdge?.id).toBe('e:START:choice:accept')
      const refuseEdge = edges.find(
        (e) => e.source === 'START' && e.target === 'END' && e.data?.choiceId === 'refuse'
      )
      expect(refuseEdge?.sourceHandle).toBe('choice:refuse')
      expect(refuseEdge?.id).toBe('e:START:choice:refuse')
      expect(nodes.some((n) => n.type === 'testNode')).toBe(false)
    })

    it('keeps stable choice edge id when the choice target changes (ADR-008)', () => {
      const docV1: UnityDocument = {
        schemaVersion: '1.1.0',
        nodes: [
          {
            id: 'START',
            line: 'Choose',
            choices: [{ choiceId: 'accept', text: 'Accept', targetNode: 'END' }],
          },
          { id: 'END', line: '' },
          { id: 'ALT', line: '' },
        ],
      }
      const docV2: UnityDocument = {
        schemaVersion: '1.1.0',
        nodes: [
          {
            id: 'START',
            line: 'Choose',
            choices: [{ choiceId: 'accept', text: 'Accept', targetNode: 'ALT' }],
          },
          { id: 'END', line: '' },
          { id: 'ALT', line: '' },
        ],
      }
      const layout: LayoutPositions = {
        nodes: { START: { x: 0, y: 0 }, END: { x: 0, y: 150 }, ALT: { x: 0, y: 300 } },
      }
      const g1 = documentToGraph(docV1, layout)
      const g2 = documentToGraph(docV2, layout)
      const e1 = g1.edges.find((e) => e.source === 'START' && e.sourceHandle === 'choice:accept')
      const e2 = g2.edges.find((e) => e.source === 'START' && e.sourceHandle === 'choice:accept')
      expect(e1).toBeDefined()
      expect(e2).toBeDefined()
      expect(e1?.id).toBe(e2?.id)
    })

    it('projects 4 and 8 choices with unique stable handles/edge ids (fixtures comfort/stress)', () => {
      const mkDoc = (choiceCount: number): UnityDocument => ({
        schemaVersion: '1.1.0',
        nodes: [
          {
            id: 'START',
            line: 'Choose',
            choices: Array.from({ length: choiceCount }, (_, i) => ({
              choiceId: `c${i + 1}`,
              text: `Choice ${i + 1}`,
              targetNode: 'END',
            })),
          },
          { id: 'END', line: '' },
        ],
      })
      const layout: LayoutPositions = { nodes: { START: { x: 0, y: 0 }, END: { x: 0, y: 150 } } }

      for (const n of [4, 8]) {
        const { edges } = documentToGraph(mkDoc(n), layout)
        const choiceEdges = edges.filter((e) => e.source === 'START' && e.target === 'END')
        expect(choiceEdges).toHaveLength(n)
        const handles = choiceEdges.map((e) => e.sourceHandle)
        const ids = choiceEdges.map((e) => e.id)
        expect(new Set(handles).size).toBe(n)
        expect(new Set(ids).size).toBe(n)
        expect(handles.every((h) => typeof h === 'string' && h.startsWith('choice:c'))).toBe(true)
        expect(ids.every((id) => /^e:START:choice:c\d+$/.test(id))).toBe(true)
      }
    })

    it('uses legacy test node id (test-node-X-choice-Y) and e:nodeId:choice:choiceId:test for choice→test edge', () => {
      const doc: UnityDocument = {
        schemaVersion: '1.1.0',
        nodes: [
          {
            id: 'NODE_A',
            line: 'Test choice',
            choices: [
              {
                choiceId: 'skill_check',
                text: 'Try',
                test: { formula: '1d20' },
                testSuccessNode: 'END',
                testFailureNode: 'END',
              },
            ],
          },
          { id: 'END', line: '' },
        ],
      }
      const layout: LayoutPositions = { nodes: { NODE_A: { x: 0, y: 0 }, END: { x: 0, y: 150 } } }
      const { nodes, edges } = documentToGraph(doc, layout)
      const testNode = nodes.find((n) => n.type === 'testNode')
      expect(testNode?.id).toBe('test-node-NODE_A-choice-0')
      const choiceToTest = edges.find(
        (e) => e.source === 'NODE_A' && e.target === 'test-node-NODE_A-choice-0'
      )
      expect(choiceToTest?.id).toBe('e:NODE_A:choice:skill_check:test')
      expect(choiceToTest?.sourceHandle).toBe('choice:skill_check')
    })
  })

  describe('fallback when choiceId missing', () => {
    it('uses __idx_N for handle and edge id when choice has no choiceId', () => {
      const doc: UnityDocument = {
        schemaVersion: '1.1.0',
        nodes: [
          {
            id: 'START',
            line: 'Choose',
            choices: [
              { text: 'First', targetNode: 'END' },
              { text: 'Second', targetNode: 'END' },
            ],
          },
          { id: 'END', line: '' },
        ],
      }
      const layout: LayoutPositions = { nodes: { START: { x: 0, y: 0 }, END: { x: 0, y: 150 } } }
      const { edges } = documentToGraph(doc, layout)
      const firstEdge = edges.find(
        (e) => e.source === 'START' && e.target === 'END' && e.data?.choiceIndex === 0
      )
      expect(firstEdge?.sourceHandle).toBe('choice:__idx_0')
      expect(firstEdge?.id).toBe('e:START:choice:__idx_0')
      const secondEdge = edges.find(
        (e) => e.source === 'START' && e.target === 'END' && e.data?.choiceIndex === 1
      )
      expect(secondEdge?.sourceHandle).toBe('choice:__idx_1')
      expect(secondEdge?.id).toBe('e:START:choice:__idx_1')
    })
  })

  describe('positions from layout', () => {
    it('applies layout node positions when provided', () => {
      const doc: UnityDocument = {
        schemaVersion: '1.1.0',
        nodes: [
          { id: 'START', line: 'Hi', nextNode: 'END' },
          { id: 'END', line: '' },
        ],
      }
      const layout: LayoutPositions = {
        nodes: { START: { x: 100, y: 200 }, END: { x: 100, y: 350 } },
      }
      const { nodes } = documentToGraph(doc, layout)
      const start = nodes.find((n) => n.id === 'START')
      const end = nodes.find((n) => n.id === 'END')
      expect(start?.position).toEqual({ x: 100, y: 200 })
      expect(end?.position).toEqual({ x: 100, y: 350 })
    })

    it('applies layout position for test node (legacy id; fallback from test:choiceId for old layouts)', () => {
      const doc: UnityDocument = {
        schemaVersion: '1.1.0',
        nodes: [
          {
            id: 'N',
            line: 'Test',
            choices: [
              {
                choiceId: 'skill',
                text: 'Try',
                test: { formula: '1d20' },
                testSuccessNode: 'END',
              },
            ],
          },
          { id: 'END', line: '' },
        ],
      }
      const layout: LayoutPositions = {
        nodes: { N: { x: 0, y: 0 }, END: { x: 0, y: 150 }, 'test:skill': { x: 400, y: 100 } },
      }
      const { nodes } = documentToGraph(doc, layout)
      const testNode = nodes.find((n) => n.type === 'testNode')
      expect(testNode?.id).toBe('test-node-N-choice-0')
      expect(testNode?.position).toEqual({ x: 400, y: 100 })
    })

    it('applies layout position for test node (legacy id test-node-...-choice-N)', () => {
      const doc: UnityDocument = {
        schemaVersion: '1.1.0',
        nodes: [
          {
            id: 'N',
            line: 'Test',
            choices: [
              { text: 'Try', test: { formula: '1d20' }, testSuccessNode: 'END' },
            ],
          },
          { id: 'END', line: '' },
        ],
      }
      const layout: LayoutPositions = {
        nodes: { N: { x: 0, y: 0 }, END: { x: 0, y: 150 }, 'test-node-N-choice-0': { x: 350, y: 80 } },
      }
      const { nodes } = documentToGraph(doc, layout)
      const testNode = nodes.find((n) => n.type === 'testNode')
      expect(testNode?.id).toBe('test-node-N-choice-0')
      expect(testNode?.position).toEqual({ x: 350, y: 80 })
    })
  })

  describe('invariants (regression: no duplicate edges, single dialogue→test)', () => {
    it('produces no duplicate edges by (source, sourceHandle, target)', () => {
      const doc: UnityDocument = {
        schemaVersion: '1.1.0',
        nodes: [
          {
            id: 'START',
            line: 'Choose',
            choices: [
              { choiceId: 'a', text: 'A', targetNode: 'END' },
              { choiceId: 'b', text: 'B', test: { formula: '1d20' }, testSuccessNode: 'END' },
            ],
          },
          { id: 'END', line: '' },
        ],
      }
      const layout: LayoutPositions = { nodes: { START: { x: 0, y: 0 }, END: { x: 0, y: 150 } } }
      const { edges } = documentToGraph(doc, layout)
      const key = (e: { source: string; sourceHandle?: string | null; target: string }) =>
        `${e.source}|${e.sourceHandle ?? ''}|${e.target}`
      const seen = new Set<string>()
      for (const e of edges) {
        const k = key(e)
        expect(seen.has(k)).toBe(false)
        seen.add(k)
      }
    })

    it('creates TestNode when choice has test even without test*Node (attribute tests / formula only)', () => {
      const doc: UnityDocument = {
        schemaVersion: '1.1.0',
        nodes: [
          {
            id: 'START',
            line: 'Choose',
            choices: [
              { choiceId: 'a', text: 'A', test: 'Skill:8' },
              { choiceId: 'b', text: 'B', targetNode: 'END' },
            ],
          },
          { id: 'END', line: '' },
        ],
      }
      const layout: LayoutPositions = { nodes: { START: { x: 0, y: 0 }, END: { x: 0, y: 150 } } }
      const { nodes } = documentToGraph(doc, layout)
      const testNodes = nodes.filter((n) => n.type === 'testNode')
      expect(testNodes).toHaveLength(1)
      expect(testNodes[0].id).toBe('test-node-START-choice-0')
    })

    it('produces exactly one dialogue→test edge per choice with test (canonical id e:...:choice:...:test)', () => {
      const doc: UnityDocument = {
        schemaVersion: '1.1.0',
        nodes: [
          {
            id: 'N',
            line: 'Test',
            choices: [
              { choiceId: 'c1', text: 'T1', test: { formula: '1d20' }, testSuccessNode: 'END' },
            ],
          },
          { id: 'END', line: '' },
        ],
      }
      const layout: LayoutPositions = { nodes: { N: { x: 0, y: 0 }, END: { x: 0, y: 150 } } }
      const { edges } = documentToGraph(doc, layout)
      const dialogueToTest = edges.filter(
        (e) => e.source === 'N' && e.target === 'test-node-N-choice-0'
      )
      expect(dialogueToTest).toHaveLength(1)
      expect(dialogueToTest[0].id).toBe('e:N:choice:c1:test')
    })

    it('treats node with root-level test as dialogueNode so START is not skipped (validation finds start)', () => {
      const doc: UnityDocument = {
        schemaVersion: '1.1.0',
        nodes: [
          {
            id: 'START',
            speaker: 'NPC',
            line: 'Line',
            test: 'Raison+Duperie:12',
            choices: [{ choiceId: 'c0', text: 'Choice', targetNode: 'END' }],
          },
          { id: 'END', line: '' },
        ],
      }
      const layout: LayoutPositions = { nodes: { START: { x: 0, y: 0 }, END: { x: 0, y: 150 } } }
      const { nodes } = documentToGraph(doc, layout)
      const startNode = nodes.find((n) => n.id === 'START')
      expect(startNode).toBeDefined()
      expect(startNode?.type).toBe('dialogueNode')
    })
  })
})

describe('graphToDocument', () => {
  it('persists title from node.data (schema v1.2.0)', () => {
    const nodes = [
      {
        id: 'node-abc123',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { id: 'node-abc123', title: 'Ouverture', speaker: 'PNJ', line: 'Hi', choices: [] },
      },
    ]
    const edges: never[] = []
    const doc = graphToDocument(nodes as never, edges)
    expect(doc.nodes).toHaveLength(1)
    expect((doc.nodes[0] as { title?: string }).title).toBe('Ouverture')
  })

  it('prefers edgeType nextNode over legacy Suivant when both edges exist', () => {
    const nodes = [
      {
        id: 'START',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { id: 'START', speaker: 'A', line: 'L', choices: [], nextNode: 'MID' },
      },
      {
        id: 'MID',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { id: 'MID', speaker: 'M', line: 'M', choices: [] },
      },
      {
        id: 'END',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { id: 'END', speaker: 'B', line: 'E', choices: [] },
      },
    ]
    const edges = [
      {
        id: 'START->MID',
        source: 'START',
        target: 'MID',
        type: 'smoothstep',
        label: 'Suivant',
      },
      {
        id: 'START->END',
        source: 'START',
        target: 'END',
        type: 'smoothstep',
        data: { edgeType: 'nextNode' },
      },
    ]
    const doc = graphToDocument(nodes as never, edges as never)
    const start = doc.nodes.find((n) => n.id === 'START')
    expect((start as { nextNode?: string } | undefined)?.nextNode).toBe('END')
  })

  it('tie-breaks plusieurs arêtes Suivant (sans edgeType) via node.data.nextNode', () => {
    const nodes = [
      {
        id: 'START',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { id: 'START', speaker: 'A', line: 'L', choices: [], nextNode: 'END' },
      },
      {
        id: 'MID',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { id: 'MID', speaker: 'M', line: 'M', choices: [] },
      },
      {
        id: 'END',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { id: 'END', speaker: 'B', line: 'E', choices: [] },
      },
    ]
    // Ordre volontairement « MID en dernier » : sans tie-break, nextFromSuivant = MID.
    const edges = [
      {
        id: 'START->END',
        source: 'START',
        target: 'END',
        type: 'smoothstep',
        label: 'Suivant',
      },
      {
        id: 'START->MID',
        source: 'START',
        target: 'MID',
        type: 'smoothstep',
        label: 'Suivant',
      },
    ]
    const doc = graphToDocument(nodes as never, edges as never)
    const start = doc.nodes.find((n) => n.id === 'START')
    expect((start as { nextNode?: string } | undefined)?.nextNode).toBe('END')
  })

  it('maps nextNode from edge.data.edgeType nextNode (connectNodes sans label Suivant)', () => {
    const nodes = [
      {
        id: 'START',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { id: 'START', speaker: 'A', line: 'L', choices: [], nextNode: 'MID' },
      },
      {
        id: 'END',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { id: 'END', speaker: 'B', line: 'E', choices: [] },
      },
    ]
    const edges = [
      {
        id: 'START->END',
        source: 'START',
        target: 'END',
        type: 'smoothstep',
        data: { edgeType: 'nextNode' },
      },
    ]
    const doc = graphToDocument(nodes as never, edges as never)
    const start = doc.nodes.find((n) => n.id === 'START')
    expect((start as { nextNode?: string } | undefined)?.nextNode).toBe('END')
  })

  it('reconstructs document with choiceId from stable sourceHandle', () => {
    const doc: UnityDocument = {
      schemaVersion: '1.1.0',
      nodes: [
        {
          id: 'START',
          line: 'Choose',
          choices: [
            { choiceId: 'yes', text: 'Yes', targetNode: 'END' },
            { choiceId: 'no', text: 'No', targetNode: 'END' },
          ],
        },
        { id: 'END', line: '' },
      ],
    }
    const layout: LayoutPositions = { nodes: { START: { x: 0, y: 0 }, END: { x: 0, y: 150 } } }
    const { nodes, edges } = documentToGraph(doc, layout)
    const roundTrip = graphToDocument(nodes, edges)
    expect(roundTrip.nodes).toHaveLength(2)
    const start = roundTrip.nodes.find((n) => n.id === 'START')
    expect(start?.choices).toHaveLength(2)
    expect(start?.choices?.[0].choiceId).toBe('yes')
    expect(start?.choices?.[0].targetNode).toBe('END')
    expect(start?.choices?.[1].choiceId).toBe('no')
    expect(start?.choices?.[1].targetNode).toBe('END')
  })

  it('persists test*Node from test-node edges so round-trip preserves TestNode result links', () => {
    const nodes = [
      {
        id: 'START',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'START',
          choices: [
            {
              choiceId: '__idx_0',
              text: 'Try',
              test: 'Dex:10',
              testCriticalFailureNode: 'NODE_CF',
              testFailureNode: 'NODE_F',
              testSuccessNode: 'NODE_S',
              testCriticalSuccessNode: 'NODE_CS',
            },
          ],
        },
      },
      { id: 'NODE_CF', type: 'dialogueNode', position: { x: 0, y: 0 }, data: {} },
      { id: 'NODE_F', type: 'dialogueNode', position: { x: 0, y: 0 }, data: {} },
      { id: 'NODE_S', type: 'dialogueNode', position: { x: 0, y: 0 }, data: {} },
      { id: 'NODE_CS', type: 'dialogueNode', position: { x: 0, y: 0 }, data: {} },
    ]
    const edges = [
      { id: 'e:START:choice:__idx_0:test', source: 'START', target: 'test-node-START-choice-0', sourceHandle: 'choice:__idx_0', type: 'smoothstep' },
      { id: 'tn-cf', source: 'test-node-START-choice-0', target: 'NODE_CF', sourceHandle: 'critical-failure', type: 'smoothstep' },
      { id: 'tn-f', source: 'test-node-START-choice-0', target: 'NODE_F', sourceHandle: 'failure', type: 'smoothstep' },
      { id: 'tn-s', source: 'test-node-START-choice-0', target: 'NODE_S', sourceHandle: 'success', type: 'smoothstep' },
      { id: 'tn-cs', source: 'test-node-START-choice-0', target: 'NODE_CS', sourceHandle: 'critical-success', type: 'smoothstep' },
    ]
    const doc = graphToDocument(nodes as never, edges as never)
    const start = doc.nodes.find((n) => n.id === 'START')
    expect(start?.choices).toHaveLength(1)
    expect((start?.choices?.[0] as { testCriticalFailureNode?: string }).testCriticalFailureNode).toBe('NODE_CF')
    expect((start?.choices?.[0] as { testFailureNode?: string }).testFailureNode).toBe('NODE_F')
    expect((start?.choices?.[0] as { testSuccessNode?: string }).testSuccessNode).toBe('NODE_S')
    expect((start?.choices?.[0] as { testCriticalSuccessNode?: string }).testCriticalSuccessNode).toBe('NODE_CS')
    const { edges: roundTripEdges } = documentToGraph(doc as never, undefined)
    expect(roundTripEdges.some((e) => e.source === 'test-node-START-choice-0' && e.target === 'NODE_CF')).toBe(true)
    expect(roundTripEdges.some((e) => e.source === 'test-node-START-choice-0' && e.target === 'NODE_CS')).toBe(true)
  })

  it('omits choice.test when cleared from store (TestNode deleted)', () => {
    const nodes = [
      {
        id: 'START',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'START',
          choices: [
            { choiceId: 'a', text: 'A' },
            { choiceId: 'b', text: 'B', test: 'Stat:6' },
          ],
        },
      },
    ]
    const edges = [
      {
        id: 'e:START:choice:b:test',
        source: 'START',
        target: 'test:b',
        sourceHandle: 'choice:b',
        type: 'smoothstep',
      },
    ]
    const roundTrip = graphToDocument(nodes as never, edges as never)
    const start = roundTrip.nodes.find((n) => n.id === 'START')
    expect(start?.choices).toHaveLength(2)
    expect((start?.choices?.[0] as { test?: unknown }).test).toBeUndefined()
    expect((start?.choices?.[1] as { test?: unknown }).test).toBe('Stat:6')
  })

  it('post-generation without TestNodes: normalizeTestBars then round-trip keeps TestNodes', () => {
    const { nodes, edges } = postGenerationReactFlowGraph()
    expect(nodes.filter((n) => n.type === 'testNode')).toHaveLength(0)

    const normalized = normalizeTestBars(nodes, edges)
    expect(normalized.nodes.filter((n) => n.type === 'testNode')).toHaveLength(1)
    expect(
      normalized.edges.some(
        (e) => e.source === 'START' && e.target === 'test-node-START-choice-0'
      )
    ).toBe(true)

    const doc = graphToDocument(normalized.nodes, normalized.edges)
    const start = doc.nodes.find((n) => n.id === 'START')
    expect((start?.choices?.[0] as { test?: string }).test).toBe('Volonté+Adaptabilité:12')

    const { nodes: reloadedNodes, edges: reloadedEdges } = documentToGraph(doc, undefined)
    const renormalized = normalizeTestBars(reloadedNodes, reloadedEdges)
    expect(renormalized.nodes.filter((n) => n.type === 'testNode')).toHaveLength(1)
  })

  it('omits empty visibilityConditions blocks from nodes and choices', () => {
    const doc = graphToDocument(
      [
        {
          id: 'START',
          type: 'dialogueNode',
          position: { x: 0, y: 0 },
          data: {
            id: 'START',
            line: 'Hello',
            visibilityConditions: { items: [] },
            choices: [
              {
                choiceId: 'go',
                text: 'Go',
                targetNode: 'END',
                visibilityConditions: { items: [] },
              },
            ],
          },
        },
      ] as never,
      [] as never,
    )
    const start = doc.nodes.find((n) => n.id === 'START') as Record<string, unknown>
    expect(start.visibilityConditions).toBeUndefined()
    expect((start.choices as Record<string, unknown>[])[0].visibilityConditions).toBeUndefined()
  })
})

describe('buildLayoutFromNodes', () => {
  it('extracts positions by node id', () => {
    const nodes = [
      { id: 'START', type: 'dialogueNode', position: { x: 10, y: 20 }, data: {} },
      { id: 'END', type: 'endNode', position: { x: 10, y: 170 }, data: {} },
    ]
    const layout = buildLayoutFromNodes(nodes as never)
    expect(layout.nodes).toEqual({ START: { x: 10, y: 20 }, END: { x: 10, y: 170 } })
  })
})
