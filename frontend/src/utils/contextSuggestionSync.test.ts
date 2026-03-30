import { describe, it, expect } from 'vitest'
import { suggestionRefreshAfterSceneChange } from './contextSuggestionSync'
import type { SceneSelection } from '../types/generation'

const empty: SceneSelection = {
  characterA: null,
  characterB: null,
  sceneRegion: null,
  subLocation: null,
}

describe('suggestionRefreshAfterSceneChange', () => {
  it('noop si rien ne change', () => {
    const s: SceneSelection = { ...empty, characterA: 'Alice' }
    expect(suggestionRefreshAfterSceneChange(s, s)).toEqual({ kind: 'noop' })
  })

  it('🎲 personnage A → fetch character', () => {
    const prev = { ...empty }
    const next = { ...empty, characterA: 'Bob' }
    expect(suggestionRefreshAfterSceneChange(next, prev)).toEqual({
      kind: 'fetch',
      triggerType: 'character',
      triggerName: 'Bob',
    })
  })

  it('🎲 sous-lieu → fetch location (prioritaire sur région)', () => {
    const prev = { ...empty, sceneRegion: 'R1', subLocation: null }
    const next = { ...empty, sceneRegion: 'R1', subLocation: 'Salle X' }
    expect(suggestionRefreshAfterSceneChange(next, prev)).toEqual({
      kind: 'fetch',
      triggerType: 'location',
      triggerName: 'Salle X',
    })
  })

  it('🎲 région seule → fetch location', () => {
    const prev = { ...empty }
    const next = { ...empty, sceneRegion: 'Escelion' }
    expect(suggestionRefreshAfterSceneChange(next, prev)).toEqual({
      kind: 'fetch',
      triggerType: 'location',
      triggerName: 'Escelion',
    })
  })

  it('retire sous-lieu mais garde région → fetch location région', () => {
    const prev = { ...empty, sceneRegion: 'R1', subLocation: 'S1' }
    const next = { ...empty, sceneRegion: 'R1', subLocation: null }
    expect(suggestionRefreshAfterSceneChange(next, prev)).toEqual({
      kind: 'fetch',
      triggerType: 'location',
      triggerName: 'R1',
    })
  })

  it('efface tout → clear', () => {
    const prev = { ...empty, characterA: 'A', sceneRegion: 'R' }
    const next = { ...empty }
    expect(suggestionRefreshAfterSceneChange(next, prev)).toEqual({ kind: 'clear' })
  })
})
