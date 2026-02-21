/**
 * Edge smoothstep avec label mémoïsé pour éviter le scintillement
 * pendant le déplacement des nœuds : seul le wrapper de position est mis à jour.
 */
import { memo, useRef, useEffect, useState } from 'react'
import {
  getSmoothStepPath,
  BaseEdge,
  type SmoothStepEdgeProps,
} from 'reactflow'
import { theme } from '../../../theme'

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

  useEffect(() => {
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
      visibility={bbox.width ? 'visible' : 'hidden'}
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
            fill: theme.background.panel ?? '#2a2a2a',
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
  } = props

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    ...pathOptions,
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
        <g transform={`translate(${labelX}, ${labelY})`}>
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
