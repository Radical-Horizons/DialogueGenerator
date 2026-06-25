import { describe, expect, it } from 'vitest'
import {
  formatAttributeSkillTest,
  isCompleteAttributeSkillTest,
  localAttributeSkillTestFieldError,
  parseAttributeSkillTest,
  resolveCatalogToken,
} from './attributeSkillTest'

describe('attributeSkillTest', () => {
  it('parse un test complet', () => {
    expect(parseAttributeSkillTest('Raison+Rhétorique:8')).toEqual({
      attribute: 'Raison',
      skill: 'Rhétorique',
      dc: '8',
    })
  })

  it('parse une compétence avec espace', () => {
    expect(parseAttributeSkillTest('Raison+Création d’artefacts:10')).toEqual({
      attribute: 'Raison',
      skill: 'Création d’artefacts',
      dc: '10',
    })
  })

  it('compose le format Unity', () => {
    expect(
      formatAttributeSkillTest({ attribute: 'Raison', skill: 'Rhétorique', dc: '8' }),
    ).toBe('Raison+Rhétorique:8')
  })

  it('signale un espace dans la compétence', () => {
    expect(localAttributeSkillTestFieldError('skill', 'Création d’artefacts')).toContain('espace')
  })

  it('valide un test complet sans espace', () => {
    expect(
      isCompleteAttributeSkillTest({ attribute: 'Raison', skill: 'Rhétorique', dc: '8' }),
    ).toBe(true)
  })

  it('résout un libellé avec espaces vers l’identifiant catalogue', () => {
    const options = [
      { id: 'Créationd\'artefacts', label: 'Création d\'artefacts' },
      { id: 'Rhétorique', label: 'Rhétorique' },
    ]
    expect(resolveCatalogToken('Création d\'artefacts', options)).toBe('Créationd\'artefacts')
    expect(resolveCatalogToken('Armes de Poing', [{ id: 'ArmesDePoing', label: 'Armes de Poing' }])).toBe(
      'ArmesDePoing',
    )
  })
})
