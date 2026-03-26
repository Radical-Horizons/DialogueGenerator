/**
 * États async partagés pour le panneau sync GDD Notion (FR18).
 * Réutilisable par d'autres flux Notion similaires (pending / erreur / message).
 */
import { useCallback, useState } from 'react'

export type GddNotionUiPhase = 'idle' | 'loading' | 'success' | 'error'

export interface UseGddNotionSyncUiState {
  phase: GddNotionUiPhase
  userMessage: string | null
  run: (fn: () => Promise<{ success?: boolean; message?: string; ok?: boolean }>) => Promise<void>
  resetMessage: () => void
}

/**
 * Encapsule pending + message utilisateur pour actions Notion (test / sync).
 */
export function useGddNotionSyncUi(): UseGddNotionSyncUiState {
  const [phase, setPhase] = useState<GddNotionUiPhase>('idle')
  const [userMessage, setUserMessage] = useState<string | null>(null)

  const run = useCallback(
    async (fn: () => Promise<{ success?: boolean; message?: string; ok?: boolean }>) => {
      setPhase('loading')
      setUserMessage(null)
      try {
        const res = await fn()
        const okFlag = res.ok ?? res.success
        const msg = res.message ?? ''
        if (okFlag === false) {
          setPhase('error')
          setUserMessage(msg || 'Sync Notion échouée')
          return
        }
        setPhase('success')
        setUserMessage(msg || 'Terminé')
      } catch (e) {
        setPhase('error')
        const text =
          e instanceof Error ? e.message : 'Sync Notion échouée — erreur réseau ou serveur'
        setUserMessage(text.startsWith('Sync Notion') ? text : `Sync Notion échouée — ${text}`)
      }
    },
    [],
  )

  const resetMessage = useCallback(() => {
    setUserMessage(null)
    setPhase('idle')
  }, [])

  return { phase, userMessage, run, resetMessage }
}
