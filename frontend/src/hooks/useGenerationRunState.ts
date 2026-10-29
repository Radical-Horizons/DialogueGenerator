/**
 * État « un run de génération est en cours » — écran 2a.
 *
 * Un seul endroit décide de ce que veut dire « en cours », parce que trois zones
 * de l'écran doivent basculer ensemble : la colonne GDD se verrouille, le brief
 * se range, le header affiche le compteur. Sans définition partagée, elles
 * divergent au premier changement de logique de streaming.
 */
import { useEffect, useState } from 'react'
import { useGenerationStore } from '../store/generationStore'

/**
 * Vrai tant que l'appel LLM peut encore produire du texte (interruption comprise).
 *
 * Pour les composants qui ne lisent pas déjà le store. `GenerationPanel`, lui, se sert
 * de ses propres valeurs déstructurées : les mocks qui remplacent `useGenerationStore`
 * par un `mockReturnValue` renvoient l'objet store entier quel que soit le sélecteur,
 * donc un sélecteur y serait inopérant.
 *
 * `=== true` pour la même raison : sous ces mocks, la valeur lue est un objet — sans
 * la coercition, l'écran basculerait en « génération en cours » dans des tests qui
 * n'en font pas. Même garde que `gddCatalogLoading` dans `GenerationPanel`.
 */
export function useGenerationRunActive(): boolean {
  const isGenerating = useGenerationStore((s) => s.isGenerating) === true
  const isInterrupting = useGenerationStore((s) => s.isInterrupting) === true
  return isGenerating || isInterrupting
}

/** Formate une durée en `MM:SS` (compteur du header 2a). */
export function formatRunElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/**
 * Durée écoulée du run courant, rafraîchie chaque seconde.
 * `null` hors run — le header n'affiche alors rien.
 */
export function useGenerationElapsed(): string | null {
  const startedAt = useGenerationStore((s) => s.generationStartedAt)
  const isActive = useGenerationRunActive()
  const [elapsed, setElapsed] = useState<string | null>(null)

  useEffect(() => {
    if (!isActive || startedAt == null) {
      setElapsed(null)
      return
    }
    const tick = () => setElapsed(formatRunElapsed(Date.now() - startedAt))
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [isActive, startedAt])

  return elapsed
}
