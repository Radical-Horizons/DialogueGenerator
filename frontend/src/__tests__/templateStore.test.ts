/**
 * Tests du store templates (liste + CRUD).
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { AxiosError } from 'axios'
import type { AxiosResponse } from 'axios'
import { renderHook, act } from '@testing-library/react'
import { useTemplateStore } from '../store/templateStore'
import * as templatesApi from '../api/templates'
import type { PrebuiltTemplate, Template, TemplateCreateResponse } from '../types/template'

vi.mock('../api/templates')

function axiosHttpError(status: number): AxiosError {
  const error = new AxiosError(`Request failed with status code ${status}`)
  error.response = { status } as AxiosResponse
  return error
}

const sampleTemplate: Template = {
  id: 'tpl-001',
  name: 'Template test',
  description: 'Desc',
  category: 'Confrontation',
  icon: '⚔️',
  metadata: { created: '2026-08-16T10:00:00Z', modified: '2026-08-16T10:00:00Z' },
  configuration: {
    characters: ['char-alpha'],
    locations: ['loc-alpha'],
    region: 'loc-alpha',
    sceneType: 'Generic',
    instructions: 'Brief',
  },
}

describe('useTemplateStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const { result } = renderHook(() => useTemplateStore())
    act(() => {
      result.current.reset()
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('charge la liste des templates', async () => {
    vi.mocked(templatesApi.listTemplatesApi).mockResolvedValueOnce([sampleTemplate])
    const { result } = renderHook(() => useTemplateStore())

    await act(async () => {
      await result.current.loadTemplates()
    })

    expect(result.current.templates).toEqual([sampleTemplate])
    expect(result.current.error).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })

  it('crée un template et l’ajoute à la liste', async () => {
    const created: TemplateCreateResponse = { ...sampleTemplate, warnings: [] }
    vi.mocked(templatesApi.createTemplateApi).mockResolvedValueOnce(created)
    const { result } = renderHook(() => useTemplateStore())

    await act(async () => {
      const outcome = await result.current.createTemplate({
        name: 'Template test',
        description: 'Desc',
        category: 'Confrontation',
        icon: '⚔️',
        configuration: sampleTemplate.configuration,
      })
      expect(outcome.warnings).toEqual([])
    })

    expect(result.current.templates).toHaveLength(1)
    expect(result.current.templates[0].name).toBe('Template test')
    expect(result.current.templates[0]).not.toHaveProperty('warnings')
  })

  it('expose les warnings de création sans échouer', async () => {
    const created: TemplateCreateResponse = {
      ...sampleTemplate,
      warnings: ["Character 'char-obsolete' not found in GDD"],
    }
    vi.mocked(templatesApi.createTemplateApi).mockResolvedValueOnce(created)
    const { result } = renderHook(() => useTemplateStore())

    await act(async () => {
      const outcome = await result.current.createTemplate({
        name: 'Template test',
        configuration: sampleTemplate.configuration,
      })
      expect(outcome.warnings).toHaveLength(1)
    })
  })

  it('pose une erreur si le chargement échoue', async () => {
    vi.mocked(templatesApi.listTemplatesApi).mockRejectedValueOnce(axiosHttpError(500))
    const { result } = renderHook(() => useTemplateStore())

    await act(async () => {
      await result.current.loadTemplates()
    })

    expect(result.current.error).toContain('Échec du chargement des templates')
    expect(result.current.isLoading).toBe(false)
  })

  it('n’écrase pas un create par un GET liste périmé', async () => {
    let resolveList: ((templates: Template[]) => void) | undefined
    vi.mocked(templatesApi.listTemplatesApi).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveList = resolve
        })
    )
    const created: TemplateCreateResponse = { ...sampleTemplate, warnings: [] }
    vi.mocked(templatesApi.createTemplateApi).mockResolvedValueOnce(created)

    const { result } = renderHook(() => useTemplateStore())

    let loadPromise: Promise<void> = Promise.resolve()
    act(() => {
      loadPromise = result.current.loadTemplates()
    })

    await act(async () => {
      await result.current.createTemplate({
        name: 'Template test',
        configuration: sampleTemplate.configuration,
      })
    })

    expect(result.current.templates).toHaveLength(1)

    await act(async () => {
      resolveList?.([])
      await loadPromise
    })

    expect(result.current.templates).toHaveLength(1)
    expect(result.current.templates[0].id).toBe('tpl-001')
  })

  it('fusionne un GET incomplet avec le template venant d’être créé', async () => {
    const existing: Template = {
      ...sampleTemplate,
      id: 'tpl-old',
      name: 'Ancien',
    }
    let resolveList: ((templates: Template[]) => void) | undefined
    vi.mocked(templatesApi.listTemplatesApi).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveList = resolve
        })
    )
    const created: TemplateCreateResponse = { ...sampleTemplate, warnings: [] }
    vi.mocked(templatesApi.createTemplateApi).mockResolvedValueOnce(created)

    const { result } = renderHook(() => useTemplateStore())

    let loadPromise: Promise<void> = Promise.resolve()
    act(() => {
      loadPromise = result.current.loadTemplates()
    })

    await act(async () => {
      await result.current.createTemplate({
        name: 'Template test',
        configuration: sampleTemplate.configuration,
      })
    })

    await act(async () => {
      resolveList?.([existing])
      await loadPromise
    })

    expect(result.current.templates.map((item) => item.id).sort()).toEqual(['tpl-001', 'tpl-old'])
  })

  it('pose une erreur si la création échoue', async () => {
    vi.mocked(templatesApi.createTemplateApi).mockRejectedValueOnce(axiosHttpError(500))
    const { result } = renderHook(() => useTemplateStore())

    await act(async () => {
      try {
        await result.current.createTemplate({
          name: 'X',
          configuration: sampleTemplate.configuration,
        })
      } catch {
        // attendu
      }
    })

    expect(result.current.error).toContain('Échec de la création du template')
  })

  it('met à jour un template en place (même id)', async () => {
    const created: TemplateCreateResponse = { ...sampleTemplate, warnings: [] }
    vi.mocked(templatesApi.createTemplateApi).mockResolvedValueOnce(created)
    vi.mocked(templatesApi.updateTemplateApi).mockResolvedValueOnce({
      ...sampleTemplate,
      name: 'Renommé',
      warnings: [],
      history: [
        { at: '2026-08-16T10:00:00Z', action: 'created' },
        { at: '2026-08-16T12:00:00Z', action: 'updated' },
      ],
    })
    const { result } = renderHook(() => useTemplateStore())

    await act(async () => {
      await result.current.createTemplate({
        name: 'Template test',
        configuration: sampleTemplate.configuration,
      })
    })
    await act(async () => {
      await result.current.updateTemplate('tpl-001', { name: 'Renommé' })
    })

    expect(result.current.templates).toHaveLength(1)
    expect(result.current.templates[0].name).toBe('Renommé')
    expect(result.current.templates[0].id).toBe('tpl-001')
  })

  it('retire le template de la liste après delete', async () => {
    const created: TemplateCreateResponse = { ...sampleTemplate, warnings: [] }
    vi.mocked(templatesApi.createTemplateApi).mockResolvedValueOnce(created)
    vi.mocked(templatesApi.deleteTemplateApi).mockResolvedValueOnce()
    const { result } = renderHook(() => useTemplateStore())

    await act(async () => {
      await result.current.createTemplate({
        name: 'Template test',
        configuration: sampleTemplate.configuration,
      })
    })
    await act(async () => {
      await result.current.deleteTemplate('tpl-001')
    })

    expect(result.current.templates).toEqual([])
  })

  it('charge le catalogue pré-built', async () => {
    const samplePrebuilt: PrebuiltTemplate = {
      id: 'confrontation',
      name: 'Confrontation',
      description: 'Desc',
      category: 'Confrontation',
      icon: '⚔️',
      gddSystem: 'Skill check',
      sceneTypeHint: 'confrontation',
      objectif: 'Obj',
      casUsage: 'Cas',
      examples: [],
      addedAt: '2026-08-16T00:00:00Z',
      configuration: {
        characters: [],
        locations: [],
        region: '',
        sceneType: 'Generic',
        instructions: 'Brief',
      },
    }
    vi.mocked(templatesApi.listPrebuiltTemplatesApi).mockResolvedValueOnce([samplePrebuilt])
    const { result } = renderHook(() => useTemplateStore())

    await act(async () => {
      await result.current.loadPrebuiltTemplates()
    })

    expect(result.current.prebuiltTemplates).toEqual([samplePrebuilt])
    expect(result.current.prebuiltError).toBeNull()
    expect(result.current.prebuiltLoading).toBe(false)
  })

  it('pose prebuiltError si le catalogue échoue', async () => {
    vi.mocked(templatesApi.listPrebuiltTemplatesApi).mockRejectedValueOnce(axiosHttpError(500))
    const { result } = renderHook(() => useTemplateStore())

    await act(async () => {
      await result.current.loadPrebuiltTemplates()
    })

    expect(result.current.prebuiltError).toContain('Échec du chargement des templates pré-built')
    expect(result.current.prebuiltTemplates).toEqual([])
    expect(result.current.prebuiltLoading).toBe(false)
  })
})
