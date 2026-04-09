/**
 * Modal pour la sélection des flags in-game.
 */
import { useEffect, useCallback, useRef } from 'react'
import { useFlagsStore } from '../../store/flagsStore'
import { theme } from '../../theme'
import { remSize } from '../../theme/uiTypography'
import { useNarrowInlineSize } from '../../hooks/useNarrowInlineSize'
import { modalTypography } from '../../theme/responsiveChrome'
import { useToast } from '../shared'
import type { FlagDefinition } from '../../types/flags'
import * as flagsAPI from '../../api/flags'
import { getErrorMessage } from '../../types/errors'

export interface InGameFlagsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function InGameFlagsModal({ isOpen, onClose }: InGameFlagsModalProps) {
  const { ref: panelRef, isNarrow } = useNarrowInlineSize(720)
  const typo = isNarrow ? modalTypography.narrow : modalTypography.comfortable
  const {
    catalog,
    selectedFlags,
    query,
    favoritesOnly,
    selectedCategories,
    isLoading,
    error,
    loadCatalog,
    searchFlags,
    toggleFavoritesFilter,
    toggleCategoryFilter,
    clearFilters,
    toggleBoolFlag,
    setNumericFlag,
    setStringFlag,
    removeFlag,
    clearFlags,
    toggleFavoriteInCatalog,
    importFromSnapshot,
    exportToSnapshot
  } = useFlagsStore()
  
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Charger le catalogue au montage
  useEffect(() => {
    if (isOpen && catalog.length === 0) {
      loadCatalog()
    }
  }, [isOpen, catalog.length, loadCatalog])
  
  // Gérer la fermeture avec ESC
  useEffect(() => {
    if (!isOpen) return
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])
  
  // Filtrer les flags selon les critères
  const filteredFlags = useCallback(() => {
    let results = catalog
    
    // Filtre favoris
    if (favoritesOnly) {
      results = results.filter(f => f.isFavorite)
    }
    
    // Filtre catégories
    if (selectedCategories.size > 0) {
      results = results.filter(f => selectedCategories.has(f.category))
    }
    
    // Recherche textuelle
    if (query.trim()) {
      const q = query.toLowerCase()
      results = results.filter(f =>
        f.id.toLowerCase().includes(q) ||
        f.label.toLowerCase().includes(q) ||
        f.description?.toLowerCase().includes(q) ||
        f.tags.some(t => t.toLowerCase().includes(q))
      )
    }
    
    return results
  }, [catalog, query, favoritesOnly, selectedCategories])
  
  // Regrouper par catégorie
  const flagsByCategory = useCallback(() => {
    const filtered = filteredFlags()
    const grouped: Record<string, FlagDefinition[]> = {}
    
    for (const flag of filtered) {
      if (!grouped[flag.category]) {
        grouped[flag.category] = []
      }
      grouped[flag.category].push(flag)
    }
    
    return grouped
  }, [filteredFlags])
  
  const categories = Array.from(new Set(catalog.map(f => f.category)))
  
  const handleToggleFavorite = async (flagId: string) => {
    try {
      await toggleFavoriteInCatalog(flagId)
    } catch (err) {
      toast('Erreur lors du toggle favori', 'error')
    }
  }
  
  const handleImportSnapshot = async () => {
    if (!fileInputRef.current) return
    
    fileInputRef.current.click()
  }
  
  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    
    try {
      const text = await file.text()
      const response = await flagsAPI.importSnapshot(text)
      
      // Charger les flags depuis le snapshot
      importFromSnapshot(response.snapshot)
      
      // Afficher les warnings s'il y en a
      if (response.warnings.length > 0) {
        toast(`Snapshot importé avec ${response.warnings.length} avertissement(s)`, 'warning')
      } else {
        toast(`Snapshot importé: ${response.imported_count} flag(s)`, 'success')
      }
    } catch (err) {
      toast(`Erreur lors de l'import du snapshot: ${getErrorMessage(err)}`, 'error')
    }
    
    // Réinitialiser l'input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }
  
  const handleExportSnapshot = async () => {
    try {
      const snapshot = exportToSnapshot()
      const snapshotJson = JSON.stringify(snapshot, null, 2)
      
      // Créer un blob et télécharger
      const blob = new Blob([snapshotJson], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `flags-snapshot-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      toast('Snapshot exporté avec succès', 'success')
    } catch (err) {
      toast(`Erreur lors de l'export du snapshot: ${getErrorMessage(err)}`, 'error')
    }
  }
  
  const renderFlagControl = (flag: FlagDefinition) => {
    const isSelected = selectedFlags.has(flag.id)
    const currentValue = selectedFlags.get(flag.id)?.value
    
    if (flag.type === 'bool') {
      return (
        <label
          key={flag.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0.75rem',
            backgroundColor: isSelected ? theme.button.primary.background : theme.background.secondary,
            border: `1px solid ${isSelected ? theme.border.focus : theme.border.primary}`,
            borderRadius: '4px',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleBoolFlag(flag.id)}
            style={{ marginRight: '0.75rem' }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 'bold', color: theme.text.primary }}>
              {flag.label}
              {flag.isFavorite && <span style={{ marginLeft: '0.5rem', color: theme.state.warning.color }}>★</span>}
            </div>
            {flag.description && (
              <div style={{ fontSize: remSize('accent'), color: theme.text.secondary, marginTop: '0.25rem' }}>
                {flag.description}
              </div>
            )}
            <div style={{ fontSize: remSize('caption'), color: theme.text.secondary, marginTop: '0.25rem', fontFamily: 'monospace' }}>
              {flag.id}
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              handleToggleFavorite(flag.id)
            }}
            style={{
              marginLeft: '0.5rem',
              padding: '0.25rem 0.5rem',
              backgroundColor: 'transparent',
              border: 'none',
              color: flag.isFavorite ? theme.state.warning.color : theme.text.secondary,
              cursor: 'pointer',
              fontSize: remSize('title'),
            }}
            title={flag.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          >
            {flag.isFavorite ? '★' : '☆'}
          </button>
        </label>
      )
    }
    
    if (flag.type === 'int' || flag.type === 'float') {
      // Utiliser defaultValueParsed si disponible, sinon parser defaultValue
      const defaultValue = typeof flag.defaultValueParsed === 'number' 
        ? flag.defaultValueParsed 
        : (typeof currentValue === 'number' ? currentValue : parseFloat(flag.defaultValue) || 0)
      
      return (
        <div
          key={flag.id}
          style={{
            padding: '0.75rem',
            backgroundColor: isSelected ? theme.button.primary.background : theme.background.secondary,
            border: `1px solid ${isSelected ? theme.border.focus : theme.border.primary}`,
            borderRadius: '4px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <div>
              <div style={{ fontWeight: 'bold', color: theme.text.primary }}>
                {flag.label}
                {flag.isFavorite && <span style={{ marginLeft: '0.5rem', color: theme.state.warning.color }}>★</span>}
              </div>
              <div style={{ fontSize: remSize('caption'), color: theme.text.secondary, marginTop: '0.25rem', fontFamily: 'monospace' }}>
                {flag.id}
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleToggleFavorite(flag.id)}
              style={{
                padding: '0.25rem 0.5rem',
                backgroundColor: 'transparent',
                border: 'none',
                color: flag.isFavorite ? theme.state.warning.color : theme.text.secondary,
                cursor: 'pointer',
                fontSize: remSize('title'),
              }}
              title={flag.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            >
              {flag.isFavorite ? '★' : '☆'}
            </button>
          </div>
          {flag.description && (
            <div style={{ fontSize: remSize('accent'), color: theme.text.secondary, marginBottom: '0.5rem' }}>
              {flag.description}
            </div>
          )}
          <input
            type="number"
            value={typeof currentValue === 'number' ? currentValue : defaultValue}
            onChange={(e) => {
              const numValue = parseFloat(e.target.value)
              if (!isNaN(numValue)) {
                setNumericFlag(flag.id, numValue)
              }
            }}
            step={flag.type === 'float' ? '0.1' : '1'}
            style={{
              width: '100%',
              padding: '0.5rem',
              backgroundColor: theme.input.background,
              border: `1px solid ${theme.input.border}`,
              color: theme.input.color,
              borderRadius: '4px'
            }}
          />
        </div>
      )
    }
    
    if (flag.type === 'string') {
      // Utiliser defaultValueParsed si disponible
      const defaultValue = typeof flag.defaultValueParsed === 'string'
        ? flag.defaultValueParsed
        : (typeof currentValue === 'string' ? currentValue : flag.defaultValue || '')
      
      return (
        <div
          key={flag.id}
          style={{
            padding: '0.75rem',
            backgroundColor: isSelected ? theme.button.primary.background : theme.background.secondary,
            border: `1px solid ${isSelected ? theme.border.focus : theme.border.primary}`,
            borderRadius: '4px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 'bold', color: theme.text.primary }}>
                {flag.label}
                {flag.isFavorite && <span style={{ marginLeft: '0.5rem', color: theme.state.warning.color }}>★</span>}
              </div>
              <div style={{ fontSize: remSize('caption'), color: theme.text.secondary, marginTop: '0.25rem', fontFamily: 'monospace' }}>
                {flag.id}
              </div>
            </div>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                marginLeft: '0.75rem',
                cursor: 'pointer'
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => {
                  if (isSelected) {
                    removeFlag(flag.id)
                  } else {
                    setStringFlag(flag.id, defaultValue)
                  }
                }}
                style={{ marginRight: '0.5rem' }}
              />
              <span style={{ fontSize: remSize('accent'), color: theme.text.secondary }}>Sélectionner</span>
            </label>
            <button
              type="button"
              onClick={() => handleToggleFavorite(flag.id)}
              style={{
                padding: '0.25rem 0.5rem',
                backgroundColor: 'transparent',
                border: 'none',
                color: flag.isFavorite ? theme.state.warning.color : theme.text.secondary,
                cursor: 'pointer',
                fontSize: remSize('title'),
              }}
              title={flag.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            >
              {flag.isFavorite ? '★' : '☆'}
            </button>
          </div>
          {flag.description && (
            <div style={{ fontSize: remSize('accent'), color: theme.text.secondary, marginBottom: '0.5rem' }}>
              {flag.description}
            </div>
          )}
          <input
            type="text"
            value={typeof currentValue === 'string' ? currentValue : defaultValue}
            onChange={(e) => setStringFlag(flag.id, e.target.value)}
            disabled={!isSelected}
            style={{
              width: '100%',
              padding: '0.5rem',
              backgroundColor: isSelected ? theme.input.background : theme.background.tertiary,
              border: `1px solid ${theme.input.border}`,
              color: isSelected ? theme.input.color : theme.text.secondary,
              borderRadius: '4px',
              opacity: isSelected ? 1 : 0.6
            }}
            placeholder={defaultValue || 'Entrez une valeur...'}
          />
        </div>
      )
    }
    
    return null
  }
  
  if (!isOpen) return null
  
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
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: theme.background.panel,
          borderRadius: '8px',
          width: '90%',
          maxWidth: '1000px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
        ref={panelRef}
      >
        {/* Header */}
        <div
          style={{
            padding: isNarrow ? '0.9rem' : '1.5rem',
            borderBottom: `1px solid ${theme.border.primary}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <div>
            <h2 style={{ margin: 0, color: theme.text.primary, fontSize: `${typo.titleFontRem}rem` }}>
              Flags In-Game
            </h2>
            <div style={{ fontSize: `${typo.bodyFontRem}rem`, color: theme.text.secondary, marginTop: '0.25rem' }}>
              Sélectionnez les flags in-game pour générer des dialogues réactifs à l'état du jeu.
              {selectedFlags.size > 0 && (
                <span style={{ marginLeft: '0.5rem', color: theme.text.primary, fontWeight: 'bold' }}>
                  ({selectedFlags.size} sélectionné{selectedFlags.size > 1 ? 's' : ''})
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: theme.text.secondary,
              fontSize: `${typo.titleFontRem}rem`,
              cursor: 'pointer',
              padding: '0.25rem 0.5rem',
            }}
            title="Fermer (ESC)"
          >
            ×
          </button>
        </div>
        
        {/* Content - Scrollable */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: isNarrow ? '0.9rem' : '1.5rem',
          }}
        >
          {/* Recherche et filtres */}
          <div style={{ marginBottom: '1rem' }}>
            <input
              type="text"
              placeholder="Rechercher un flag (ID, label, description, tags)..."
              value={query}
              onChange={(e) => searchFlags(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                marginBottom: '0.75rem',
                backgroundColor: theme.input.background,
                border: `1px solid ${theme.input.border}`,
                color: theme.input.color,
                borderRadius: '4px'
              }}
            />
            
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              <button
                onClick={toggleFavoritesFilter}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: favoritesOnly ? theme.button.primary.background : theme.button.default.background,
                  color: favoritesOnly ? theme.button.primary.color : theme.button.default.color,
                  border: `1px solid ${theme.border.primary}`,
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                ★ Favoris uniquement
              </button>
              
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => toggleCategoryFilter(cat)}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: selectedCategories.has(cat) ? theme.button.primary.background : theme.button.default.background,
                    color: selectedCategories.has(cat) ? theme.button.primary.color : theme.button.default.color,
                    border: `1px solid ${theme.border.primary}`,
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  {cat}
                </button>
              ))}
              
              {(query || favoritesOnly || selectedCategories.size > 0) && (
                <button
                  onClick={clearFilters}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: theme.button.default.background,
                    color: theme.button.default.color,
                    border: `1px solid ${theme.border.primary}`,
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Réinitialiser filtres
                </button>
              )}
            </div>
            
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {selectedFlags.size > 0 && (
                <button
                  onClick={clearFlags}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: theme.state.error.background,
                    color: theme.state.error.color,
                    border: `1px solid ${theme.border.primary}`,
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Effacer sélection ({selectedFlags.size})
                </button>
              )}
            </div>
          </div>
          
          {/* Liste des flags */}
          {isLoading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: theme.text.secondary }}>
              Chargement du catalogue...
            </div>
          ) : error ? (
            <div style={{
              padding: '1rem',
              backgroundColor: theme.state.error.background,
              color: theme.state.error.color,
              borderRadius: '4px',
              marginBottom: '1rem'
            }}>
              {error}
            </div>
          ) : (
            <div>
              {Object.entries(flagsByCategory()).map(([category, flags]) => (
                <div key={category} style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ margin: '0 0 0.75rem 0', color: theme.text.primary, fontSize: remSize('title') }}>
                    {category} ({flags.length})
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {flags.map(flag => renderFlagControl(flag))}
                  </div>
                </div>
              ))}
              
              {filteredFlags().length === 0 && (
                <div style={{ padding: '2rem', textAlign: 'center', color: theme.text.secondary }}>
                  Aucun flag trouvé avec les filtres sélectionnés
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Footer avec actions */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: `1px solid ${theme.border.primary}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
            gap: '0.5rem'
          }}
        >
          <div style={{ fontSize: remSize('accent'), color: theme.text.secondary }}>
            {selectedFlags.size > 0 
              ? `${selectedFlags.size} flag${selectedFlags.size > 1 ? 's' : ''} sélectionné${selectedFlags.size > 1 ? 's' : ''}`
              : 'Aucun flag sélectionné'
            }
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              onClick={handleImportSnapshot}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: theme.button.default.background,
                color: theme.button.default.color,
                border: `1px solid ${theme.border.primary}`,
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: remSize('body')
              }}
              title="Importer un snapshot Unity (JSON)"
            >
              📥 Importer snapshot
            </button>
            {selectedFlags.size > 0 && (
              <button
                onClick={handleExportSnapshot}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: theme.button.default.background,
                  color: theme.button.default.color,
                  border: `1px solid ${theme.border.primary}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: remSize('body')
                }}
                title="Exporter la sélection actuelle en snapshot JSON"
              >
                📤 Exporter sélection
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                padding: '0.5rem 1.5rem',
                backgroundColor: theme.button.primary.background,
                color: theme.button.primary.color,
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Fermer
            </button>
          </div>
        </div>
        
        {/* Input file caché pour l'import */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleFileSelected}
        />
      </div>
    </div>
  )
}
