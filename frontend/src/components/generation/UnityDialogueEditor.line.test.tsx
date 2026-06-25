import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UnityDialogueEditor } from './UnityDialogueEditor'

const minimalJson = JSON.stringify([{ id: 'START', speaker: 'A', line: 'Première ligne' }])

describe('UnityDialogueEditor — dialogue line editing', () => {
  it('conserve un retour à la ligne ajouté après la dernière ligne', async () => {
    const user = userEvent.setup()
    render(<UnityDialogueEditor json_content={minimalJson} />)

    const textarea = screen.getByPlaceholderText('Texte du dialogue...')
    await user.click(textarea)
    await user.keyboard('{End}{Enter}')

    expect(textarea).toHaveValue('Première ligne\n')
  })

  it('conserve les retours à la ligne internes', async () => {
    const user = userEvent.setup()
    render(<UnityDialogueEditor json_content={minimalJson} />)

    const textarea = screen.getByPlaceholderText('Texte du dialogue...')
    await user.clear(textarea)
    await user.type(textarea, 'Ligne 1{Enter}Ligne 2')

    expect(textarea).toHaveValue('Ligne 1\nLigne 2')
  })
})
