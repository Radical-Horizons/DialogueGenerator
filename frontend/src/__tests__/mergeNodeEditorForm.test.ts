import { describe, it, expect } from 'vitest'
import {
  pickTestConnectionField,
  mergeDialogueNodeFormIntoStoreData,
  mergeTestNodeFormIntoStoreData,
  mergeEndNodeFormIntoStoreData,
  mergeNodeFormIntoStoreData,
  connectionFingerprintFromNodeData,
  applyStoreConnectionFieldsToDialogueFormChoices,
} from '../utils/mergeNodeEditorForm'
import type { Choice, DialogueNodeData, TestNodeData } from '../schemas/nodeEditorSchema'

describe('pickTestConnectionField', () => {
  it('prefers non-empty store string over form', () => {
    expect(pickTestConnectionField('node-a', '')).toBe('node-a')
    expect(pickTestConnectionField('node-a', 'node-b')).toBe('node-a')
  })
  it('uses form when store empty or whitespace-only', () => {
    expect(pickTestConnectionField('', 'node-b')).toBe('node-b')
    expect(pickTestConnectionField('   ', 'node-b')).toBe('node-b')
    expect(pickTestConnectionField(undefined, 'x')).toBe('x')
  })
  it('returns empty string when both empty', () => {
    expect(pickTestConnectionField('', '')).toBe('')
    expect(pickTestConnectionField(undefined, undefined)).toBe('')
  })
})

describe('mergeTestNodeFormIntoStoreData', () => {
  const baseStore: Record<string, unknown> = {
    id: 't1',
    test: 'A+B:1',
    criticalFailureNode: 'cf',
    failureNode: 'f',
    successNode: 's',
    criticalSuccessNode: 'cs',
  }
  const emptyForm: TestNodeData = {
    id: 't1',
    test: 'A+B:1',
    criticalFailureNode: '',
    failureNode: '',
    successNode: '',
    criticalSuccessNode: '',
  }
  it('keeps all four connection ids when form is empty', () => {
    const out = mergeTestNodeFormIntoStoreData(baseStore, emptyForm)
    expect(out.criticalFailureNode).toBe('cf')
    expect(out.failureNode).toBe('f')
    expect(out.successNode).toBe('s')
    expect(out.criticalSuccessNode).toBe('cs')
  })
  it('uses form when store connection fields empty', () => {
    const store = { ...baseStore, criticalFailureNode: '', failureNode: '' }
    const form: TestNodeData = {
      ...emptyForm,
      criticalFailureNode: 'fc',
      failureNode: 'ff',
    }
    const out = mergeTestNodeFormIntoStoreData(store, form)
    expect(out.criticalFailureNode).toBe('fc')
    expect(out.failureNode).toBe('ff')
  })
})

describe('mergeDialogueNodeFormIntoStoreData', () => {
  it('takes targetNode only from store', () => {
    const nodeData: Record<string, unknown> = {
      id: 'D1',
      line: 'x',
      choices: [
        { text: 'c0', choiceId: '0', targetNode: 'TGT' },
      ] as Choice[],
    }
    const formValues: DialogueNodeData = {
      id: 'D1',
      line: 'edited',
      choices: [{ text: 'c0', choiceId: '0', targetNode: 'WRONG' }],
    }
    const out = mergeDialogueNodeFormIntoStoreData(nodeData, formValues) as DialogueNodeData
    expect(out.choices?.[0]?.targetNode).toBe('TGT')
    expect(out.line).toBe('edited')
  })
  it('takes nextNode from store when defined on nodeData', () => {
    const nodeData: Record<string, unknown> = {
      id: 'D1',
      line: 'x',
      nextNode: 'NEXT_FROM_STORE',
      choices: [] as Choice[],
    }
    const formValues: DialogueNodeData = {
      id: 'D1',
      line: 'x',
      nextNode: 'WRONG',
      choices: [],
    }
    const out = mergeDialogueNodeFormIntoStoreData(nodeData, formValues) as DialogueNodeData
    expect(out.nextNode).toBe('NEXT_FROM_STORE')
  })

  it('prefers store test* when set, else form', () => {
    const nodeData: Record<string, unknown> = {
      id: 'D1',
      choices: [
        {
          text: 'c',
          choiceId: '0',
          test: 'X:1',
          testSuccessNode: 'STORE_S',
        },
      ] as Choice[],
    }
    const formValues: DialogueNodeData = {
      id: 'D1',
      choices: [
        {
          text: 'c',
          choiceId: '0',
          testSuccessNode: 'FORM_S',
          testFailureNode: 'FORM_F',
        },
      ],
    }
    const out = mergeDialogueNodeFormIntoStoreData(nodeData, formValues) as DialogueNodeData
    const c = out.choices?.[0]
    expect(c?.testSuccessNode).toBe('STORE_S')
    expect(c?.testFailureNode).toBe('FORM_F')
  })
  it('store choice with explicit empty test* string keeps empty (no fallback to form)', () => {
    const nodeData: Record<string, unknown> = {
      id: 'D1',
      choices: [
        {
          text: 'c',
          choiceId: '0',
          testFailureNode: '',
        },
      ] as Choice[],
    }
    const formValues: DialogueNodeData = {
      id: 'D1',
      choices: [{ text: 'c', choiceId: '0', testFailureNode: 'FORM_F' }],
    }
    const out = mergeDialogueNodeFormIntoStoreData(nodeData, formValues) as DialogueNodeData
    expect(out.choices?.[0]?.testFailureNode).toBe('')
  })
})

describe('mergeEndNodeFormIntoStoreData', () => {
  it('spreads node and form', () => {
    const out = mergeEndNodeFormIntoStoreData({ id: 'E1', extra: 1 }, { id: 'E1' })
    expect(out.id).toBe('E1')
    expect(out.extra).toBe(1)
  })
})

describe('mergeNodeFormIntoStoreData dispatcher', () => {
  it('routes by nodeType', () => {
    const d = mergeNodeFormIntoStoreData(
      'dialogueNode',
      { id: '1', choices: [] },
      { id: '1', choices: [] } as DialogueNodeData
    )
    expect(d.id).toBe('1')
    const t = mergeNodeFormIntoStoreData(
      'testNode',
      { id: 't', test: 'A:1', criticalFailureNode: 'x' },
      { id: 't', test: 'A:1', criticalFailureNode: '' } as TestNodeData
    )
    expect(t.criticalFailureNode).toBe('x')
  })
})

describe('connectionFingerprintFromNodeData', () => {
  it('is stable for testNode', () => {
    const a = connectionFingerprintFromNodeData('testNode', {
      criticalFailureNode: 'a',
      failureNode: 'b',
    })
    const b = connectionFingerprintFromNodeData('testNode', {
      criticalFailureNode: 'a',
      failureNode: 'b',
    })
    expect(a).toBe(b)
  })
  it('changes when dialogue choice connections change', () => {
    const fp1 = connectionFingerprintFromNodeData('dialogueNode', {
      choices: [{ text: 'x', targetNode: 'A' }],
    })
    const fp2 = connectionFingerprintFromNodeData('dialogueNode', {
      choices: [{ text: 'x', targetNode: 'B' }],
    })
    expect(fp1).not.toBe(fp2)
  })

  it('changes when dialogue nextNode changes', () => {
    const fp1 = connectionFingerprintFromNodeData('dialogueNode', {
      choices: [],
      nextNode: 'A',
    })
    const fp2 = connectionFingerprintFromNodeData('dialogueNode', {
      choices: [],
      nextNode: 'B',
    })
    expect(fp1).not.toBe(fp2)
  })
})

describe('applyStoreConnectionFieldsToDialogueFormChoices', () => {
  it('overlays store connection fields onto form choices', () => {
    const store: Choice[] = [
      { text: 't', choiceId: '0', targetNode: 'NEW', testSuccessNode: 'S' },
    ]
    const form: Choice[] = [{ text: 'edited', choiceId: '0', targetNode: 'OLD' }]
    const merged = applyStoreConnectionFieldsToDialogueFormChoices(store, form)
    expect(merged[0].text).toBe('edited')
    expect(merged[0].targetNode).toBe('NEW')
    expect(merged[0].testSuccessNode).toBe('S')
  })
})
