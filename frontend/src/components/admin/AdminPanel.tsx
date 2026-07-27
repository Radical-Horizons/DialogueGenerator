import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

import { theme } from '../../theme'
import { Tabs, type Tab } from '../shared/Tabs'
import { DEFAULT_ADMIN_TAB, resolveAdminTabId } from './adminTabs'
import { AuditLogsPanel } from './AuditLogsPanel'
import { LlmModelsPanel } from './LlmModelsPanel'
import { UserManagementPanel } from './UserManagementPanel'

/**
 * Panneau d'administration unifié (utilisateurs, modèles LLM, journaux d'audit).
 */
export function AdminPanel() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTabId = resolveAdminTabId(searchParams.get('tab'))

  const tabs: Tab[] = useMemo(
    () => [
      {
        id: 'users',
        label: 'Utilisateurs',
        content: <UserManagementPanel />,
      },
      {
        id: 'llm-models',
        label: 'Modèles LLM',
        content: <LlmModelsPanel />,
      },
      {
        id: 'audit-logs',
        label: 'Journaux d’audit',
        content: <AuditLogsPanel />,
      },
    ],
    [],
  )

  const handleTabChange = (tabId: string) => {
    setSearchParams(tabId === DEFAULT_ADMIN_TAB ? {} : { tab: tabId }, { replace: true })
  }

  return (
    <div
      style={{
        height: '100%',
        overflow: 'auto',
        boxSizing: 'border-box',
        padding: 'clamp(1rem, 3vw, 1.5rem)',
        background: theme.background.primary,
        color: theme.text.primary,
      }}
    >
      <h1
        style={{
          margin: '0 0 1rem',
          fontSize: '1.35rem',
          fontWeight: 600,
          color: theme.text.primary,
        }}
      >
        Administration
      </h1>
      <Tabs
        variant="segmented"
        activeTabId={activeTabId}
        onTabChange={handleTabChange}
        tabs={tabs}
        contentStyle={{ paddingTop: '1rem' }}
      />
    </div>
  )
}
