/**
 * Story 9.4 — entrée/sortie preview ; délègue au mode playthrough VN.
 */
import { useCallback } from 'react'
import { useScenarioPlaythrough } from './useScenarioPlaythrough'

export interface UseDialoguePreviewResult {
  enterDialoguePreview: () => void
  exitDialoguePreview: () => void
}

/**
 * Prépare l'état simulé initial et ouvre le mode playthrough Visual Novel.
 */
export function useDialoguePreview(): UseDialoguePreviewResult {
  const { enterScenarioPlaythrough, exitScenarioPlaythrough } = useScenarioPlaythrough()

  return {
    enterDialoguePreview: enterScenarioPlaythrough,
    exitDialoguePreview: exitScenarioPlaythrough,
  }
}
