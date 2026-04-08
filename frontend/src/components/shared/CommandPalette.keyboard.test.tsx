import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { CommandPalette } from './CommandPalette'

vi.mock('../../api/context', () => ({
  listCharacters: vi.fn().mockResolvedValue({ characters: [] }),
  listLocations: vi.fn().mockResolvedValue({ locations: [] }),
  listItems: vi.fn().mockResolvedValue({ items: [] }),
}))

vi.mock('../../api/unityDialogues', () => ({
  listUnityDialogues: vi.fn().mockResolvedValue({ dialogues: [] }),
}))

vi.mock('../../store/contextStore', () => ({
  useContextStore: () => ({
    selections: {
      characters: [],
      locations: [],
      items: [],
      characters_full: [],
      characters_excerpt: [],
    },
    toggleCharacter: vi.fn(),
    toggleLocation: vi.fn(),
    toggleItem: vi.fn(),
  }),
}))

vi.mock('../../store/generationActionsStore', () => ({
  useGenerationActionsStore: () => ({
    actions: { handleGenerate: null },
  }),
}))

describe('CommandPalette — confort clavier (17.4)', () => {
  it('déclare data-shell-keyboard-zone et applique le padding bas (visual viewport)', async () => {
    render(
      <BrowserRouter>
        <CommandPalette isOpen onClose={() => {}} keyboardBottomInsetPx={88} />
      </BrowserRouter>
    )

    const input = await waitFor(() =>
      screen.getByPlaceholderText(/rechercher des actions/i)
    )
    const zone = input.closest('[data-shell-keyboard-zone="true"]')
    expect(zone).toBeTruthy()
    expect(zone?.getAttribute('style') ?? '').toMatch(/calc\(88px\s*\+\s*1rem\)/)
  })
})
