/**
 * Section et dialogue ouverts vivent dans l'adresse du Dashboard, pour que F5 y revienne.
 *
 * Le sens unique est voulu : l'adresse n'est lue qu'au démarrage, ensuite le store et
 * l'état du Dashboard font foi et l'adresse les recopie, sans ajouter d'entrée
 * d'historique. La page de génération garde l'adresse nue `/`.
 */
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { SECTION_URL_PARAM, type CenterPanelTab } from '../store/uiLayoutStore'

const DIALOGUE_URL_PARAM = 'dialogue'

export function readDialogueFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get(DIALOGUE_URL_PARAM)
}

export function useDashboardUrlMirror(section: CenterPanelTab, dialogue: string | null): void {
  const { search } = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const current = new URLSearchParams(search)
    const next = new URLSearchParams(search)
    if (section === 'generation') next.delete(SECTION_URL_PARAM)
    else next.set(SECTION_URL_PARAM, section)
    if (dialogue) next.set(DIALOGUE_URL_PARAM, dialogue)
    else next.delete(DIALOGUE_URL_PARAM)

    if (next.toString() !== current.toString()) {
      navigate({ search: next.toString() }, { replace: true })
    }
  }, [section, dialogue, search, navigate])
}
