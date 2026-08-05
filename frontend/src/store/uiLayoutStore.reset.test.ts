/**
 * Étanchéité des états d'écran (refonte 2026).
 *
 * Les écrans 2a–2e sont des **états** du même arbre DOM, pas des pages. Le risque
 * propre à ce choix est qu'un état fuite dans un autre : rester en mode écriture
 * après une génération, garder un inspecteur ouvert après avoir quitté le graphe.
 * Ces tests fixent le retour à l'état de repos.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useUiLayoutStore } from './uiLayoutStore'
import { useGenerationOptionsStore } from './generationOptionsStore'
import type { GenerateUnityDialogueRequest } from '../types/api'

describe('étanchéité des états d’écran', () => {
  beforeEach(() => {
    useUiLayoutStore.setState({ inspectorTab: 'node', writingMode: false })
    useGenerationOptionsStore.setState({
      optionCount: 1,
      slots: [],
      lastRequest: null,
      keptIndex: null,
    })
  })

  it('mode écriture et inspecteur sont indépendants : l’un ne force pas l’autre', () => {
    useUiLayoutStore.getState().setWritingMode(true)
    expect(useUiLayoutStore.getState().inspectorTab).toBe('node')

    useUiLayoutStore.getState().toggleInspectorTab('cost')
    expect(useUiLayoutStore.getState().writingMode).toBe(true)
  })

  it('sortir du mode écriture ne laisse aucun résidu dans le store', () => {
    useUiLayoutStore.getState().setWritingMode(true)
    useUiLayoutStore.getState().setWritingMode(false)
    expect(useUiLayoutStore.getState().writingMode).toBe(false)
  })

  it('clearRun ramène la comparaison à l’état de repos', () => {
    const request = { user_instructions: 'x' } as GenerateUnityDialogueRequest
    useGenerationOptionsStore.getState().startRun(3, request)
    useGenerationOptionsStore.getState().setKeptIndex(1)
    expect(useGenerationOptionsStore.getState().slots).toHaveLength(3)

    useGenerationOptionsStore.getState().clearRun()
    const state = useGenerationOptionsStore.getState()
    expect(state.slots).toEqual([])
    expect(state.keptIndex).toBeNull()
    // Le réglage utilisateur ×N survit au run : c'est une préférence, pas un état de run.
    expect(state.optionCount).toBe(1)
  })

  it('un run à une seule option ne déclenche pas la comparaison', () => {
    const request = { user_instructions: 'x' } as GenerateUnityDialogueRequest
    useGenerationOptionsStore.getState().startRun(1, request)
    // `GenerationOptionsComparison` et le rail 2b se gardent sur `slots.length >= 2`.
    expect(useGenerationOptionsStore.getState().slots.length).toBeLessThan(2)
  })
})
