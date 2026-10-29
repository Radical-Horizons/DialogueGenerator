import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormProvider, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ConditionEditor } from './ConditionEditor'
import { dialogueNodeDataSchema, type DialogueNodeData } from '../../../schemas/nodeEditorSchema'
import * as flagsAPI from '../../../api/flags'
import * as contextAPI from '../../../api/context'

vi.mock('../../../api/flags', () => ({
  listFlags: vi.fn(),
}))

vi.mock('../../../api/context', () => ({
  listCommunities: vi.fn(),
}))

function TestWrap({ variant, choiceIndex }: { variant: 'node' | 'choice'; choiceIndex?: number }) {
  const form = useForm<DialogueNodeData>({
    resolver: zodResolver(dialogueNodeDataSchema),
    defaultValues: {
      id: 'node-1',
      line: 'Hello',
      choices:
        variant === 'choice'
          ? [{ text: 'Go', targetNode: 'END', choiceId: 'c1' }]
          : [],
    },
  })
  return (
    <FormProvider {...form}>
      <ConditionEditor variant={variant} choiceIndex={choiceIndex} />
    </FormProvider>
  )
}

describe('ConditionEditor', () => {
  beforeEach(() => {
    vi.mocked(flagsAPI.listFlags).mockResolvedValue({ flags: [], total: 0 })
    vi.mocked(contextAPI.listCommunities).mockResolvedValue({
      communities: [{ name: 'Guilde des Cartographes', data: {} }],
      total: 1,
    })
  })

  it('renders node editor region', async () => {
    render(<TestWrap variant="node" />)
    expect(await screen.findByTestId('condition-editor-node')).toBeTruthy()
  })

  it('renders choice editor region', async () => {
    render(<TestWrap variant="choice" choiceIndex={0} />)
    expect(await screen.findByTestId('condition-editor-choice-0')).toBeTruthy()
  })

  it('affiche la première condition dès le premier clic', async () => {
    const user = userEvent.setup()
    render(<TestWrap variant="node" />)

    await user.click(await screen.findByRole('button', { name: /\+ Condition/i }))

    expect(screen.getByRole('button', { name: /Retirer/i })).toBeInTheDocument()
    expect(screen.getByLabelText('Type condition 1')).toHaveValue('flag_bool')
  })

  it('utilise des selects pour axe réputation et communauté', async () => {
    const user = userEvent.setup()
    render(<TestWrap variant="node" />)

    await user.click(await screen.findByRole('button', { name: /\+ Condition/i }))
    await user.selectOptions(screen.getByLabelText('Type condition 1'), 'reputation')

    expect(screen.getByLabelText('Axe réputation')).toHaveValue('Prestige')
    expect(screen.getByLabelText('Communauté réputation')).toHaveDisplayValue('— communauté —')
    expect(await screen.findByRole('option', { name: 'Guilde des Cartographes' })).toBeInTheDocument()
  })
})
