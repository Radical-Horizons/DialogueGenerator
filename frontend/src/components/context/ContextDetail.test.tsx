import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ContextDetail } from './ContextDetail'
import type { CharacterResponse, LocationResponse, ItemResponse } from '../../types/api'

describe('ContextDetail', () => {
  it('affiche un message quand aucun élément n\'est sélectionné', () => {
    render(<ContextDetail item={null} />)
    
    expect(screen.getByText(/sélectionnez un élément/i)).toBeInTheDocument()
  })

  it('affiche les détails d\'un personnage avec sections GDD expand/collapse', () => {
    const character: CharacterResponse = {
      name: 'Test Character',
      data: {
        description: 'A test character',
        portrait: 'A portrait description',
        tags: ['tag1', 'tag2'],
        traits: ['trait1', 'trait2'],
        rôle_narratif: 'Protagonist',
      },
    }

    render(<ContextDetail item={character} />)

    expect(screen.getByText('Test Character')).toBeInTheDocument()
    expect(screen.getByText('Sections GDD')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /portrait/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /tags/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /traits/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /rôle_narratif/i })).toBeInTheDocument()
  })

  it('affiche les détails d\'un lieu', () => {
    const location: LocationResponse = {
      name: 'Test Location',
      data: {
        description: 'A test location',
        region: 'Test Region',
        type: 'City',
      },
    }

    render(<ContextDetail item={location} />)

    expect(screen.getByText('Test Location')).toBeInTheDocument()
    expect(screen.getByText('Sections GDD')).toBeInTheDocument()
  })

  it('affiche les détails d\'un objet', () => {
    const item: ItemResponse = {
      name: 'Test Item',
      data: {
        description: 'A test item',
        type: 'Weapon',
        rarity: 'Common',
      },
    }

    render(<ContextDetail item={item} />)

    expect(screen.getByText('Test Item')).toBeInTheDocument()
    expect(screen.getByText('Sections GDD')).toBeInTheDocument()
  })

  it('affiche les données imbriquées en sections expand/collapse', () => {
    const character: CharacterResponse = {
      name: 'Test Character',
      data: {
        description: 'A test character',
        nested: {
          level1: {
            level2: 'Deep value',
          },
        },
      },
    }

    render(<ContextDetail item={character} />)

    expect(screen.getByText('Test Character')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /nested/i })).toBeInTheDocument()
  })

  it('affiche les tableaux en section expand/collapse', () => {
    const character: CharacterResponse = {
      name: 'Test Character',
      data: {
        description: 'A test character',
        skills: ['Skill 1', 'Skill 2', 'Skill 3'],
      },
    }

    render(<ContextDetail item={character} />)

    expect(screen.getByText('Test Character')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /skills/i })).toBeInTheDocument()
  })

  it('affiche les colonnes Notion (values) et le libellé Propriétés (table Notion)', async () => {
    const user = userEvent.setup()
    const character: CharacterResponse = {
      name: 'PNJ Sync',
      data: {
        Nom: 'PNJ Sync',
        values: { Région: 'Nord', Type: 'Marchand' },
        sections: {
          _general: 'Phrase d’accroche.\n\n## Section test\nContenu sous-section.',
        },
      },
    }
    render(<ContextDetail item={character} />)
    expect(screen.getByText('PNJ Sync')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /propriétés \(table notion\)/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /propriétés \(table notion\)/i }))
    const propPanel = screen.getByTestId('context-detail-proprietes-body')
    expect(propPanel).toHaveTextContent('Région:')
    expect(propPanel).toHaveTextContent('Nord')
    expect(propPanel).toHaveTextContent('Type:')
    expect(propPanel).toHaveTextContent('Marchand')
    expect(screen.getByRole('button', { name: /préambule/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /section test/i })).toBeInTheDocument()
  })

  it('affiche sync Notion : values en Propriétés, sections plates + section_titles (pas de _general)', async () => {
    const user = userEvent.setup()
    const character: CharacterResponse = {
      name: 'Quête',
      data: {
        Nom: 'Quête',
        values: { Difficulté: 'Hard' },
        sections: {
          objectifs: 'Tuer le dragon',
          re_compense: 'Or',
        },
        section_titles: {
          objectifs: 'Objectifs',
          re_compense: 'Récompense',
        },
      },
    }
    render(<ContextDetail item={character} />)
    expect(screen.getByRole('button', { name: /propriétés \(table notion\)/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /propriétés \(table notion\)/i }))
    expect(screen.getByTestId('context-detail-proprietes-body')).toHaveTextContent('Difficulté')
    expect(screen.getByTestId('context-detail-proprietes-body')).toHaveTextContent('Hard')
    expect(screen.getByRole('button', { name: /^objectifs$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^récompense$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /re_compense/i })).not.toBeInTheDocument()
  })

  it('affiche "—" pour une chaîne repr rich_text vide (fiche type Barvas)', async () => {
    const user = userEvent.setup()
    const reprString = "{'id': 'Ifqh', 'type': 'rich_text', 'rich_text': []}"
    const character: CharacterResponse = {
      name: 'Barvas le Juge-Mendiant',
      data: {
        Résumé: reprString,
      },
    }

    render(<ContextDetail item={character} />)

    expect(screen.getByText('Barvas le Juge-Mendiant')).toBeInTheDocument()
    const propButton = screen.getByRole('button', { name: /propriétés/i })
    expect(propButton).toBeInTheDocument()
    await user.click(propButton)
    expect(screen.getByTestId('context-detail-proprietes-body')).toHaveTextContent('Résumé')
    expect(screen.getByText((_content, el) => el?.textContent === 'Résumé:')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText(/rich_text/)).not.toBeInTheDocument()
  })
})

