import {
  unavailableCodexSettingsView,
  type CodexSettingsSave,
  type CodexSettingsValue,
  type CodexSettingsView,
  type CredentialView,
  type OpenAIReuseView,
} from './shared.ts'

const OPENAI_SETTINGS_NAMESPACE = 'llm-pi-ai'
const OPENAI_PROVIDER_PATH = ['providers', 'openai'] as const
const OPENAI_DEFAULT_API_KEY_REF = 'OPENAI_API_KEY'

interface OpenAISettings {
  readonly endpoint?: string
  readonly apiKeyRef: string
}

function recordAt(value: unknown, path: readonly string[]): Record<string, unknown> | undefined {
  let current = value
  for (const segment of path) {
    if (typeof current !== 'object' || current === null || Array.isArray(current)) return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return typeof current === 'object' && current !== null && !Array.isArray(current)
    ? current as Record<string, unknown>
    : undefined
}

function alphaSearchEndpoint(baseURL: unknown): string | undefined {
  if (typeof baseURL !== 'string' || baseURL.trim() === '') return undefined
  let parsed: URL
  try {
    parsed = new URL(baseURL.trim())
  } catch {
    return undefined
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
  if (!/\/alpha\/search\/?$/u.test(parsed.pathname)) {
    parsed.pathname = `${parsed.pathname.replace(/\/+$/u, '')}/alpha/search`
  }
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString()
}

export interface SettingsDescriptorLike {
  readonly ns: string
  readonly value?: unknown
  readonly user?: unknown
  readonly revision: number
}

export interface SettingsLike {
  readonly writable: boolean
  describe(options: { redactSecrets: true }): SettingsDescriptorLike[]
  mutate(
    namespace: string,
    operations: readonly unknown[],
    expectedRevision?: number,
  ): Promise<void>
}

type SettingsPathOperation =
  | { readonly op: 'set'; readonly path: readonly string[]; readonly value: unknown }
  | { readonly op: 'unset'; readonly path: readonly string[] }

export interface CredentialsLike {
  describe(ref: string): Promise<{ configured: boolean; writable: boolean }>
  resolve(ref: string): Promise<{ value: string } | undefined>
  set(ref: string, value: string): Promise<void>
  unset(ref: string): Promise<void>
}

export class HostSettingsController {
  constructor(
    private readonly settings: SettingsLike,
    private readonly credentials: CredentialsLike | undefined,
    private readonly namespace: string,
    private readonly defaultApiKeyRef: string,
  ) {}

  async get(): Promise<CodexSettingsView> {
    const descriptor = this.descriptor()
    if (descriptor === undefined) {
      return unavailableCodexSettingsView()
    }
    const value = this.value() ?? {}
    const ref = typeof value.apiKeyEnv === 'string' && value.apiKeyEnv !== ''
      ? value.apiKeyEnv
      : this.defaultApiKeyRef
    const credential = this.credentials === undefined
      ? { configured: false, writable: false }
      : await this.credentials.describe(ref)
    const openAIReuse = await this.openAIReuse(ref, credential)
    return {
      available: true,
      writable: this.settings.writable,
      revision: descriptor.revision,
      endpoint: typeof value.endpoint === 'string' ? value.endpoint : '',
      model: typeof value.model === 'string' ? value.model : '',
      credential: {
        configured: credential.configured,
        writable: credential.writable,
      },
      ...openAIReuse === undefined ? {} : { openAIReuse },
    }
  }

  async save(input: CodexSettingsSave): Promise<CodexSettingsView> {
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) {
      throw new TypeError('expectedRevision must be a non-negative integer')
    }
    const descriptor = this.descriptor()
    if (descriptor === undefined) throw new Error('Codex search settings namespace is unavailable')
    const previousUser = typeof descriptor.user === 'object' && descriptor.user !== null && !Array.isArray(descriptor.user)
      ? structuredClone(descriptor.user)
      : {}
    const endpoint = input.endpoint.trim()
    if (endpoint !== '') {
      let parsed: URL
      try {
        parsed = new URL(endpoint)
      } catch {
        throw new TypeError('endpoint must be a complete HTTP or HTTPS URL')
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new TypeError('endpoint must be a complete HTTP or HTTPS URL')
      }
    }
    const model = input.model.trim()
    const currentValue = this.value() ?? {}
    const currentRef = typeof currentValue.apiKeyEnv === 'string' && currentValue.apiKeyEnv !== ''
      ? currentValue.apiKeyEnv
      : this.defaultApiKeyRef
    const openAISettings = this.openAISettings()
    let targetRef = currentRef
    if (input.credentialSource === 'independent') {
      targetRef = this.defaultApiKeyRef
    } else if (input.credentialSource === 'openai') {
      if (openAISettings?.endpoint === undefined) throw new TypeError('OpenAI provider has no reusable base URL')
      if (this.credentials === undefined) throw new TypeError('OpenAI credential store is unavailable')
      const openAICredential = await this.credentials.describe(openAISettings.apiKeyRef)
      if (!openAICredential.configured) throw new TypeError('OpenAI credential is not configured')
      targetRef = openAISettings.apiKeyRef
    }
    const settingsChanged = endpoint !== (currentValue.endpoint ?? '')
      || model !== (currentValue.model ?? '')
      || targetRef !== currentRef
    if (settingsChanged && !this.settings.writable) throw new Error('Codex search settings are read-only')
    const operations: SettingsPathOperation[] = [
      endpoint === ''
        ? { op: 'unset', path: ['endpoint'] }
        : { op: 'set', path: ['endpoint'], value: endpoint },
      model === ''
        ? { op: 'unset', path: ['model'] }
        : { op: 'set', path: ['model'], value: model },
      ...targetRef === currentRef
        ? []
        : [{ op: 'set' as const, path: ['apiKeyEnv'], value: targetRef }],
    ]
    const apiKey = input.apiKey?.trim()
    const clearApiKey = input.clearApiKey === true
    if (clearApiKey && apiKey !== undefined && apiKey !== '') {
      throw new TypeError('apiKey and clearApiKey cannot be used together')
    }
    if (clearApiKey && targetRef !== this.defaultApiKeyRef) {
      throw new TypeError('shared OpenAI credentials cannot be cleared here')
    }
    if (clearApiKey || apiKey !== undefined && apiKey !== '') {
      if (openAISettings?.apiKeyRef === targetRef) {
        throw new TypeError('OpenAI credentials must be managed from the model provider settings')
      }
      if (this.credentials === undefined) throw new Error('Codex search credential store is unavailable')
      const credential = await this.credentials.describe(targetRef)
      if (!credential.writable) throw new Error('Codex search credential is read-only')
    }
    if (settingsChanged) await this.settings.mutate(this.namespace, operations, input.expectedRevision)
    if (clearApiKey || apiKey !== undefined && apiKey !== '') {
      try {
        if (clearApiKey) {
          await this.credentials!.unset(targetRef)
        } else {
          await this.credentials!.set(targetRef, apiKey!)
        }
      } catch {
        if (!settingsChanged) throw new Error('Failed to update Codex search credential')
        const committed = this.descriptor()
        try {
          if (committed === undefined) throw new Error('settings namespace disappeared')
          await this.settings.mutate(
            this.namespace,
            [{ op: 'set', path: [], value: previousUser }],
            committed.revision,
          )
        } catch {
          throw new Error('Failed to save Codex search settings and rollback failed')
        }
        throw new Error('Failed to save Codex search settings; previous settings were restored')
      }
    }
    return this.get()
  }

  private value(): CodexSettingsValue | undefined {
    const value = this.descriptor()?.value
    return typeof value === 'object' && value !== null ? value as CodexSettingsValue : undefined
  }

  private async openAIReuse(currentRef: string, currentCredential: CredentialView): Promise<OpenAIReuseView | undefined> {
    const settings = this.openAISettings()
    if (settings === undefined) return undefined
    const unavailable: CredentialView = { configured: false, writable: false }
    const credential = currentRef === settings.apiKeyRef
      ? currentCredential
      : await this.credentials?.describe(settings.apiKeyRef) ?? unavailable
    const independentCredential = currentRef === this.defaultApiKeyRef
      ? currentCredential
      : await this.credentials?.describe(this.defaultApiKeyRef) ?? unavailable
    return {
      available: settings.endpoint !== undefined && credential.configured,
      active: currentRef === settings.apiKeyRef,
      endpoint: settings.endpoint ?? '',
      credential,
      independentCredential,
    }
  }

  private openAISettings(): OpenAISettings | undefined {
    const descriptor = this.settings.describe({ redactSecrets: true })
      .find(candidate => candidate.ns === OPENAI_SETTINGS_NAMESPACE)
    const profile = recordAt(descriptor?.value, OPENAI_PROVIDER_PATH)
    if (profile === undefined) return undefined
    const endpoint = alphaSearchEndpoint(profile?.baseURL)
    const configuredRef = profile?.apiKeyEnv
    const apiKeyRef = typeof configuredRef === 'string' && configuredRef.trim() !== ''
      ? configuredRef.trim()
      : OPENAI_DEFAULT_API_KEY_REF
    return { ...endpoint === undefined ? {} : { endpoint }, apiKeyRef }
  }

  private descriptor(): SettingsDescriptorLike | undefined {
    return this.settings.describe({ redactSecrets: true })
      .find(candidate => candidate.ns === this.namespace)
  }
}
