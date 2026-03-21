/**
 * Sélecteur de cible de connexion : applique connectNodes / disconnectNodes (SoT graphe).
 */
import { memo, useCallback, useMemo } from 'react'
import type { Node } from 'reactflow'
import { useGraphStore } from '../../store/graphStore'
import { theme } from '../../theme'
import { Combobox, type ComboboxOption } from '../shared/Combobox'
import { stableChoiceEdgeId } from '../../utils/graphEdgeBuilders'
import { listTargetPickerOptions } from '../../utils/targetPickerOptions'

export type TestResultHandleId =
  | 'critical-failure'
  | 'failure'
  | 'success'
  | 'critical-success'

const TEST_CONNECTION_TYPE: Record<TestResultHandleId, string> = {
  'critical-failure': 'test-critical-failure',
  failure: 'test-failure',
  success: 'test-success',
  'critical-success': 'test-critical-success',
}

function choiceStableId(nodes: Node[], dialogueNodeId: string, choiceIndex: number): string {
  const node = nodes.find((n) => n.id === dialogueNodeId)
  const choices = (node?.data?.choices ?? []) as { choiceId?: string }[]
  const c = choices[choiceIndex]
  return (c?.choiceId as string | undefined) ?? `__idx_${choiceIndex}`
}

export type ConnectionTargetSelectProps = {
  /** Libellé accessibilité / UI */
  label: string
  disabled?: boolean
  value: string | undefined
  'data-testid'?: string
} & (
  | {
      variant: 'choice'
      dialogueNodeId: string
      choiceIndex: number
    }
  | {
      variant: 'nextNode'
      dialogueNodeId: string
    }
  | {
      variant: 'testHandle'
      testSourceNodeId: string
      handle: TestResultHandleId
    }
)

export const ConnectionTargetSelect = memo(function ConnectionTargetSelect(
  props: ConnectionTargetSelectProps
) {
  const { label, disabled = false, value, 'data-testid': testId } = props

  const nodes = useGraphStore((s) => s.nodes)
  const connectNodes = useGraphStore((s) => s.connectNodes)
  const disconnectNodes = useGraphStore((s) => s.disconnectNodes)

  const excludeIds = useMemo((): string[] => {
    switch (props.variant) {
      case 'choice':
      case 'nextNode':
        return [props.dialogueNodeId]
      case 'testHandle':
        return [props.testSourceNodeId]
      default:
        return []
    }
  }, [props])

  const options: ComboboxOption[] = useMemo(
    () => listTargetPickerOptions(nodes, { excludeIds, includeEnd: true }),
    [nodes, excludeIds]
  )

  const applyChoiceTarget = useCallback(
    (newVal: string | null) => {
      if (props.variant !== 'choice') return
      const { dialogueNodeId, choiceIndex } = props
      const v = (newVal ?? '').trim()
      const sid = choiceStableId(useGraphStore.getState().nodes, dialogueNodeId, choiceIndex)
      const edgeId = stableChoiceEdgeId(dialogueNodeId, sid)
      const existing = useGraphStore.getState().edges.find((e) => e.id === edgeId)

      if (!v) {
        if (existing) {
          disconnectNodes(edgeId)
        }
        return
      }

      if (existing?.target === v) {
        return
      }

      connectNodes(dialogueNodeId, v, choiceIndex)
    },
    [props, connectNodes, disconnectNodes]
  )

  const applyNextTarget = useCallback(
    (newVal: string | null) => {
      if (props.variant !== 'nextNode') return
      const { dialogueNodeId } = props
      const v = (newVal ?? '').trim()
      const st = useGraphStore.getState()
      const suivant = st.edges.find(
        (e) => e.source === dialogueNodeId && e.label === 'Suivant'
      )

      if (!v) {
        if (suivant) {
          disconnectNodes(suivant.id)
        }
        return
      }

      if (suivant?.target === v) {
        return
      }

      if (suivant) {
        disconnectNodes(suivant.id)
      }
      connectNodes(dialogueNodeId, v, undefined, 'nextNode')
    },
    [props, connectNodes, disconnectNodes]
  )

  const applyTestTarget = useCallback(
    (newVal: string | null) => {
      if (props.variant !== 'testHandle') return
      const { testSourceNodeId, handle } = props
      const v = (newVal ?? '').trim()
      const st = useGraphStore.getState()
      const existing = st.edges.find(
        (e) => e.source === testSourceNodeId && e.sourceHandle === handle
      )

      if (!v) {
        if (existing) {
          disconnectNodes(existing.id)
        }
        return
      }

      if (existing?.target === v) {
        return
      }

      if (existing) {
        disconnectNodes(existing.id)
      }
      const ct = TEST_CONNECTION_TYPE[handle]
      connectNodes(testSourceNodeId, v, undefined, ct)
    },
    [props, connectNodes, disconnectNodes]
  )

  const onChange = useCallback(
    (newVal: string | null) => {
      if (props.variant === 'choice') {
        applyChoiceTarget(newVal)
      } else if (props.variant === 'nextNode') {
        applyNextTarget(newVal)
      } else {
        applyTestTarget(newVal)
      }
    },
    [props.variant, applyChoiceTarget, applyNextTarget, applyTestTarget]
  )

  const comboboxValue = value && value.trim() !== '' ? value : null

  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <span
        style={{
          display: 'block',
          marginBottom: '0.5rem',
          fontSize: '0.85rem',
          fontWeight: 'bold',
          color: theme.text.secondary,
        }}
      >
        {label}
      </span>
      <Combobox
        options={options}
        value={comboboxValue}
        onChange={onChange}
        disabled={disabled}
        allowClear
        placeholder="Rechercher une cible…"
        data-testid={testId}
        style={{ width: '100%' }}
      />
    </div>
  )
})
