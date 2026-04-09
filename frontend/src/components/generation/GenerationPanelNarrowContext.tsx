import { createContext, useContext, type ReactNode } from 'react'

const GenerationPanelNarrowContext = createContext(false)

export function GenerationPanelNarrowProvider({
  value,
  children,
}: {
  value: boolean
  children: ReactNode
}) {
  return (
    <GenerationPanelNarrowContext.Provider value={value}>
      {children}
    </GenerationPanelNarrowContext.Provider>
  )
}

/** Consommateur du Provider {@link GenerationPanelNarrowProvider} (même module que le contexte). */
// eslint-disable-next-line react-refresh/only-export-components -- hook intentionnellement co-localisé au Provider
export function useGenerationPanelNarrow(): boolean {
  return useContext(GenerationPanelNarrowContext)
}
