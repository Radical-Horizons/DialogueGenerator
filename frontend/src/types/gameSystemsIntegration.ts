export type RuntimeSourceStatus = 'connected' | 'disconnected' | 'unknown'

export interface GameSystemFamily {
  id: 'attributes_skills' | 'effort' | 'reputation'
  label: string
  description: string
}

export interface RuntimeSourceState {
  status: RuntimeSourceStatus
  label: string
  editing_blocked: boolean
  message: string
}

export interface GameSystemsIntegrationCatalog {
  families: GameSystemFamily[]
  runtime_source: RuntimeSourceState
}
