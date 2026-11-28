/**
 * Titre de la scène, écrit sur place et enregistré au fil de la saisie. Le nom du fichier
 * ne change pas ; un titre vide n'est pas enregistré.
 */
import { useRef, useState, type CSSProperties } from 'react'
import { useGraphStore } from '../../store/graphStore'
import {
  redesignFont,
  redesignHairline,
  redesignSpacing,
  redesignText,
} from '../../theme/redesignTokens'

const titleStyle: CSSProperties = {
  margin: `${redesignSpacing.sm}px 0 0`,
  fontFamily: redesignFont.serif,
  fontWeight: 400,
  fontSize: '33px',
  lineHeight: 1.12,
  color: redesignText.strong,
}

/** Partagé par le champ et sa copie : les deux doivent couper les lignes au même endroit. */
const textStyle: CSSProperties = {
  gridArea: '1 / 1',
  minWidth: 0,
  margin: 0,
  padding: 0,
  boxSizing: 'border-box',
  font: 'inherit',
  letterSpacing: 'inherit',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
}

export function SceneTitleField({ title, readOnly }: { title: string; readOnly: boolean }) {
  const setDocumentTitle = useGraphStore((state) => state.setDocumentTitle)
  const [draft, setDraft] = useState<string | null>(null)
  /** Titre enregistré avant la saisie en cours ; `undefined` tant que rien n'est tapé. */
  const previous = useRef<string | null | undefined>(undefined)

  if (readOnly) return <h2 style={titleStyle}>{title}</h2>

  const type = (raw: string) => {
    // Un collage peut porter des retours à la ligne : le titre n'en garde aucun.
    const value = raw.replace(/\s*[\r\n]+\s*/g, ' ')
    if (previous.current === undefined) {
      const stored = useGraphStore.getState().document?.title
      previous.current = typeof stored === 'string' ? stored : null
    }
    setDraft(value)
    if (value.trim()) setDocumentTitle(value)
  }

  const leave = () => {
    if (draft !== null && previous.current !== undefined) {
      const next = draft.trim() || previous.current
      const stored = useGraphStore.getState().document?.title
      // Réécrire un titre inchangé le ferait primer sur un renommage fait ailleurs.
      if (next !== (typeof stored === 'string' ? stored : null)) setDocumentTitle(next)
    }
    previous.current = undefined
    setDraft(null)
  }

  const value = draft ?? title

  return (
    <h2 style={titleStyle}>
      {/* La copie invisible donne sa hauteur à la case : le champ suit, sans mesure. */}
      <span style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <span aria-hidden="true" style={{ ...textStyle, visibility: 'hidden' }}>
          {`${value} `}
        </span>
        <textarea
          aria-label="Titre de la scène"
          rows={1}
          value={value}
          onChange={(event) => type(event.target.value)}
          onBlur={leave}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            event.currentTarget.blur()
          }}
          style={{
            ...textStyle,
            width: '100%',
            alignSelf: 'stretch',
            border: 'none',
            borderRadius: 0,
            boxShadow: `inset 0 -1px 0 ${redesignHairline.standard}`,
            background: 'transparent',
            color: 'inherit',
            resize: 'none',
            overflow: 'hidden',
          }}
        />
      </span>
    </h2>
  )
}
