/**
 * Store Zustand pour gérer les règles de sélection de contexte (Story 3.4).
 */
import { create } from 'zustand'
import * as contextAPI from '../api/context'
import type { ContextRule, CreateRuleRequest, UpdateRuleRequest } from '../types/api'

interface ContextRulesState {
  rules: ContextRule[]
  selectedDialogueType: string
  source: 'specific' | 'fallback_global'
  isLoading: boolean
  error: string | null

  loadRules: () => Promise<void>
  loadRulesByDialogueType: (dialogueType: string) => Promise<void>
  saveRulesByDialogueType: (dialogueType: string, rules: CreateRuleRequest[]) => Promise<void>
  createRule: (request: CreateRuleRequest) => Promise<void>
  updateRule: (ruleId: string, request: UpdateRuleRequest) => Promise<void>
  toggleRule: (ruleId: string) => Promise<void>
  /** Ré-ordonne les règles selon l'ordre fourni (liste d'IDs) en assignant priority=index+1. */
  reorderRules: (orderedIds: string[]) => Promise<void>
  deleteRule: (ruleId: string) => Promise<void>
}

export const useContextRulesStore = create<ContextRulesState>((set, get) => ({
  rules: [],
  selectedDialogueType: 'salutation',
  source: 'fallback_global',
  isLoading: false,
  error: null,

  loadRules: async () => {
    set({ isLoading: true, error: null })
    try {
      const { rules } = await contextAPI.listRules()
      set({ rules, source: 'specific', isLoading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur de chargement'
      set({ isLoading: false, error: message })
    }
  },

  loadRulesByDialogueType: async (dialogueType: string) => {
    set({ isLoading: true, error: null, selectedDialogueType: dialogueType })
    try {
      const response = await contextAPI.getRulesByDialogueType(dialogueType)
      set({ rules: response.rules, source: response.source, isLoading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur de chargement des règles'
      set({ isLoading: false, error: message })
    }
  },

  saveRulesByDialogueType: async (dialogueType: string, rules: CreateRuleRequest[]) => {
    set({ isLoading: true, error: null })
    try {
      const response = await contextAPI.putRulesByDialogueType(dialogueType, rules)
      set({
        selectedDialogueType: dialogueType,
        rules: response.rules,
        source: response.source,
        isLoading: false,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur de sauvegarde des règles'
      set({ isLoading: false, error: message })
    }
  },

  createRule: async (request: CreateRuleRequest) => {
    try {
      const created = await contextAPI.createRule(request)
      set(state => ({ rules: [...state.rules, created] }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la création'
      set({ error: message })
    }
  },

  updateRule: async (ruleId: string, request: UpdateRuleRequest) => {
    try {
      const updated = await contextAPI.updateRule(ruleId, request)
      set(state => ({
        rules: state.rules.map(r => (r.id === ruleId ? updated : r)),
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la mise à jour'
      set({ error: message })
    }
  },

  toggleRule: async (ruleId: string) => {
    const rule = get().rules.find(r => r.id === ruleId)
    if (!rule) return
    try {
      const updated = await contextAPI.updateRule(ruleId, { enabled: !rule.enabled })
      set(state => ({
        rules: state.rules.map(r => (r.id === ruleId ? updated : r)),
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors du toggle'
      set({ error: message })
    }
  },

  reorderRules: async (orderedIds: string[]) => {
    const { rules } = get()
    // Optimistic update: réordonne localement immédiatement
    const idToRule = new Map(rules.map(r => [r.id, r]))
    const nextRules = orderedIds.map(id => idToRule.get(id)).filter((r): r is ContextRule => r != null)
    set({ rules: nextRules })

    try {
      // Persiste le nouvel ordre (priority = position 1-based)
      await Promise.all(
        orderedIds.map((id, idx) => contextAPI.updateRule(id, { priority: idx + 1 }))
      )
    } catch (err) {
      // Rollback : restaure l'ordre original si l'API échoue
      set({ rules, error: err instanceof Error ? err.message : 'Erreur lors du réordonnancement' })
    }
  },

  deleteRule: async (ruleId: string) => {
    try {
      await contextAPI.deleteRule(ruleId)
      set(state => ({ rules: state.rules.filter(r => r.id !== ruleId) }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la suppression'
      set({ error: message })
    }
  },
}))
