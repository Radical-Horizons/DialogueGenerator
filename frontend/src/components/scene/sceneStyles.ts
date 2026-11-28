/** Styles partagés par la fiche de scène (board `Fiche`). */
import type { CSSProperties } from 'react'
import {
  redesignControl,
  redesignFont,
  redesignHairline,
  redesignMonoLabelStyle,
  redesignRadius,
  redesignSpacing,
  redesignSurface,
  redesignText,
} from '../../theme/redesignTokens'

export const SCENE_CATEGORY_LABELS: Record<string, string> = {
  characters: 'personnage',
  locations: 'lieu',
  items: 'objet',
  species: 'espèce',
  communities: 'communauté',
  dialogues_examples: 'exemple de dialogue',
  narrative_structures: 'structure narrative',
  chapters: 'chapitre',
  scenes: 'scène',
}

export const monoLabel: CSSProperties = {
  ...redesignMonoLabelStyle,
  fontSize: '10px',
  letterSpacing: '0.1em',
  color: redesignText.label,
  whiteSpace: 'nowrap',
}

/** Étiquette de rangée alignée (« TON », « PROFIL D'AUTEUR »). */
export const rowLabel: CSSProperties = { ...monoLabel, width: 120, flex: 'none' }

export const buttonStyle: CSSProperties = {
  minHeight: 28,
  padding: '0 10px',
  borderRadius: redesignRadius.control,
  border: `1px solid ${redesignControl.border}`,
  background: 'transparent',
  color: redesignText.secondary,
  fontFamily: 'inherit',
  fontSize: '12.5px',
  cursor: 'pointer',
  flex: 'none',
}

export const fieldStyle: CSSProperties = {
  boxSizing: 'border-box',
  borderRadius: redesignRadius.control,
  border: `1px solid ${redesignControl.inputBorder}`,
  background: redesignSurface.panel,
  color: redesignText.body,
  fontFamily: 'inherit',
  fontSize: '13px',
}

export const chipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  minHeight: 28,
  boxSizing: 'border-box',
  padding: '0 9px',
  borderRadius: redesignRadius.chip,
  border: `1px solid ${redesignHairline.strong}`,
  fontSize: '13px',
  color: redesignText.body,
}

export const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: redesignSpacing.sm,
}

export const initialsStyle: CSSProperties = {
  width: 20,
  height: 20,
  flex: 'none',
  borderRadius: redesignRadius.chip,
  background: redesignSurface.nodeHeader,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: redesignFont.mono,
  fontSize: '10px',
}
