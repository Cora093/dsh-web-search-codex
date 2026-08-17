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
  it('renders exactly the three requested fields, warning, and append action', () => {
    let state: CodexCardState = {
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
      apiKeyConfigured: false,
      apiKeyWritable: true,
    }
    const edit = vi.fn()
    const props = {
      t: (key: keyof typeof zh) => zh[key],
      useCodexSearchCard: (selector: (value: CodexCardState) => unknown) => selector(state),
      edit,
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
    const append = [...container.querySelectorAll('button')]
      .find(button => button.textContent?.includes('追加 /alpha/search')) as HTMLButtonElement
    expect(append.disabled).toBe(false)
    act(() => { append.click() })
    expect(edit).toHaveBeenCalledWith('endpoint', 'http://localhost:8080/v1/alpha/search')

    state = { ...state, endpoint: 'http://localhost:8080/v1/alpha/search' }
    act(() => { root.render(createElement(CodexSearchCard, props)) })
    const updatedAppend = [...container.querySelectorAll('button')]
      .find(button => button.textContent?.includes('追加 /alpha/search')) as HTMLButtonElement
    expect(updatedAppend.disabled).toBe(true)
  })
})
