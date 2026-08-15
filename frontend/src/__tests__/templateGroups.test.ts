/**
 * Tests du regroupement des templates par catégorie.
 */
import { describe, it, expect } from 'vitest'
import { groupTemplatesByCategory } from '../utils/templateGroups'
import type { Template } from '../types/template'

function tpl(name: string, category: string): Template {
  return {
    id: name,
    name,
    description: '',
    category,
    icon: '📋',
    metadata: { created: '2026-08-16T10:00:00Z', modified: '2026-08-16T10:00:00Z' },
    configuration: {
      characters: [],
      locations: [],
      region: '',
      sceneType: 'Generic',
      instructions: '',
    },
  }
}

describe('groupTemplatesByCategory', () => {
  it('groupe par catégorie en conservant l’ordre d’apparition', () => {
    const grouped = groupTemplatesByCategory([
      tpl('A', 'Salutation'),
      tpl('B', 'Confrontation'),
      tpl('C', 'Salutation'),
    ])

    expect(grouped.map(([category]) => category)).toEqual(['Salutation', 'Confrontation'])
    expect(grouped[0][1].map((item) => item.name)).toEqual(['A', 'C'])
    expect(grouped[1][1].map((item) => item.name)).toEqual(['B'])
  })
})
