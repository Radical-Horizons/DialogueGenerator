/**
 * Store Zustand pour la liste et le CRUD des templates custom.
 */
import { AxiosError } from 'axios'
import { create } from 'zustand'
import type { PrebuiltTemplate, Template, TemplateCreate, TemplateUpdate } from '../types/template'
import {
  createTemplateApi,
  deleteTemplateApi,
  listPrebuiltTemplatesApi,
  listTemplatesApi,
  updateTemplateApi,
} from '../api/templates'

function formatTemplateRequestError(actionLabel: string, error: unknown): string {
  if (error instanceof AxiosError && error.response?.status != null) {
    return `Échec ${actionLabel} : ${error.response.status}`
  }
  if (error instanceof Error) {
    return error.message
  }
  return `Échec ${actionLabel}`
}

export interface TemplateWriteOutcome {
  warnings: string[]
}

interface TemplateStore {
  templates: Template[]
  prebuiltTemplates: PrebuiltTemplate[]
  isLoading: boolean
  prebuiltLoading: boolean
  error: string | null
  prebuiltError: string | null
  loadTemplates: () => Promise<void>
  loadPrebuiltTemplates: () => Promise<void>
  createTemplate: (templateData: TemplateCreate) => Promise<TemplateWriteOutcome>
  updateTemplate: (id: string, updateData: TemplateUpdate) => Promise<TemplateWriteOutcome>
  deleteTemplate: (id: string) => Promise<void>
  reset: () => void
}

/** Invalide les GET liste concurrentes (load vs load / reset / delete). */
let listRequestSeq = 0
let prebuiltListSeq = 0

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
  prebuiltTemplates: [],
  isLoading: false,
  prebuiltLoading: false,
  error: null,
  prebuiltError: null,

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

  loadPrebuiltTemplates: async () => {
    const seq = ++prebuiltListSeq
    set({ prebuiltLoading: true, prebuiltError: null })
    try {
      const prebuiltTemplates = await listPrebuiltTemplatesApi()
      if (seq !== prebuiltListSeq) {
        return
      }
      set({ prebuiltTemplates, prebuiltError: null, prebuiltLoading: false })
    } catch (error) {
      if (seq !== prebuiltListSeq) {
        return
      }
      set({
        prebuiltError: formatTemplateRequestError('du chargement des templates pré-built', error),
        prebuiltLoading: false,
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

  updateTemplate: async (id, updateData) => {
    set({ isLoading: true, error: null })
    try {
      const updated = await updateTemplateApi(id, updateData)
      const { warnings, ...template } = updated
      set((state) => ({
        templates: upsertTemplate(state.templates, template),
        isLoading: false,
      }))
      return { warnings }
    } catch (error) {
      const message = formatTemplateRequestError('de la mise à jour du template', error)
      set({
        error: message,
        isLoading: false,
      })
      throw new Error(message)
    }
  },

  deleteTemplate: async (id) => {
    set({ isLoading: true, error: null })
    try {
      await deleteTemplateApi(id)
      listRequestSeq += 1
      set((state) => ({
        templates: state.templates.filter((item) => item.id !== id),
        isLoading: false,
      }))
    } catch (error) {
      const message = formatTemplateRequestError('de la suppression du template', error)
      set({
        error: message,
        isLoading: false,
      })
      throw new Error(message)
    }
  },

  reset: () => {
    listRequestSeq += 1
    prebuiltListSeq += 1
    set({
      templates: [],
      prebuiltTemplates: [],
      isLoading: false,
      prebuiltLoading: false,
      error: null,
      prebuiltError: null,
    })
  },
}))
