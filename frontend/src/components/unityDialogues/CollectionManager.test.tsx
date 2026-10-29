/**
 * Tests CollectionManager (Story 8.5 / FR84) — variante toolbar intégrée.
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
  it('sélectionne une collection via le select et ouvre la création', async () => {
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
      />,
    )

    fireEvent.change(screen.getByTestId('collection-filter-select'), {
      target: { value: 'c1' },
    })
    expect(onSelect).toHaveBeenCalledWith(SAMPLE)

    fireEvent.click(screen.getByTestId('collection-create-button'))
    expect(screen.getByTestId('collection-modal')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('collection-form-name'), {
      target: { value: 'Nouveau' },
    })
    fireEvent.click(screen.getByTestId('collection-form-submit'))
    await waitFor(() => {
      // Pas d'icône imposée : sans saisie, la collection n'en porte aucune.
      expect(onCreate).toHaveBeenCalledWith({
        name: 'Nouveau',
        description: null,
        icon: null,
      })
    })
  })

  it('expose modifier / supprimer quand une collection est active', () => {
    render(
      <CollectionManager
        collections={[SAMPLE]}
        activeCollectionId="c1"
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByTestId('collection-edit-c1')).toHaveTextContent('Modifier')
    expect(screen.getByTestId('collection-delete-c1')).toBeInTheDocument()
  })

  it('n’ajoute pas d’icône par défaut à une collection qui n’en a pas', () => {
    render(
      <CollectionManager
        collections={[{ ...SAMPLE, icon: null }]}
        activeCollectionId={null}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByTestId('collection-select-c1')).toHaveTextContent('Chapitre 1 (1)')
    expect(screen.getByTestId('collection-select-c1').textContent).not.toContain('📁')
  })
})
