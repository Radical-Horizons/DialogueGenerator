/**
 * Tests du composant ContextRulesEditor (Story 3.4 — Task 4).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ContextRulesEditor } from './ContextRulesEditor'
import { useContextRulesStore } from '../../store/contextRulesStore'
import type { ContextRule } from '../../types/api'

vi.mock('../../store/contextRulesStore')

const mockStore = vi.mocked(useContextRulesStore)

const makeRule = (overrides: Partial<ContextRule> = {}): ContextRule => ({
  id: 'rule-1',
  name: 'Lieu → Région',
  enabled: true,
  priority: 1,
  conditionOperator: 'OR',
  conditions: [{ entityType: 'location' }],
  suggestedTypes: ['location'],
  createdAt: '2026-03-22T00:00:00Z',
  updatedAt: '2026-03-22T00:00:00Z',
  ...overrides,
})

const makeStoreMock = (rules: ContextRule[]) => ({
  rules,
  isLoading: false,
  error: null,
  loadRules: vi.fn(),
  createRule: vi.fn(),
  updateRule: vi.fn(),
  toggleRule: vi.fn(),
  reorderRules: vi.fn(),
  deleteRule: vi.fn(),
})

describe('ContextRulesEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('affiche 2 regles avec nom et badge actif/inactif', () => {
    const r1 = makeRule({ id: 'rule-1', name: 'Lieu → Région', enabled: true, priority: 1 })
    const r2 = makeRule({ id: 'rule-2', name: 'Personnage → Objet', enabled: false, priority: 2 })
    mockStore.mockReturnValue(makeStoreMock([r1, r2]) as ReturnType<typeof useContextRulesStore>)

    render(<ContextRulesEditor />)

    expect(screen.getByText('Lieu → Région')).toBeInTheDocument()
    expect(screen.getByText('Personnage → Objet')).toBeInTheDocument()
    // badge actif
    const badges = screen.getAllByTestId('rule-badge')
    expect(badges[0]).toHaveTextContent(/actif/i)
    expect(badges[1]).toHaveTextContent(/inactif/i)
    // priorité affichée
    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.getByText('#2')).toBeInTheDocument()
  })

  it('clic toggle switch → toggleRule(id) appelé', async () => {
    const user = userEvent.setup()
    const toggleRule = vi.fn()
    const rule = makeRule()
    mockStore.mockReturnValue({
      ...makeStoreMock([rule]),
      toggleRule,
    } as ReturnType<typeof useContextRulesStore>)

    render(<ContextRulesEditor />)
    await user.click(screen.getByRole('button', { name: /activer\/d.sactiver lieu/i }))

    expect(toggleRule).toHaveBeenCalledWith('rule-1')
  })

  it('clic Supprimer → deleteRule(id) appelé', async () => {
    const user = userEvent.setup()
    const deleteRule = vi.fn()
    const rule = makeRule()
    mockStore.mockReturnValue({
      ...makeStoreMock([rule]),
      deleteRule,
    } as ReturnType<typeof useContextRulesStore>)

    render(<ContextRulesEditor />)
    await user.click(screen.getByRole('button', { name: /supprimer lieu/i }))

    expect(deleteRule).toHaveBeenCalledWith('rule-1')
  })

  it('clic bouton haut (index 1) → reorderRules avec les deux regles swappees', async () => {
    const user = userEvent.setup()
    const reorderRules = vi.fn()
    const r1 = makeRule({ id: 'rule-1', priority: 1 })
    const r2 = makeRule({ id: 'rule-2', name: 'Personnage → Objet', priority: 2 })
    mockStore.mockReturnValue({
      ...makeStoreMock([r1, r2]),
      reorderRules,
    } as ReturnType<typeof useContextRulesStore>)

    render(<ContextRulesEditor />)
    const upButtons = screen.getAllByRole('button', { name: /monter/i })
    await user.click(upButtons[1]) // bouton ↑ activé de la règle à index 1

    expect(reorderRules).toHaveBeenCalledWith(['rule-2', 'rule-1'])
  })

  it('clic Ajouter regle → formulaire visible', async () => {
    const user = userEvent.setup()
    mockStore.mockReturnValue(makeStoreMock([]) as ReturnType<typeof useContextRulesStore>)

    render(<ContextRulesEditor />)
    await user.click(screen.getByRole('button', { name: /ajouter r.gle/i }))

    expect(screen.getByRole('textbox', { name: /nom de la r.gle/i })).toBeInTheDocument()
  })

  it('soumission formulaire valide → createRule appelé avec bonnes valeurs', async () => {
    const user = userEvent.setup()
    const createRule = vi.fn()
    mockStore.mockReturnValue({
      ...makeStoreMock([]),
      createRule,
    } as ReturnType<typeof useContextRulesStore>)

    render(<ContextRulesEditor />)
    await user.click(screen.getByRole('button', { name: /ajouter r.gle/i }))

    await user.type(screen.getByRole('textbox', { name: /nom de la r.gle/i }), 'Ma règle')
    // La première condition a son sélecteur de type
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'location')
    // Sélection suggestedTypes (checkbox "Personnage")
    await user.click(screen.getByRole('checkbox', { name: /personnage/i }))

    await user.click(screen.getByRole('button', { name: /sauvegarder/i }))

    expect(createRule).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Ma règle',
        conditions: expect.arrayContaining([expect.objectContaining({ entityType: 'location' })]),
        suggestedTypes: expect.arrayContaining(['character']),
      })
    )
  })

  it('formulaire invalide (nom vide) → createRule non appelé', async () => {
    const user = userEvent.setup()
    const createRule = vi.fn()
    mockStore.mockReturnValue({
      ...makeStoreMock([]),
      createRule,
    } as ReturnType<typeof useContextRulesStore>)

    render(<ContextRulesEditor />)
    await user.click(screen.getByRole('button', { name: /ajouter r.gle/i }))
    await user.click(screen.getByRole('button', { name: /sauvegarder/i }))

    expect(createRule).not.toHaveBeenCalled()
  })

  it('formulaire invalide (aucun suggestedType) → createRule non appelé', async () => {
    const user = userEvent.setup()
    const createRule = vi.fn()
    mockStore.mockReturnValue({
      ...makeStoreMock([]),
      createRule,
    } as ReturnType<typeof useContextRulesStore>)

    render(<ContextRulesEditor />)
    await user.click(screen.getByRole('button', { name: /ajouter r.gle/i }))
    await user.type(screen.getByRole('textbox', { name: /nom de la r.gle/i }), 'Ma règle')
    // Aucune checkbox cochée
    await user.click(screen.getByRole('button', { name: /sauvegarder/i }))

    expect(createRule).not.toHaveBeenCalled()
  })

  it('formulaire multi-conditions : clic + Condition ajoute une condition ET / OU', async () => {
    const user = userEvent.setup()
    mockStore.mockReturnValue(makeStoreMock([]) as ReturnType<typeof useContextRulesStore>)

    render(<ContextRulesEditor />)
    await user.click(screen.getByRole('button', { name: /ajouter r.gle/i }))

    // Par défaut 1 condition
    expect(screen.getAllByRole('combobox')).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: /\+ condition/i }))

    // Maintenant 2 conditions + sélecteur d'opérateur
    expect(screen.getAllByRole('combobox')).toHaveLength(3) // 2 types + opérateur
    expect(screen.getByRole('combobox', { name: /op.rateur de conditions/i })).toBeInTheDocument()
  })
})
