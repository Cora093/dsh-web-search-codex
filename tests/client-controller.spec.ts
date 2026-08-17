import { describe, expect, it, vi } from 'vitest'
import type { CodexSettingsApi } from '../src/client/api.ts'
import { CodexSettingsApiError } from '../src/client/api.ts'
import { CodexCardController } from '../src/client/controller.ts'

describe('CodexCardController', () => {
  it('stages and saves the reusable OpenAI endpoint and credential reference', async () => {
    const view = {
      available: true,
      writable: true,
      revision: 5,
      endpoint: 'https://old.example/alpha/search',
      model: 'old-model',
      credential: { configured: false, writable: true },
      openAIReuse: {
        available: true,
        active: false,
        endpoint: 'https://gateway.example/alpha/search',
        credential: { configured: true, writable: true },
        independentCredential: { configured: false, writable: true },
      },
    }
    const get = vi.fn(async () => view)
    const save = vi.fn(async () => ({
      ...view,
      revision: 6,
      endpoint: 'https://gateway.example/alpha/search',
      model: '',
      credential: { configured: true, writable: true },
      openAIReuse: { ...view.openAIReuse, active: true },
    }))
    const controller = new CodexCardController({ get, save } satisfies CodexSettingsApi)
    await controller.load()
    controller.edit('apiKey', 'discard-this-draft')

    controller.reuseOpenAI()

    expect(controller.getSnapshot()).toMatchObject({
      credentialSource: 'openai',
      endpoint: 'https://gateway.example/alpha/search',
      model: '',
      apiKey: '',
      apiKeyConfigured: true,
      apiKeyWritable: false,
      dirty: true,
    })
    await controller.save()
    expect(save).toHaveBeenCalledWith({
      expectedRevision: 5,
      endpoint: 'https://gateway.example/alpha/search',
      model: '',
      credentialSource: 'openai',
    }, expect.any(AbortSignal))
  })

  it('switches an active OpenAI reuse configuration back to an independent credential', async () => {
    const view = {
      available: true,
      writable: true,
      revision: 8,
      endpoint: 'https://gateway.example/alpha/search',
      model: '',
      credential: { configured: true, writable: true },
      openAIReuse: {
        available: true,
        active: true,
        endpoint: 'https://gateway.example/alpha/search',
        credential: { configured: true, writable: true },
        independentCredential: { configured: false, writable: true },
      },
    }
    const get = vi.fn(async () => view)
    const save = vi.fn(async () => ({
      ...view,
      revision: 9,
      credential: { configured: false, writable: true },
      openAIReuse: { ...view.openAIReuse, active: false },
    }))
    const controller = new CodexCardController({ get, save } satisfies CodexSettingsApi)
    await controller.load()

    controller.useIndependentCredential()
    expect(controller.getSnapshot()).toMatchObject({
      credentialSource: 'independent',
      apiKeyConfigured: false,
      apiKeyWritable: true,
      dirty: true,
    })
    await controller.save()
    expect(save).toHaveBeenCalledWith({
      expectedRevision: 8,
      endpoint: 'https://gateway.example/alpha/search',
      model: '',
      credentialSource: 'independent',
    }, expect.any(AbortSignal))
  })

  it('stages restoring defaults and clearing the independent credential', async () => {
    const view = {
      available: true,
      writable: true,
      revision: 10,
      endpoint: 'https://gateway.example/alpha/search',
      model: 'gpt-5.2',
      credential: { configured: true, writable: true },
      openAIReuse: {
        available: true,
        active: true,
        endpoint: 'https://gateway.example/alpha/search',
        credential: { configured: true, writable: true },
        independentCredential: { configured: true, writable: true },
      },
    }
    const get = vi.fn(async () => view)
    const save = vi.fn(async () => ({
      ...view,
      revision: 11,
      endpoint: '',
      model: '',
      openAIReuse: { ...view.openAIReuse, active: false },
    }))
    const controller = new CodexCardController({ get, save } satisfies CodexSettingsApi)
    await controller.load()

    controller.restoreDefaults()

    expect(controller.getSnapshot()).toMatchObject({
      credentialSource: 'independent',
      endpoint: '',
      model: '',
      apiKey: '',
      apiKeyConfigured: false,
      apiKeyWritable: true,
      dirty: true,
    })
    await controller.save()
    expect(save).toHaveBeenCalledWith({
      expectedRevision: 10,
      endpoint: '',
      model: '',
      credentialSource: 'independent',
      clearApiKey: true,
    }, expect.any(AbortSignal))
  })

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
