import { Context } from '@deepseek-ai/cordis'
import WebRuntime from '@deepseek-ai/dsh-web'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodexSearchProvider } from '../src/provider.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('WebRuntime provider selection', () => {
  it('uses codex without ambiguity while the DeepSeek provider remains mounted', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      output: 'codex-result',
      results: [{ url: 'https://example.com/result', title: 'Result' }],
    })))
    vi.stubGlobal('fetch', fetchMock)
    const deepSeekSearch = vi.fn(async () => ({
      content: 'wrong-provider',
      sources: [],
      truncated: false,
    }))
    const ctx = new Context()
    await ctx.plugin(WebRuntime, { searchProvider: 'codex' })
    ctx.web.registerSearchProvider({
      id: 'deepseek',
      available: () => true,
      search: deepSeekSearch,
    })
    ctx.web.registerSearchProvider(new CodexSearchProvider(() => ({
      endpoint: 'https://search.example/v1/alpha/search',
      model: 'gpt-test',
      apiKeyRef: 'CODEX_SEARCH_API_KEY',
      resolveApiKey: async () => 'secret',
      resolveSessionModel: () => undefined,
    })))

    await expect(ctx.web.search({ query: 'selected provider' })).resolves.toMatchObject({
      content: 'codex-result',
      sources: [{ url: 'https://example.com/result', title: 'Result' }],
    })
    expect(deepSeekSearch).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
