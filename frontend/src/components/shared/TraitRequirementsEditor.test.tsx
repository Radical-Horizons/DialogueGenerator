import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { TraitRequirementsEditor, type TraitRequirementValue } from './TraitRequirementsEditor'
import * as flagsAPI from '../../api/flags'

vi.mock('../../api/flags', () => ({
  listFlags: vi.fn(),
}))

function StatefulEditor() {
  const [value, setValue] = useState<TraitRequirementValue[] | undefined>(undefined)

  return (
    <TraitRequirementsEditor
      idPrefix="trait-test"
      value={value}
      onChange={setValue}
    />
  )
}

describe('TraitRequirementsEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(flagsAPI.listFlags).mockResolvedValue({
      total: 1,
      flags: [
        {
          id: 'autoritaire',
          label: 'Autoritaire',
          type: 'int',
          category: 'traits',
          defaultValue: '0',
          tags: [],
          isFavorite: false,
        },
      ],
    })
  })

  it('edits trait requirements with a searchable trait field and numeric value', async () => {
    const user = userEvent.setup()

    render(<StatefulEditor />)

    await user.click(screen.getByRole('button', { name: /ajouter un trait requis/i }))

    const traitInput = screen.getByPlaceholderText(/rechercher ou saisir un trait/i)
    await user.type(traitInput, 'Autoritaire')

    const minimumInput = screen.getByRole('spinbutton')
    await user.clear(minimumInput)
    await user.type(minimumInput, '5')

    expect(traitInput).toHaveValue('Autoritaire')
    expect(minimumInput).toHaveValue(5)
    await waitFor(() => {
      expect(flagsAPI.listFlags).toHaveBeenCalled()
    })
  })
})
