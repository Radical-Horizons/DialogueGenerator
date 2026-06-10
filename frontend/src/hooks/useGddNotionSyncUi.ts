/**
 * États async partagés pour le panneau sync GDD Notion (FR18).
 * Réutilisable par d'autres flux Notion similaires (pending / erreur / message).
 */
import { useCallback, useState } from 'react'

export type GddNotionUiPhase = 'idle' | 'loading' | 'success' | 'error'

/** Teinte de la bannière de fin de sync (succès strict, avertissement, erreur). */
export type GddNotionSyncOutcomeTone = 'success' | 'warning' | 'error'

/** Retour attendu par ``run`` : succès / échec, ou échec « doux » (ex. miroir en attente). */
export interface GddNotionSyncUiRunResult {
  success?: boolean
  message?: string
  ok?: boolean
  /** Si true avec success false : afficher avertissement sans traiter comme erreur bloquante. */
  softFailure?: boolean
}

export interface UseGddNotionSyncUiState {
  phase: GddNotionUiPhase
  userMessage: string | null
  /** Non nul dès qu’un message de fin de run est affiché ; effacé par ``resetMessage``. */
  outcomeTone: GddNotionSyncOutcomeTone | null
  run: (fn: () => Promise<GddNotionSyncUiRunResult>) => Promise<void>
  resetMessage: () => void
}

/**
 * Encapsule pending + message utilisateur pour actions Notion (test / sync).
 */
export function useGddNotionSyncUi(): UseGddNotionSyncUiState {
  const [phase, setPhase] = useState<GddNotionUiPhase>('idle')
  const [userMessage, setUserMessage] = useState<string | null>(null)
  const [outcomeTone, setOutcomeTone] = useState<GddNotionSyncOutcomeTone | null>(null)

  const run = useCallback(
    async (fn: () => Promise<GddNotionSyncUiRunResult>) => {
      setPhase('loading')
      setUserMessage(null)
      setOutcomeTone(null)
      try {
        const res = await fn()
        const okFlag = res.ok ?? res.success
        const msg = res.message ?? ''
        if (okFlag === false && res.softFailure) {
          setPhase('success')
          setOutcomeTone('warning')
          setUserMessage(msg || 'Sync terminée — une action est possible ci-dessous')
          return
        }
        if (okFlag === false) {
          setPhase('error')
          setOutcomeTone('error')
          setUserMessage(msg || 'Sync Notion échouée')
          return
        }
        setPhase('success')
        setOutcomeTone('success')
        setUserMessage(msg || 'Terminé')
      } catch (e) {
        setPhase('error')
        setOutcomeTone('error')
        const text =
          e instanceof Error ? e.message : 'Sync Notion échouée — erreur réseau ou serveur'
        setUserMessage(text.startsWith('Sync Notion') ? text : `Sync Notion échouée — ${text}`)
      }
    },
    [],
  )

  const resetMessage = useCallback(() => {
    setUserMessage(null)
    setOutcomeTone(null)
    setPhase('idle')
  }, [])

  return { phase, userMessage, outcomeTone, run, resetMessage }
}
