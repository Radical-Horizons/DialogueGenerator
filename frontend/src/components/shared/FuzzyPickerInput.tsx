/**
 * Champ texte avec suggestions fuzzy au focus / à la saisie.
 */
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { theme } from '../../theme'
import { mechanicalFormClass } from '../../theme/fieldTokens'
import { remSize } from '../../theme/uiTypography'
import { fieldErrorBorder } from './InlineFieldError'
import { rankFuzzyOptions } from '../../utils/fuzzyMatch'

export interface FuzzyPickerOption {
  id: string
  label: string
}

export interface FuzzyPickerInputProps {
  id?: string
  value: string
  onChange: (value: string) => void
  options: FuzzyPickerOption[]
  placeholder?: string
  disabled?: boolean
  hasError?: boolean
  inputRef?: RefObject<HTMLInputElement | null>
  'data-testid'?: string
}

export const FuzzyPickerInput = memo(function FuzzyPickerInput({
  id,
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  hasError = false,
  inputRef,
  'data-testid': testId,
}: FuzzyPickerInputProps) {
  const listId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const localInputRef = useRef<HTMLInputElement>(null)
  const mergedRef = inputRef ?? localInputRef
  const [isOpen, setIsOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const [dropdownBox, setDropdownBox] = useState({ top: 0, left: 0, width: 0 })

  const suggestions = useMemo(
    () => rankFuzzyOptions(options, value, 8),
    [options, value],
  )

  const syncDropdownPosition = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setDropdownBox({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 240),
    })
  }, [])

  useEffect(() => {
    if (!isOpen) return
    syncDropdownPosition()
    const onScroll = () => syncDropdownPosition()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [isOpen, syncDropdownPosition])

  useEffect(() => {
    if (!isOpen) return
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (containerRef.current?.contains(target) || dropdownRef.current?.contains(target)) {
        return
      }
      setIsOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [isOpen])

  useEffect(() => {
    if (highlightIndex >= suggestions.length) {
      setHighlightIndex(0)
    }
  }, [highlightIndex, suggestions.length])

  const selectSuggestion = useCallback(
    (id: string) => {
      onChange(id)
      setIsOpen(false)
    },
    [onChange],
  )

  const inputStyle: CSSProperties = {
    border: `1px solid ${fieldErrorBorder(hasError, theme.border.primary)}`,
    backgroundColor: theme.background.tertiary,
    color: theme.text.primary,
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        ref={mergedRef}
        id={id}
        className={mechanicalFormClass.input}
        type="text"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={hasError}
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-autocomplete="list"
        data-testid={testId}
        onFocus={() => {
          syncDropdownPosition()
          setIsOpen(true)
        }}
        onChange={(event) => {
          onChange(event.target.value)
          setIsOpen(true)
        }}
        onKeyDown={(event) => {
          if (!isOpen || suggestions.length === 0) return
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setHighlightIndex((prev) => Math.min(prev + 1, suggestions.length - 1))
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setHighlightIndex((prev) => Math.max(prev - 1, 0))
          } else if (event.key === 'Enter' && suggestions[highlightIndex]) {
            event.preventDefault()
            selectSuggestion(suggestions[highlightIndex].id)
          } else if (event.key === 'Escape') {
            setIsOpen(false)
          }
        }}
        style={inputStyle}
      />
      {isOpen &&
        suggestions.length > 0 &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={dropdownRef}
            id={listId}
            role="listbox"
            style={{
              position: 'fixed',
              top: dropdownBox.top,
              left: dropdownBox.left,
              width: dropdownBox.width,
              zIndex: 12000,
              backgroundColor: theme.background.panel,
              border: `1px solid ${theme.border.primary}`,
              borderRadius: 4,
              boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
              maxHeight: 220,
              overflowY: 'auto',
            }}
          >
            {suggestions.map((option, index) => (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={index === highlightIndex}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectSuggestion(option.id)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '0.45rem 0.6rem',
                  border: 'none',
                  borderBottom: `1px solid ${theme.border.primary}`,
                  backgroundColor:
                    index === highlightIndex
                      ? theme.state.hover.background
                      : 'transparent',
                  color: theme.text.primary,
                  cursor: 'pointer',
                  fontSize: remSize('caption'),
                }}
              >
                <span style={{ fontWeight: 600 }}>{option.id}</span>
                {option.label !== option.id ? (
                  <span style={{ color: theme.text.secondary, marginLeft: '0.35rem' }}>
                    — {option.label}
                  </span>
                ) : null}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
})
