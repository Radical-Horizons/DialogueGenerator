/**
 * Sidebar + modal CRUD des collections de dialogues (Story 8.5 / FR84).
 */
import { useEffect, useState, type FormEvent } from 'react'
import type { DialogueCollection } from '../../api/collections'
import { theme } from '../../theme'
import { remSize } from '../../theme/uiTypography'
import { ConfirmDialog } from '../shared/ConfirmDialog'

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

/**
 * Affiche la liste des collections et gère création / édition / suppression.
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
    <aside
      data-testid="collection-manager"
      style={{
        width: '11.5rem',
        flexShrink: 0,
        borderRight: `1px solid ${theme.border.primary}`,
        backgroundColor: theme.background.panelHeader,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <div
        style={{
          padding: '0.45rem',
          borderBottom: `1px solid ${theme.border.primary}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.25rem',
        }}
      >
        <span
          style={{
            fontSize: remSize('small'),
            fontWeight: 600,
            color: theme.text.secondary,
          }}
        >
          Collections
        </span>
        {!isGuest && (
          <button
            type="button"
            data-testid="collection-create-button"
            onClick={openCreate}
            title="Nouvelle collection"
            style={{
              padding: '0.15rem 0.4rem',
              border: `1px solid ${theme.button.primary.background}`,
              borderRadius: '4px',
              backgroundColor: theme.button.primary.background,
              color: theme.button.primary.color,
              cursor: 'pointer',
              fontSize: remSize('small'),
            }}
          >
            +
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0.35rem' }}>
        <button
          type="button"
          data-testid="collection-filter-all"
          onClick={() => onSelect(null)}
          style={{
            width: '100%',
            textAlign: 'left',
            padding: '0.35rem 0.4rem',
            marginBottom: '0.25rem',
            border: 'none',
            borderRadius: '4px',
            backgroundColor:
              activeCollectionId == null
                ? theme.button.selected.background
                : 'transparent',
            color: theme.text.primary,
            cursor: 'pointer',
            fontSize: remSize('small'),
          }}
        >
          Tous les dialogues
        </button>
        {isLoading && (
          <div
            style={{
              padding: '0.35rem',
              fontSize: remSize('small'),
              color: theme.text.tertiary,
            }}
          >
            Chargement…
          </div>
        )}
        {collections.map((collection) => {
          const isActive = collection.id === activeCollectionId
          return (
            <div
              key={collection.id}
              data-testid={`collection-item-${collection.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.15rem',
                marginBottom: '0.2rem',
              }}
            >
              <button
                type="button"
                data-testid={`collection-select-${collection.id}`}
                onClick={() => onSelect(collection)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  textAlign: 'left',
                  padding: '0.35rem 0.4rem',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor: isActive
                    ? theme.button.selected.background
                    : 'transparent',
                  color: theme.text.primary,
                  cursor: 'pointer',
                  fontSize: remSize('small'),
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={collection.description ?? collection.name}
              >
                <span aria-hidden>{collection.icon || '📁'} </span>
                {collection.name}
                <span
                  style={{ color: theme.text.tertiary, marginLeft: '0.25rem' }}
                >
                  ({collection.dialogue_ids.length})
                </span>
              </button>
              {!isGuest && (
                <>
                  <button
                    type="button"
                    data-testid={`collection-edit-${collection.id}`}
                    aria-label={`Modifier ${collection.name}`}
                    onClick={() => openEdit(collection)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: theme.text.secondary,
                      cursor: 'pointer',
                      padding: '0.15rem',
                    }}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    data-testid={`collection-delete-${collection.id}`}
                    aria-label={`Supprimer ${collection.name}`}
                    onClick={() => {
                      setDeleteError(null)
                      setPendingDelete(collection)
                    }}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: theme.text.secondary,
                      cursor: 'pointer',
                      padding: '0.15rem',
                    }}
                  >
                    ×
                  </button>
                </>
              )}
            </div>
          )
        })}
      </div>

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
            padding: '0.35rem 0.45rem',
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
    </aside>
  )
}
