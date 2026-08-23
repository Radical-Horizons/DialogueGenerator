/**
 * Enregistrer le brief courant comme template.
 *
 * Le bouton vivait dans l'onglet Templates, à côté d'une liste : rien ne disait ce
 * qu'il capturait. Ces tests couvrent le câblage — la logique de création, elle, est
 * couverte par les tests de `TemplateCreatorModal`.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BriefTemplateSaver } from '../BriefTemplateSaver'
import type { TemplateConfiguration } from '../../../types/template'

vi.mock('../../../store/templateStore', () => ({
  useTemplateStore: () => ({ createTemplate: vi.fn().mockResolvedValue({ id: 'x', warnings: [] }) }),
}))

function configuration(overrides: Partial<TemplateConfiguration> = {}): TemplateConfiguration {
  return {
    characters: ['char-alpha'],
    locations: ['loc-alpha'],
    region: '',
    sceneType: 'Generic',
    instructions: 'Le brief en cours de frappe',
    ...overrides,
  } as TemplateConfiguration
}

describe('BriefTemplateSaver', () => {
  it('dit ce qu’il enregistre', () => {
    render(<BriefTemplateSaver getConfiguration={() => configuration()} />)

    expect(screen.getByTestId('brief-save-as-template-btn')).toHaveTextContent(
      'Sauvegarder ce brief comme template',
    )
  })

  it('ouvre la modale avec la configuration du moment', async () => {
    const user = userEvent.setup()
    const getConfiguration = vi.fn(() => configuration())
    render(<BriefTemplateSaver getConfiguration={getConfiguration} />)

    await user.click(screen.getByTestId('brief-save-as-template-btn'))

    expect(getConfiguration).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('heading', { name: /sauvegarder comme template/i })).toBeInTheDocument()
  })

  /**
   * Le risque du câblage : `getConfiguration` renvoie `null` et la modale ne s'ouvre
   * jamais, sans que rien ne le signale. Le bouton reste alors inerte au clic.
   */
  it('n’ouvre pas la modale quand il n’y a rien à capturer', async () => {
    const user = userEvent.setup()
    render(<BriefTemplateSaver getConfiguration={() => null} />)

    await user.click(screen.getByTestId('brief-save-as-template-btn'))

    expect(screen.queryByRole('heading', { name: /sauvegarder comme template/i })).toBeNull()
  })

  it('fige la configuration à l’ouverture', async () => {
    const user = userEvent.setup()
    let courante = configuration({ instructions: 'premier brief' })
    render(<BriefTemplateSaver getConfiguration={() => courante} />)

    await user.click(screen.getByTestId('brief-save-as-template-btn'))
    // Le brief change pendant que la modale est ouverte : ce qui sera enregistré ne
    // doit pas suivre.
    courante = configuration({ instructions: 'brief modifié après coup' })

    expect(screen.getByText(/premier brief/i)).toBeInTheDocument()
  })

  it('ne propose rien à une session en lecture seule', () => {
    render(<BriefTemplateSaver getConfiguration={() => configuration()} readOnly />)

    expect(screen.queryByTestId('brief-save-as-template-btn')).toBeNull()
  })
})
