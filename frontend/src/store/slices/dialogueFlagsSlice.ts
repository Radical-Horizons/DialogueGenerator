/**
 * Slice liaisons dialogue ↔ catalogue flags (Story 9.1 FR89).
 */
import type { StateCreator } from 'zustand'
import type { DialogueFlagBinding } from '../../types/dialogueFlags'
import type { GraphState } from '../types/graphState'

export type DialogueFlagsSlice = Pick<
  GraphState,
  | 'dialogueFlagBindings'
  | 'setDialogueFlagBindings'
  | 'upsertDialogueFlagBinding'
  | 'removeDialogueFlagBinding'
>

export const createDialogueFlagsSlice: StateCreator<
  GraphState,
  [],
  [],
  DialogueFlagsSlice
> = (set, get) => ({
  dialogueFlagBindings: [],

  setDialogueFlagBindings: (bindings: DialogueFlagBinding[]) => {
    set({ dialogueFlagBindings: [...bindings] })
    get().markDirty()
  },

  upsertDialogueFlagBinding: (binding: DialogueFlagBinding) => {
    const cur = [...get().dialogueFlagBindings]
    const i = cur.findIndex((b) => b.flagId === binding.flagId)
    if (i >= 0) cur[i] = binding
    else cur.push(binding)
    set({ dialogueFlagBindings: cur })
    get().markDirty()
  },

  removeDialogueFlagBinding: (flagId: string) => {
    set({
      dialogueFlagBindings: get().dialogueFlagBindings.filter((b) => b.flagId !== flagId),
    })
    get().markDirty()
  },
})
