/**
 * Onglet Brief (matrice I/O — « Briefs enregistrés »).
 *
 * Régression de vocabulaire : « briefs enregistrés » était une entrée du bandeau, au
 * même rang que « templates », alors que c'est une sous-fonction du brief. Il redevient
 * un repli *à l'intérieur* de l'onglet Brief, qui ne remplace jamais le champ.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SystemPromptEditor } from '../SystemPromptEditor'

const BRIEF_PLACEHOLDER = /^Ex: Bob doit annoncer/

describe('SystemPromptEditor — onglet Brief', () => {
  it('rend le champ de brief', () => {
    render(<SystemPromptEditor userInstructions="" onUserInstructionsChange={vi.fn()} />)
    expect(screen.getByPlaceholderText(BRIEF_PLACEHOLDER)).toBeInTheDocument()
  })

  /**
   * Les briefs enregistrés sont devenus des templates : un objet serveur unique, avec
   * un statut privé/partagé. L'onglet Brief ne porte plus de liste locale — c'était le
   * doublon que « brief » vs « briefs » signalait.
   */
  it('ne porte plus de liste de briefs enregistrés', () => {
    render(<SystemPromptEditor userInstructions="" onUserInstructionsChange={vi.fn()} />)

    expect(screen.queryByTestId('brief-saved-briefs')).not.toBeInTheDocument()
    expect(screen.queryByText(/briefs enregistrés/i)).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText(BRIEF_PLACEHOLDER)).toBeInTheDocument()
  })

  it('ne porte plus ni bandeau de liens ni onglets secondaires', () => {
    render(<SystemPromptEditor userInstructions="" onUserInstructionsChange={vi.fn()} />)

    expect(screen.queryByTestId('brief-section-header')).not.toBeInTheDocument()
    expect(screen.queryByTestId('brief-link-templates')).not.toBeInTheDocument()
    expect(screen.queryByTestId('brief-link-system-prompt')).not.toBeInTheDocument()
    expect(screen.queryByTestId('brief-link-back')).not.toBeInTheDocument()
  })
})
