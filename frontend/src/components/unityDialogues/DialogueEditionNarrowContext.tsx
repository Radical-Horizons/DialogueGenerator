import { createContext, useContext, type ReactNode } from 'react'

const DialogueEditionNarrowContext = createContext(false)

export function DialogueEditionNarrowProvider({
  value,
  children,
}: {
  value: boolean
  children: ReactNode
}) {
  return (
    <DialogueEditionNarrowContext.Provider value={value}>
      {children}
    </DialogueEditionNarrowContext.Provider>
  )
}

/** Consommateur du Provider {@link DialogueEditionNarrowProvider} (même module que le contexte). */
// eslint-disable-next-line react-refresh/only-export-components -- hook intentionnellement co-localisé au Provider
export function useDialogueEditionNarrow(): boolean {
  return useContext(DialogueEditionNarrowContext)
}
