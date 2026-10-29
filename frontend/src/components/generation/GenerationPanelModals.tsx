/**
 * Composant pour tous les modals du panneau de génération.
 */
import { ConfirmDialog } from '../shared'
import { PresetValidationModal } from './PresetValidationModal'
import type { PresetValidationResult } from '../../types/preset'

export interface GenerationPanelModalsProps {
  /** Afficher le modal de confirmation de reset */
  showResetConfirm: boolean
  /** Afficher le modal de blocage budget */
  showBudgetBlock: boolean
  /** Message de blocage budget */
  budgetBlockMessage: string
  /** Résultat de validation preset */
  validationResult?: PresetValidationResult | null
  /** Modal de validation preset ouvert */
  isValidationModalOpen: boolean
  /** Callback pour confirmer reset */
  onResetConfirm: () => void
  /** Callback pour annuler reset */
  onResetCancel: () => void
  /** Callback pour fermer budget block */
  onBudgetBlockClose: () => void
  /** Callback pour fermer validation preset */
  onValidationClose: () => void
  /** Callback pour confirmer validation preset */
  onValidationConfirm: () => void
  /** Libellé modal (preset par défaut) */
  validationEntityLabel?: 'preset' | 'template'
}

/**
 * Tous les modals du panneau de génération.
 */
export function GenerationPanelModals({
  showResetConfirm,
  showBudgetBlock,
  budgetBlockMessage,
  validationResult,
  isValidationModalOpen,
  onResetConfirm,
  onResetCancel,
  onBudgetBlockClose,
  onValidationClose,
  onValidationConfirm,
  validationEntityLabel = 'preset',
}: GenerationPanelModalsProps) {
  return (
    <>
      {/* Modal de confirmation de reset */}
      <ConfirmDialog
        isOpen={showResetConfirm}
        title="Réinitialiser le formulaire"
        message="Vous avez des modifications non sauvegardées. Êtes-vous sûr de vouloir tout réinitialiser ? Cette action est irréversible."
        confirmLabel="Réinitialiser"
        cancelLabel="Annuler"
        variant="warning"
        onConfirm={onResetConfirm}
        onCancel={onResetCancel}
      />
      
      {/* Modal de validation preset */}
      {validationResult && (
        <PresetValidationModal
          isOpen={isValidationModalOpen}
          validationResult={validationResult}
          onClose={onValidationClose}
          onConfirm={onValidationConfirm}
          entityLabel={validationEntityLabel}
        />
      )}
      
      {/* Modal de blocage budget */}
      <ConfirmDialog
        isOpen={showBudgetBlock}
        title="Budget dépassé"
        message={budgetBlockMessage || "Votre quota mensuel a été atteint. Veuillez augmenter le budget ou attendre le prochain mois."}
        confirmLabel="Fermer"
        cancelLabel="Fermer"
        variant="danger"
        onConfirm={onBudgetBlockClose}
        onCancel={onBudgetBlockClose}
      />
    </>
  )
}
