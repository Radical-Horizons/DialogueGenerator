/**
 * Onglet actif de la colonne d'entrée de génération.
 *
 * Sort l'état de la vue pour qu'il soit testable sans monter `GenerationPanel`,
 * et garantit l'invariant du mode écriture : ce mode masque la barre d'onglets,
 * donc y entrer depuis Flags ou Templates enfermerait l'utilisateur sur un
 * panneau qu'il ne peut plus quitter.
 */
import { useEffect, useState } from 'react'
import { useUiLayoutStore } from '../store/uiLayoutStore'

export const GENERATION_INPUT_TABS = [
  { id: 'brief', label: 'Brief' },
  { id: 'flags', label: 'Flags' },
  { id: 'templates', label: 'Templates' },
] as const

export type GenerationInputTabId = (typeof GENERATION_INPUT_TABS)[number]['id']

export const PRIMARY_INPUT_TAB: GenerationInputTabId = 'brief'

export interface UseGenerationInputTabReturn {
  activeTab: GenerationInputTabId
  setActiveTab: (tab: GenerationInputTabId) => void
  /** La barre est masquée en mode écriture : il ne reste que le brief. */
  tabsVisible: boolean
}

export function useGenerationInputTab(): UseGenerationInputTabReturn {
  const writingMode = useUiLayoutStore((s) => s.writingMode)
  const [activeTab, setActiveTab] = useState<GenerationInputTabId>(PRIMARY_INPUT_TAB)

  useEffect(() => {
    if (writingMode) setActiveTab(PRIMARY_INPUT_TAB)
  }, [writingMode])

  return { activeTab, setActiveTab, tabsVisible: !writingMode }
}
