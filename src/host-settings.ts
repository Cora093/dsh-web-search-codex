import type { CodexSettingsSave, CodexSettingsValue, CodexSettingsView } from './shared.ts'

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
      return {
        available: false,
        writable: false,
        endpoint: '',
        model: '',
        credential: { configured: false, writable: false },
      }
    }
    const value = this.value() ?? {}
    const ref = typeof value.apiKeyEnv === 'string' && value.apiKeyEnv !== ''
      ? value.apiKeyEnv
      : this.defaultApiKeyRef
    const credential = this.credentials === undefined
      ? { configured: false, writable: false }
      : await this.credentials.describe(ref)
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
    const settingsChanged = endpoint !== (currentValue.endpoint ?? '')
      || model !== (currentValue.model ?? '')
    if (settingsChanged && !this.settings.writable) throw new Error('Codex search settings are read-only')
    const operations: SettingsPathOperation[] = [
      endpoint === ''
        ? { op: 'unset', path: ['endpoint'] }
        : { op: 'set', path: ['endpoint'], value: endpoint },
      model === ''
        ? { op: 'unset', path: ['model'] }
        : { op: 'set', path: ['model'], value: model },
    ]
    const apiKey = input.apiKey?.trim()
    const ref = typeof currentValue.apiKeyEnv === 'string' && currentValue.apiKeyEnv !== ''
      ? currentValue.apiKeyEnv
      : this.defaultApiKeyRef
    if (apiKey !== undefined && apiKey !== '') {
      if (this.credentials === undefined) throw new Error('Codex search credential store is unavailable')
      const credential = await this.credentials.describe(ref)
      if (!credential.writable) throw new Error('Codex search credential is read-only')
    }
    if (settingsChanged) await this.settings.mutate(this.namespace, operations, input.expectedRevision)
    if (apiKey !== undefined && apiKey !== '') {
      try {
        await this.credentials!.set(ref, apiKey)
      } catch {
        if (!settingsChanged) throw new Error('Failed to save Codex search credential')
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

  private descriptor(): SettingsDescriptorLike | undefined {
    return this.settings.describe({ redactSecrets: true })
      .find(candidate => candidate.ns === this.namespace)
  }
}
