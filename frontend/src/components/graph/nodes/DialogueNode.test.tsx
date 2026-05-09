import { render, screen } from '@testing-library/react'
import { ReactFlowProvider } from 'reactflow'
import { beforeEach, describe, expect, it } from 'vitest'

import { useGraphViewStore } from '../../../store/graphViewStore'
import { DialogueNode } from './DialogueNode'

const renderDialogueNode = () =>
  render(
    <ReactFlowProvider>
      <DialogueNode
        id="node-1"
        type="dialogue"
        selected={false}
        isConnectable
        dragging={false}
        xPos={0}
        yPos={0}
        zIndex={0}
        data={{
          id: 'node-1',
          speaker: 'PNJ',
          line: 'Test',
          choices: [
            {
              text: 'Mentir',
              choiceId: 'choice-1',
              effortCost: 12,
              skillCheck: {
                attributeId: 'sociabilite',
                attributeLabel: 'Sociabilité',
                skillId: 'tromperie',
                skillLabel: 'Tromperie',
                dc: 7,
                branches: {
                  succès: 'SUCCESS',
                  échec_critique: 'CRIT_FAILURE',
                },
              },
            },
          ],
        }}
      />
    </ReactFlowProvider>,
  )

describe('DialogueNode FR94 preview affordances', () => {
  beforeEach(() => {
    useGraphViewStore.setState({
      dialoguePreviewActive: true,
      previewGameSystemsState: {
        attributes: { sociabilite: 0 },
        skills: { tromperie: 1 },
        effortPool: 10,
        reputationValues: {},
        factionTitles: {},
        simulationLimits: [],
      },
      visibilityEvalState: { flags: {}, reputation: {} },
      previewEffectHistory: [],
    })
  })

  it('expose skill check tentable et effort insuffisant sur le choix', () => {
    renderDialogueNode()

    expect(
      screen.getByLabelText(
        /Mentir — Sociabilité \+ Tromperie vs DD 7 : score 1, échec_critique — branche CRIT_FAILURE — Effort insuffisant : 10 PE disponibles, coût 12 PE\./,
      ),
    ).toBeInTheDocument()
  })
})
