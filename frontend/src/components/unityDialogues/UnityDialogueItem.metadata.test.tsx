import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { UnityDialogueMetadata } from '../../types/api'
import { UnityDialogueItem } from './UnityDialogueItem'

const dialogue: UnityDialogueMetadata = {
  filename: 'scene.json',
  file_path: 'C:/Dialogues/scene.json',
  size_bytes: 1024,
  modified_time: '2026-08-04T10:00:00Z',
  node_count: 45,
  total_cost_eur: 8.2,
  last_modified_by: 'editor-1',
  last_modified_by_username: 'Marc',
}

describe('UnityDialogueItem métadonnées compactes', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-04T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('affiche les nœuds, le coût et la dernière modification en compact', () => {
    render(
      <UnityDialogueItem
        dialogue={dialogue}
        onClick={() => {}}
        isSelected={false}
      />
    )
    expect(screen.getByTestId('unity-dialogue-item-node-count')).toHaveTextContent(
      '45 nœuds'
    )
    expect(screen.getByTestId('unity-dialogue-item-cost')).toHaveTextContent('8.20€')
    expect(screen.getByTitle('Dernière modification')).toHaveTextContent('il y a 2h')
  })

  it('affiche un tooltip custom puis le masque après trois secondes', () => {
    render(
      <UnityDialogueItem
        dialogue={dialogue}
        onClick={() => {}}
        isSelected={false}
      />
    )
    fireEvent.mouseEnter(screen.getByTestId('unity-dialogue-item'))
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      '45 nœuds, 8.20€, modifié il y a 2h par Marc'
    )

    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('n’affiche pas le coût compact à 0€', () => {
    render(
      <UnityDialogueItem
        dialogue={{ ...dialogue, total_cost_eur: 0 }}
        onClick={() => {}}
        isSelected={false}
      />
    )
    expect(screen.queryByTestId('unity-dialogue-item-cost')).not.toBeInTheDocument()
  })

  it('masque le tooltip au leave et au clic', () => {
    const onClick = vi.fn()
    render(
      <UnityDialogueItem
        dialogue={dialogue}
        onClick={onClick}
        isSelected={false}
      />
    )
    const item = screen.getByTestId('unity-dialogue-item')
    fireEvent.mouseEnter(item)
    fireEvent.mouseLeave(item)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    fireEvent.mouseEnter(item)
    fireEvent.click(item)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(onClick).toHaveBeenCalledOnce()
  })
})
