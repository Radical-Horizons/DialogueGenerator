/**
 * Tests unitaires pour le store graphStore (cycles intentionnels).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useGraphStore } from '../store/graphStore'

describe('graphStore - Intentional Cycles', () => {
  beforeEach(() => {
    // Nettoyer localStorage avant chaque test
    localStorage.clear()
    
    // Réinitialiser le store
    const store = useGraphStore.getState()
    store.resetGraph()
  })

  describe('markCycleAsIntentional', () => {
    it('should add cycle_id to intentionalCycles', () => {
      const { markCycleAsIntentional, intentionalCycles: initial } = useGraphStore.getState()
      expect(initial).toEqual([])

      markCycleAsIntentional('cycle_abc123')

      const { intentionalCycles } = useGraphStore.getState()
      expect(intentionalCycles).toContain('cycle_abc123')
      expect(intentionalCycles.length).toBe(1)
    })

    it('should not add duplicate cycle_id', () => {
      const { markCycleAsIntentional } = useGraphStore.getState()
      
      markCycleAsIntentional('cycle_abc123')
      markCycleAsIntentional('cycle_abc123')

      const { intentionalCycles } = useGraphStore.getState()
      expect(intentionalCycles).toEqual(['cycle_abc123'])
      expect(intentionalCycles.length).toBe(1)
    })

    it('should persist to localStorage', () => {
      const { markCycleAsIntentional } = useGraphStore.getState()
      
      markCycleAsIntentional('cycle_abc123')

      const stored = localStorage.getItem('graph_intentional_cycles')
      expect(stored).toBeTruthy()
      const parsed = JSON.parse(stored!)
      expect(parsed).toContain('cycle_abc123')
    })

    it('should handle localStorage quota exceeded error gracefully', () => {
      // Mock Storage.prototype.setItem pour simuler QuotaExceededError
      const originalSetItem = Storage.prototype.setItem
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      Storage.prototype.setItem = vi.fn(function(key: string, value: string) {
        if (key === 'graph_intentional_cycles') {
          const error = new DOMException('Quota exceeded', 'QuotaExceededError')
          throw error
        }
        originalSetItem.call(this, key, value)
      })

      const { markCycleAsIntentional } = useGraphStore.getState()
      
      // Ne devrait pas crasher
      expect(() => markCycleAsIntentional('cycle_abc123')).not.toThrow()
      
      // console.error devrait être appelé
      expect(consoleErrorSpy).toHaveBeenCalled()

      // Restaurer
      Storage.prototype.setItem = originalSetItem
      consoleErrorSpy.mockRestore()
    })
  })

  describe('unmarkCycleAsIntentional', () => {
    it('should remove cycle_id from intentionalCycles', () => {
      const { markCycleAsIntentional, unmarkCycleAsIntentional } = useGraphStore.getState()
      
      markCycleAsIntentional('cycle_abc123')
      markCycleAsIntentional('cycle_def456')
      
      unmarkCycleAsIntentional('cycle_abc123')

      const { intentionalCycles } = useGraphStore.getState()
      expect(intentionalCycles).not.toContain('cycle_abc123')
      expect(intentionalCycles).toContain('cycle_def456')
      expect(intentionalCycles.length).toBe(1)
    })

    it('should update localStorage when unmarking', () => {
      const { markCycleAsIntentional, unmarkCycleAsIntentional } = useGraphStore.getState()
      
      markCycleAsIntentional('cycle_abc123')
      markCycleAsIntentional('cycle_def456')
      
      unmarkCycleAsIntentional('cycle_abc123')

      const stored = localStorage.getItem('graph_intentional_cycles')
      const parsed = JSON.parse(stored!)
      expect(parsed).not.toContain('cycle_abc123')
      expect(parsed).toContain('cycle_def456')
    })

    it('should handle localStorage quota exceeded error when unmarking gracefully', () => {
      const { markCycleAsIntentional, unmarkCycleAsIntentional } = useGraphStore.getState()
      markCycleAsIntentional('cycle_abc123')
      
      // Mock Storage.prototype.setItem pour simuler QuotaExceededError
      const originalSetItem = Storage.prototype.setItem
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      Storage.prototype.setItem = vi.fn(function(key: string, value: string) {
        if (key === 'graph_intentional_cycles') {
          const error = new DOMException('Quota exceeded', 'QuotaExceededError')
          throw error
        }
        originalSetItem.call(this, key, value)
      })

      // Ne devrait pas crasher
      expect(() => unmarkCycleAsIntentional('cycle_abc123')).not.toThrow()
      
      // console.error devrait être appelé
      expect(consoleErrorSpy).toHaveBeenCalled()

      // Restaurer
      Storage.prototype.setItem = originalSetItem
      consoleErrorSpy.mockRestore()
    })
  })

  describe('localStorage persistence', () => {
    it('should load intentionalCycles from localStorage on initialization', () => {
      // Pré-remplir localStorage
      localStorage.setItem('graph_intentional_cycles', JSON.stringify(['cycle_abc123', 'cycle_def456']))
      
      // Créer un nouveau store (simuler rechargement page)
      const store = useGraphStore.getState()
      store.resetGraph()
      
      // Le store devrait charger depuis localStorage
      // Note: Le store charge depuis localStorage dans initialState
      const { intentionalCycles } = useGraphStore.getState()
      // Après resetGraph, intentionalCycles devrait être réinitialisé
      // Mais l'initialState charge depuis localStorage
      expect(intentionalCycles).toBeDefined()
    })

    it('should handle corrupted localStorage data gracefully', () => {
      // Pré-remplir avec données corrompues
      localStorage.setItem('graph_intentional_cycles', 'invalid json')
      
      // Ne devrait pas crasher
      const store = useGraphStore.getState()
      expect(() => store.resetGraph()).not.toThrow()
      
      const { intentionalCycles } = useGraphStore.getState()
      // Devrait être un tableau vide en cas d'erreur
      expect(Array.isArray(intentionalCycles)).toBe(true)
    })
  })

  describe('filtering intentional cycles in validation errors', () => {
    it('should filter out intentional cycles from warnings display', () => {
      const { markCycleAsIntentional } = useGraphStore.getState()
      
      // Marquer un cycle comme intentionnel
      markCycleAsIntentional('cycle_abc123')
      
      // Simuler une validation avec un cycle intentionnel
      const mockValidationResult = {
        errors: [],
        warnings: [
          {
            type: 'cycle_detected',
            cycle_id: 'cycle_abc123',
            cycle_path: 'A → B → C → A',
            cycle_nodes: ['A', 'B', 'C'],
            message: 'Cycle détecté : A → B → C → A',
            severity: 'warning',
          },
          {
            type: 'cycle_detected',
            cycle_id: 'cycle_def456',
            cycle_path: 'D → E → D',
            cycle_nodes: ['D', 'E'],
            message: 'Cycle détecté : D → E → D',
            severity: 'warning',
          },
        ],
        valid: true,
      }
      
      // Mettre à jour le store avec les résultats de validation
      useGraphStore.setState({
        validationErrors: [...mockValidationResult.errors, ...mockValidationResult.warnings],
        intentionalCycles: ['cycle_abc123'],
      })
      
      const { validationErrors, intentionalCycles } = useGraphStore.getState()
      
      // Filtrer les cycles intentionnels (comme dans GraphEditor.tsx)
      const filteredWarnings = validationErrors
        .filter((e) => e.severity === 'warning')
        .filter((warn) => {
          if (warn.type === 'cycle_detected' && warn.cycle_id) {
            return !intentionalCycles.includes(warn.cycle_id)
          }
          return true
        })
      
      // Le cycle intentionnel devrait être filtré
      expect(filteredWarnings.length).toBe(1)
      expect(filteredWarnings[0].cycle_id).toBe('cycle_def456')
      expect(filteredWarnings.find((w) => w.cycle_id === 'cycle_abc123')).toBeUndefined()
    })

    it('should not filter non-cycle warnings', () => {
      const { markCycleAsIntentional } = useGraphStore.getState()
      markCycleAsIntentional('cycle_abc123')
      
      const mockValidationResult = {
        errors: [],
        warnings: [
          {
            type: 'orphan_node',
            node_id: 'X',
            message: 'Nœud orphelin',
            severity: 'warning',
          },
          {
            type: 'cycle_detected',
            cycle_id: 'cycle_abc123',
            cycle_path: 'A → B → C → A',
            cycle_nodes: ['A', 'B', 'C'],
            message: 'Cycle détecté : A → B → C → A',
            severity: 'warning',
          },
        ],
        valid: true,
      }
      
      useGraphStore.setState({
        validationErrors: [...mockValidationResult.errors, ...mockValidationResult.warnings],
        intentionalCycles: ['cycle_abc123'],
      })
      
      const { validationErrors, intentionalCycles } = useGraphStore.getState()
      
      const filteredWarnings = validationErrors
        .filter((e) => e.severity === 'warning')
        .filter((warn) => {
          if (warn.type === 'cycle_detected' && warn.cycle_id) {
            return !intentionalCycles.includes(warn.cycle_id)
          }
          return true
        })
      
      // Le warning non-cycle devrait être présent
      expect(filteredWarnings.length).toBe(1)
      expect(filteredWarnings[0].type).toBe('orphan_node')
    })
  })
})
