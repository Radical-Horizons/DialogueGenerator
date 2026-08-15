/**
 * Tests du store templates (liste + création uniquement).
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { AxiosError } from 'axios'
import type { AxiosResponse } from 'axios'
import { renderHook, act } from '@testing-library/react'
import { useTemplateStore } from '../store/templateStore'
import * as templatesApi from '../api/templates'
import type { Template, TemplateCreateResponse } from '../types/template'

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

    expect(result.current.error).toContain('Failed to load templates')
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

    expect(result.current.error).toContain('Failed to create template')
  })
})
