/**
 * Styles VN pour le mode playthrough scénario.
 */
import { theme } from '../../../theme'

export const PLAYTHROUGH_OVERLAY_Z_INDEX = 12000

export const playthroughChrome = {
  overlayBackground: `linear-gradient(180deg, #0a0a12 0%, ${theme.background.primary} 40%, #0d1117 100%)`,
  stageMaxWidth: 'min(720px, 92vw)',
  choiceAccent: '#646cff',
  choiceUntestedGlow: '0 0 0 2px rgba(100, 108, 255, 0.55)',
  speakerColor: '#a8b4ff',
  lineFontSize: 'clamp(1.05rem, 2.5vw, 1.35rem)',
  topBarHeight: 48,
  devDrawerWidth: 'min(380px, 94vw)',
} as const
