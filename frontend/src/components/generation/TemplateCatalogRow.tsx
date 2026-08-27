/**
 * Une ligne du catalogue de templates.
 *
 * Ce que je vois, je peux le modifier : un template partagé appartient à l'équipe qui
 * le voit, un template privé n'est visible que de son auteur. Le statut porte déjà
 * toute la frontière — un verrou de propriété par-dessus rendait la moitié de la liste
 * inerte, y compris pour un admin.
 */
import React from 'react';
import type { CatalogueItem } from '../../utils/templateCatalog';
import type { Template } from '../../types/template';
import { theme } from '../../theme';
import {
  redesignAccent,
  redesignFont,
  redesignHairline,
  redesignRadius,
  redesignText,
} from '../../theme/redesignTokens';
import { generationPanelChrome } from '../../theme/responsiveChrome';
import { TOUCH_TARGET_MIN_PX } from '../../constants';

type Chrome =
  | typeof generationPanelChrome.comfortable
  | typeof generationPanelChrome.narrow;

export interface TemplateCatalogRowProps {
  item: CatalogueItem;
  chrome: Chrome;
  /** Session sans droit d'écriture (invité) : la liste se consulte, rien de plus. */
  readOnly: boolean;
  onApply: (template: Template) => void;
  onToggleVisibility: (template: Template) => void;
  onEdit: (template: Template) => void;
  onDelete: (template: Template) => void;
}

/** Pastille de statut : discrète pour le cas courant, marquée pour un brouillon. */
function chipStyle(marque: boolean, cliquable: boolean): React.CSSProperties {
  return {
    appearance: 'none',
    height: 18,
    padding: '0 8px',
    borderRadius: 99,
    fontSize: '10.5px',
    fontFamily: redesignFont.mono,
    letterSpacing: '0.06em',
    cursor: cliquable ? 'pointer' : 'default',
    border: `1px solid ${marque ? redesignAccent.ring : redesignHairline.strong}`,
    background: marque ? redesignAccent.selectedBg : 'transparent',
    color: marque ? redesignAccent.light : redesignText.muted,
  };
}

function boutonStyle(chrome: Chrome, couleur?: string): React.CSSProperties {
  return {
    minHeight: TOUCH_TARGET_MIN_PX,
    padding: chrome.buttonPadding,
    backgroundColor: theme.button.default.background,
    border: `1px solid ${theme.border.secondary}`,
    borderRadius: `${redesignRadius.control}px`,
    color: couleur ?? theme.button.default.color,
    cursor: 'pointer',
    fontSize: `${chrome.buttonFontRem}rem`,
  };
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString;
  }
  return date.toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function derniereModification(template: Template): string | undefined {
  return template.history?.at(-1)?.at ?? template.metadata?.modified ?? template.metadata?.created;
}

export function TemplateCatalogRow({
  item,
  chrome,
  readOnly,
  onApply,
  onToggleVisibility,
  onEdit,
  onDelete,
}: TemplateCatalogRowProps): React.ReactElement {
  const secondaire: React.CSSProperties = {
    fontSize: `${chrome.labelFontRem}rem`,
    color: theme.text.secondary,
  };
  const modifieLe = derniereModification(item.template);
  const { characters, locations } = item.template.configuration;

  return (
    <div
      data-testid="template-item"
      data-template-name={item.name}
      data-template-category={item.category}
      data-catalogue-badge={item.badge}
      onClick={() => onApply(item.template)}
      style={{
        padding: chrome.dropdownOptionPadding,
        border: `1px solid ${theme.border.secondary}`,
        borderRadius: `${redesignRadius.control}px`,
        marginBottom: '0.35rem',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.5rem',
        cursor: 'pointer',
      }}
    >
      <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>{item.icon}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, color: theme.text.primary }}>{item.name}</span>

          {/* Le statut se bascule depuis la pastille, sur n'importe quelle ligne. */}
          {readOnly ? (
            <span data-testid="catalogue-badge" style={chipStyle(false, false)}>
              {item.badge}
            </span>
          ) : (
            <button
              type="button"
              data-testid="template-visibility-toggle"
              data-visibility={item.visibility}
              onClick={(event) => {
                event.stopPropagation();
                onToggleVisibility(item.template);
              }}
              title={
                item.visibility === 'private'
                  ? 'Brouillon visible de vous seul — cliquer pour partager'
                  : "Visible de l'équipe — cliquer pour repasser en brouillon"
              }
              style={chipStyle(item.visibility === 'private', true)}
            >
              {item.badge}
            </button>
          )}
        </div>

        {item.description && <div style={secondaire}>{item.description}</div>}

        {modifieLe && (
          <div data-testid="template-item-modified" style={secondaire}>
            Modifié le {formatDate(modifieLe)}
          </div>
        )}

        <div style={secondaire}>
          {characters.length > 0 ? `Contexte : ${characters.join(', ')}` : 'Contexte : —'}
          {locations.length > 0 ? ` · ${locations.join(', ')}` : ''}
        </div>

        {!readOnly && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              data-testid="template-item-edit-btn"
              onClick={(event) => {
                event.stopPropagation();
                onEdit(item.template);
              }}
              style={boutonStyle(chrome)}
            >
              Éditer
            </button>
            <button
              type="button"
              data-testid="template-item-delete-btn"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(item.template);
              }}
              style={boutonStyle(chrome, theme.state.error.color)}
            >
              Supprimer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
