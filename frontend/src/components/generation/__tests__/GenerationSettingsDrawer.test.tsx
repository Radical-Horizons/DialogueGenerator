/**
 * Tiroir de réglages (matrice I/O — « Tiroir replié », « Tiroir déplié »).
 *
 * Régression : profil d'auteur, règles du jeu et prompt système étaient des onglets
 * à égalité avec le brief. Les ouvrir effaçait la surface d'écriture.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GenerationSettingsDrawer } from '../GenerationSettingsDrawer'

vi.mock('../../../hooks/useSystemPrompt', () => ({
  useSystemPrompt: () => ({
    systemPrompt: 'prompt de test',
    isLoading: false,
    savePrompt: vi.fn(),
    restore: vi.fn(),
    updatePrompt: vi.fn(),
  }),
}))

vi.mock('../../../hooks/useAuthorProfile', () => ({
  useAuthorProfile: () => ({
    authorProfile: '',
    saveProfile: vi.fn(),
    restore: vi.fn(),
    updateProfile: vi.fn(),
  }),
}))

function renderDrawer(open: boolean) {
  const onToggle = vi.fn()
  render(
    <GenerationSettingsDrawer
      open={open}
      onToggle={onToggle}
      summary="gpt-5.6 · moyen · 150K/20K"
      authorProfile=""
      onAuthorProfileChange={vi.fn()}
      gameRules=""
      onGameRulesChange={vi.fn()}
      systemPromptOverride={null}
      onSystemPromptChange={vi.fn()}
    >
      <div data-testid="model-settings-children">réglages du modèle</div>
    </GenerationSettingsDrawer>
  )
  return { onToggle }
}

describe('GenerationSettingsDrawer', () => {
  it('replié : la ligne résumé annonce le modèle, le corps est masqué', () => {
    renderDrawer(false)

    expect(screen.getByTestId('model-settings-summary-toggle')).toHaveAttribute(
      'aria-expanded',
      'false'
    )
    expect(screen.getByText('gpt-5.6 · moyen · 150K/20K')).toBeInTheDocument()
    expect(screen.getByTestId('generation-settings-body')).toHaveStyle({ display: 'none' })
  })

  it('déplié : les quatre réglages sont accessibles au même endroit', () => {
    renderDrawer(true)

    expect(screen.getByTestId('generation-settings-body')).toHaveStyle({ display: 'block' })
    expect(screen.getByTestId('model-settings-children')).toBeInTheDocument()
    expect(screen.getByText("Profil d'auteur")).toBeInTheDocument()
    expect(screen.getByText('Règles du jeu')).toBeInTheDocument()
    expect(screen.getByText('Prompt système')).toBeInTheDocument()
  })

  it('le prompt système garde sa marque de zone avancée', () => {
    renderDrawer(true)
    expect(screen.getByText('zone avancée')).toBeInTheDocument()
  })

  it('délègue la bascule au parent', async () => {
    const user = userEvent.setup()
    const { onToggle } = renderDrawer(false)

    await user.click(screen.getByTestId('model-settings-summary-toggle'))

    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})
