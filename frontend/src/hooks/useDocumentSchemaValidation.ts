/**
 * Validation schéma Unity pour un document persisté (bibliothèque, Story 5.3 / FR51).
 */
import { useCallback, useState } from 'react'
import { validateDocumentSchema } from '../api/dialogues'
import type { SchemaValidationIssue } from '../types/graph'
import { getErrorMessage } from '../types/errors'

export interface DocumentSchemaValidationState {
  isOpen: boolean
  isLoading: boolean
  isValid: boolean
  errors: string[]
  errorCount: number
  warnings: SchemaValidationIssue[]
  structuredErrors: SchemaValidationIssue[]
  documentLabel: string | null
}

const INITIAL_STATE: DocumentSchemaValidationState = {
  isOpen: false,
  isLoading: false,
  isValid: false,
  errors: [],
  errorCount: 0,
  warnings: [],
  structuredErrors: [],
  documentLabel: null,
}

export function useDocumentSchemaValidation() {
  const [state, setState] = useState<DocumentSchemaValidationState>(INITIAL_STATE)

  const close = useCallback(() => {
    setState(INITIAL_STATE)
  }, [])

  const validateDocument = useCallback(async (documentId: string, documentLabel: string) => {
    setState({
      ...INITIAL_STATE,
      isOpen: true,
      isLoading: true,
      documentLabel,
    })
    try {
      const res = await validateDocumentSchema(documentId)
      setState({
        isOpen: true,
        isLoading: false,
        isValid: res.is_valid,
        errors: res.errors,
        errorCount: res.error_count,
        warnings: res.warnings ?? [],
        structuredErrors: res.structured_errors ?? [],
        documentLabel,
      })
    } catch (err) {
      setState({
        isOpen: true,
        isLoading: false,
        isValid: false,
        errors: [getErrorMessage(err)],
        errorCount: 1,
        warnings: [],
        structuredErrors: [],
        documentLabel,
      })
    }
  }, [])

  return { ...state, validateDocument, close }
}
