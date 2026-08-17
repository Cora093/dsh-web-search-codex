export const PACKAGE_NAME = 'dsh-web-search-codex'
export const SETTINGS_NAMESPACE = 'web-search-codex'
export const DEFAULT_API_KEY_REF = 'CODEX_SEARCH_API_KEY'
export const HOST_API_PREFIX = '/web-search-codex/api'
export const CLIENT_SLOT_ID = 'web-search-codex'

export interface CodexSettingsValue {
  readonly apiKeyEnv?: string
  readonly endpoint?: string
  readonly model?: string
}

export interface CredentialView {
  readonly configured: boolean
  readonly writable: boolean
}

export interface CodexSettingsView {
  readonly available: boolean
  readonly writable: boolean
  readonly revision?: number
  readonly endpoint: string
  readonly model: string
  readonly credential: CredentialView
}

export interface CodexSettingsSave {
  readonly expectedRevision: number
  readonly endpoint: string
  readonly model: string
  readonly apiKey?: string
}
