import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { WebSearchProvider } from '@deepseek-ai/dsh-web'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply, type Config } from '../src/index.ts'
import { HOST_API_PREFIX, SETTINGS_NAMESPACE } from '../src/shared.ts'

interface CapturedRoute {
  path: string
  handler(request: IncomingMessage, response: ServerResponse): void | Promise<void>
}

function request(url: string, body: unknown, headers: Record<string, string> = { host: '127.0.0.1:3000' }): IncomingMessage {
  const stream = Readable.from([JSON.stringify(body)]) as IncomingMessage
  Object.assign(stream, { method: 'POST', url, headers })
  return stream
}

function responseCapture(): {
  response: ServerResponse
  read: () => { status: number; body: unknown }
} {
  let status = 0
  let text = ''
  return {
    response: {
      writeHead(next: number) { status = next; return this },
      end(chunk?: unknown) { text = String(chunk ?? ''); return this },
    } as unknown as ServerResponse,
    read: () => ({ status, body: JSON.parse(text) as unknown }),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('host plugin apply', () => {
  it('registers the namespace, provider, and fenced redacted settings route', async () => {
    let current: Config = {
      apiKeyEnv: 'CODEX_SEARCH_API_KEY',
      endpoint: 'https://one.example/alpha/search',
      model: 'gpt-one',
    }
    let provider: WebSearchProvider | undefined
    let route: CapturedRoute | undefined
    const settings = {
      writable: true,
      register: vi.fn((namespace: string) => {
        expect(namespace).toBe(SETTINGS_NAMESPACE)
        return { get: () => current, watch: vi.fn(), update: vi.fn(), replace: vi.fn() }
      }),
      describe: vi.fn(() => [{ ns: SETTINGS_NAMESPACE, value: current, user: current, revision: 1 }]),
      mutate: vi.fn(),
    }
    const services: Record<string, unknown> = {
      settings,
      credentials: {
        describe: vi.fn(async () => ({ configured: true, writable: true })),
        resolve: vi.fn(async () => ({ value: 'runtime-secret' })),
        set: vi.fn(),
      },
      loader: { entries: () => [{ options: { name: 'connection', config: { trustedHosts: [] } } }] },
      webServer: { register: vi.fn((registered: CapturedRoute) => { route = registered; return vi.fn() }) },
      agents: { currentInitiator: () => undefined },
    }
    const fakeContext = {
      settings,
      web: { registerSearchProvider: vi.fn((registered: WebSearchProvider) => { provider = registered; return vi.fn() }) },
      logger: { info: vi.fn() },
      get: (name: string) => services[name],
      inject: (_names: string[], callback: (ctx: unknown) => void) => { callback(fakeContext) },
      effect: (install: () => unknown) => { install() },
    } as unknown as Context

    apply(fakeContext, current)

    expect(provider?.id).toBe('codex')
    expect(route?.path).toBe(HOST_API_PREFIX)
    const getResponse = responseCapture()
    await route!.handler(request(`${HOST_API_PREFIX}/settings.get`, {}), getResponse.response)
    expect(getResponse.read()).toEqual({
      status: 200,
      body: {
        ok: true,
        value: {
          available: true,
          writable: true,
          revision: 1,
          endpoint: 'https://one.example/alpha/search',
          model: 'gpt-one',
          credential: { configured: true, writable: true },
        },
      },
    })
    expect(JSON.stringify(getResponse.read())).not.toContain('runtime-secret')

    const forbidden = responseCapture()
    await route!.handler(request(`${HOST_API_PREFIX}/settings.get`, {}, {
      host: '127.0.0.1:3000',
      'sec-fetch-site': 'cross-site',
    }), forbidden.response)
    expect(forbidden.read().status).toBe(403)

    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ output: 'ok' })))
    vi.stubGlobal('fetch', fetchMock)
    await provider!.search({ query: 'first' })
    current = { ...current, endpoint: 'https://two.example/alpha/search', model: 'gpt-two' }
    await provider!.search({ query: 'second' })
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://one.example/alpha/search',
      'https://two.example/alpha/search',
    ])
    expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).model)).toEqual([
      'gpt-one',
      'gpt-two',
    ])
  })
})
