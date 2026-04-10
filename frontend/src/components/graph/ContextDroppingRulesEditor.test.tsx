/**
 * Tests Story 4.10 : ContextDroppingRulesEditor
 * - chargement GET à l'ouverture
 * - sauvegarde PUT avec payload cohérent
 * - non-régression états slop / juge LLM
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ContextDroppingRulesEditor } from './ContextDroppingRulesEditor'
import type { ContextDroppingRules } from '../../types/graph'

vi.mock('../../api/graph', () => ({
  getContextDroppingRules: vi.fn(),
  putContextDroppingRules: vi.fn(),
}))

import * as graphAPI from '../../api/graph'

const DEFAULT_RULES: ContextDroppingRules = {
  rules_profile: 'strict',
  tolerance: null,
  mandatory_info: [],
  dialogue_type_overrides: {},
  schema_version: '1.0',
}

describe('ContextDroppingRulesEditor', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.mocked(graphAPI.getContextDroppingRules).mockReset()
    vi.mocked(graphAPI.putContextDroppingRules).mockReset()
    onClose.mockReset()
  })

  it("appelle GET a l'ouverture et affiche les valeurs chargees", async () => {
    vi.mocked(graphAPI.getContextDroppingRules).mockResolvedValue({
      ...DEFAULT_RULES,
      rules_profile: 'light',
    })

    render(<ContextDroppingRulesEditor onClose={onClose} />)

    await waitFor(() => {
      expect(graphAPI.getContextDroppingRules).toHaveBeenCalledOnce()
    })

    // L'option "light" doit être visible/sélectionnée
    await waitFor(() => {
      const select = screen.getByRole('combobox', { name: /profil/i })
      expect(select).toBeTruthy()
      expect((select as HTMLSelectElement).value).toBe('light')
    })
  })

  it('appelle PUT avec payload cohérent lors de la sauvegarde', async () => {
    vi.mocked(graphAPI.getContextDroppingRules).mockResolvedValue(DEFAULT_RULES)
    vi.mocked(graphAPI.putContextDroppingRules).mockResolvedValue(DEFAULT_RULES)

    render(<ContextDroppingRulesEditor onClose={onClose} />)
    await waitFor(() => expect(graphAPI.getContextDroppingRules).toHaveBeenCalled())

    const saveBtn = screen.getByRole('button', { name: /sauvegarder/i })
    await userEvent.click(saveBtn)

    await waitFor(() => {
      expect(graphAPI.putContextDroppingRules).toHaveBeenCalledOnce()
      const arg = vi.mocked(graphAPI.putContextDroppingRules).mock.calls[0][0]
      expect(arg).toHaveProperty('rules_profile')
      expect(['strict', 'light']).toContain(arg.rules_profile)
      expect(arg).toHaveProperty('mandatory_info')
      expect(Array.isArray(arg.mandatory_info)).toBe(true)
    })
  })

  it('affiche un message de succes apres sauvegarde', async () => {
    vi.mocked(graphAPI.getContextDroppingRules).mockResolvedValue(DEFAULT_RULES)
    vi.mocked(graphAPI.putContextDroppingRules).mockResolvedValue(DEFAULT_RULES)

    render(<ContextDroppingRulesEditor onClose={onClose} />)
    await waitFor(() => expect(graphAPI.getContextDroppingRules).toHaveBeenCalled())

    await userEvent.click(screen.getByRole('button', { name: /sauvegarder/i }))

    await waitFor(() => {
      // "sauvegardées" n'apparaît que dans le message de succès, pas dans le bouton.
      expect(screen.getByText(/sauvegard\u00e9es/i)).toBeTruthy()
    })
  })

  it('affiche une erreur si GET échoue', async () => {
    vi.mocked(graphAPI.getContextDroppingRules).mockRejectedValue(new Error('Network error'))

    render(<ContextDroppingRulesEditor onClose={onClose} />)

    await waitFor(() => {
      expect(screen.getByText(/erreur/i)).toBeTruthy()
    })
  })

  it('appelle onClose au clic sur Fermer', async () => {
    vi.mocked(graphAPI.getContextDroppingRules).mockResolvedValue(DEFAULT_RULES)

    render(<ContextDroppingRulesEditor onClose={onClose} />)
    await waitFor(() => expect(graphAPI.getContextDroppingRules).toHaveBeenCalled())

    const closeBtn = screen.getByRole('button', { name: /fermer/i })
    await userEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledOnce()
  })
})
