/**
 * Filtre Collections intégré à la barre de la liste Unity (Story 8.5 / FR84).
 * Un seul volet avec la liste : plus de rail latéral dédié.
 */
import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import type { DialogueCollection } from '../../api/collections'
import { theme } from '../../theme'
import { remSize } from '../../theme/uiTypography'
import { ConfirmDialog } from '../shared/ConfirmDialog'
import { StyledSelect } from '../shared/StyledSelect'

export interface CollectionManagerProps {
  collections: DialogueCollection[]
  activeCollectionId: string | null
  isGuest?: boolean
  isLoading?: boolean
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
  icon: '📁',
}

const iconButtonStyle: CSSProperties = {
  border: `1px solid ${theme.border.primary}`,
  borderRadius: '6px',
  backgroundColor: theme.button.default.background,
  color: theme.text.secondary,
  cursor: 'pointer',
  padding: '0.35rem 0.5rem',
  fontSize: remSize('small'),
  flexShrink: 0,
  minHeight: 36,
}

/**
 * Sélecteur de collection + CRUD modal, destiné à la toolbar de la liste.
 */
export function CollectionManager({
  collections,
  activeCollectionId,
  isGuest = false,
  isLoading = false,
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
      icon: collection.icon ?? '📁',
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
        alignItems: 'center',
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
            padding: '0.4rem 0.5rem',
            border: `1px solid ${theme.input.border}`,
            borderRadius: '6px',
            backgroundColor: theme.input.background,
            color: theme.input.color,
            fontSize: remSize('small'),
          }}
          wrapperStyle={{ flex: 1, minWidth: 0 }}
        >
          <option data-testid="collection-filter-all" value="">
            Tous les dialogues
          </option>
          {collections.map((collection) => (
            <option
              key={collection.id}
              data-testid={`collection-select-${collection.id}`}
              value={collection.id}
            >
              {(collection.icon || '📁') + ' '}
              {collection.name} ({collection.dialogue_ids.length})
            </option>
          ))}
        </StyledSelect>
      </label>

      {!isGuest && (
        <button
          type="button"
          data-testid="collection-create-button"
          onClick={openCreate}
          title="Nouvelle collection"
          aria-label="Nouvelle collection"
          style={{
            ...iconButtonStyle,
            borderColor: theme.button.primary.background,
            backgroundColor: theme.button.primary.background,
            color: theme.button.primary.color,
          }}
        >
          +
        </button>
      )}

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
            ✎
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
              backgroundColor: theme.background.panel,
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '8px',
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
                  borderRadius: '4px',
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
                  borderRadius: '4px',
                  resize: 'vertical',
                }}
              />
            </label>
            <label style={{ fontSize: remSize('small'), color: theme.text.secondary }}>
              Icône emoji (optionnel)
              <input
                data-testid="collection-form-icon"
                value={form.icon}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, icon: e.target.value }))
                }
                maxLength={16}
                style={{
                  display: 'block',
                  width: '100%',
                  marginTop: '0.25rem',
                  padding: '0.4rem',
                  boxSizing: 'border-box',
                  backgroundColor: theme.input.background,
                  color: theme.input.color,
                  border: `1px solid ${theme.input.border}`,
                  borderRadius: '4px',
                }}
              />
            </label>
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
                  border: `1px solid ${theme.border.primary}`,
                  borderRadius: '4px',
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
                  borderRadius: '4px',
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
