/**
 * Tons de la scène (board `Fiche`) : une seule source, `scene.tones`, cochée depuis la
 * fiche comme depuis le panneau de génération IA.
 */
import { useRef, useState, type CSSProperties } from 'react'
import { useGraphStore } from '../../store/graphStore'
import {
  SCENE_TONES,
  addSceneTone,
  sceneTones,
  toggleSceneTone,
  type SceneSheet,
} from '../../utils/sceneSheet'
import {
  redesignAccent,
  redesignHairline,
  redesignNodeBorder,
  redesignRadius,
  redesignText,
} from '../../theme/redesignTokens'
import { fieldStyle, rowStyle } from './sceneStyles'

const toneStyle = (on: boolean): CSSProperties => ({
  minHeight: 26,
  boxSizing: 'border-box',
  padding: '0 11px',
  borderRadius: redesignRadius.chip,
  border: `1px solid ${on ? redesignAccent.base : redesignHairline.strong}`,
  background: on ? redesignAccent.selectedBg : 'transparent',
  color: on ? redesignAccent.light : redesignText.secondary,
  fontFamily: 'inherit',
  fontSize: '12.5px',
  lineHeight: '24px',
  flex: 'none',
})

export function SceneToneChips({ sheet, readOnly }: { sheet: SceneSheet; readOnly: boolean }) {
  const updateScene = useGraphStore((state) => state.updateScene)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const tones = sceneTones(sheet)
  const custom = tones.filter((tone) => !(SCENE_TONES as readonly string[]).includes(tone))

  const close = (keep: boolean) => {
    if (keep && draft.trim()) updateScene((current) => addSceneTone(current, draft))
    setDraft('')
    setAdding(false)
  }

  if (readOnly) {
    return (
      <div role="group" aria-label="Ton" style={rowStyle}>
        {tones.map((tone) => (
          <span key={tone} style={toneStyle(true)}>
            {tone}
          </span>
        ))}
        {tones.length === 0 ? (
          <span style={{ fontSize: '12.5px', color: redesignText.muted }}>Aucun ton choisi.</span>
        ) : null}
      </div>
    )
  }

  return (
    <div role="group" aria-label="Ton" style={rowStyle}>
      {[...SCENE_TONES, ...custom].map((tone) => {
        const on = tones.includes(tone)
        return (
          <button
            key={tone}
            type="button"
            aria-pressed={on}
            onClick={() => updateScene((current) => toggleSceneTone(current, tone))}
            style={{ ...toneStyle(on), cursor: 'pointer' }}
          >
            {tone}
          </button>
        )
      })}
      {adding ? (
        <input
          // Le champ remplace le bouton « + » que l'auteur vient d'actionner.
          autoFocus
          aria-label="Nouveau ton"
          value={draft}
          maxLength={40}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => close(true)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== 'Escape') return
            event.preventDefault()
            event.stopPropagation()
            close(event.key === 'Enter')
            requestAnimationFrame(() => addButtonRef.current?.focus())
          }}
          style={{ ...fieldStyle, height: 26, width: 140, padding: '0 11px', borderRadius: redesignRadius.chip }}
        />
      ) : (
        <button
          ref={addButtonRef}
          type="button"
          aria-label="Ajouter un ton"
          onClick={() => setAdding(true)}
          style={{
            ...toneStyle(false),
            width: 26,
            padding: 0,
            border: `1px dashed ${redesignNodeBorder.strong}`,
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          +
        </button>
      )}
    </div>
  )
}
