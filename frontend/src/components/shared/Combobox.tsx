/**
 * Combobox amélioré avec recherche, raccourcis clavier, et récents.
 */
import { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { theme } from '../../theme'

export interface ComboboxOption {
  value: string
  label: string
  disabled?: boolean
}

export interface ComboboxProps {
  options: ComboboxOption[]
  value: string | null
  onChange: (value: string | null) => void
  placeholder?: string
  disabled?: boolean
  allowClear?: boolean
  recentlyUsed?: string[]
  maxRecentItems?: number
  onRecentUpdate?: (recent: string[]) => void
  style?: React.CSSProperties
  'data-testid'?: string
}

const RECENT_STORAGE_PREFIX = 'combobox_recent_'

export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Rechercher et sélectionner...',
  disabled = false,
  allowClear = false,
  recentlyUsed: externalRecent,
  maxRecentItems = 5,
  onRecentUpdate,
  style,
  'data-testid': testId,
}: ComboboxProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [dropdownBox, setDropdownBox] = useState({ top: 0, left: 0, width: 0 })

  // Gestion des récents (localStorage ou prop externe)
  const storageKey = useMemo(() => {
    // Créer une clé basée sur les options (simplifié)
    return `${RECENT_STORAGE_PREFIX}${options.length}`
  }, [options.length])

  const [internalRecent, setInternalRecent] = useState<string[]>(() => {
    if (externalRecent) return externalRecent
    try {
      const stored = localStorage.getItem(storageKey)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })

  const recentlyUsed = externalRecent ?? internalRecent

  const updateRecent = useCallback(
    (value: string) => {
      const newRecent = [
        value,
        ...recentlyUsed.filter((v) => v !== value),
      ].slice(0, maxRecentItems)

      if (externalRecent && onRecentUpdate) {
        onRecentUpdate(newRecent)
      } else {
        setInternalRecent(newRecent)
        try {
          localStorage.setItem(storageKey, JSON.stringify(newRecent))
        } catch {
          // Ignore storage errors
        }
      }
    },
    [externalRecent, onRecentUpdate, recentlyUsed, maxRecentItems, storageKey]
  )

  const filteredOptions = useMemo(() => {
    const term = searchTerm.toLowerCase().trim()
    if (!term) return options

    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(term) ||
        opt.value.toLowerCase().includes(term)
    )
  }, [options, searchTerm])

  const displayedOptions = useMemo(() => {
    const recentOptions = recentlyUsed
      .map((val) => options.find((opt) => opt.value === val))
      .filter((opt): opt is ComboboxOption => opt !== undefined)
      .map((opt) => ({ ...opt, label: `⭐ ${opt.label}` }))

    const otherOptions = filteredOptions.filter(
      (opt) => !recentlyUsed.includes(opt.value)
    )

    return [...recentOptions, ...otherOptions]
  }, [filteredOptions, recentlyUsed, options])

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value]
  )

  // Fermer au clic extérieur
  useLayoutEffect(() => {
    if (!isOpen || !containerRef.current) return
    const sync = () => {
      const el = containerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setDropdownBox({ top: r.bottom + 4, left: r.left, width: r.width })
    }
    sync()
    window.addEventListener('scroll', sync, true)
    window.addEventListener('resize', sync)
    return () => {
      window.removeEventListener('scroll', sync, true)
      window.removeEventListener('resize', sync)
    }
  }, [isOpen])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const t = event.target as Node
      if (containerRef.current?.contains(t) || dropdownRef.current?.contains(t)) {
        return
      }
      setIsOpen(false)
      setSearchTerm('')
      setHighlightedIndex(-1)
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Focus sur l'input quand on ouvre
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  const handleSelect = useCallback((optionValue: string) => {
    onChange(optionValue)
    updateRecent(optionValue)
    setIsOpen(false)
    setSearchTerm('')
    setHighlightedIndex(-1)
  }, [onChange, updateRecent])

  // Navigation clavier
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightedIndex((prev) =>
          prev < displayedOptions.length - 1 ? prev + 1 : prev
        )
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1))
      } else if (e.key === 'Enter' && highlightedIndex >= 0) {
        e.preventDefault()
        const option = displayedOptions[highlightedIndex]
        if (option && !option.disabled) {
          handleSelect(option.value)
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setIsOpen(false)
        setSearchTerm('')
        setHighlightedIndex(-1)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, highlightedIndex, displayedOptions, handleSelect])

  // Scroll vers l'option highlightée
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.children
      if (items[highlightedIndex]) {
        items[highlightedIndex].scrollIntoView({
          block: 'nearest',
          behavior: 'smooth',
        })
      }
    }
  }, [highlightedIndex])

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(null)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value)
    setHighlightedIndex(-1)
    if (!isOpen) setIsOpen(true)
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        ...style,
      }}
      data-testid={testId}
    >
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        style={{
          padding: '0.55rem 0.65rem',
          border: `1px solid ${theme.input.border}`,
          borderRadius: '6px',
          backgroundColor: disabled ? theme.background.secondary : theme.input.background,
          color: theme.input.color,
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: '38px',
        }}
      >
        {isOpen ? (
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={handleInputChange}
            placeholder={placeholder}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              backgroundColor: 'transparent',
              color: theme.input.color,
              fontSize: 'inherit',
              fontFamily: 'inherit',
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            style={{
              flex: 1,
              color: selectedOption
                ? theme.text.primary
                : theme.text.secondary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          {allowClear && selectedOption && !disabled && (
            <span
              onClick={handleClear}
              style={{
                cursor: 'pointer',
                padding: '0 0.25rem',
                fontSize: '1.2rem',
                lineHeight: 1,
                color: theme.text.secondary,
              }}
            >
              ×
            </span>
          )}
          <span
            style={{
              fontSize: '0.75rem',
              color: theme.text.secondary,
              transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
            }}
          >
            ▼
          </span>
        </div>
      </div>

      {isOpen &&
        !disabled &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: 'fixed',
              top: dropdownBox.top,
              left: dropdownBox.left,
              width: dropdownBox.width,
              backgroundColor: theme.background.panel,
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '4px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
              zIndex: 12000,
              maxHeight: '300px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              ref={listRef}
              style={{
                maxHeight: '280px',
                overflowY: 'auto',
              }}
            >
              {displayedOptions.length === 0 ? (
                <div
                  style={{
                    padding: '0.75rem',
                    textAlign: 'center',
                    color: theme.text.secondary,
                    fontSize: '0.9rem',
                  }}
                >
                  Aucun résultat
                </div>
              ) : (
                displayedOptions.map((option, index) => {
                  const isHighlighted = index === highlightedIndex
                  const isSelected = option.value === value

                  return (
                    <div
                      key={option.value}
                      onMouseDown={(e) => {
                        e.preventDefault()
                      }}
                      onClick={() => !option.disabled && handleSelect(option.value)}
                      style={{
                        padding: '0.75rem',
                        cursor: option.disabled ? 'not-allowed' : 'pointer',
                        backgroundColor: isSelected
                          ? theme.state.selected.background
                          : isHighlighted
                            ? theme.state.hover.background
                            : 'transparent',
                        color: option.disabled
                          ? theme.text.secondary
                          : theme.text.primary,
                        opacity: option.disabled ? 0.5 : 1,
                        borderBottom: `1px solid ${theme.border.primary}`,
                      }}
                    >
                      {option.label}
                    </div>
                  )
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}



