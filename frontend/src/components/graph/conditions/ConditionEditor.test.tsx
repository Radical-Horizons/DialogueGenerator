import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FormProvider, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ConditionEditor } from './ConditionEditor'
import { dialogueNodeDataSchema, type DialogueNodeData } from '../../../schemas/nodeEditorSchema'

vi.mock('../../../api/flags', () => ({
  listFlags: vi.fn().mockResolvedValue({ flags: [] }),
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
  it('renders node editor region', async () => {
    render(<TestWrap variant="node" />)
    expect(await screen.findByTestId('condition-editor-node')).toBeTruthy()
  })

  it('renders choice editor region', async () => {
    render(<TestWrap variant="choice" choiceIndex={0} />)
    expect(await screen.findByTestId('condition-editor-choice-0')).toBeTruthy()
  })
})
