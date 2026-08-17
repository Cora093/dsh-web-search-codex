import type { CodexSettingsSave, CodexSettingsView } from '../shared.ts'
import type { CodexSettingsApi } from './api.ts'

export type CardField = 'endpoint' | 'model' | 'apiKey'

export interface CodexCardState {
  readonly available: boolean
  readonly writable: boolean
  readonly loading: boolean
  readonly saving: boolean
  readonly dirty: boolean
  readonly failure: 'save' | 'conflict' | null
  readonly revision?: number
  readonly endpoint: string
  readonly model: string
  readonly apiKey: string
  readonly apiKeyConfigured: boolean
  readonly apiKeyWritable: boolean
}

export interface SnapshotSource<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

const INITIAL_STATE: CodexCardState = {
  available: false,
  writable: false,
  loading: true,
  saving: false,
  dirty: false,
  failure: null,
  endpoint: '',
  model: '',
  apiKey: '',
  apiKeyConfigured: false,
  apiKeyWritable: false,
}

export class CodexCardController implements SnapshotSource<CodexCardState> {
  private state = INITIAL_STATE
  private canonical: CodexSettingsView | undefined
  private readonly listeners = new Set<() => void>()
  private readonly abort = new AbortController()

  constructor(private readonly api: CodexSettingsApi) {}

  getSnapshot(): CodexCardState {
    return this.state
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  async load(): Promise<void> {
    try {
      const view = await this.api.get(this.abort.signal)
      if (!this.abort.signal.aborted) this.adopt(view)
    } catch {
      if (this.abort.signal.aborted) return
      this.publish({ ...INITIAL_STATE, loading: false })
    }
  }

  edit(field: CardField, value: string): void {
    if (!this.state.available || this.state.saving) return
    const next = { ...this.state, [field]: value, failure: null }
    this.publish({ ...next, dirty: this.isDirty(next) })
  }

  discard(): void {
    if (this.canonical === undefined || this.state.saving) return
    this.adopt(this.canonical)
  }

  async save(): Promise<void> {
    const payload = this.payload()
    if (payload === undefined || this.state.saving) return
    this.publish({ ...this.state, saving: true, failure: null })
    try {
      const view = await this.api.save(payload, this.abort.signal)
      if (!this.abort.signal.aborted) this.adopt(view)
    } catch (error: unknown) {
      if (this.abort.signal.aborted) return
      if (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'settings-conflict') {
        await this.reloadConflict()
        return
      }
      this.publish({ ...this.state, saving: false, failure: 'save' })
    }
  }

  dispose(): void {
    this.abort.abort()
    this.listeners.clear()
  }

  private payload(): CodexSettingsSave | undefined {
    const credentialWrite = this.state.apiKeyWritable && this.state.apiKey.trim() !== ''
    if (!this.state.available
      || !this.state.dirty
      || this.state.revision === undefined
      || !this.state.writable && !credentialWrite) {
      return undefined
    }
    return {
      expectedRevision: this.state.revision,
      endpoint: this.state.endpoint,
      model: this.state.model,
      ...this.state.apiKey.trim() === '' ? {} : { apiKey: this.state.apiKey },
    }
  }

  private adopt(view: CodexSettingsView): void {
    this.canonical = view
    this.publish({
      available: view.available,
      writable: view.writable,
      loading: false,
      saving: false,
      dirty: false,
      failure: null,
      ...view.revision === undefined ? {} : { revision: view.revision },
      endpoint: view.endpoint,
      model: view.model,
      apiKey: '',
      apiKeyConfigured: view.credential.configured,
      apiKeyWritable: view.credential.writable,
    })
  }

  private isDirty(state: CodexCardState): boolean {
    return this.canonical !== undefined && (
      state.endpoint !== this.canonical.endpoint
      || state.model !== this.canonical.model
      || state.apiKey.trim() !== ''
    )
  }

  private async reloadConflict(): Promise<void> {
    const draft = this.state
    try {
      const view = await this.api.get(this.abort.signal)
      if (this.abort.signal.aborted) return
      this.canonical = view
      const next: CodexCardState = {
        available: view.available,
        writable: view.writable,
        loading: false,
        saving: false,
        dirty: false,
        failure: 'conflict',
        ...view.revision === undefined ? {} : { revision: view.revision },
        endpoint: draft.endpoint,
        model: draft.model,
        apiKey: draft.apiKey,
        apiKeyConfigured: view.credential.configured,
        apiKeyWritable: view.credential.writable,
      }
      this.publish({ ...next, dirty: this.isDirty(next) })
    } catch {
      if (!this.abort.signal.aborted) {
        this.publish({ ...this.state, saving: false, failure: 'conflict' })
      }
    }
  }

  private publish(state: CodexCardState): void {
    this.state = state
    for (const listener of this.listeners) listener()
  }
}
