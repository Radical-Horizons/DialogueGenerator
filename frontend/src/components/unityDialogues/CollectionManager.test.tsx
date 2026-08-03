/**
 * Tests CollectionManager (Story 8.5 / FR84).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CollectionManager } from './CollectionManager'
import type { DialogueCollection } from '../../api/collections'

const SAMPLE: DialogueCollection = {
  id: 'c1',
  name: 'Chapitre 1',
  description: null,
  icon: '📁',
  owner_id: 'writer-a',
  created_at: '2026-08-04T00:00:00+00:00',
  updated_at: '2026-08-04T00:00:00+00:00',
  dialogue_ids: ['doc-a'],
}

describe('CollectionManager', () => {
  it('sélectionne une collection et ouvre la création', async () => {
    const onSelect = vi.fn()
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(
      <CollectionManager
        collections={[SAMPLE]}
        activeCollectionId={null}
        onSelect={onSelect}
        onCreate={onCreate}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    fireEvent.click(screen.getByTestId('collection-select-c1'))
    expect(onSelect).toHaveBeenCalledWith(SAMPLE)

    fireEvent.click(screen.getByTestId('collection-create-button'))
    expect(screen.getByTestId('collection-modal')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('collection-form-name'), {
      target: { value: 'Nouveau' },
    })
    fireEvent.click(screen.getByTestId('collection-form-submit'))
    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith({
        name: 'Nouveau',
        description: null,
        icon: '📁',
      })
    })
  })
})
