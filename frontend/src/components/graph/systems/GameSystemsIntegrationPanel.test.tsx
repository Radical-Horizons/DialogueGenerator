import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { GameSystemsIntegrationPanel } from './GameSystemsIntegrationPanel'
import type { GameSystemsIntegrationCatalog } from '../../../types/gameSystemsIntegration'

describe('GameSystemsIntegrationPanel', () => {
  const catalog: GameSystemsIntegrationCatalog = {
    families: [
      {
        id: 'attributes_skills',
        label: 'Caractéristiques & Compétences',
        description: 'Tests tentables avec caractéristique + compétence + DD.',
      },
      {
        id: 'effort',
        label: "Gestion de l'Effort",
        description: 'Coûts PE et pool preview simulé.',
      },
      {
        id: 'reputation',
        label: 'Réputation',
        description: 'Admiration, Prestige et Crainte avec paliers calculés.',
      },
    ],
    runtime_source: {
      status: 'disconnected',
      label: 'Source runtime externe (Unity/API/fichier config)',
      editing_blocked: false,
      message: 'Source runtime externe non connectée : édition locale disponible via preview simulée.',
    },
  }

  it('affiche les familles FR94 et garde l’édition locale disponible sans source runtime', () => {
    render(<GameSystemsIntegrationPanel catalog={catalog} onClose={() => undefined} />)

    expect(
      screen.getByRole('complementary', { name: 'Intégration systèmes de jeu' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Caractéristiques & Compétences')).toBeInTheDocument()
    expect(screen.getByText("Gestion de l'Effort")).toBeInTheDocument()
    expect(screen.getByText('Réputation')).toBeInTheDocument()
    expect(screen.getByText('Source runtime externe (Unity/API/fichier config)')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Source runtime externe non connectée')
    expect(screen.getByText('Édition locale disponible')).toBeInTheDocument()
  })
})
