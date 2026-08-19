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

vi.mock('../../../api/config', () => ({
  getSceneInstructionTemplates: vi.fn().mockResolvedValue({ templates: [] }),
  getAuthorProfileTemplates: vi.fn().mockResolvedValue({ templates: [] }),
}))

const BRIEF_PLACEHOLDER = /^Ex: Bob doit annoncer/

describe('SystemPromptEditor — onglet Brief', () => {
  it('rend le champ de brief', () => {
    render(<SystemPromptEditor userInstructions="" onUserInstructionsChange={vi.fn()} />)
    expect(screen.getByPlaceholderText(BRIEF_PLACEHOLDER)).toBeInTheDocument()
  })

  it('propose les briefs enregistrés en repli, sans remplacer le brief', () => {
    render(<SystemPromptEditor userInstructions="" onUserInstructionsChange={vi.fn()} />)

    const saved = screen.getByTestId('brief-saved-briefs')
    expect(saved.tagName).toBe('DETAILS')
    // Fermé au départ : `<details>` sans `open` masque son contenu, mais le champ
    // de brief reste monté — c'est tout l'intérêt d'un repli plutôt qu'un onglet.
    expect(saved).not.toHaveAttribute('open')
    expect(screen.getByPlaceholderText(BRIEF_PLACEHOLDER)).toBeInTheDocument()
  })

  it('ne porte plus ni bandeau de liens ni onglets secondaires', () => {
    render(<SystemPromptEditor userInstructions="" onUserInstructionsChange={vi.fn()} />)

    expect(screen.queryByTestId('brief-section-header')).not.toBeInTheDocument()
    expect(screen.queryByTestId('brief-link-templates')).not.toBeInTheDocument()
    expect(screen.queryByTestId('brief-link-system-prompt')).not.toBeInTheDocument()
    expect(screen.queryByTestId('brief-link-back')).not.toBeInTheDocument()
  })

  /**
   * Régression : la sauvegarde explicite du brief avait été sortie du repli et
   * flottait au-dessus du champ, sur sa propre ligne. jsdom ne simule pas le
   * repliement d'un `<details>` — on assertie donc l'appartenance, qui est
   * l'invariant réel (vérifié visuellement en navigateur par ailleurs).
   */
  it('garde Sauvegarder et Restaurer à l’intérieur du repli', () => {
    render(<SystemPromptEditor userInstructions="" onUserInstructionsChange={vi.fn()} />)

    const repli = screen.getByTestId('brief-saved-briefs')
    const sauvegarder = screen.getByTitle('Sauvegarde le brief de scène actuel')
    const restaurer = screen.getByTitle('Restaure la dernière version sauvegardée')

    expect(repli).toContainElement(sauvegarder)
    expect(repli).toContainElement(restaurer)
  })
})

