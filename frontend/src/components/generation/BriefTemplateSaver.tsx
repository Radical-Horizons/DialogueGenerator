/**
 * Enregistre le brief courant comme template, depuis l'onglet Brief.
 *
 * Le bouton vivait dans l'onglet Templates, à côté d'une liste : on ne pouvait pas
 * deviner ce qu'il capturait. Il capture le brief — il est donc sous le brief, et son
 * libellé le dit.
 */
import React, { useState } from 'react';
import { TemplateCreatorModal } from './TemplateCreatorModal';
import type { TemplateConfiguration } from '../../types/template';
import { redesignControl, redesignRadius, redesignText } from '../../theme/redesignTokens';

export interface BriefTemplateSaverProps {
  /** Capture de la configuration au moment du clic (brief, contexte, modèle). */
  getConfiguration: () => TemplateConfiguration | null;
  /** Session sans droit d'écriture : l'action n'est pas proposée. */
  readOnly?: boolean;
}

export function BriefTemplateSaver({
  getConfiguration,
  readOnly = false,
}: BriefTemplateSaverProps): React.ReactElement | null {
  // Le snapshot fige la configuration à l'ouverture : éditer le brief pendant que la
  // modale est ouverte ne doit pas changer ce qui sera enregistré.
  const [snapshot, setSnapshot] = useState<TemplateConfiguration | null>(null);

  if (readOnly) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        data-testid="brief-save-as-template-btn"
        onClick={() => setSnapshot(getConfiguration())}
        style={{
          marginTop: 9,
          padding: '0.42rem 0.85rem',
          background: 'transparent',
          border: `1px solid ${redesignControl.border}`,
          borderRadius: `${redesignRadius.control}px`,
          color: redesignText.secondary,
          cursor: 'pointer',
          fontSize: '0.82rem',
        }}
      >
        Sauvegarder ce brief comme template
      </button>

      <TemplateCreatorModal
        isOpen={snapshot != null}
        snapshot={snapshot}
        onClose={() => setSnapshot(null)}
      />
    </>
  );
}
