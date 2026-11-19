/**
 * Edge smoothstep avec label mémoïsé pour éviter le scintillement
 * pendant le déplacement des nœuds : seul le wrapper de position est mis à jour.
 */
import { memo, useMemo, useRef, useLayoutEffect, useState } from 'react'
import {
  getSmoothStepPath,
  BaseEdge,
  Position,
  useStore,
  type SmoothStepEdgeProps,
} from 'reactflow'
import { routeSmoothStepEdge, type RoutingBox } from '../../../utils/edgeRouting'
import { theme } from '../../../theme'
import { useGraphViewStore } from '../../../store/graphViewStore'
import {
  getChoiceEdgePathOptions,
  resolveSmoothStepLabelPosition,
  type ChoiceEdgeData,
} from '../../../utils/choiceEdgeGeometry'

/** Valeur par défaut de l'option `offset` de `getSmoothStepPath` (React Flow 11). */
const DEFAULT_SMOOTH_STEP_OFFSET = 20
const defaultLabelBgPadding: [number, number] = [4, 8]
const defaultLabelBgBorderRadius = 4

const MemoizedLabelContent = memo(function MemoizedLabelContent({
  label,
  labelStyle,
  labelShowBg,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
}: {
  label: string | React.ReactNode
  labelStyle?: React.CSSProperties
  labelShowBg?: boolean
  labelBgStyle?: React.CSSProperties
  labelBgPadding?: [number, number]
  labelBgBorderRadius?: number
}) {
  const textRef = useRef<SVGTextElement>(null)
  const [bbox, setBbox] = useState({ width: 0, height: 0, x: 0, y: 0 })

  useLayoutEffect(() => {
    if (textRef.current) {
      const b = textRef.current.getBBox()
      setBbox({ width: b.width, height: b.height, x: b.x, y: b.y })
    }
  }, [label])

  const text = typeof label === 'string' ? label : String(label)
  const padding = labelBgPadding ?? defaultLabelBgPadding
  const radius = labelBgBorderRadius ?? defaultLabelBgBorderRadius
  const showBg = labelShowBg !== false

  return (
    <g
      className="react-flow__edge-textwrapper"
      style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden' as const }}
      transform={`translate(${-bbox.x - bbox.width / 2}, ${-bbox.y - bbox.height / 2})`}
      visibility="visible"
    >
      {showBg && bbox.width > 0 && (
        <rect
          x={bbox.x - padding[0]}
          y={bbox.y - padding[1]}
          width={bbox.width + 2 * padding[0]}
          height={bbox.height + 2 * padding[1]}
          rx={radius}
          ry={radius}
          className="react-flow__edge-textbg"
          style={{
            fill: theme.background.panel,
            stroke: theme.border.primary,
            ...labelBgStyle,
          }}
        />
      )}
      <text
        ref={textRef}
        className="react-flow__edge-text"
        style={{
          fill: theme.text.primary,
          ...labelStyle,
        }}
      >
        {text}
      </text>
    </g>
  )
})

function StableLabelSmoothStepEdgeComponent(props: SmoothStepEdgeProps) {
  const {
    id,
    source,
    target,
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    label,
    labelStyle,
    labelShowBg,
    labelBgStyle,
    labelBgPadding,
    labelBgBorderRadius,
    style,
    markerEnd,
    markerStart,
    pathOptions,
    interactionWidth,
    data,
  } = props

  const edgeData = data as ChoiceEdgeData | undefined
  const isChoice = edgeData?.edgeType === 'choice'
  const choicePathOpts = isChoice
    ? getChoiceEdgePathOptions(edgeData?.choiceIndex)
    : undefined
  const mergedPathOptions =
    choicePathOpts != null ? { ...pathOptions, ...choicePathOpts } : pathOptions

  const nodeInternals = useStore((state) => state.nodeInternals)
  const offset = mergedPathOptions?.offset ?? DEFAULT_SMOOTH_STEP_OFFSET
  const routedCenter = useMemo(() => {
    if (sourcePosition !== Position.Bottom || targetPosition !== Position.Top) return {}
    const obstacles: RoutingBox[] = []
    nodeInternals.forEach((node) => {
      if (node.id === source || node.id === target || node.hidden) return
      const position = node.positionAbsolute ?? node.position
      if (!node.width || !node.height) return
      obstacles.push({ x: position.x, y: position.y, width: node.width, height: node.height })
    })
    return routeSmoothStepEdge({ sourceX, sourceY, targetX, targetY, offset, obstacles })
  }, [nodeInternals, source, target, sourceX, sourceY, targetX, targetY, offset, sourcePosition, targetPosition])
  const isRerouted = routedCenter.centerX != null || routedCenter.centerY != null

  const [path, pathLabelX, pathLabelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    ...mergedPathOptions,
    ...routedCenter,
  })

  // Un fil qui remonte (renvoi) longe un couloir étroit entre deux colonnes : son étiquette
  // y déborderait sur les nœuds voisins. Elle se pose sur le tronçon horizontal qui part
  // sous la source, dans l'intervalle libre entre deux rangées.
  const goesUp = sourceY + offset >= targetY - offset
  const upwardCorridorX = routedCenter.centerX ?? (sourceX + targetX) / 2
  // Un fil descendant détourné ne suit plus la diagonale source → cible : étiquette sur le tracé.
  const { x: labelX, y: labelY } = goesUp
    ? { x: (sourceX + upwardCorridorX) / 2, y: sourceY + offset }
    : isRerouted
    ? { x: pathLabelX, y: pathLabelY }
    : resolveSmoothStepLabelPosition({
        edgeType: edgeData?.edgeType,
        choiceIndex: edgeData?.choiceIndex,
        sourceX,
        sourceY,
        targetX,
        targetY,
        pathLabelX,
        pathLabelY,
      })

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={style}
        markerEnd={markerEnd}
        markerStart={markerStart}
        interactionWidth={interactionWidth}
      />
      {label != null && (
        <g
          transform={`translate(${labelX}, ${labelY})`}
          onDoubleClick={(e) => {
            if (edgeData?.edgeType !== 'choice') return
            e.preventDefault()
            e.stopPropagation()
            useGraphViewStore.getState().requestEdgeLabelEdit(id)
          }}
          style={{
            cursor: edgeData?.edgeType === 'choice' ? 'pointer' : undefined,
          }}
        >
          {/* L'étiquette est tronquée : le survol donne la réponse entière. */}
          {edgeData?.choiceText ? <title>{edgeData.choiceText}</title> : null}
          <MemoizedLabelContent
            label={label}
            labelStyle={labelStyle}
            labelShowBg={labelShowBg}
            labelBgStyle={labelBgStyle}
            labelBgPadding={labelBgPadding}
            labelBgBorderRadius={labelBgBorderRadius}
          />
        </g>
      )}
    </>
  )
}

export const StableLabelSmoothStepEdge = memo(StableLabelSmoothStepEdgeComponent)
