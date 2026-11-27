/**
 * Story 20.2 : drapeau, palier, disposition gauche → droite et positions séparées du prototype.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Node } from 'reactflow'
import fixture from '../../../e2e/fixtures/perf-graph-500.json'
import * as documentsAPI from '../api/documents'
import { useGraphStore } from '../store/graphStore'
import { useGraphViewStore } from '../store/graphViewStore'
import { TEXT_CARDS_STORAGE_KEY, useUiLayoutStore } from '../store/uiLayoutStore'
import { documentToGraph, graphToDocument, type UnityDocument } from '../utils/documentToGraph'
import { toPersistedLayout, toTextCardsWorkingLayout } from '../utils/syncDocLayout'
import {
  calculateTextCardLayout,
  estimateTextCardHeight,
  TEXT_CARD_WIDTH,
  toTextCardEdges,
} from '../utils/textCardLayout'

vi.mock('../api/documents', () => ({
  getDocument: vi.fn(),
  getLayout: vi.fn(),
  putDocument: vi.fn(),
  putLayout: vi.fn(),
  putDocumentKeepalive: vi.fn(),
  putLayoutKeepalive: vi.fn(),
}))

vi.mock('../utils/graphJournal', () => ({
  setPending: vi.fn().mockResolvedValue(undefined),
  acknowledgeSnapshot: vi.fn().mockResolvedValue(undefined),
}))

const document = {
  schemaVersion: '1.1.0',
  nodes: [
    {
      id: 'START',
      speaker: 'PNJ',
      line: 'Bonjour',
      choices: [
        {
          choiceId: 'c0',
          text: 'Tester',
          test: 'Raison+Artisanat:12',
          testFailureNode: 'node-a',
          testSuccessNode: 'node-b',
        },
        { choiceId: 'c1', text: 'Partir', targetNode: 'node-c' },
      ],
    },
    { id: 'node-a', speaker: 'PNJ', line: 'Raté', nextNode: 'END' },
    { id: 'node-b', speaker: 'PNJ', line: 'Réussi', nextNode: 'END' },
    { id: 'node-c', speaker: 'PNJ', line: 'Adieu', nextNode: 'END' },
  ],
}

const topToBottom = {
  START: { x: 0, y: 0 },
  'node-a': { x: -300, y: 400 },
  'node-b': { x: 0, y: 400 },
  'node-c': { x: 300, y: 400 },
}

const positionsOf = (nodes: Node[]) =>
  Object.fromEntries(nodes.filter((n) => n.type === 'dialogueNode').map((n) => [n.id, n.position]))

function serve(layout: Record<string, unknown>) {
  vi.mocked(documentsAPI.getDocument).mockResolvedValue({
    document,
    schemaVersion: '1.1.0',
    revision: 1,
  })
  vi.mocked(documentsAPI.getLayout).mockResolvedValue({ layout, revision: 1 })
}

const open = () => useGraphStore.getState().loadDialogueByDocumentId('doc')

describe('prototype cartes de texte — stores', () => {
  beforeEach(() => localStorage.clear())

  it('drapeau désactivé par défaut, relu à la création du store', async () => {
    vi.resetModules()
    const first = await import('../store/uiLayoutStore')
    expect(first.useUiLayoutStore.getState().textCardsPrototype).toBe(false)

    first.useUiLayoutStore.getState().setTextCardsPrototype(true)
    expect(localStorage.getItem(TEXT_CARDS_STORAGE_KEY)).toBe('1')
    vi.resetModules()
    const second = await import('../store/uiLayoutStore')
    expect(second.useUiLayoutStore.getState().textCardsPrototype).toBe(true)

    second.useUiLayoutStore.getState().setTextCardsPrototype(false)
    expect(localStorage.getItem(TEXT_CARDS_STORAGE_KEY)).toBeNull()
  })

  it('porte le palier courant et le nœud en écriture', () => {
    useGraphViewStore.getState().setZoomTier('situate')
    useGraphViewStore.getState().setWritingNode('START')
    expect(useGraphViewStore.getState()).toMatchObject({
      zoomTier: 'situate',
      writingNodeId: 'START',
    })
    useGraphViewStore.getState().setZoomTier('write')
    useGraphViewStore.getState().setWritingNode(null)
  })
})

describe('prototype cartes de texte — layout', () => {
  it('range les positions LR sous leur propre clé et rend les positions TB intactes', () => {
    const persisted = { nodes: topToBottom, intentionalCycleIds: ['a'] }
    const working = toTextCardsWorkingLayout(persisted)
    expect(working.nodes).toEqual({})

    const moved = { ...working, nodes: { START: { x: 9, y: 9 } } }
    expect(toPersistedLayout(moved)).toEqual({
      nodes: topToBottom,
      nodesLR: { START: { x: 9, y: 9 } },
      intentionalCycleIds: ['a'],
    })
    expect(toPersistedLayout(persisted)).toBe(persisted)
  })

  it('dessine les 4 issues depuis les ports de la réplique, sans toucher au document', () => {
    const { nodes, edges } = documentToGraph(document, undefined)
    const before = graphToDocument(nodes, edges)
    const projected = toTextCardEdges(edges, false)

    expect(projected.map((e) => [e.source, e.sourceHandle, e.target])).toEqual(
      expect.arrayContaining([
        ['START', 'test:c0:failure', 'node-a'],
        ['START', 'test:c0:success', 'node-b'],
        ['START', 'choice:c1', 'node-c'],
      ])
    )
    expect(projected.some((e) => e.target.startsWith('test-node-'))).toBe(false)
    expect(projected.every((e) => e.label === undefined)).toBe(true)
    // Les liens du store sont intacts : l'export en dérive toujours les mêmes issues.
    expect(graphToDocument(nodes, edges)).toEqual(before)
    expect(edges.some((e) => e.target.startsWith('test-node-'))).toBe(true)
  })

  it(
    'dispose les 500 répliques de gauche à droite sans chevauchement',
    () => {
      const { nodes, edges } = documentToGraph(fixture as unknown as UnityDocument, undefined)
      const laidOut = calculateTextCardLayout(nodes, edges, {
        spacingMode: 'normal',
        showTestBars: false,
      })
      const cards = laidOut
        .filter((n) => n.type === 'dialogueNode')
        .map((n) => ({ ...n.position, height: estimateTextCardHeight(n, false) }))
      expect(cards).toHaveLength(500)

      const start = laidOut.find((n) => n.id === 'START') as Node
      expect(Math.min(...cards.map((c) => c.x))).toBe(start.position.x)

      const overlaps = cards.flatMap((a, i) =>
        cards
          .slice(i + 1)
          .filter(
            (b) =>
              Math.abs(a.x - b.x) < TEXT_CARD_WIDTH && a.y < b.y + b.height && b.y < a.y + a.height
          )
      )
      expect(overlaps).toHaveLength(0)
    },
    60_000
  )
})

describe('prototype cartes de texte — ouverture et enregistrement', () => {
  beforeEach(() => {
    vi.mocked(documentsAPI.getDocument).mockReset()
    vi.mocked(documentsAPI.getLayout).mockReset()
    vi.mocked(documentsAPI.putDocument).mockReset().mockResolvedValue({ revision: 2 })
    vi.mocked(documentsAPI.putLayout).mockReset().mockResolvedValue({ revision: 2 })
    useGraphStore.getState().resetGraph()
    useUiLayoutStore.setState({ textCardsPrototype: true, textCardsTestBars: false })
    return () => useUiLayoutStore.setState({ textCardsPrototype: false })
  })

  it('première ouverture : LR calculée et enregistrée à part, positions TB gardées', async () => {
    serve({ nodes: topToBottom })
    await open()

    const positions = positionsOf(useGraphStore.getState().nodes)
    expect(positions['node-c'].x).toBeGreaterThan(positions.START.x + TEXT_CARD_WIDTH)
    expect(documentsAPI.putDocument).not.toHaveBeenCalled()
    const saved = vi.mocked(documentsAPI.putLayout).mock.calls[0][1].layout as {
      nodes: unknown
      nodesLR: Record<string, unknown>
    }
    expect(saved.nodes).toEqual(topToBottom)
    expect(saved.nodesLR.START).toEqual(positions.START)
    await vi.waitFor(() => expect(useGraphStore.getState().layoutRevision).toBe(2))
  })

  it('ouverture suivante : positions LR reprises sans recalcul ni écriture', async () => {
    const stored = {
      START: { x: 11, y: 12 },
      'node-a': { x: 700, y: 1 },
      'node-b': { x: 701, y: 2 },
      'node-c': { x: 702, y: 3 },
    }
    serve({ nodes: topToBottom, nodesLR: stored })
    await open()

    expect(positionsOf(useGraphStore.getState().nodes)).toEqual(stored)
    expect(documentsAPI.putLayout).not.toHaveBeenCalled()
  })

  it('enregistre un déplacement dans les positions LR seulement', async () => {
    serve({ nodes: topToBottom, nodesLR: { START: { x: 11, y: 12 } } })
    await open()
    useGraphStore.getState().updateNodePosition('START', { x: 90, y: 90 })
    await useGraphStore.getState().saveDialogue()

    const saved = vi.mocked(documentsAPI.putLayout).mock.calls.at(-1)?.[1].layout as {
      nodes: unknown
      nodesLR: Record<string, unknown>
    }
    expect(saved.nodes).toEqual(topToBottom)
    expect(saved.nodesLR.START).toEqual({ x: 90, y: 90 })

    // La seconde sauvegarde part du layout resté en mémoire : toujours la même séparation.
    useGraphStore.getState().updateNodePosition('START', { x: 91, y: 91 })
    await useGraphStore.getState().saveDialogue()
    const again = vi.mocked(documentsAPI.putLayout).mock.calls.at(-1)?.[1].layout as {
      nodes: unknown
    }
    expect(again.nodes).toEqual(topToBottom)
  })

  it('repli JSON brut sans layout : la disposition LR ne prend pas la place des positions TB', async () => {
    vi.mocked(documentsAPI.getLayout).mockRejectedValue({ response: { status: 404 } })
    await useGraphStore.getState().loadDialogueFromRawJson(JSON.stringify(document), 'doc')
    await useGraphStore.getState().saveDialogue()

    const saved = vi.mocked(documentsAPI.putLayout).mock.calls.at(-1)?.[1].layout as {
      nodes: unknown
      nodesLR: Record<string, unknown>
    }
    expect(saved.nodes).toEqual({})
    expect(Object.keys(saved.nodesLR)).toContain('START')
  })

  it('frappe et glisser en prototype : même document que la voie complète, sans reprojection', async () => {
    const stored = { START: { x: 11, y: 12 } }
    const edit = () => {
      const { nodes, updateNode } = useGraphStore.getState()
      const node = nodes.find((n) => n.id === 'START') as Node
      updateNode('START', { data: { ...node.data, line: 'Nouvelle réplique' } })
    }
    useUiLayoutStore.setState({ textCardsPrototype: false })
    serve({ nodes: topToBottom })
    await open()
    edit()
    const reference = graphToDocument(useGraphStore.getState().nodes, useGraphStore.getState().edges)

    useUiLayoutStore.setState({ textCardsPrototype: true })
    useGraphStore.getState().resetGraph()
    serve({ nodes: topToBottom, nodesLR: stored })
    await open()
    const untouched = useGraphStore.getState().nodes.find((n) => n.id === 'node-a')
    const edgesBefore = useGraphStore.getState().edges
    edit()
    useGraphStore.getState().updateNodePosition('START', { x: 40, y: 50 })

    const state = useGraphStore.getState()
    expect(state.nodes.find((n) => n.id === 'node-a')).toBe(untouched)
    expect(state.edges).toBe(edgesBefore)
    expect(graphToDocument(state.nodes, state.edges)).toEqual(reference)
    expect((state.document as { nodes: Array<{ line: string }> }).nodes[0].line).toBe(
      'Nouvelle réplique'
    )
    expect((state.layout as { nodes: Record<string, unknown> }).nodes.START).toEqual({
      x: 40,
      y: 50,
    })
    expect(state.hasUnsavedChanges).toBe(true)
    state.undo()
    state.undo()
  })

  it('disposition automatique demandée en TB : cartes en LR, positions TB intactes', async () => {
    const piled = Object.fromEntries(Object.keys(topToBottom).map((id) => [id, { x: 0, y: 0 }]))
    serve({ nodes: topToBottom, nodesLR: piled })
    await open()
    await useGraphStore.getState().applyAutoLayout('dagre', 'TB')

    const positions = positionsOf(useGraphStore.getState().nodes)
    for (const child of ['node-a', 'node-b', 'node-c']) {
      expect(positions[child].x).toBeGreaterThan(positions.START.x + TEXT_CARD_WIDTH)
    }
    await useGraphStore.getState().saveDialogue()
    const saved = vi.mocked(documentsAPI.putLayout).mock.calls.at(-1)?.[1].layout
    expect(saved).toMatchObject({ nodes: topToBottom, nodesLR: { START: positions.START } })
  })

  it('annuler puis rétablir une frappe en prototype rend la réplique et le document', async () => {
    serve({ nodes: topToBottom, nodesLR: { START: { x: 11, y: 12 } } })
    await open()
    const lines = () => {
      const { nodes, document: stored } = useGraphStore.getState()
      return [
        nodes.find((n) => n.id === 'START')?.data.line,
        (stored as { nodes: Array<{ id: string; line: string }> }).nodes.find(
          (n) => n.id === 'START'
        )?.line,
      ]
    }
    const { nodes, updateNode } = useGraphStore.getState()
    const node = nodes.find((n) => n.id === 'START') as Node
    updateNode('START', { data: { ...node.data, line: 'Nouvelle réplique' } })
    expect(lines()).toEqual(['Nouvelle réplique', 'Nouvelle réplique'])

    useGraphStore.getState().undo()
    expect(lines()).toEqual(['Bonjour', 'Bonjour'])
    useGraphStore.getState().redo()
    expect(lines()).toEqual(['Nouvelle réplique', 'Nouvelle réplique'])
  })

  it('un glisser seul marque le document à enregistrer, sauf demande contraire', async () => {
    serve({ nodes: topToBottom, nodesLR: { START: { x: 11, y: 12 } } })
    await open()
    expect(useGraphStore.getState().hasUnsavedChanges).toBe(false)

    useGraphStore.getState().updateNodePosition('START', { x: 40, y: 50 }, true)
    expect(positionsOf(useGraphStore.getState().nodes).START).toEqual({ x: 40, y: 50 })
    expect(useGraphStore.getState().hasUnsavedChanges).toBe(false)

    useGraphStore.getState().updateNodePosition('START', { x: 60, y: 70 })
    expect(useGraphStore.getState().hasUnsavedChanges).toBe(true)
  })

  it('drapeau éteint ensuite : le document revient à ses positions TB', async () => {
    useUiLayoutStore.setState({ textCardsPrototype: false })
    serve({ nodes: topToBottom, nodesLR: { START: { x: 11, y: 12 } } })
    await open()

    expect(positionsOf(useGraphStore.getState().nodes)).toEqual(topToBottom)
    useGraphStore.getState().updateNodePosition('START', { x: 5, y: 5 })
    await useGraphStore.getState().saveDialogue()
    const saved = vi.mocked(documentsAPI.putLayout).mock.calls.at(-1)?.[1].layout
    expect(saved).toMatchObject({
      nodes: { START: { x: 5, y: 5 } },
      nodesLR: { START: { x: 11, y: 12 } },
    })
  })
})
