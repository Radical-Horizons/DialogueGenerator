import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ContextUsagePanel } from './ContextUsagePanel'

const mockGetUsage = vi.fn()

vi.mock('../../api/llmUsage', () => ({
  getNodeContextSectionUsage: (...args: unknown[]) => mockGetUsage(...args),
}))

const storeState = {
  documentId: 'd.json' as string | null,
  dialogueMetadata: {
    filename: 'd.json',
    title: '',
    node_count: 0,
    edge_count: 0,
  },
  selectedNodeId: 'NODE_1' as string | null,
  selectedNodeIds: ['NODE_1'] as string[],
  nodes: [
    { id: 'NODE_1', type: 'default', position: { x: 0, y: 0 }, data: {} },
    { id: 'NODE_2', type: 'default', position: { x: 0, y: 0 }, data: {} },
  ],
}

vi.mock('../../store/graphStore', () => ({
  useGraphStore: (selector: (s: typeof storeState) => unknown) => selector(storeState),
}))

const sampleReport = {
  dialogue_id: 'd.json',
  node_id: 'NODE_1',
  request_id: 'r1',
  method: 'section_keyword_overlap_v2',
  computation_ms: 1,
  computed_at: '2020-01-01T00:00:00+00:00',
  reflected_threshold_percent: 40,
  entity_groups: [
    {
      entity_type: 'characters',
      entity_label: 'Personnages',
      sections: [
        {
          section_key: 'characters|personnages|contenu',
          section_title: 'Contenu',
          excerpt: 'TokenPanelZZZ lore',
          overlap_percent: 80,
          status: 'reflected',
        },
      ],
    },
  ],
  weak_sections: [
    {
      entity_type: 'locations',
      entity_label: 'Lieux',
      section_key: 'locations|lieux|contenu',
      section_title: 'Contenu',
      excerpt: 'WeakPlaceQQQ',
      overlap_percent: 5,
      status: 'weak',
    },
  ],
  reflected_sections: [],
  weak_section_count: 1,
  reflected_section_count: 1,
  generated_plain_preview: 'TokenPanelZZZ speaks here.',
}

describe('ContextUsagePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeState.documentId = 'd.json'
    storeState.selectedNodeId = 'NODE_1'
    storeState.selectedNodeIds = ['NODE_1']
  })

  it('affiche groupes, zone faible et ouvre la modal au clic section', async () => {
    mockGetUsage.mockResolvedValue(sampleReport)
    render(<ContextUsagePanel />)
    await waitFor(() => {
      expect(screen.getByTestId('context-usage-counts')).toBeInTheDocument()
    })
    expect(screen.getByTestId('context-usage-weak-zone')).toHaveTextContent(/Peu ou pas détectées/)
    expect(screen.getByTestId('context-usage-group-characters')).toBeInTheDocument()

    await userEvent.click(
      screen.getByTestId('context-usage-section-characters|personnages|contenu')
    )
    expect(screen.getByTestId('context-section-usage-modal')).toBeInTheDocument()
    expect(screen.getByTestId('context-section-usage-modal-excerpt')).toHaveTextContent('TokenPanelZZZ')
    const gen = screen.getByTestId('context-section-usage-modal-generated')
    expect(within(gen).getAllByTestId('context-usage-highlight-mark').length).toBeGreaterThan(0)
  })

  it('affiche état 404 sans erreur réseau', async () => {
    const err = Object.assign(new Error('Not found'), {
      isAxiosError: true,
      response: { status: 404 },
    })
    mockGetUsage.mockRejectedValue(err)
    render(<ContextUsagePanel />)
    await waitFor(() => {
      expect(screen.getByTestId('context-usage-missing')).toBeInTheDocument()
    })
  })
})
