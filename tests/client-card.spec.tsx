// @vitest-environment jsdom
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodexSearchCard, type CodexSearchCardProps } from '../src/client/CodexSearchCard.tsx'
import type { CodexCardState } from '../src/client/controller.ts'
import { zh } from '../src/client/locales.ts'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const roots: Array<ReturnType<typeof createRoot>> = []

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop()
    act(() => { root?.unmount() })
  }
})

describe('CodexSearchCard', () => {
  it('renders exactly the three requested fields and the endpoint guidance', () => {
    const state: CodexCardState = {
      available: true,
      writable: true,
      loading: false,
      saving: false,
      dirty: false,
      failure: null,
      revision: 1,
      endpoint: 'http://localhost:8080/v1',
      model: '',
      apiKey: '',
      clearApiKey: false,
      apiKeyConfigured: false,
      apiKeyWritable: true,
      credentialSource: 'independent',
      openAIReuse: { available: true, endpoint: 'https://gateway.example/alpha/search' },
    }
    const edit = vi.fn()
    const props = {
      t: (key: keyof typeof zh) => zh[key],
      useCodexSearchCard: (selector: (value: CodexCardState) => unknown) => selector(state),
      edit,
      reuseOpenAI: vi.fn(),
      useIndependentCredential: vi.fn(),
      restoreDefaults: vi.fn(),
      save: vi.fn(),
      discard: vi.fn(),
    } as unknown as CodexSearchCardProps
    const container = document.createElement('div')
    const root = createRoot(container)
    roots.push(root)
    act(() => { root.render(createElement(CodexSearchCard, props)) })

    const header = container.querySelector('button[aria-expanded="false"]') as HTMLButtonElement
    act(() => { header.click() })
    expect([...container.querySelectorAll('label')].map(label => label.textContent)).toEqual([
      'API Key',
      '接口地址',
      '模型（可选）',
    ])
    expect(container.textContent).toContain('连接未加密')
    expect(container.textContent).toContain('留空时使用当前会话模型')
    expect(container.textContent).toContain('填写完整接口 URL；Codex 默认路径为 /alpha/search。')
    expect(container.textContent).not.toContain('追加 /alpha/search')
    expect(edit).not.toHaveBeenCalled()
  })

  it('switches between reusable OpenAI and independent credentials', () => {
    let state: CodexCardState = {
      available: true,
      writable: true,
      loading: false,
      saving: false,
      dirty: false,
      failure: null,
      revision: 2,
      endpoint: 'https://old.example/alpha/search',
      model: 'old-model',
      apiKey: '',
      clearApiKey: false,
      apiKeyConfigured: false,
      apiKeyWritable: true,
      credentialSource: 'independent',
      openAIReuse: { available: true, endpoint: 'https://gateway.example/alpha/search' },
    }
    const reuseOpenAI = vi.fn()
    const useIndependentCredential = vi.fn()
    const restoreDefaults = vi.fn()
    const props = {
      t: (key: keyof typeof zh) => zh[key],
      useCodexSearchCard: (selector: (value: CodexCardState) => unknown) => selector(state),
      edit: vi.fn(),
      reuseOpenAI,
      useIndependentCredential,
      restoreDefaults,
      save: vi.fn(),
      discard: vi.fn(),
    } as unknown as CodexSearchCardProps
    const container = document.createElement('div')
    const root = createRoot(container)
    roots.push(root)
    act(() => { root.render(createElement(CodexSearchCard, props)) })
    act(() => { (container.querySelector('button[aria-expanded="false"]') as HTMLButtonElement).click() })

    const reuse = [...container.querySelectorAll('button')]
      .find(button => button.textContent === 'OpenAI') as HTMLButtonElement
    expect(reuse.disabled).toBe(false)
    expect(reuse.getAttribute('aria-pressed')).toBe('false')
    act(() => { reuse.click() })
    expect(reuseOpenAI).toHaveBeenCalledOnce()

    state = {
      ...state,
      credentialSource: 'openai',
      endpoint: 'https://gateway.example/alpha/search',
      model: '',
      clearApiKey: false,
      apiKeyConfigured: true,
      apiKeyWritable: false,
    }
    act(() => { root.render(createElement(CodexSearchCard, props)) })
    expect(container.querySelector('#codex-search-api-key')).toBeNull()
    const independent = [...container.querySelectorAll('button')]
      .find(button => button.textContent === '独立 Key') as HTMLButtonElement
    expect(independent.getAttribute('aria-pressed')).toBe('false')
    act(() => { independent.click() })
    expect(useIndependentCredential).toHaveBeenCalledOnce()

    const restore = [...container.querySelectorAll('button')]
      .find(button => button.textContent === '恢复默认') as HTMLButtonElement
    expect(restore.disabled).toBe(false)
    act(() => { restore.click() })
    expect(restoreDefaults).toHaveBeenCalledOnce()

    state = {
      ...state,
      credentialSource: 'independent',
      endpoint: '',
      model: '',
      apiKeyConfigured: false,
    }
    act(() => { root.render(createElement(CodexSearchCard, props)) })
    expect((([...container.querySelectorAll('button')]
      .find(button => button.textContent === '恢复默认')) as HTMLButtonElement).disabled).toBe(true)
  })
})
