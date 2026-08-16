/**
 * PresetValidationModal - Modal d'affichage de la validation d'un preset
 * 
 * Affiche le résultat de la validation GDD d'un preset :
 * - ✅ Valide : toutes les références existent dans le GDD
 * - ⚠️ Invalide : certaines références sont obsolètes ou manquantes
 * 
 * Permet de charger le preset malgré les warnings (choix utilisateur).
 */
import React from 'react';
import type { PresetValidationResult } from '../../types/preset';
import { theme } from '../../theme';
import { remSize } from '../../theme/uiTypography';
import { useNarrowInlineSize } from '../../hooks/useNarrowInlineSize';
import { modalTypography } from '../../theme/responsiveChrome';

export interface PresetValidationModalProps {
  /** Contrôle l'affichage de la modal */
  isOpen: boolean;
  /** Résultat de la validation du preset */
  validationResult: PresetValidationResult;
  /** Callback pour fermer la modal */
  onClose: () => void;
  /** Callback pour confirmer le chargement du preset */
  onConfirm: () => void;
  /** Libellé (preset par défaut, template pour le flux 6.3) */
  entityLabel?: 'preset' | 'template';
}

/**
 * Modal de validation de preset.
 * 
 * États :
 * - Valide : Affiche message de succès + bouton "Charger"
 * - Invalide : Affiche warnings + bouton "Charger quand même"
 */
export const PresetValidationModal: React.FC<PresetValidationModalProps> = ({
  isOpen,
  validationResult,
  onClose,
  onConfirm,
  entityLabel = 'preset',
}) => {
  const { ref: panelRef, isNarrow } = useNarrowInlineSize(520);
  const typo = isNarrow ? modalTypography.narrow : modalTypography.comfortable;
  if (!isOpen) return null;

  const { valid, warnings, obsoleteRefs } = validationResult;
  const entityWord = entityLabel === 'template' ? 'template' : 'preset';
  const entityWordCap = entityLabel === 'template' ? 'Template' : 'Preset';

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
      onClick={onClose}
      data-testid="preset-validation-modal"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: theme.background.elevated,
          padding: isNarrow ? '0.9rem' : '2rem',
          borderRadius: '8px',
          minWidth: isNarrow ? 'unset' : '400px',
          maxWidth: '600px',
          maxHeight: '80vh',
          overflowY: 'auto',
          border: `1px solid ${theme.border.primary}`,
        }}
        ref={panelRef}
      >
        <h3 style={{ marginTop: 0, color: theme.text.primary }}>Validation du {entityWord}</h3>

        {/* État : Valide */}
        {valid && (
          <div
            style={{
              padding: '1rem',
              backgroundColor: theme.background.secondary,
              borderRadius: '4px',
              marginBottom: '1.5rem',
              border: `1px solid ${theme.state.success.color}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: remSize('title') }}>✅</span>
              <strong style={{ color: theme.state.success.color }}>{entityWordCap} valide</strong>
            </div>
            <div style={{ fontSize: `${typo.bodyFontRem}rem`, color: theme.text.secondary }}>
              Toutes les références sont valides et existent dans le GDD actuel.
            </div>
          </div>
        )}

        {/* État : Invalide */}
        {!valid && (
          <div
            style={{
              padding: '1rem',
              backgroundColor: theme.background.secondary,
              borderRadius: '4px',
              marginBottom: '1.5rem',
              border: `1px solid ${theme.state.warning.color}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: remSize('title') }}>⚠️</span>
              <strong style={{ color: theme.state.warning.color }}>{entityWordCap} contient des références obsolètes</strong>
            </div>
            <div style={{ fontSize: `${typo.bodyFontRem}rem`, color: theme.text.secondary, marginBottom: '1rem' }}>
              {obsoleteRefs.length} référence(s) obsolète(s) détectée(s). Le {entityWord} peut être chargé, mais
              certaines entités peuvent manquer.
            </div>

            {/* Liste des warnings */}
            {warnings.length > 0 && (
              <div
                style={{
                  maxHeight: '200px',
                  overflowY: 'auto',
                  backgroundColor: theme.background.primary,
                  padding: '0.75rem',
                  borderRadius: '4px',
                }}
              >
                {warnings.map((warning, index) => (
                  <div
                    key={index}
                    style={{
                      fontSize: `${typo.bodyFontRem}rem`,
                      color: theme.text.secondary,
                      marginBottom: index < warnings.length - 1 ? '0.5rem' : 0,
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.5rem',
                    }}
                  >
                    <span style={{ color: theme.state.warning.color, flexShrink: 0 }}>•</span>
                    <span>{warning}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Boutons */}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button
            type="button"
            data-testid="preset-validation-cancel"
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: theme.background.secondary,
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '4px',
              color: theme.text.primary,
              cursor: 'pointer',
              fontSize: `${typo.bodyFontRem}rem`,
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            data-testid="preset-validation-confirm"
            onClick={onConfirm}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: valid ? theme.button.primary.background : theme.state.warning.color,
              border: 'none',
              borderRadius: '4px',
              color: 'white',
              cursor: 'pointer',
              fontSize: `${typo.bodyFontRem}rem`,
            }}
          >
            {valid ? 'Charger' : 'Charger quand même'}
          </button>
        </div>
      </div>
    </div>
  );
};
