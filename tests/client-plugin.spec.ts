// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/index.tsx'
import { CLIENT_SLOT_ID } from '../src/shared.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('client plugin lifecycle', () => {
  it('registers cleanup for its slot, locales, and in-flight controller request', async () => {
    let requestSignal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined
      return new Promise<Response>(() => {})
    }))
    const cleanups: Array<() => void> = []
    const disposeZh = vi.fn()
    const disposeEn = vi.fn()
    const disposeSlot = vi.fn()
    const localeRegister = vi.fn()
      .mockReturnValueOnce(disposeZh)
      .mockReturnValueOnce(disposeEn)
    const slotRegister = vi.fn(() => disposeSlot)
    const slotInject = vi.fn((_name: string, setup: () => () => void) => {
      const cleanup = setup()
      cleanups.push(cleanup)
      return vi.fn()
    })
    const effect = vi.fn((install: () => unknown) => {
      const cleanup = install()
      if (typeof cleanup === 'function') cleanups.push(cleanup as () => void)
      return vi.fn()
    })
    const ctx = {
      locale: { register: localeRegister },
      slots: { inject: slotInject, register: slotRegister },
      effect,
    }

    apply(ctx as never)
    await vi.waitFor(() => { expect(requestSignal).toBeDefined() })

    expect(inject).toEqual(['slots', 'locale'])
    expect(slotInject).toHaveBeenCalledWith('settings.plugin.item', expect.any(Function))
    expect(slotRegister).toHaveBeenCalledWith(expect.objectContaining({
      name: 'settings.plugin.item',
      id: CLIENT_SLOT_ID,
    }), expect.any(Function))
    expect(localeRegister.mock.calls.map(call => call.slice(0, 2))).toEqual([
      ['web-search-codex', 'zh'],
      ['web-search-codex', 'en'],
    ])
    expect(requestSignal?.aborted).toBe(false)

    for (const cleanup of cleanups.reverse()) cleanup()

    expect(disposeSlot).toHaveBeenCalledOnce()
    expect(disposeZh).toHaveBeenCalledOnce()
    expect(disposeEn).toHaveBeenCalledOnce()
    expect(requestSignal?.aborted).toBe(true)
  })
})
