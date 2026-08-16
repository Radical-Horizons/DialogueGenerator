/**
 * Store Zustand pour la liste et la création des templates custom (Story 6.1.1).
 */
import { AxiosError } from 'axios'
import { create } from 'zustand'
import type { Template, TemplateCreate } from '../types/template'
import { createTemplateApi, listTemplatesApi } from '../api/templates'

function formatTemplateRequestError(actionLabel: string, error: unknown): string {
  if (error instanceof AxiosError && error.response?.status != null) {
    return `Échec ${actionLabel} : ${error.response.status}`
  }
  if (error instanceof Error) {
    return error.message
  }
  return `Échec ${actionLabel}`
}

export interface TemplateCreateOutcome {
  warnings: string[]
}

interface TemplateStore {
  templates: Template[]
  isLoading: boolean
  error: string | null
  loadTemplates: () => Promise<void>
  createTemplate: (templateData: TemplateCreate) => Promise<TemplateCreateOutcome>
  reset: () => void
}

/** Invalide les GET liste concurrentes (load vs load / reset). */
let listRequestSeq = 0

function upsertTemplate(list: Template[], incoming: Template): Template[] {
  const index = list.findIndex((item) => item.id === incoming.id)
  if (index === -1) {
    return [...list, incoming]
  }
  const next = [...list]
  next[index] = incoming
  return next
}

/** Conserve les items locaux absents de la réponse serveur (create en course). */
function mergeTemplateLists(server: Template[], local: Template[]): Template[] {
  let next = [...server]
  for (const item of local) {
    next = upsertTemplate(next, item)
  }
  return next
}

export const useTemplateStore = create<TemplateStore>((set) => ({
  templates: [],
  isLoading: false,
  error: null,

  loadTemplates: async () => {
    const seq = ++listRequestSeq
    set({ isLoading: true, error: null })
    try {
      const templates = await listTemplatesApi()
      if (seq !== listRequestSeq) {
        return
      }
      set((state) => ({
        templates: mergeTemplateLists(templates, state.templates),
        isLoading: false,
      }))
    } catch (error) {
      if (seq !== listRequestSeq) {
        return
      }
      set({
        error: formatTemplateRequestError('du chargement des templates', error),
        isLoading: false,
      })
    }
  },

  createTemplate: async (templateData: TemplateCreate) => {
    set({ isLoading: true, error: null })
    try {
      const created = await createTemplateApi(templateData)
      const { warnings, ...newTemplate } = created
      set((state) => ({
        templates: upsertTemplate(state.templates, newTemplate),
        isLoading: false,
      }))
      return { warnings }
    } catch (error) {
      const message = formatTemplateRequestError('de la création du template', error)
      set({
        error: message,
        isLoading: false,
      })
      throw new Error(message)
    }
  },

  reset: () => {
    listRequestSeq += 1
    set({
      templates: [],
      isLoading: false,
      error: null,
    })
  },
}))
