/**
 * Une ligne du catalogue unifié de templates.
 *
 * La provenance décide de ce que la ligne offre — pas la section dans laquelle elle se
 * trouve, puisqu'il n'y en a plus qu'une. Un template d'équipe s'applique mais ne s'édite
 * ni ne se supprime ; une fiche fournie se copie ; seuls les miens portent une pastille
 * de statut cliquable.
 */
import React from 'react';
import type { CatalogueItem } from '../../utils/templateCatalog';
import type { PrebuiltTemplate, Template } from '../../types/template';
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
import { isPrebuiltNew } from '../../utils/templateApply';

type Chrome =
  | typeof generationPanelChrome.comfortable
  | typeof generationPanelChrome.narrow;

export interface TemplateCatalogRowProps {
  item: CatalogueItem;
  chrome: Chrome;
  /** Une copie de fiche fournie est en cours : on évite le double envoi. */
  copying: boolean;
  onOpen: (item: CatalogueItem) => void;
  onToggleVisibility: (template: Template) => void;
  onEdit: (template: Template) => void;
  onDelete: (template: Template) => void;
  onCopyPrebuilt: (prebuilt: PrebuiltTemplate) => void;
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
  return template.history?.at(-1)?.at ?? template.metadata.modified ?? template.metadata.created;
}

export function TemplateCatalogRow({
  item,
  chrome,
  copying,
  onOpen,
  onToggleVisibility,
  onEdit,
  onDelete,
  onCopyPrebuilt,
}: TemplateCatalogRowProps): React.ReactElement {
  const fourni = item.source.kind === 'prebuilt';
  const mien = item.provenance === 'mien';
  const secondaire: React.CSSProperties = {
    fontSize: `${chrome.labelFontRem}rem`,
    color: theme.text.secondary,
  };

  return (
    <div
      data-testid={fourni ? 'prebuilt-template-item' : 'template-item'}
      data-catalogue-provenance={item.provenance}
      data-catalogue-badge={item.badge}
      {...(fourni
        ? { 'data-prebuilt-id': item.id, 'data-prebuilt-name': item.name }
        : { 'data-template-name': item.name, 'data-template-category': item.category })}
      onClick={() => onOpen(item)}
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

          {/* Seul le propriétaire décide qui voit son template : pour les autres la
              pastille informe, elle n'agit pas. */}
          {mien ? (
            <button
              type="button"
              data-testid="template-visibility-toggle"
              data-visibility={item.visibility ?? 'shared'}
              onClick={(event) => {
                event.stopPropagation();
                if (item.source.kind === 'custom') onToggleVisibility(item.source.value);
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
          ) : (
            <span data-testid="catalogue-badge" style={chipStyle(false, false)}>
              {item.badge}
            </span>
          )}

          {item.source.kind === 'prebuilt' && isPrebuiltNew(item.source.value.addedAt) && (
            <span
              data-testid="prebuilt-new-badge"
              style={{
                fontSize: `${chrome.labelFontRem}rem`,
                fontWeight: 600,
                color: theme.state.info?.color ?? theme.text.secondary,
              }}
            >
              Nouveau
            </span>
          )}
        </div>

        {item.description && <div style={secondaire}>{item.description}</div>}

        {item.source.kind === 'prebuilt' ? (
          <>
            <div data-testid="prebuilt-item-gdd-system" style={secondaire}>
              {item.source.value.gddSystem}
            </div>
            <div data-testid="prebuilt-item-scene-type" style={secondaire}>
              {item.source.value.sceneTypeHint}
            </div>
            <div data-testid="prebuilt-item-preview" style={secondaire}>
              {item.source.value.configuration.instructions.slice(0, 120)}
              {item.source.value.configuration.instructions.length > 120 ? '…' : ''}
            </div>
          </>
        ) : (
          <>
            {derniereModification(item.source.value) && (
              <div data-testid="template-item-modified" style={secondaire}>
                Modifié le {formatDate(derniereModification(item.source.value) as string)}
              </div>
            )}
            <div style={secondaire}>
              {item.source.value.configuration.characters.length > 0
                ? `Contexte : ${item.source.value.configuration.characters.join(', ')}`
                : 'Contexte : —'}
              {item.source.value.configuration.locations.length > 0
                ? ` · ${item.source.value.configuration.locations.join(', ')}`
                : ''}
            </div>
          </>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.5rem' }}>
          {fourni && (
            <button
              type="button"
              data-testid="prebuilt-item-copy-btn"
              disabled={copying}
              onClick={(event) => {
                event.stopPropagation();
                if (item.source.kind === 'prebuilt') onCopyPrebuilt(item.source.value);
              }}
              style={boutonStyle(chrome)}
            >
              Copier vers mes templates
            </button>
          )}

          {/* Un template d'équipe s'applique, il ne se modifie pas : le proposer puis
              refuser côté serveur serait une promesse que l'écran ne peut pas tenir. */}
          {mien && item.source.kind === 'custom' && (
            <>
              <button
                type="button"
                data-testid="template-item-edit-btn"
                onClick={(event) => {
                  event.stopPropagation();
                  if (item.source.kind === 'custom') onEdit(item.source.value);
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
                  if (item.source.kind === 'custom') onDelete(item.source.value);
                }}
                style={boutonStyle(chrome, theme.state.error.color)}
              >
                Supprimer
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
