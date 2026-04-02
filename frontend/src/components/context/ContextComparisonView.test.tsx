import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ContextComparisonView } from './ContextComparisonView'

const mockGetUsage = vi.fn()

vi.mock('../../api/llmUsage', () => ({
  getNodeContextSectionUsage: (...args: unknown[]) => mockGetUsage(...args),
}))

describe('ContextComparisonView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('affiche communes et uniques pour deux nœuds', async () => {
    mockGetUsage
      .mockResolvedValueOnce({
        dialogue_id: 'd.json',
        node_id: 'A',
        method: 'm',
        computation_ms: 0,
        computed_at: '',
        reflected_threshold_percent: 40,
        entity_groups: [
          {
            entity_type: 'characters',
            entity_label: 'X',
            sections: [
              {
                section_key: 'k1',
                section_title: 'S1',
                excerpt: '',
                overlap_percent: 50,
                status: 'reflected',
              },
              {
                section_key: 'k2',
                section_title: 'S2',
                excerpt: '',
                overlap_percent: 10,
                status: 'weak',
              },
            ],
          },
        ],
        weak_sections: [],
        reflected_sections: [],
        weak_section_count: 0,
        reflected_section_count: 0,
        generated_plain_preview: '',
      })
      .mockResolvedValueOnce({
        dialogue_id: 'd.json',
        node_id: 'B',
        method: 'm',
        computation_ms: 0,
        computed_at: '',
        reflected_threshold_percent: 40,
        entity_groups: [
          {
            entity_type: 'characters',
            entity_label: 'X',
            sections: [
              {
                section_key: 'k1',
                section_title: 'S1',
                excerpt: '',
                overlap_percent: 50,
                status: 'reflected',
              },
              {
                section_key: 'k3',
                section_title: 'S3',
                excerpt: '',
                overlap_percent: 20,
                status: 'reflected',
              },
            ],
          },
        ],
        weak_sections: [],
        reflected_sections: [],
        weak_section_count: 0,
        reflected_section_count: 0,
        generated_plain_preview: '',
      })

    render(
      <ContextComparisonView dialogueId="d.json" nodeIdA="A" nodeIdB="B" />
    )
    await waitFor(() => {
      expect(screen.getByTestId('context-comparison-view')).toBeInTheDocument()
    })
    expect(screen.getByTestId('context-comparison-common')).toHaveTextContent('k1')
    expect(screen.getByTestId('context-comparison-only-a')).toHaveTextContent('k2')
    expect(screen.getByTestId('context-comparison-only-b')).toHaveTextContent('k3')
  })

  it('affiche idle si même nœud', () => {
    render(
      <ContextComparisonView dialogueId="d.json" nodeIdA="A" nodeIdB="A" />
    )
    expect(screen.getByTestId('context-comparison-idle')).toBeInTheDocument()
  })
})
