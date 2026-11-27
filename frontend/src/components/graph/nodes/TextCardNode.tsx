/**
 * Carte de réplique de 360 px (Story 20.2, prototype derrière `textCardsPrototype`).
 * Trois paliers de zoom (boards `Carte` et `Paliers`) : écrire (réplique bornée à 12 lignes,
 * réponses entières, un port par réponse, 4 issues de test), lire (2 lignes, une ligne par
 * réponse) et situer (titre et premiers mots). La carte en écriture reste à « écrire ».
 */
import { memo, useLayoutEffect, useRef, type CSSProperties, type MouseEvent } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { useGraphStore } from '../../../store/graphStore'
import { useGraphViewStore } from '../../../store/graphViewStore'
import { useUiLayoutStore } from '../../../store/uiLayoutStore'
import { useAuthStore } from '../../../store/authStore'
import { theme } from '../../../theme'
import {
  redesignAccent,
  redesignFont,
  redesignHairline,
  redesignNodeBorder,
  redesignNodeShadow,
  redesignRadius,
  redesignSurface,
  redesignText,
} from '../../../theme/redesignTokens'
import { DialogueLineText } from '../../shared/DialogueLineText'
import { TEST_RESULT_EDGE_CONFIG } from '../../../utils/graphEdgeBuilders'
import {
  TEXT_CARD_LINE_PX,
  TEXT_CARD_MAX_LINES,
  TEXT_CARD_WIDTH,
  textCardChips,
  type TextCardChoice,
} from '../../../utils/textCardLayout'

interface TextCardData {
  id: string
  speaker?: string
  title?: string
  line?: string
  choices?: TextCardChoice[]
  nextNode?: string
  status?: 'pending' | 'accepted'
  validationErrors?: Array<{ message: string }>
  validationWarnings?: Array<{ message: string }>
  [key: string]: unknown
}

const MAX_TEXT_HEIGHT_PX = Math.ceil(TEXT_CARD_MAX_LINES * TEXT_CARD_LINE_PX)

/** Libellés courts et couleurs de texte des issues, dans l'ordre de `TEST_RESULT_EDGE_CONFIG`. */
const OUTCOME_LABELS = [
  { label: 'É. CRIT', color: '#ff6b6b' },
  { label: 'ÉCHEC', color: '#ff6b6b' },
  { label: 'RÉUSSITE', color: '#27ae60' },
  { label: 'R. CRIT', color: '#3d9bff' },
] as const

const monoStyle: CSSProperties = {
  fontFamily: redesignFont.mono,
  fontSize: '10px',
  letterSpacing: '0.06em',
  color: redesignText.secondary,
}

const lineStyle: CSSProperties = {
  fontFamily: redesignFont.serif,
  fontSize: '16px',
  lineHeight: `${TEXT_CARD_LINE_PX}px`,
  color: redesignText.dialogue,
  overflowWrap: 'break-word',
}

const portStyle = (color: string, dashed: boolean): CSSProperties => ({
  width: 10,
  height: 10,
  minWidth: 10,
  minHeight: 10,
  background: redesignSurface.canvas,
  border: `1.5px ${dashed ? 'dashed' : 'solid'} ${color}`,
  boxSizing: 'border-box',
})

const NEUTRAL_PORT = 'rgba(255, 255, 255, 0.55)'

const isWritten = (target: unknown) => typeof target === 'string' && target !== '' && target !== 'END'

const choiceKey = (choice: TextCardChoice, index: number) => choice.choiceId ?? `__idx_${index}`

/** Champ de texte brut de la carte : seul écrivain de la réplique tant qu'il est ouvert. */
const CardTextEditor = memo(function CardTextEditor({ nodeId }: { nodeId: string }) {
  // Lu directement dans le store du graphe : passer par les props de React Flow arrive un
  // rendu plus tard, et le curseur sauterait en fin de texte.
  const line = useGraphStore((s) => {
    const value = s.nodes.find((n) => n.id === nodeId)?.data?.line
    return typeof value === 'string' ? value : ''
  })
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    ref.current?.focus({ preventScroll: true })
  }, [])

  useLayoutEffect(() => {
    const field = ref.current
    if (!field) return
    field.style.height = 'auto'
    field.style.height = `${Math.min(field.scrollHeight, MAX_TEXT_HEIGHT_PX)}px`
  }, [line])

  return (
    <textarea
      ref={ref}
      data-testid="text-card-editor"
      aria-label="Texte de la réplique"
      className="nodrag nopan nowheel"
      value={line}
      onChange={(event) => {
        const { nodes, updateNode } = useGraphStore.getState()
        const node = nodes.find((n) => n.id === nodeId)
        if (node) updateNode(nodeId, { data: { ...node.data, line: event.target.value } })
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.stopPropagation()
        useGraphViewStore.getState().setWritingNode(null)
      }}
      onClick={(event) => event.stopPropagation()}
      style={{
        ...lineStyle,
        display: 'block',
        width: '100%',
        boxSizing: 'border-box',
        resize: 'none',
        padding: 0,
        border: 'none',
        borderRadius: redesignRadius.control,
        outline: `1px solid ${redesignAccent.base}`,
        outlineOffset: 5,
        background: redesignSurface.base,
        whiteSpace: 'pre-wrap',
      }}
    />
  )
})

function WriteBody({
  nodeId,
  data,
  selected,
  writing,
  showTestBars,
}: {
  nodeId: string
  data: TextCardData
  selected: boolean
  writing: boolean
  showTestBars: boolean
}) {
  const isGuest = useAuthStore((s) => s.user?.role === 'guest')
  const choices = data.choices ?? []

  const startWriting = (event: MouseEvent) => {
    if (isGuest || event.shiftKey) return
    useGraphStore.getState().setSelectedNode(nodeId)
    // Un seul écrivain : l'inspecteur se replie avant que la carte n'écrive.
    useUiLayoutStore.getState().setInspectorTab(null)
    useGraphViewStore.getState().setWritingNode(nodeId)
  }

  return (
    <>
      <div style={{ padding: '12px 14px 13px' }}>
        {writing ? (
          <CardTextEditor nodeId={nodeId} />
        ) : (
          <div
            data-testid="text-card-line"
            // `nowheel` seulement quand la carte est sélectionnée : sinon la molette zoome.
            className={selected ? 'nowheel nodrag' : undefined}
            onClick={startWriting}
            style={{
              ...lineStyle,
              maxHeight: MAX_TEXT_HEIGHT_PX,
              overflowY: selected ? 'auto' : 'hidden',
              cursor: isGuest ? 'default' : 'text',
            }}
          >
            <DialogueLineText text={data.line ?? ''} />
          </div>
        )}
      </div>

      {choices.length > 0 && (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {choices.map((choice, index) => {
            const key = choiceKey(choice, index)
            const chips = textCardChips(choice)
            const showOutcomes = Boolean(choice.test) && !showTestBars
            return (
              <li
                key={key}
                data-testid="text-card-choice"
                style={{
                  position: 'relative',
                  display: 'grid',
                  gridTemplateColumns: '22px minmax(0, 1fr)',
                  columnGap: 9,
                  padding: '9px 18px 10px 14px',
                  borderTop: `1px solid ${redesignHairline.standard}`,
                }}
              >
                <span style={{ ...monoStyle, fontSize: '11px', lineHeight: '20px' }}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13.5px', lineHeight: 1.5, color: redesignText.body }}>
                    {choice.text ? (
                      <DialogueLineText text={choice.text} />
                    ) : (
                      <span style={{ fontStyle: 'italic', color: redesignText.secondary }}>
                        Réponse vide
                      </span>
                    )}
                  </div>
                  {chips.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 5 }}>
                      {chips.map((chip, chipIndex) => (
                        <span
                          key={`${chipIndex}-${chip}`}
                          style={{
                            ...monoStyle,
                            fontSize: '10.5px',
                            height: 24,
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '0 9px',
                            borderRadius: redesignRadius.chip,
                            border: '1px solid rgba(255, 255, 255, 0.12)',
                            textTransform: 'uppercase',
                          }}
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                  )}
                  {showOutcomes && (
                    <div style={{ marginTop: 7, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {OUTCOME_LABELS.map((outcome, outcomeIndex) => {
                        const config = TEST_RESULT_EDGE_CONFIG[outcomeIndex]
                        const written = isWritten(choice[config.field])
                        return (
                          <div
                            key={config.handleId}
                            style={{
                              ...monoStyle,
                              position: 'relative',
                              display: 'flex',
                              justifyContent: 'flex-end',
                              gap: 7,
                              lineHeight: '18px',
                              marginRight: -18,
                              paddingRight: 18,
                            }}
                          >
                            {!written && <span>À ÉCRIRE</span>}
                            <span style={{ color: outcome.color }}>{outcome.label}</span>
                            <Handle
                              type="source"
                              position={Position.Right}
                              id={`test:${key}:${config.handleId}`}
                              isConnectable={false}
                              aria-label={`Réponse ${index + 1}, ${config.label}`}
                              style={portStyle(written ? config.color : NEUTRAL_PORT, !written)}
                            />
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
                {!showOutcomes && (
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={`choice:${key}`}
                    title={choice.text}
                    aria-label={choice.text || `Réponse ${index + 1}`}
                    style={{
                      ...portStyle(NEUTRAL_PORT, !choice.test && !isWritten(choice.targetNode)),
                      top: 19,
                    }}
                  />
                )}
              </li>
            )
          })}
        </ol>
      )}

      {choices.length === 0 && (
        <div style={{ ...monoStyle, position: 'relative', padding: '0 14px 12px' }}>
          SUITE →
          <Handle
            type="source"
            position={Position.Right}
            style={portStyle(NEUTRAL_PORT, !isWritten(data.nextNode))}
          />
        </div>
      )}
    </>
  )
}

/** Ports d'une carte réduite : mêmes identifiants, empilés sur le bord droit. */
function CompactRow({
  choice,
  index,
  showTestBars,
  children,
}: {
  choice: TextCardChoice
  index: number
  showTestBars: boolean
  children?: React.ReactNode
}) {
  const key = choiceKey(choice, index)
  const showOutcomes = Boolean(choice.test) && !showTestBars
  return (
    <div style={{ position: 'relative' }}>
      {children}
      {showOutcomes ? (
        TEST_RESULT_EDGE_CONFIG.map((config, outcomeIndex) => (
          <Handle
            key={config.handleId}
            type="source"
            position={Position.Right}
            id={`test:${key}:${config.handleId}`}
            isConnectable={false}
            style={{
              width: 6,
              height: 6,
              minWidth: 6,
              minHeight: 6,
              border: 'none',
              background: config.color,
              top: `${(outcomeIndex + 1) * 20}%`,
            }}
          />
        ))
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          id={`choice:${key}`}
          style={portStyle(NEUTRAL_PORT, false)}
        />
      )}
    </div>
  )
}

function ReadBody({ data, showTestBars }: { data: TextCardData; showTestBars: boolean }) {
  const choices = data.choices ?? []
  return (
    <>
      <div style={{ padding: '10px 14px' }}>
        <div style={{ ...lineStyle, fontSize: '21px', lineHeight: '30px', height: 60, overflow: 'hidden' }}>
          <DialogueLineText text={data.line ?? ''} />
        </div>
      </div>
      {choices.map((choice, index) => (
        <CompactRow
          key={choiceKey(choice, index)}
          choice={choice}
          index={index}
          showTestBars={showTestBars}
        >
          <div
            data-testid="text-card-choice"
            style={{
              height: 34,
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              padding: '0 14px',
              borderTop: `1px solid ${redesignHairline.standard}`,
              fontSize: '18px',
              color: redesignText.body,
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ ...monoStyle, fontSize: '15px' }}>
              {String(index + 1).padStart(2, '0')}
            </span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {choice.text?.replace(/\*/g, '') || 'Réponse vide'}
            </span>
          </div>
        </CompactRow>
      ))}
      {choices.length === 0 && (
        <Handle type="source" position={Position.Right} style={portStyle(NEUTRAL_PORT, false)} />
      )}
    </>
  )
}

function SituateBody({ data, showTestBars }: { data: TextCardData; showTestBars: boolean }) {
  const choices = data.choices ?? []
  const words = (data.line ?? '').replace(/\*/g, '').trim().split(/\s+/).slice(0, 5).join(' ')
  return (
    <div style={{ padding: '10px 21px 14px' }}>
      <div
        style={{
          fontSize: '35px',
          lineHeight: '43px',
          color: redesignText.strong,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {data.title || data.speaker || 'PNJ'}
      </div>
      <div
        style={{
          fontFamily: redesignFont.serif,
          fontSize: '37px',
          lineHeight: '46px',
          color: redesignText.secondary,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {words ? `« ${words}… »` : '▲ Réplique vide'}
      </div>
      <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly' }}>
        {choices.map((choice, index) => (
          <CompactRow
            key={choiceKey(choice, index)}
            choice={choice}
            index={index}
            showTestBars={showTestBars}
          >
            <div style={{ height: 8, width: 1 }} />
          </CompactRow>
        ))}
      </div>
      {choices.length === 0 && (
        <Handle type="source" position={Position.Right} style={portStyle(NEUTRAL_PORT, false)} />
      )}
    </div>
  )
}

export const TextCardNode = memo(function TextCardNode({
  id,
  data,
  selected,
}: NodeProps<TextCardData>) {
  // Un sélecteur par carte : seules celles dont le palier change sont rendues à nouveau.
  const writing = useGraphViewStore((s) => s.writingNodeId === id)
  const tier = useGraphViewStore((s) => (s.writingNodeId === id ? 'write' : s.zoomTier))
  const showTestBars = useUiLayoutStore((s) => s.textCardsTestBars)
  const errors = data.validationErrors ?? []
  const warnings = data.validationWarnings ?? []
  const choiceCount = data.choices?.length ?? 0

  const borderColor = errors.length
    ? theme.state.error.border
    : warnings.length
      ? theme.state.warning.color
      : redesignNodeBorder.strong
  const stateLabel = writing
    ? 'En écriture'
    : data.status === 'pending'
      ? 'À valider'
      : selected
        ? 'Sélectionné'
        : null

  return (
    <article
      data-testid="graph-node-content"
      data-node-type="dialogue"
      data-card="text"
      data-tier={tier}
      data-status={data.status}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        useGraphViewStore.getState().openContextMenu(id, event.clientX, event.clientY)
      }}
      style={{
        position: 'relative',
        width: TEXT_CARD_WIDTH,
        boxSizing: 'border-box',
        background: redesignSurface.node,
        border: `1px solid ${selected || writing ? redesignAccent.base : borderColor}`,
        borderRadius: redesignRadius.node,
        boxShadow:
          selected || writing ? `0 0 0 3px ${redesignAccent.ring}, ${redesignNodeShadow}` : undefined,
        textAlign: 'left',
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ ...portStyle(NEUTRAL_PORT, false), top: 15 }}
      />
      <header
        style={{
          ...monoStyle,
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: tier === 'situate' ? '9px 14px' : '7px 11px',
          background: redesignSurface.nodeHeader,
          borderBottom: `1px solid ${redesignHairline.standard}`,
          borderRadius: `${redesignRadius.node - 1}px ${redesignRadius.node - 1}px 0 0`,
          letterSpacing: '0.09em',
          textTransform: 'uppercase',
          fontSize: tier === 'write' ? '10px' : '15px',
          lineHeight: tier === 'write' ? '16px' : '20px',
        }}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {data.speaker || 'PNJ'}
          {tier === 'write' && data.title ? ` · ${data.title}` : ''}
        </span>
        {stateLabel && <span style={{ color: redesignAccent.light }}>{stateLabel}</span>}
        {tier === 'read' && <span>{choiceCount} RÉP.</span>}
        {errors.length > 0 && (
          <span title={errors.map((e) => e.message).join('\n')} style={{ color: theme.state.error.color }}>
            ▲ {errors.length}
          </span>
        )}
        {errors.length === 0 && warnings.length > 0 && (
          <span title={warnings.map((w) => w.message).join('\n')} style={{ color: theme.state.warning.color }}>
            ▲ {warnings.length}
          </span>
        )}
      </header>

      {tier === 'write' ? (
        <WriteBody
          nodeId={id}
          data={data}
          selected={selected}
          writing={writing}
          showTestBars={showTestBars}
        />
      ) : tier === 'read' ? (
        <ReadBody data={data} showTestBars={showTestBars} />
      ) : (
        <SituateBody data={data} showTestBars={showTestBars} />
      )}
    </article>
  )
})
