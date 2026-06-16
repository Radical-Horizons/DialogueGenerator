/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { applyResolvedReferences, preparePresetForApply } from './presetUtils'
import type { Preset } from '../types/preset'

const basePreset: Preset = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Test',
  icon: '📋',
  metadata: { created: '2026-01-01T00:00:00Z', modified: '2026-01-01T00:00:00Z' },
  configuration: {
    characters: ['Seigneuresse Uresaïr', 'Barvas le Juge-Mendiant'],
    locations: ['Antichambre des Impossibles'],
    region: 'Antichambre des Impossibles',
    sceneType: 'Generic',
    instructions: '',
    contextSelections: {
      characters_full: ['Seigneuresse Uresaïr'],
      characters_excerpt: [],
      locations_full: [],
      locations_excerpt: [],
      items_full: [],
      items_excerpt: [],
      species_full: [],
      species_excerpt: [],
      communities_full: [],
      communities_excerpt: [],
      dialogues_examples: [],
      narrative_structures: [],
      chapters: [],
      scenes: [],
    },
  },
}

describe('presetUtils resolved references', () => {
  it('remaps historical character names and deduplicates', () => {
    const resolved = applyResolvedReferences(basePreset, {
      'Seigneuresse Uresaïr': 'Uresaïr',
    })
    expect(resolved.configuration.characters).toEqual(['Uresaïr', 'Barvas le Juge-Mendiant'])
    expect(resolved.configuration.contextSelections?.characters_full).toEqual(['Uresaïr'])
  })

  it('preparePresetForApply resolves then filters obsolete', () => {
    const prepared = preparePresetForApply(basePreset, {
      valid: false,
      warnings: [],
      obsoleteRefs: ['Ghost'],
      resolvedRefs: { 'Seigneuresse Uresaïr': 'Uresaïr' },
    })
    expect(prepared.configuration.characters).toEqual(['Uresaïr', 'Barvas le Juge-Mendiant'])
  })
})
