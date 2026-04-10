import { useCallback, useEffect, useState } from 'react'
import {
  loadLoreDispositions,
  type LoreWarningDisposition,
  saveLoreDispositions,
} from '../utils/loreWarningUi'

export function useLoreWarningPanelState(scopeKey: string) {
  const [showIgnored, setShowIgnored] = useState(false)
  const [typeFilter, setTypeFilter] = useState<'all' | string>('all')
  const [dispositions, setDispositions] = useState<Record<string, LoreWarningDisposition>>({})

  useEffect(() => {
    setDispositions(loadLoreDispositions(scopeKey))
    setShowIgnored(false)
    setTypeFilter('all')
  }, [scopeKey])

  const setDisposition = useCallback((key: string, disposition: LoreWarningDisposition) => {
    setDispositions((prev) => {
      const next = { ...prev, [key]: disposition }
      saveLoreDispositions(scopeKey, next)
      return next
    })
  }, [scopeKey])

  return {
    showIgnored,
    setShowIgnored,
    typeFilter,
    setTypeFilter,
    dispositions,
    setDisposition,
  }
}
