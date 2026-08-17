import { describe, expect, it, vi } from 'vitest'
import type { CodexSettingsApi } from '../src/client/api.ts'
import { CodexSettingsApiError } from '../src/client/api.ts'
import { CodexCardController } from '../src/client/controller.ts'

describe('CodexCardController', () => {
  it('stages, discards, and saves the three visible fields as one operation', async () => {
    const get = vi.fn(async () => ({
      available: true,
      writable: true,
      revision: 3,
      endpoint: 'https://old.example/alpha/search',
      model: '',
      credential: { configured: false, writable: true },
    }))
    const save = vi.fn(async () => ({
      available: true,
      writable: true,
      revision: 4,
      endpoint: 'http://localhost:8080/alpha/search',
      model: 'gpt-5.2',
      credential: { configured: true, writable: true },
    }))
    const controller = new CodexCardController({ get, save } satisfies CodexSettingsApi)
    const listener = vi.fn()
    const unsubscribe = controller.subscribe(listener)

    await controller.load()
    expect(controller.getSnapshot()).toMatchObject({
      available: true,
      loading: false,
      revision: 3,
      endpoint: 'https://old.example/alpha/search',
      model: '',
      apiKey: '',
      apiKeyConfigured: false,
      apiKeyWritable: true,
      dirty: false,
    })

    controller.edit('endpoint', 'https://draft.example/v1')
    controller.edit('apiKey', 'draft-secret')
    expect(controller.getSnapshot()).toMatchObject({ dirty: true, endpoint: 'https://draft.example/v1' })
    controller.discard()
    expect(controller.getSnapshot()).toMatchObject({
      dirty: false,
      endpoint: 'https://old.example/alpha/search',
      apiKey: '',
    })

    controller.edit('endpoint', 'http://localhost:8080/alpha/search')
    controller.edit('model', 'gpt-5.2')
    controller.edit('apiKey', 'new-secret')
    await controller.save()
    expect(save).toHaveBeenCalledWith({
      expectedRevision: 3,
      endpoint: 'http://localhost:8080/alpha/search',
      model: 'gpt-5.2',
      apiKey: 'new-secret',
    }, expect.any(AbortSignal))
    expect(controller.getSnapshot()).toMatchObject({
      saving: false,
      dirty: false,
      revision: 4,
      endpoint: 'http://localhost:8080/alpha/search',
      model: 'gpt-5.2',
      apiKey: '',
      apiKeyConfigured: true,
    })
    expect(listener).toHaveBeenCalled()
    unsubscribe()
  })

  it('reloads a revision conflict while preserving the user draft', async () => {
    const get = vi.fn()
      .mockResolvedValueOnce({
        available: true,
        writable: true,
        revision: 2,
        endpoint: 'https://old.example/alpha/search',
        model: '',
        credential: { configured: true, writable: true },
      })
      .mockResolvedValueOnce({
        available: true,
        writable: true,
        revision: 3,
        endpoint: 'https://other-editor.example/alpha/search',
        model: 'other-model',
        credential: { configured: true, writable: true },
      })
    const save = vi.fn(async () => {
      throw new CodexSettingsApiError('settings-conflict', 'changed elsewhere')
    })
    const controller = new CodexCardController({ get, save } satisfies CodexSettingsApi)
    await controller.load()
    controller.edit('endpoint', 'https://my-draft.example/alpha/search')
    controller.edit('model', 'my-model')

    await controller.save()

    expect(get).toHaveBeenCalledTimes(2)
    expect(controller.getSnapshot()).toMatchObject({
      revision: 3,
      endpoint: 'https://my-draft.example/alpha/search',
      model: 'my-model',
      dirty: true,
      saving: false,
      failure: 'conflict',
    })
    controller.discard()
    expect(controller.getSnapshot()).toMatchObject({
      endpoint: 'https://other-editor.example/alpha/search',
      model: 'other-model',
      dirty: false,
      failure: null,
    })
  })

  it('allows a credential-only save when settings are read-only', async () => {
    const get = vi.fn(async () => ({
      available: true,
      writable: false,
      revision: 8,
      endpoint: 'https://fixed.example/alpha/search',
      model: 'fixed-model',
      credential: { configured: false, writable: true },
    }))
    const save = vi.fn(async () => ({
      available: true,
      writable: false,
      revision: 8,
      endpoint: 'https://fixed.example/alpha/search',
      model: 'fixed-model',
      credential: { configured: true, writable: true },
    }))
    const controller = new CodexCardController({ get, save } satisfies CodexSettingsApi)
    await controller.load()
    controller.edit('apiKey', 'new-secret')

    await controller.save()

    expect(save).toHaveBeenCalledWith({
      expectedRevision: 8,
      endpoint: 'https://fixed.example/alpha/search',
      model: 'fixed-model',
      apiKey: 'new-secret',
    }, expect.any(AbortSignal))
    expect(controller.getSnapshot()).toMatchObject({ apiKeyConfigured: true, dirty: false })
  })
})
