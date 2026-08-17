import type { CodexSettingsSave, CodexSettingsView, CredentialSource, CredentialView } from '../shared.ts'
import type { CodexSettingsApi } from './api.ts'

export type CardField = 'endpoint' | 'model' | 'apiKey'

export interface OpenAIReuseState {
  readonly available: boolean
  readonly endpoint: string
}

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
  readonly clearApiKey: boolean
  readonly apiKeyConfigured: boolean
  readonly apiKeyWritable: boolean
  readonly credentialSource: CredentialSource
  readonly openAIReuse: OpenAIReuseState
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
  clearApiKey: false,
  apiKeyConfigured: false,
  apiKeyWritable: false,
  credentialSource: 'independent',
  openAIReuse: { available: false, endpoint: '' },
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
    if (field === 'apiKey' && this.state.credentialSource === 'openai') return
    const next = field === 'apiKey'
      ? {
          ...this.state,
          apiKey: value,
          clearApiKey: false,
          apiKeyConfigured: this.credentialFor(this.canonical, 'independent').configured,
          failure: null,
        }
      : { ...this.state, [field]: value, failure: null }
    this.publish({ ...next, dirty: this.isDirty(next) })
  }

  reuseOpenAI(): void {
    const reuse = this.canonical?.openAIReuse
    if (!this.state.available || !this.state.writable || this.state.saving || reuse?.available !== true) return
    const next: CodexCardState = {
      ...this.state,
      credentialSource: 'openai',
      endpoint: reuse.endpoint,
      model: '',
      apiKey: '',
      clearApiKey: false,
      apiKeyConfigured: reuse.credential.configured,
      apiKeyWritable: false,
      failure: null,
    }
    this.publish({ ...next, dirty: this.isDirty(next) })
  }

  useIndependentCredential(): void {
    if (!this.state.available || !this.state.writable || this.state.saving) return
    const credential = this.credentialFor(this.canonical, 'independent')
    const next: CodexCardState = {
      ...this.state,
      credentialSource: 'independent',
      apiKey: '',
      clearApiKey: false,
      apiKeyConfigured: credential.configured,
      apiKeyWritable: credential.writable,
      failure: null,
    }
    this.publish({ ...next, dirty: this.isDirty(next) })
  }

  restoreDefaults(): void {
    if (!this.state.available || !this.state.writable || this.state.saving) return
    const credential = this.credentialFor(this.canonical, 'independent')
    const next: CodexCardState = {
      ...this.state,
      endpoint: '',
      model: '',
      apiKey: '',
      clearApiKey: credential.configured,
      apiKeyConfigured: false,
      apiKeyWritable: credential.writable,
      credentialSource: 'independent',
      failure: null,
    }
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
    const credentialClear = this.state.apiKeyWritable && this.state.clearApiKey
    if (!this.state.available
      || !this.state.dirty
      || this.state.revision === undefined
      || !this.state.writable && !credentialWrite && !credentialClear) {
      return undefined
    }
    return {
      expectedRevision: this.state.revision,
      endpoint: this.state.endpoint,
      model: this.state.model,
      ...this.canonical !== undefined
        && this.state.credentialSource !== this.credentialSourceOf(this.canonical)
        ? { credentialSource: this.state.credentialSource }
        : {},
      ...this.state.apiKey.trim() === '' ? {} : { apiKey: this.state.apiKey },
      ...this.state.clearApiKey ? { clearApiKey: true } : {},
    }
  }

  private adopt(view: CodexSettingsView): void {
    this.canonical = view
    const credentialSource = this.credentialSourceOf(view)
    this.publish({
      ...this.viewState(view, credentialSource),
      loading: false,
      saving: false,
      dirty: false,
      failure: null,
      endpoint: view.endpoint,
      model: view.model,
      apiKey: '',
      clearApiKey: false,
    })
  }

  private isDirty(state: CodexCardState): boolean {
    return this.canonical !== undefined && (
      state.endpoint !== this.canonical.endpoint
      || state.model !== this.canonical.model
      || state.apiKey.trim() !== ''
      || state.clearApiKey
      || state.credentialSource !== this.credentialSourceOf(this.canonical)
    )
  }

  private async reloadConflict(): Promise<void> {
    const draft = this.state
    try {
      const view = await this.api.get(this.abort.signal)
      if (this.abort.signal.aborted) return
      this.canonical = view
      const next: CodexCardState = {
        ...this.viewState(view, draft.credentialSource),
        loading: false,
        saving: false,
        dirty: false,
        failure: 'conflict',
        endpoint: draft.endpoint,
        model: draft.model,
        apiKey: draft.apiKey,
        clearApiKey: draft.clearApiKey,
        ...draft.clearApiKey ? { apiKeyConfigured: false } : {},
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

  private credentialSourceOf(view: CodexSettingsView): CredentialSource {
    return view.openAIReuse?.active === true ? 'openai' : 'independent'
  }

  private credentialFor(view: CodexSettingsView | undefined, source: CredentialSource): CredentialView {
    if (view === undefined) return { configured: false, writable: false }
    if (source === 'openai') {
      return view.openAIReuse?.credential ?? { configured: false, writable: false }
    }
    return view.openAIReuse?.independentCredential ?? view.credential
  }

  private viewState(
    view: CodexSettingsView,
    credentialSource: CredentialSource,
  ): Pick<
    CodexCardState,
    | 'available'
    | 'writable'
    | 'revision'
    | 'apiKeyConfigured'
    | 'apiKeyWritable'
    | 'credentialSource'
    | 'openAIReuse'
    | 'clearApiKey'
  > {
    const credential = this.credentialFor(view, credentialSource)
    return {
      available: view.available,
      writable: view.writable,
      ...view.revision === undefined ? {} : { revision: view.revision },
      apiKeyConfigured: credential.configured,
      apiKeyWritable: credentialSource === 'openai' ? false : credential.writable,
      credentialSource,
      clearApiKey: false,
      openAIReuse: {
        available: view.openAIReuse?.available ?? false,
        endpoint: view.openAIReuse?.endpoint ?? '',
      },
    }
  }
}
