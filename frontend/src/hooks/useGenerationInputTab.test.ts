/**
 * Invariant du mode écriture (matrice I/O — « Mode écriture hors Brief »).
 *
 * Le mode masque la barre d'onglets. Sans repli forcé sur le brief, y entrer depuis
 * Flags ou Templates affichait un panneau de réglage en pleine surface d'écriture,
 * sans aucun chemin de retour — le symptôme rapporté en revue UI (août 2026).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useGenerationInputTab } from './useGenerationInputTab'
import { useUiLayoutStore } from '../store/uiLayoutStore'

describe('useGenerationInputTab', () => {
  beforeEach(() => {
    useUiLayoutStore.setState({ writingMode: false })
  })

  it('démarre sur le brief, barre visible', () => {
    const { result } = renderHook(() => useGenerationInputTab())
    expect(result.current.activeTab).toBe('brief')
    expect(result.current.tabsVisible).toBe(true)
  })

  it('mémorise l’onglet sélectionné', () => {
    const { result } = renderHook(() => useGenerationInputTab())
    act(() => result.current.setActiveTab('templates'))
    expect(result.current.activeTab).toBe('templates')
  })

  it('ramène au brief en entrant en mode écriture depuis un autre onglet', () => {
    const { result } = renderHook(() => useGenerationInputTab())
    act(() => result.current.setActiveTab('flags'))
    expect(result.current.activeTab).toBe('flags')

    act(() => useUiLayoutStore.setState({ writingMode: true }))

    expect(result.current.activeTab).toBe('brief')
    expect(result.current.tabsVisible).toBe(false)
  })

  it('laisse rechoisir un onglet après la sortie du mode écriture', () => {
    const { result } = renderHook(() => useGenerationInputTab())
    act(() => useUiLayoutStore.setState({ writingMode: true }))
    act(() => useUiLayoutStore.setState({ writingMode: false }))

    expect(result.current.tabsVisible).toBe(true)
    act(() => result.current.setActiveTab('templates'))
    expect(result.current.activeTab).toBe('templates')
  })
})
