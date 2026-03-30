/**
 * Store Zustand pour gérer la synchronisation Notion.
 */
import { create } from 'zustand'
import * as vocabularyAPI from '../api/vocabulary'

interface SyncState {
  // État de synchronisation
  lastSyncTime: string | null
  isSyncing: boolean
  error: string | null
  
  // Actions
  syncFromNotion: () => Promise<{
    success: boolean
    last_sync?: string | null
    error?: string
  }>
  clearError: () => void
}

export const useSyncStore = create<SyncState>()((set) => ({
  lastSyncTime: null,
  isSyncing: false,
  error: null,

  syncFromNotion: async () => {
    try {
      set({ isSyncing: true, error: null })
      
      // Synchroniser vocabulaire et guides en parallèle
      const [vocabResult, guidesResult] = await Promise.all([
        vocabularyAPI.syncVocabulary(),
        vocabularyAPI.syncNarrativeGuides(),
      ])

      if (vocabResult.success && guidesResult.success) {
        // Utiliser la valeur la plus récente entre les deux synchronisations
        const latestSync = vocabResult.last_sync && guidesResult.last_sync
          ? (vocabResult.last_sync > guidesResult.last_sync ? vocabResult.last_sync : guidesResult.last_sync)
          : (vocabResult.last_sync || guidesResult.last_sync)
        set({
          lastSyncTime: latestSync,
        })
        // Retourner le résultat pour permettre le rechargement dans les composants
        return { success: true, last_sync: latestSync }
      } else {
        const errors = [
          vocabResult.error,
          guidesResult.error,
        ]
          .filter(Boolean)
          .join('; ')
        set({ error: errors || 'Erreur lors de la synchronisation' })
        return { success: false, error: errors || 'Erreur lors de la synchronisation' }
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Erreur lors de la synchronisation depuis Notion'
      set({ error: errorMessage })
      console.error('Erreur lors de la synchronisation:', err)
      return { success: false, error: errorMessage }
    } finally {
      set({ isSyncing: false })
    }
  },

  clearError: () => {
    set({ error: null })
  },
}))
