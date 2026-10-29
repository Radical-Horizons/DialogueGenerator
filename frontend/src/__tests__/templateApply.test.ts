import { describe, it, expect } from 'vitest'
import { isLlmProvider, isPrebuiltNew, prebuiltToTemplate, templateToPreset } from '../utils/templateApply'
import type { PrebuiltTemplate, Template } from '../types/template'

const sampleTemplate: Template = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  name: 'Salut',
  description: 'Première rencontre',
  category: 'Salutation',
  icon: '👋',
  metadata: { created: '2026-08-16T10:00:00Z', modified: '2026-08-16T10:00:00Z' },
  configuration: {
    characters: ['char-alpha'],
    locations: ['loc-alpha'],
    region: 'loc-alpha',
    sceneType: 'Generic',
    instructions: 'Brief A',
    llmModel: 'gpt-5.6-terra',
    llmProvider: 'mistral',
    temperature: 0.4,
  },
}

describe('templateToPreset', () => {
  it('copie id/name/icon/metadata/configuration sans champs LLM template', () => {
    const preset = templateToPreset(sampleTemplate)

    expect(preset).toEqual({
      id: sampleTemplate.id,
      name: 'Salut',
      icon: '👋',
      metadata: sampleTemplate.metadata,
      configuration: {
        characters: ['char-alpha'],
        locations: ['loc-alpha'],
        region: 'loc-alpha',
        sceneType: 'Generic',
        instructions: 'Brief A',
        llmModel: 'gpt-5.6-terra',
      },
    })
    expect(preset.configuration).not.toHaveProperty('llmProvider')
    expect(preset.configuration).not.toHaveProperty('temperature')
  })
})

describe('isLlmProvider', () => {
  it('accepte openai, mistral, openrouter', () => {
    expect(isLlmProvider('openai')).toBe(true)
    expect(isLlmProvider('mistral')).toBe(true)
    expect(isLlmProvider('openrouter')).toBe(true)
  })

  it('refuse les valeurs vides ou inconnues', () => {
    expect(isLlmProvider(null)).toBe(false)
    expect(isLlmProvider(undefined)).toBe(false)
    expect(isLlmProvider('anthropic')).toBe(false)
  })
})

describe('prebuilt helpers', () => {
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
      instructions: 'Brief pré-built',
    },
  }

  it('prebuiltToTemplate copie configuration et métadonnées', () => {
    const template = prebuiltToTemplate(samplePrebuilt)
    expect(template.name).toBe('Confrontation')
    expect(template.configuration.instructions).toBe('Brief pré-built')
    expect(template.metadata.created).toBe(samplePrebuilt.addedAt)
  })

  it('isPrebuiltNew est vrai sous 30 jours', () => {
    const added = Date.parse('2026-08-16T00:00:00Z')
    expect(isPrebuiltNew('2026-08-16T00:00:00Z', added + 2 * 24 * 60 * 60 * 1000)).toBe(true)
    expect(isPrebuiltNew('2026-08-16T00:00:00Z', added + 40 * 24 * 60 * 60 * 1000)).toBe(false)
  })

  it('isPrebuiltNew refuse une date invalide', () => {
    expect(isPrebuiltNew('not-a-date')).toBe(false)
  })
})
