/**
 * Styles VN pour le mode playthrough scénario.
 */
import { theme } from '../../../theme'
import { redesignAccent, redesignSurface } from '../../../theme/redesignTokens'

export const PLAYTHROUGH_OVERLAY_Z_INDEX = 12000

export const playthroughChrome = {
  overlayBackground: `linear-gradient(180deg, ${redesignSurface.canvas} 0%, ${theme.background.primary} 40%, ${redesignSurface.canvas} 100%)`,
  stageMaxWidth: 'min(720px, 92vw)',
  choiceAccent: redesignAccent.text,
  /** Halo et fond des choix non testés : même teinte que `choiceAccent` (`redesignAccent.text`). */
  choiceUntestedGlow: '0 0 0 2px rgba(143, 176, 255, 0.55)',
  choiceUntestedBackground: 'rgba(143, 176, 255, 0.12)',
  speakerColor: redesignAccent.light,
  lineFontSize: 'clamp(1.05rem, 2.5vw, 1.35rem)',
  topBarHeight: 48,
  devDrawerWidth: 'min(380px, 94vw)',
} as const
