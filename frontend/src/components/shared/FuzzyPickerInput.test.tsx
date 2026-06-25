import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FuzzyPickerInput } from './FuzzyPickerInput'

describe('FuzzyPickerInput', () => {
  it('ouvre la liste de suggestions au focus sans crash (champ vide)', () => {
    const onChange = vi.fn()
    render(
      <FuzzyPickerInput
        value=""
        onChange={onChange}
        options={[
          { id: 'Rhétorique', label: 'Rhétorique' },
          { id: 'Diplomatie', label: 'Diplomatie' },
        ]}
        placeholder="Compétence"
      />,
    )

    fireEvent.focus(screen.getByPlaceholderText('Compétence'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Rhétorique/i })).toBeInTheDocument()
  })
})
