/**
 * Dérive le trigger API /suggestions après un changement de sélection de scène (🎲, combobox, etc.).
 * Hors du chemin ContextSelector — la synchro scène → contextStore doit rafraîchir les suggestions pareil.
 */
import type { SceneSelection } from '../types/generation'

export type SuggestionRefreshAction =
  | { kind: 'fetch'; triggerType: 'character' | 'location'; triggerName: string }
  | { kind: 'clear' }
  | { kind: 'noop' }

/**
 * Compare la sélection de scène courante à la précédente et indique comment mettre à jour les suggestions.
 *
 * @param current - État après le changement
 * @param previous - État avant le changement (ex. prevSelection.current)
 */
export function suggestionRefreshAfterSceneChange(
  current: SceneSelection,
  previous: SceneSelection
): SuggestionRefreshAction {
  const unchanged =
    current.characterA === previous.characterA &&
    current.characterB === previous.characterB &&
    current.sceneRegion === previous.sceneRegion &&
    current.subLocation === previous.subLocation
  if (unchanged) {
    return { kind: 'noop' }
  }

  if (current.subLocation !== previous.subLocation) {
    if (current.subLocation) {
      return { kind: 'fetch', triggerType: 'location', triggerName: current.subLocation }
    }
    if (current.sceneRegion) {
      return { kind: 'fetch', triggerType: 'location', triggerName: current.sceneRegion }
    }
    return fallbackAfterPartialClear(current)
  }

  if (current.sceneRegion !== previous.sceneRegion) {
    if (current.sceneRegion) {
      return { kind: 'fetch', triggerType: 'location', triggerName: current.sceneRegion }
    }
    return fallbackAfterPartialClear(current)
  }

  if (current.characterA !== previous.characterA) {
    if (current.characterA) {
      return { kind: 'fetch', triggerType: 'character', triggerName: current.characterA }
    }
    return fallbackAfterPartialClear(current)
  }

  if (current.characterB !== previous.characterB) {
    if (current.characterB) {
      return { kind: 'fetch', triggerType: 'character', triggerName: current.characterB }
    }
    return fallbackAfterPartialClear(current)
  }

  return { kind: 'noop' }
}

function fallbackAfterPartialClear(current: SceneSelection): SuggestionRefreshAction {
  if (current.characterA) {
    return { kind: 'fetch', triggerType: 'character', triggerName: current.characterA }
  }
  if (current.characterB) {
    return { kind: 'fetch', triggerType: 'character', triggerName: current.characterB }
  }
  if (current.subLocation) {
    return { kind: 'fetch', triggerType: 'location', triggerName: current.subLocation }
  }
  if (current.sceneRegion) {
    return { kind: 'fetch', triggerType: 'location', triggerName: current.sceneRegion }
  }
  return { kind: 'clear' }
}
