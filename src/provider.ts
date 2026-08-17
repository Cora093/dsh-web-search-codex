import { randomUUID } from 'node:crypto'
import { WebError } from '@deepseek-ai/dsh-web'
import type {
  WebSearchProvider,
  WebSearchRequest,
  WebSearchResult,
  WebSearchSource,
} from '@deepseek-ai/dsh-web'

export const CODEX_PROVIDER_ID = 'codex'

export interface CodexSearchRequestBody {
  readonly id: string
  readonly model: string
  readonly input: string
  readonly commands: {
    readonly search_query: readonly [{ readonly q: string }]
  }
  readonly settings: {
    readonly allowed_callers: readonly ['direct']
    readonly external_web_access: true
  }
}

export interface CodexSearchProviderOptions {
  readonly endpoint?: string
  readonly model?: string
  readonly apiKeyRef: string
  readonly resolveApiKey: () => Promise<string | undefined>
  readonly resolveSessionModel: () => string | undefined
  readonly recordRequest?: (request: { endpoint: string; body: CodexSearchRequestBody }) => void
}

function searchAborted(signal?: AbortSignal, fallback?: unknown): WebError {
  return new WebError('Codex search aborted', 'WEB_ABORTED', {
    cause: signal?.aborted === true ? signal.reason : fallback,
  })
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) throw searchAborted(signal)
}

function abortable<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal === undefined) return operation
  if (signal.aborted) return Promise.reject(searchAborted(signal))
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => { reject(searchAborted(signal)) }
    signal.addEventListener('abort', onAbort, { once: true })
    void operation.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

function mapResponse(payload: unknown): WebSearchResult {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new WebError('Codex search returned an invalid response shape', 'CODEX_SEARCH_PROTOCOL_ERROR')
  }
  const response = payload as { readonly output?: unknown; readonly results?: unknown }
  if (Object.hasOwn(response, 'output') && typeof response.output !== 'string') {
    throw new WebError('Codex search returned a non-string output', 'CODEX_SEARCH_PROTOCOL_ERROR')
  }
  if (Object.hasOwn(response, 'results') && !Array.isArray(response.results)) {
    throw new WebError('Codex search returned non-array results', 'CODEX_SEARCH_PROTOCOL_ERROR')
  }
  const sources: WebSearchSource[] = []
  const seen = new Set<string>()
  if (Array.isArray(response.results)) {
    for (const item of response.results) {
      if (typeof item !== 'object' || item === null) continue
      const { url: rawUrl, title } = item as { url?: unknown; title?: unknown }
      if (typeof rawUrl !== 'string') continue
      let parsed: URL
      try {
        parsed = new URL(rawUrl)
      } catch {
        continue
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue
      const normalized = new URL(parsed)
      normalized.hash = ''
      if (seen.has(normalized.href)) continue
      seen.add(normalized.href)
      sources.push({
        url: parsed.href,
        ...typeof title === 'string' && title.trim() !== '' ? { title: title.trim() } : {},
      })
    }
  }
  const content = typeof response.output === 'string' && response.output.trim() !== ''
    ? response.output
    : undefined
  if (content === undefined && sources.length === 0) {
    throw new WebError('Codex search returned no output or valid sources', 'CODEX_SEARCH_PROTOCOL_ERROR')
  }
  return { ...content === undefined ? {} : { content }, sources, truncated: false }
}

function errorDetail(payload: unknown): string | undefined {
  if (typeof payload === 'string') return payload
  if (typeof payload !== 'object' || payload === null) return undefined
  const record = payload as { error?: unknown; message?: unknown }
  if (typeof record.error === 'string') return record.error
  if (typeof record.error === 'object' && record.error !== null) {
    const message = (record.error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return typeof record.message === 'string' ? record.message : undefined
}

function safeErrorDetail(payload: unknown, apiKey: string): string | undefined {
  const detail = errorDetail(payload)?.trim()
  if (detail === undefined || detail === '') return undefined
  return detail.split(apiKey).join('[REDACTED]').slice(0, 500)
}

export class CodexSearchProvider implements WebSearchProvider {
  readonly id = CODEX_PROVIDER_ID

  constructor(private readonly resolveOptions: () => CodexSearchProviderOptions) {}

  available(): boolean {
    return true
  }

  async search(_request: WebSearchRequest, _signal?: AbortSignal): Promise<WebSearchResult> {
    throwIfAborted(_signal)
    const options = this.resolveOptions()
    const endpoint = options.endpoint?.trim()
    if (endpoint === undefined || endpoint === '') {
      throw new WebError('Codex search endpoint is not configured', 'CODEX_SEARCH_ENDPOINT_MISSING')
    }
    let endpointUrl: URL
    try {
      endpointUrl = new URL(endpoint)
    } catch {
      throw new WebError('Codex search endpoint is not a valid HTTP URL', 'CODEX_SEARCH_ENDPOINT_INVALID')
    }
    if (endpointUrl.protocol !== 'http:' && endpointUrl.protocol !== 'https:') {
      throw new WebError('Codex search endpoint is not a valid HTTP URL', 'CODEX_SEARCH_ENDPOINT_INVALID')
    }
    let apiKey: string | undefined
    try {
      apiKey = await abortable(options.resolveApiKey(), _signal)
    } catch (error: unknown) {
      if (_signal?.aborted === true || error instanceof WebError && error.code === 'WEB_ABORTED') throw error
      throw new WebError('Codex search credential resolution failed', 'CODEX_SEARCH_CREDENTIAL_ERROR')
    }
    throwIfAborted(_signal)
    if (apiKey === undefined || apiKey === '') {
      throw new WebError(
        `Codex search has no API key for "${options.apiKeyRef}"`,
        'CODEX_SEARCH_CREDENTIAL_MISSING',
      )
    }
    const model = options.model?.trim() || options.resolveSessionModel()?.trim()
    if (model === undefined || model === '') {
      throw new WebError('Codex search has no explicit or current session model', 'CODEX_SEARCH_MODEL_MISSING')
    }
    const body: CodexSearchRequestBody = {
      id: randomUUID(),
      model,
      input: _request.query,
      commands: { search_query: [{ q: _request.query }] },
      settings: { allowed_callers: ['direct'], external_web_access: true },
    }
    options.recordRequest?.({ endpoint, body })
    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        ..._signal === undefined ? {} : { signal: _signal },
      })
    } catch (error: unknown) {
      if (_signal?.aborted === true || isAbortError(error)) throw searchAborted(_signal, error)
      throw new WebError(
        'Codex search network request failed',
        'CODEX_SEARCH_NETWORK_ERROR',
        { cause: error },
      )
    }
    if (response.status >= 300 && response.status < 400) {
      throw new WebError('Codex search endpoint refused an HTTP redirect', 'CODEX_SEARCH_REDIRECT')
    }
    if (!response.ok) {
      let detail: string | undefined
      try {
        const text = await response.text()
        const parsed: unknown = text.trim() === '' ? undefined : JSON.parse(text)
        detail = safeErrorDetail(parsed, apiKey)
      } catch (error: unknown) {
        if (_signal?.aborted === true || isAbortError(error)) throw searchAborted(_signal, error)
      }
      throw new WebError(
        `Codex search API error (HTTP ${String(response.status)})${detail === undefined ? '' : `: ${detail}`}`,
        'CODEX_SEARCH_HTTP_ERROR',
      )
    }
    let payload: unknown
    try {
      payload = await response.json()
    } catch (error: unknown) {
      if (_signal?.aborted === true || isAbortError(error)) throw searchAborted(_signal, error)
      throw new WebError(
        'Codex search returned invalid JSON',
        'CODEX_SEARCH_INVALID_JSON',
        { cause: error },
      )
    }
    return mapResponse(payload)
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
