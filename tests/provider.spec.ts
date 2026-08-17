import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodexSearchProvider } from '../src/provider.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CodexSearchProvider', () => {
  it('posts the query-only alpha/search request to the configured complete endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ output: 'answer' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new CodexSearchProvider(() => ({
      endpoint: 'https://search.example/v1/alpha/search',
      model: 'gpt-5.2',
      apiKeyRef: 'CODEX_SEARCH_API_KEY',
      resolveApiKey: async () => 'top-secret',
      resolveSessionModel: () => 'ignored-session-model',
    }))

    await expect(provider.search({ query: 'current weather' })).resolves.toEqual({
      content: 'answer',
      sources: [],
      truncated: false,
    })
    expect(fetchMock).toHaveBeenCalledOnce()
    const [endpoint, init] = fetchMock.mock.calls[0]!
    expect(endpoint).toBe('https://search.example/v1/alpha/search')
    expect(init).toMatchObject({
      method: 'POST',
      redirect: 'manual',
      headers: {
        Authorization: 'Bearer top-secret',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
    expect(JSON.parse(String(init?.body))).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/u),
      model: 'gpt-5.2',
      input: 'current weather',
      commands: { search_query: [{ q: 'current weather' }] },
      settings: { allowed_callers: ['direct'], external_web_access: true },
    })
  })

  it('maps output and keeps the first source for each normalized HTTP URL', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      output: 'source-backed answer',
      results: [
        { url: 'HTTPS://Example.com:443/docs#intro', title: 'First title' },
        { url: 'https://example.com/docs', title: 'Duplicate title' },
        { url: 'http://example.com/other', title: '' },
        { url: 'javascript:alert(1)', title: 'Unsafe' },
        { url: 'not a url', title: 'Invalid' },
        { title: 'Missing URL' },
      ],
    }))))
    const provider = new CodexSearchProvider(() => ({
      endpoint: 'https://search.example/alpha/search',
      model: 'gpt-5.2',
      apiKeyRef: 'CODEX_SEARCH_API_KEY',
      resolveApiKey: async () => 'secret',
      resolveSessionModel: () => undefined,
    }))

    await expect(provider.search({ query: 'docs' })).resolves.toEqual({
      content: 'source-backed answer',
      sources: [
        { url: 'https://example.com/docs#intro', title: 'First title' },
        { url: 'http://example.com/other' },
      ],
      truncated: false,
    })
  })

  it('rejects redirects without following the Location target', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, {
      status: 302,
      headers: { location: 'https://attacker.example/steal' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new CodexSearchProvider(() => ({
      endpoint: 'https://search.example/alpha/search',
      model: 'gpt-5.2',
      apiKeyRef: 'CODEX_SEARCH_API_KEY',
      resolveApiKey: async () => 'secret',
      resolveSessionModel: () => undefined,
    }))

    await expect(provider.search({ query: 'redirect' })).rejects.toMatchObject({
      code: 'CODEX_SEARCH_REDIRECT',
      message: 'Codex search endpoint refused an HTTP redirect',
    })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ redirect: 'manual' })
  })

  it.each(['not a url', 'file:///tmp/alpha/search'])(
    'rejects an invalid or non-HTTP endpoint: %s',
    async (endpoint) => {
      const fetchMock = vi.fn<typeof fetch>()
      vi.stubGlobal('fetch', fetchMock)
      const provider = new CodexSearchProvider(() => ({
        endpoint,
        model: 'gpt-5.2',
        apiKeyRef: 'CODEX_SEARCH_API_KEY',
        resolveApiKey: async () => 'secret',
        resolveSessionModel: () => undefined,
      }))

      await expect(provider.search({ query: 'invalid endpoint' })).rejects.toMatchObject({
        code: 'CODEX_SEARCH_ENDPOINT_INVALID',
      })
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it('fails an already-aborted search before credential resolution or dispatch', async () => {
    const resolveApiKey = vi.fn(async () => 'secret')
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    const provider = new CodexSearchProvider(() => ({
      endpoint: 'https://search.example/alpha/search',
      model: 'gpt-5.2',
      apiKeyRef: 'CODEX_SEARCH_API_KEY',
      resolveApiKey,
      resolveSessionModel: () => undefined,
    }))
    const controller = new AbortController()
    controller.abort(new Error('caller stopped'))

    await expect(provider.search({ query: 'cancelled' }, controller.signal)).rejects.toMatchObject({
      code: 'WEB_ABORTED',
      message: 'Codex search aborted',
    })
    expect(resolveApiKey).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('aborts while credential resolution is pending and never dispatches afterwards', async () => {
    let settleKey: ((value: string) => void) | undefined
    const resolveApiKey = vi.fn(() => new Promise<string>((resolve) => {
      settleKey = resolve
    }))
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    const provider = new CodexSearchProvider(() => ({
      endpoint: 'https://search.example/alpha/search',
      model: 'gpt-5.2',
      apiKeyRef: 'CODEX_SEARCH_API_KEY',
      resolveApiKey,
      resolveSessionModel: () => undefined,
    }))
    const controller = new AbortController()
    const pending = provider.search({ query: 'cancelled during key lookup' }, controller.signal)
    controller.abort(new Error('caller stopped'))
    settleKey?.('late-secret')

    await expect(pending).rejects.toMatchObject({ code: 'WEB_ABORTED' })
    await Promise.resolve()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('classifies non-2xx responses while redacting an echoed credential', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      error: { message: 'model gpt-unknown is unsupported; received secret top-secret' },
    }), {
      status: 422,
      headers: { 'content-type': 'application/json' },
    })))
    const provider = new CodexSearchProvider(() => ({
      endpoint: 'https://search.example/alpha/search',
      model: 'gpt-unknown',
      apiKeyRef: 'CODEX_SEARCH_API_KEY',
      resolveApiKey: async () => 'top-secret',
      resolveSessionModel: () => undefined,
    }))

    const error = await provider.search({ query: 'unsupported model' }).catch((caught: unknown) => caught)
    expect(error).toMatchObject({ code: 'CODEX_SEARCH_HTTP_ERROR' })
    expect(String(error)).toContain('HTTP 422')
    expect(String(error)).toContain('model gpt-unknown is unsupported')
    expect(String(error)).not.toContain('top-secret')
  })

  it('classifies an invalid JSON success response without echoing its body', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response('not-json top-secret', { status: 200 })))
    const provider = new CodexSearchProvider(() => ({
      endpoint: 'https://search.example/alpha/search',
      model: 'gpt-5.2',
      apiKeyRef: 'CODEX_SEARCH_API_KEY',
      resolveApiKey: async () => 'top-secret',
      resolveSessionModel: () => undefined,
    }))

    const error = await provider.search({ query: 'invalid JSON' }).catch((caught: unknown) => caught)
    expect(error).toMatchObject({ code: 'CODEX_SEARCH_INVALID_JSON' })
    expect(String(error)).not.toContain('not-json')
    expect(String(error)).not.toContain('top-secret')
  })

  it('maps a fetch AbortError to WEB_ABORTED', async () => {
    let notifyFetchStarted: (() => void) | undefined
    const fetchStarted = new Promise<void>((resolve) => {
      notifyFetchStarted = resolve
    })
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => new Promise<Response>((_resolve, reject) => {
      notifyFetchStarted?.()
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted', 'AbortError'))
      }, { once: true })
    }))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new CodexSearchProvider(() => ({
      endpoint: 'https://search.example/alpha/search',
      model: 'gpt-5.2',
      apiKeyRef: 'CODEX_SEARCH_API_KEY',
      resolveApiKey: async () => 'secret',
      resolveSessionModel: () => undefined,
    }))
    const controller = new AbortController()
    const pending = provider.search({ query: 'abort fetch' }, controller.signal)
    await fetchStarted
    controller.abort(new Error('caller stopped'))

    await expect(pending).rejects.toMatchObject({ code: 'WEB_ABORTED' })
    expect(fetchMock.mock.calls[0]![1]?.signal).toBe(controller.signal)
  })

  it('contains credential resolver failures without exposing the cause text', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    const provider = new CodexSearchProvider(() => ({
      endpoint: 'https://search.example/alpha/search',
      model: 'gpt-5.2',
      apiKeyRef: 'CODEX_SEARCH_API_KEY',
      resolveApiKey: async () => { throw new Error('vault path contains top-secret') },
      resolveSessionModel: () => undefined,
    }))

    const error = await provider.search({ query: 'credential error' }).catch((caught: unknown) => caught)
    expect(error).toMatchObject({ code: 'CODEX_SEARCH_CREDENTIAL_ERROR' })
    expect(String(error)).not.toContain('top-secret')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
