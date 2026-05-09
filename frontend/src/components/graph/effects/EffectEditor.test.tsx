import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormProvider, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import * as flagsAPI from '../../../api/flags'
import * as contextAPI from '../../../api/context'
import { dialogueNodeDataSchema, type DialogueNodeData } from '../../../schemas/nodeEditorSchema'
import { EffectEditor } from './EffectEditor'

vi.mock('../../../api/flags', () => ({
  listFlags: vi.fn(),
}))

vi.mock('../../../api/context', () => ({
  listCommunities: vi.fn(),
}))

function Wrap({ choiceEffects }: { choiceEffects?: DialogueNodeData['choices'] }) {
  const form = useForm<DialogueNodeData>({
    resolver: zodResolver(dialogueNodeDataSchema),
    defaultValues: {
      id: 'node-1',
      line: 'Hello',
      choices: choiceEffects ?? [{ text: 'Ok', choiceId: 'c1', targetNode: 'END', choiceEffects: [] }],
    },
  })
  return (
    <FormProvider {...form}>
      <EffectEditor choiceIndex={0} />
    </FormProvider>
  )
}

describe('EffectEditor', () => {
  beforeEach(() => {
    vi.mocked(contextAPI.listCommunities).mockResolvedValue({
      communities: [{ name: 'Guilde des Cartographes', data: {} }],
      total: 1,
    })
  })

  it('affiche la zone effets et charge le catalogue flags', async () => {
    vi.mocked(flagsAPI.listFlags).mockResolvedValue({
      flags: [
        {
          id: 'F_BOOL',
          type: 'bool',
          semanticType: 'bool',
          category: 't',
          label: 'l',
          defaultValue: 'false',
          tags: [],
          isFavorite: false,
        },
      ],
    })

    render(<Wrap />)

    expect(await screen.findByTestId('effect-editor-0')).toBeTruthy()
    expect(screen.getByRole('heading', { name: /Effets déclenchés/i })).toBeTruthy()
    expect(vi.mocked(flagsAPI.listFlags)).toHaveBeenCalled()
  })

  it('affiche un aperçu concaténé lorsque choiceEffects est prérempli', async () => {
    vi.mocked(flagsAPI.listFlags).mockResolvedValue({ flags: [] })

    render(
      <Wrap
        choiceEffects={[
          {
            text: 'Go',
            choiceId: 'c1',
            choiceEffects: [{ kind: 'set_bool', flagId: 'FLAG_X', value: true }],
          },
        ]}
      />,
    )

    expect(await screen.findByText(/Aperçu/i)).toBeTruthy()
    expect(screen.getByText(/FLAG_X = true/)).toBeTruthy()
  })

  it('utilise des selects pour les effets de réputation', async () => {
    const user = userEvent.setup()
    vi.mocked(flagsAPI.listFlags).mockResolvedValue({ flags: [] })

    render(<Wrap />)

    await user.selectOptions(await screen.findByLabelText('Ajouter un effet'), 'reputation_delta')

    expect(screen.getByLabelText('Axe réputation effet')).toHaveValue('Prestige')
    expect(screen.getByLabelText('Communauté réputation effet')).toHaveDisplayValue('— communauté —')
    expect(await screen.findByRole('option', { name: 'Guilde des Cartographes' })).toBeInTheDocument()
  })
})
