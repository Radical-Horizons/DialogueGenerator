import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { PasswordInput } from './PasswordInput'

describe('PasswordInput', () => {
  it('masque le mot de passe par défaut et le révèle au clic œil', async () => {
    const user = userEvent.setup()
    render(
      <label htmlFor="pwd">
        Mot de passe
        <PasswordInput id="pwd" defaultValue="secret" />
      </label>,
    )

    const input = screen.getByLabelText(/mot de passe/i)
    expect(input).toHaveAttribute('type', 'password')

    const toggle = screen.getByRole('button', { name: /afficher en clair/i })
    await user.click(toggle)

    expect(input).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: /^masquer$/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await user.click(screen.getByRole('button', { name: /^masquer$/i }))
    expect(input).toHaveAttribute('type', 'password')
  })

  it('ne soumet pas le formulaire parent au clic sur l’œil', async () => {
    const user = userEvent.setup()
    let submitted = false
    render(
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submitted = true
        }}
      >
        <PasswordInput name="password" defaultValue="x" />
        <button type="submit">OK</button>
      </form>,
    )

    await user.click(screen.getByTestId('password-visibility-toggle'))
    expect(submitted).toBe(false)
    expect(screen.getByDisplayValue('x')).toHaveAttribute('type', 'text')
  })
})
