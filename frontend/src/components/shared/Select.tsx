/**
 * Composant Select réutilisable avec recherche/filtrage.
 */
import { useState, useMemo, useRef, useEffect } from 'react'
import { theme } from '../../theme'
import { generationPanelChrome } from '../../theme/responsiveChrome'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps {
  options: SelectOption[]
  value: string | null
  onChange: (value: string | null) => void
  placeholder?: string
  disabled?: boolean
  searchable?: boolean
  allowClear?: boolean
  /** Densité réduite (colonne étroite / panneau génération). */
  compact?: boolean
  style?: React.CSSProperties
  'data-testid'?: string
}

export function Select({
  options,
  value,
  onChange,
  placeholder = 'Sélectionner...',
  disabled = false,
  searchable = false,
  allowClear = false,
  compact = false,
  style,
  'data-testid': testId,
}: SelectProps) {
  const narrowChrome = generationPanelChrome.narrow
  const comfyChrome = generationPanelChrome.comfortable
  const triggerMinHeight = compact
    ? narrowChrome.selectTriggerMinHeightPx
    : comfyChrome.selectTriggerMinHeightPx
  const triggerPadding = compact ? narrowChrome.selectTriggerPadding : comfyChrome.selectTriggerPadding
  const triggerTextRem = compact ? narrowChrome.selectTextFontRem : comfyChrome.selectTextFontRem
  const optionPadding = compact ? narrowChrome.dropdownOptionPadding : comfyChrome.dropdownOptionPadding
  const optionFontRem = compact ? narrowChrome.dropdownOptionFontRem : comfyChrome.dropdownOptionFontRem
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filteredOptions = useMemo(() => {
    if (!searchable || !searchTerm) return options
    const term = searchTerm.toLowerCase()
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(term) ||
        opt.value.toLowerCase().includes(term)
    )
  }, [options, searchTerm, searchable])

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value]
  )

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
        setSearchTerm('')
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen && searchable && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen, searchable])

  const handleSelect = (optionValue: string) => {
    onChange(optionValue)
    setIsOpen(false)
    setSearchTerm('')
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(null)
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
          padding: triggerPadding,
          border: `1px solid ${theme.input.border}`,
          borderRadius: '4px',
          backgroundColor: disabled ? theme.background.secondary : theme.input.background,
          color: theme.input.color,
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: `${triggerMinHeight}px`,
          boxSizing: 'border-box',
        }}
      >
        <span
          style={{
            flex: 1,
            color: selectedOption
              ? theme.text.primary
              : theme.text.secondary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: `${triggerTextRem}rem`,
          }}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>
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

      {isOpen && !disabled && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '0.25rem',
            backgroundColor: theme.background.panel,
            border: `1px solid ${theme.border.primary}`,
            borderRadius: '4px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            zIndex: 1000,
            maxHeight: '300px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {searchable && (
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher..."
              style={{
                padding: '0.5rem',
                border: 'none',
                borderBottom: `1px solid ${theme.border.primary}`,
                backgroundColor: theme.input.background,
                color: theme.input.color,
                outline: 'none',
              }}
              onClick={(e) => e.stopPropagation()}
            />
          )}
          <div
            style={{
              maxHeight: '250px',
              overflowY: 'auto',
            }}
          >
            {filteredOptions.length === 0 ? (
              <div
                style={{
                  padding: optionPadding,
                  textAlign: 'center',
                  color: theme.text.secondary,
                  fontSize: `${optionFontRem}rem`,
                }}
              >
                Aucun résultat
              </div>
            ) : (
              filteredOptions.map((option) => (
                <div
                  key={option.value}
                  onClick={() => !option.disabled && handleSelect(option.value)}
                  style={{
                    padding: optionPadding,
                    cursor: option.disabled ? 'not-allowed' : 'pointer',
                    backgroundColor:
                      option.value === value
                        ? theme.state.selected.background
                        : 'transparent',
                    color: option.disabled
                      ? theme.text.secondary
                      : theme.text.primary,
                    opacity: option.disabled ? 0.5 : 1,
                    borderBottom: `1px solid ${theme.border.primary}`,
                    fontSize: `${optionFontRem}rem`,
                  }}
                  onMouseEnter={(e) => {
                    if (!option.disabled && option.value !== value) {
                      e.currentTarget.style.backgroundColor =
                        theme.state.hover.background
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (option.value !== value) {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }
                  }}
                >
                  {option.label}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}



