/**
 * Tests du store contextRulesStore (Story 3.4).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import * as contextAPI from '../api/context'
import { useContextRulesStore } from './contextRulesStore'
import type { ContextRule, CreateRuleRequest, RuleCondition } from '../types/api'

const makeRule = (overrides: Partial<ContextRule> = {}): ContextRule => ({
  id: 'rule-1',
  name: 'Test rule',
  enabled: true,
  priority: 1,
  conditionOperator: 'OR',
  conditions: [{ entityType: 'location' }],
  suggestedTypes: ['character'],
  createdAt: '2026-03-22T00:00:00Z',
  updatedAt: '2026-03-22T00:00:00Z',
  ...overrides,
})

describe('contextRulesStore', () => {
  beforeEach(() => {
    useContextRulesStore.setState({ rules: [], isLoading: false, error: null })
    vi.restoreAllMocks()
  })

  describe('loadRules', () => {
    it('met a jour rules depuis API', async () => {
      const rules = [makeRule(), makeRule({ id: 'rule-2', priority: 2 })]
      vi.spyOn(contextAPI, 'listRules').mockResolvedValue({ rules, total: 2 })

      const { result } = renderHook(() => useContextRulesStore())
      await act(async () => { await result.current.loadRules() })

      expect(result.current.rules).toEqual(rules)
      expect(result.current.isLoading).toBe(false)
    })

    it('positionne error si API echoue', async () => {
      vi.spyOn(contextAPI, 'listRules').mockRejectedValue(new Error('API error'))

      const { result } = renderHook(() => useContextRulesStore())
      await act(async () => { await result.current.loadRules() })

      expect(result.current.error).toBeTruthy()
      expect(result.current.rules).toEqual([])
    })
  })

  describe('createRule', () => {
    it('appelle POST et ajoute la règle au store', async () => {
      const created = makeRule()
      vi.spyOn(contextAPI, 'createRule').mockResolvedValue(created)

      const { result } = renderHook(() => useContextRulesStore())
      await act(async () => { await result.current.createRule({ name: 'Test', conditions: [{ entityType: 'location' }], suggestedTypes: ['character'] }) })

      expect(contextAPI.createRule).toHaveBeenCalledOnce()
      expect(result.current.rules).toContain(created)
    })
  })

  describe('toggleRule', () => {
    it('appelle PUT avec enabled inversé et met à jour le store', async () => {
      const rule = makeRule({ enabled: true })
      useContextRulesStore.setState({ rules: [rule] })
      const updated = { ...rule, enabled: false }
      vi.spyOn(contextAPI, 'updateRule').mockResolvedValue(updated)

      const { result } = renderHook(() => useContextRulesStore())
      await act(async () => { await result.current.toggleRule('rule-1') })

      expect(contextAPI.updateRule).toHaveBeenCalledWith('rule-1', { enabled: false })
      expect(result.current.rules[0].enabled).toBe(false)
    })

    it('ne touche pas les autres règles', async () => {
      const r1 = makeRule({ id: 'rule-1' })
      const r2 = makeRule({ id: 'rule-2', priority: 2 })
      useContextRulesStore.setState({ rules: [r1, r2] })
      vi.spyOn(contextAPI, 'updateRule').mockResolvedValue({ ...r1, enabled: false })

      const { result } = renderHook(() => useContextRulesStore())
      await act(async () => { await result.current.toggleRule('rule-1') })

      expect(result.current.rules.find(r => r.id === 'rule-2')).toEqual(r2)
    })
  })

  describe('reorderRules', () => {
    it('appelle PUT pour chaque règle avec priority recalculée et met à jour le store', async () => {
      const r1 = makeRule({ id: 'rule-1', priority: 1 })
      const r2 = makeRule({ id: 'rule-2', priority: 2 })
      useContextRulesStore.setState({ rules: [r1, r2] })
      vi.spyOn(contextAPI, 'updateRule').mockImplementation(async (id, req) =>
        ({ ...(id === 'rule-1' ? r1 : r2), priority: req.priority ?? 0 })
      )

      const { result } = renderHook(() => useContextRulesStore())
      // Swap: r2 avant r1
      await act(async () => { await result.current.reorderRules(['rule-2', 'rule-1']) })

      expect(contextAPI.updateRule).toHaveBeenCalledWith('rule-2', { priority: 1 })
      expect(contextAPI.updateRule).toHaveBeenCalledWith('rule-1', { priority: 2 })
    })

    it('update local optimiste avant résolution API', async () => {
      const r1 = makeRule({ id: 'rule-1', priority: 1 })
      const r2 = makeRule({ id: 'rule-2', priority: 2 })
      useContextRulesStore.setState({ rules: [r1, r2] })

      let capturedLocalOrder: string[] = []
      vi.spyOn(contextAPI, 'updateRule').mockImplementation(async (id, req) => {
        // Capture l'état local au moment du premier appel
        if (capturedLocalOrder.length === 0) {
          capturedLocalOrder = useContextRulesStore.getState().rules.map(r => r.id)
        }
        return { ...(id === 'rule-1' ? r1 : r2), priority: req.priority ?? 0 }
      })

      const { result } = renderHook(() => useContextRulesStore())
      await act(async () => { await result.current.reorderRules(['rule-2', 'rule-1']) })

      // L'ordre local est déjà [r2, r1] avant la fin des appels API
      expect(capturedLocalOrder[0]).toBe('rule-2')
    })
  })

  describe('deleteRule', () => {
    it('appelle DELETE et retire la règle du store', async () => {
      useContextRulesStore.setState({ rules: [makeRule()] })
      vi.spyOn(contextAPI, 'deleteRule').mockResolvedValue()

      const { result } = renderHook(() => useContextRulesStore())
      await act(async () => { await result.current.deleteRule('rule-1') })

      expect(contextAPI.deleteRule).toHaveBeenCalledWith('rule-1')
      expect(result.current.rules).toEqual([])
    })
  })

  describe('gestion erreurs actions mutantes', () => {
    it('createRule echec API → error positionne, rules inchange', async () => {
      useContextRulesStore.setState({ rules: [] })
      vi.spyOn(contextAPI, 'createRule').mockRejectedValue(new Error('API down'))

      const { result } = renderHook(() => useContextRulesStore())
      await act(async () => { await result.current.createRule({ name: 'x', conditions: [{ entityType: 'location' }], suggestedTypes: ['character'] }) })

      expect(result.current.error).toBeTruthy()
      expect(result.current.rules).toEqual([])
    })

    it('toggleRule echec API → error positionne, rules inchange', async () => {
      const rule = makeRule()
      useContextRulesStore.setState({ rules: [rule] })
      vi.spyOn(contextAPI, 'updateRule').mockRejectedValue(new Error('API down'))

      const { result } = renderHook(() => useContextRulesStore())
      await act(async () => { await result.current.toggleRule('rule-1') })

      expect(result.current.error).toBeTruthy()
      expect(result.current.rules[0].enabled).toBe(true)
    })

    it('reorderRules echec API → rollback ordre original', async () => {
      const r1 = makeRule({ id: 'rule-1', priority: 1 })
      const r2 = makeRule({ id: 'rule-2', priority: 2 })
      useContextRulesStore.setState({ rules: [r1, r2] })
      vi.spyOn(contextAPI, 'updateRule').mockRejectedValue(new Error('API down'))

      const { result } = renderHook(() => useContextRulesStore())
      await act(async () => { await result.current.reorderRules(['rule-2', 'rule-1']) })

      expect(result.current.error).toBeTruthy()
      // Ordre restauré : r1 avant r2
      expect(result.current.rules.map(r => r.id)).toEqual(['rule-1', 'rule-2'])
    })

    it('deleteRule echec API → error positionne, règle toujours presente', async () => {
      useContextRulesStore.setState({ rules: [makeRule()] })
      vi.spyOn(contextAPI, 'deleteRule').mockRejectedValue(new Error('API down'))

      const { result } = renderHook(() => useContextRulesStore())
      await act(async () => { await result.current.deleteRule('rule-1') })

      expect(result.current.error).toBeTruthy()
      expect(result.current.rules).toHaveLength(1)
    })
  })
})
