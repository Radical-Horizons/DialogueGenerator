/**
 * Filtre Collections intégré à la barre de la liste Unity (Story 8.5 / FR84).
 * Un seul volet avec la liste : plus de rail latéral dédié.
 */
import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import type { DialogueCollection } from '../../api/collections'
import { theme } from '../../theme'
import {
  redesignAccent,
  redesignControl,
  redesignRadius,
  redesignSpacing,
} from '../../theme/redesignTokens'
import { remSize } from '../../theme/uiTypography'
import { ConfirmDialog } from '../shared/ConfirmDialog'
import { StyledSelect } from '../shared/StyledSelect'
import { COLLECTION_ICON_PALETTE } from './collectionIconPalette'

export interface CollectionManagerProps {
  collections: DialogueCollection[]
  activeCollectionId: string | null
  isGuest?: boolean
  isLoading?: boolean
  /** Dialogues cochés dans la liste (sélection batch) : seedent la collection à sa création. */
  checkedCount?: number
  onSelect: (collection: DialogueCollection | null) => void
  onCreate: (payload: {
    name: string
    description: string | null
    icon: string | null
  }) => Promise<void>
  onUpdate: (
    collectionId: string,
    payload: {
      name: string
      description: string | null
      icon: string | null
    }
  ) => Promise<void>
  onDelete: (collection: DialogueCollection) => Promise<void>
}

interface CollectionFormState {
  name: string
  description: string
  icon: string
}

const EMPTY_FORM: CollectionFormState = {
  name: '',
  description: '',
  icon: '',
}

/**
 * Hauteur explicite partagée par le `<select>` de filtre collection et le
 * bouton « + » voisin. Un `<select>` et un `<button>` ne convergent jamais
 * pile au pixel près en ne s'accordant que sur padding/bordure/line-height —
 * vécu : plusieurs tentatives ont laissé un écart ~7.5px résiduel malgré des
 * valeurs identiques sur les deux. Fixer la même hauteur explicite aux deux
 * évite de dépendre de ce mystère de rendu, quel que soit l'écran/la largeur.
 */
const SELECT_ROW_HEIGHT = '2.02rem'

const iconButtonStyle: CSSProperties = {
  appearance: 'none',
  WebkitAppearance: 'none',
  border: `1px solid ${theme.button.default.border}`,
  borderRadius: '6px',
  backgroundColor: theme.button.default.background,
  color: theme.text.secondary,
  cursor: 'pointer',
  padding: '0 0.5rem',
  fontSize: remSize('small'),
  height: SELECT_ROW_HEIGHT,
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}

/**
 * Sélecteur de collection + CRUD modal, destiné à la toolbar de la liste.
 */
export function CollectionManager({
  collections,
  activeCollectionId,
  isGuest = false,
  isLoading = false,
  checkedCount = 0,
  onSelect,
  onCreate,
  onUpdate,
  onDelete,
}: CollectionManagerProps) {
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<CollectionFormState>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<DialogueCollection | null>(
    null
  )
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const activeCollection =
    activeCollectionId == null
      ? null
      : collections.find((c) => c.id === activeCollectionId) ?? null

  useEffect(() => {
    if (!modalMode) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setModalMode(null)
        setEditingId(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [modalMode])

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setFormError(null)
    setEditingId(null)
    setModalMode('create')
  }

  const openEdit = (collection: DialogueCollection) => {
    setForm({
      name: collection.name,
      description: collection.description ?? '',
      icon: collection.icon ?? '',
    })
    setFormError(null)
    setEditingId(collection.id)
    setModalMode('edit')
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const name = form.name.trim()
    if (!name) {
      setFormError('Le nom est requis')
      return
    }
    if (isSubmitting) return
    setIsSubmitting(true)
    setFormError(null)
    const payload = {
      name,
      description: form.description.trim() || null,
      icon: form.icon.trim() || null,
    }
    try {
      if (modalMode === 'create') {
        await onCreate(payload)
      } else if (modalMode === 'edit' && editingId) {
        await onUpdate(editingId, payload)
      }
      setModalMode(null)
      setEditingId(null)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete || isDeleting) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      await onDelete(pendingDelete)
      setPendingDelete(null)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div
      data-testid="collection-manager"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        // `flex-start`, pas `center` : le select et le bouton ont maintenant
        // la même hauteur explicite (SELECT_ROW_HEIGHT), mais `center` les
        // centrait quand même différemment l'un de l'autre (constaté : 3.75px
        // d'écart vertical malgré des hauteurs identiques — un <label> et un
        // <button> flex ne partagent pas le même calcul de hauteur
        // hypothétique pré-alignement). Aligner les deux au même bord haut
        // élimine le problème sans dépendre de ce calcul.
        alignItems: 'flex-start',
        gap: '0.35rem',
        width: '100%',
        minWidth: 0,
      }}
    >
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          flex: '1 1 10rem',
          minWidth: 0,
          fontSize: remSize('small'),
          color: theme.text.secondary,
        }}
      >
        <span style={{ flexShrink: 0, fontWeight: 600 }}>Collection</span>
        <StyledSelect
          data-testid="collection-filter-select"
          aria-label="Filtrer par collection"
          disabled={isLoading}
          value={activeCollectionId ?? ''}
          onChange={(e) => {
            const value = e.target.value
            if (!value) {
              onSelect(null)
              return
            }
            const next = collections.find((c) => c.id === value) ?? null
            onSelect(next)
          }}
          style={{
            width: '100%',
            padding: '0 0.5rem',
            border: `1px solid ${theme.input.border}`,
            borderRadius: '6px',
            backgroundColor: theme.input.background,
            color: theme.input.color,
            fontSize: remSize('small'),
            // Hauteur explicite partagée avec le bouton « + » (SELECT_ROW_HEIGHT) :
            // ne pas laisser chacun dériver sa propre hauteur de son propre
            // padding/line-height, qui ne convergent jamais pile au pixel près
            // entre un <select> et un <button> (voir le commentaire de la constante).
            height: SELECT_ROW_HEIGHT,
            boxSizing: 'border-box',
          }}
          wrapperStyle={{ flex: 1, minWidth: 0 }}
        >
          <option data-testid="collection-filter-all" value="">
            Tous
          </option>
          {collections.map((collection) => (
            <option
              key={collection.id}
              data-testid={`collection-select-${collection.id}`}
              value={collection.id}
            >
              {collection.icon ? `${collection.icon} ` : ''}
              {collection.name} ({collection.dialogue_ids.length})
            </option>
          ))}
        </StyledSelect>
      </label>

      <button
        type="button"
        data-testid="collection-create-button"
        onClick={openCreate}
        disabled={isGuest}
        title={
          isGuest
            ? 'Connectez-vous pour créer une collection'
            : checkedCount > 0
              ? `Créer une collection avec ${checkedCount} dialogue${checkedCount > 1 ? 's' : ''} sélectionné${checkedCount > 1 ? 's' : ''}`
              : 'Nouvelle collection'
        }
        aria-label="Nouvelle collection"
        style={{
          // Action secondaire (créer une collection) : jamais le bleu plein
          // réservé à l'action primaire de l'écran — juste l'état
          // désactivé/actif du style par défaut, comme les autres boutons
          // de la toolbar (Métadonnées, Annuler…).
          ...iconButtonStyle,
          cursor: isGuest ? 'not-allowed' : 'pointer',
          opacity: isGuest ? 0.5 : 1,
        }}
      >
        +
      </button>

      {!isGuest && activeCollection && (
        <>
          <button
            type="button"
            data-testid={`collection-edit-${activeCollection.id}`}
            aria-label={`Modifier ${activeCollection.name}`}
            title={`Modifier ${activeCollection.name}`}
            onClick={() => openEdit(activeCollection)}
            style={iconButtonStyle}
          >
            Modifier
          </button>
          <button
            type="button"
            data-testid={`collection-delete-${activeCollection.id}`}
            aria-label={`Supprimer ${activeCollection.name}`}
            title={`Supprimer ${activeCollection.name}`}
            onClick={() => {
              setDeleteError(null)
              setPendingDelete(activeCollection)
            }}
            style={iconButtonStyle}
          >
            ×
          </button>
        </>
      )}

      {isLoading && (
        <span
          style={{
            fontSize: remSize('small'),
            color: theme.text.tertiary,
          }}
        >
          Chargement…
        </span>
      )}

      {modalMode && (
        <div
          data-testid="collection-modal"
          role="dialog"
          aria-modal="true"
          aria-label={
            modalMode === 'create' ? 'Nouvelle collection' : 'Modifier collection'
          }
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => {
            setModalMode(null)
            setEditingId(null)
          }}
        >
          <form
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              void handleSubmit(event)
            }}
            style={{
              width: 'min(22rem, 92vw)',
              backgroundColor: theme.background.elevated,
              border: `1px solid ${theme.border.secondary}`,
              borderRadius: redesignRadius.frame,
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.65rem',
            }}
          >
            <strong style={{ color: theme.text.primary }}>
              {modalMode === 'create'
                ? 'Nouvelle collection'
                : 'Modifier la collection'}
            </strong>
            <label style={{ fontSize: remSize('small'), color: theme.text.secondary }}>
              Nom
              <input
                data-testid="collection-form-name"
                value={form.name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, name: e.target.value }))
                }
                required
                maxLength={120}
                style={{
                  display: 'block',
                  width: '100%',
                  marginTop: '0.25rem',
                  padding: '0.4rem',
                  boxSizing: 'border-box',
                  backgroundColor: theme.input.background,
                  color: theme.input.color,
                  border: `1px solid ${theme.input.border}`,
                  borderRadius: redesignRadius.control,
                }}
              />
            </label>
            <label style={{ fontSize: remSize('small'), color: theme.text.secondary }}>
              Description (optionnel)
              <textarea
                data-testid="collection-form-description"
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, description: e.target.value }))
                }
                rows={3}
                maxLength={2000}
                style={{
                  display: 'block',
                  width: '100%',
                  marginTop: '0.25rem',
                  padding: '0.4rem',
                  boxSizing: 'border-box',
                  backgroundColor: theme.input.background,
                  color: theme.input.color,
                  border: `1px solid ${theme.input.border}`,
                  borderRadius: redesignRadius.control,
                  resize: 'vertical',
                }}
              />
            </label>
            <CollectionIconPicker
              value={form.icon}
              onChange={(icon) => setForm((prev) => ({ ...prev, icon }))}
            />
            {formError && (
              <div
                data-testid="collection-form-error"
                style={{ color: theme.state.error.color, fontSize: remSize('small') }}
              >
                {formError}
              </div>
            )}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.5rem',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setModalMode(null)
                  setEditingId(null)
                }}
                style={{
                  padding: '0.35rem 0.7rem',
                  border: `1px solid ${theme.button.default.border}`,
                  borderRadius: redesignRadius.control,
                  background: 'transparent',
                  color: theme.text.secondary,
                  cursor: 'pointer',
                }}
              >
                Annuler
              </button>
              <button
                type="submit"
                data-testid="collection-form-submit"
                disabled={isSubmitting}
                style={{
                  padding: '0.35rem 0.7rem',
                  border: 'none',
                  borderRadius: redesignRadius.control,
                  backgroundColor: theme.button.primary.background,
                  color: theme.button.primary.color,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                }}
              >
                {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteError && pendingDelete && (
        <div
          data-testid="collection-delete-error"
          style={{
            width: '100%',
            color: theme.state.error.color,
            fontSize: remSize('small'),
          }}
        >
          {deleteError}
        </div>
      )}

      <ConfirmDialog
        isOpen={pendingDelete != null}
        title="Supprimer la collection"
        message={
          pendingDelete
            ? `Supprimer « ${pendingDelete.name} » ? Les dialogues ne seront pas effacés.`
            : ''
        }
        confirmLabel={isDeleting ? 'Suppression…' : 'Supprimer'}
        variant="danger"
        onConfirm={() => {
          void confirmDelete()
        }}
        onCancel={() => {
          setPendingDelete(null)
          setDeleteError(null)
        }}
      />
    </div>
  )
}

interface CollectionIconPickerProps {
  value: string
  onChange: (icon: string) => void
}

/**
 * Choix d'icône parmi la palette, plus « aucune ». Une icône déjà enregistrée
 * hors palette reste proposée (et sélectionnée) pour ne pas être perdue à l'édition.
 */
function CollectionIconPicker({ value, onChange }: CollectionIconPickerProps) {
  const current = value.trim()
  const options: Array<{ icon: string; label: string }> = [
    { icon: '', label: 'Aucune icône' },
    ...COLLECTION_ICON_PALETTE,
  ]
  if (current && !COLLECTION_ICON_PALETTE.some((option) => option.icon === current)) {
    options.push({ icon: current, label: `Icône actuelle ${current}` })
  }
  return (
    <div style={{ fontSize: remSize('small'), color: theme.text.secondary }}>
      <span id="collection-form-icon-label">Icône (optionnel)</span>
      <div
        role="radiogroup"
        aria-labelledby="collection-form-icon-label"
        data-testid="collection-form-icon"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: redesignSpacing.xs,
          marginTop: redesignSpacing.xs,
        }}
      >
        {options.map((option) => {
          const selected = option.icon === current
          return (
            <button
              key={option.icon || 'none'}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={option.label}
              title={option.label}
              data-testid={`collection-icon-option-${option.icon || 'none'}`}
              onClick={() => onChange(option.icon)}
              style={{
                width: '2rem',
                height: '2rem',
                padding: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxSizing: 'border-box',
                border: `1px solid ${selected ? redesignAccent.base : redesignControl.border}`,
                borderRadius: redesignRadius.control,
                backgroundColor: selected ? redesignAccent.selectedBg : 'transparent',
                color: theme.text.secondary,
                fontSize: option.icon ? '1rem' : remSize('small'),
                cursor: 'pointer',
              }}
            >
              {option.icon || '∅'}
            </button>
          )
        })}
      </div>
    </div>
  )
}
