import { describe, expect, it, vi } from 'vitest'
import {
  HostSettingsController,
  type CredentialsLike,
  type SettingsDescriptorLike,
  type SettingsLike,
} from '../src/host-settings.ts'
import { DEFAULT_API_KEY_REF, SETTINGS_NAMESPACE } from '../src/shared.ts'

describe('HostSettingsController', () => {
  it('returns only redacted settings and credential status', async () => {
    const settings: SettingsLike = {
      writable: true,
      describe: vi.fn(() => [{
        ns: SETTINGS_NAMESPACE,
        value: {
          apiKeyEnv: DEFAULT_API_KEY_REF,
          endpoint: 'https://search.example/alpha/search',
          model: 'gpt-5.2',
          apiKey: 'must-never-escape',
        },
        user: { endpoint: 'https://search.example/alpha/search' },
        revision: 7,
      }]),
      mutate: vi.fn(),
    }
    const credentials: CredentialsLike = {
      describe: vi.fn(async () => ({ configured: true, writable: false })),
      resolve: vi.fn(async () => ({ value: 'must-never-escape' })),
      set: vi.fn(),
    }
    const controller = new HostSettingsController(
      settings,
      credentials,
      SETTINGS_NAMESPACE,
      DEFAULT_API_KEY_REF,
    )

    const view = await controller.get()
    expect(view).toEqual({
      available: true,
      writable: true,
      revision: 7,
      endpoint: 'https://search.example/alpha/search',
      model: 'gpt-5.2',
      credential: { configured: true, writable: false },
    })
    expect(JSON.stringify(view)).not.toContain('must-never-escape')
    expect(credentials.resolve).not.toHaveBeenCalled()
    expect(settings.describe).toHaveBeenCalledWith({ redactSecrets: true })
  })

  it('saves endpoint, optional model, and credential with one revision fence', async () => {
    let configured = false
    let descriptor: SettingsDescriptorLike = {
      ns: SETTINGS_NAMESPACE,
      value: {
        apiKeyEnv: DEFAULT_API_KEY_REF,
        endpoint: 'https://old.example/alpha/search',
        model: 'old-model',
      },
      user: { endpoint: 'https://old.example/alpha/search', model: 'old-model' },
      revision: 2,
    }
    const mutate = vi.fn(async (_namespace: string, operations: readonly unknown[], expectedRevision?: number) => {
      expect(expectedRevision).toBe(descriptor.revision)
      expect(operations).toEqual([
        { op: 'set', path: ['endpoint'], value: 'http://localhost:8080/alpha/search' },
        { op: 'unset', path: ['model'] },
      ])
      descriptor = {
        ...descriptor,
        value: { apiKeyEnv: DEFAULT_API_KEY_REF, endpoint: 'http://localhost:8080/alpha/search' },
        user: { endpoint: 'http://localhost:8080/alpha/search' },
        revision: descriptor.revision + 1,
      }
    })
    const settings: SettingsLike = {
      writable: true,
      describe: () => [descriptor],
      mutate,
    }
    const set = vi.fn(async () => { configured = true })
    const credentials: CredentialsLike = {
      describe: vi.fn(async () => ({ configured, writable: true })),
      resolve: vi.fn(),
      set,
    }
    const controller = new HostSettingsController(
      settings,
      credentials,
      SETTINGS_NAMESPACE,
      DEFAULT_API_KEY_REF,
    )

    const view = await controller.save({
      expectedRevision: 2,
      endpoint: ' http://localhost:8080/alpha/search ',
      model: '   ',
      apiKey: 'new-secret',
    })

    expect(mutate).toHaveBeenCalledOnce()
    expect(set).toHaveBeenCalledWith(DEFAULT_API_KEY_REF, 'new-secret')
    expect(mutate.mock.invocationCallOrder[0]).toBeLessThan(set.mock.invocationCallOrder[0]!)
    expect(view).toEqual({
      available: true,
      writable: true,
      revision: 3,
      endpoint: 'http://localhost:8080/alpha/search',
      model: '',
      credential: { configured: true, writable: true },
    })
    expect(JSON.stringify(view)).not.toContain('new-secret')
  })

  it('rolls settings back when the credential write fails', async () => {
    const oldUser = { endpoint: 'https://old.example/alpha/search', model: 'old-model' }
    let descriptor: SettingsDescriptorLike = {
      ns: SETTINGS_NAMESPACE,
      value: { apiKeyEnv: DEFAULT_API_KEY_REF, ...oldUser },
      user: oldUser,
      revision: 4,
    }
    const mutate = vi.fn(async (_namespace: string, operations: readonly unknown[], expectedRevision?: number) => {
      expect(expectedRevision).toBe(descriptor.revision)
      if (mutate.mock.calls.length === 1) {
        descriptor = {
          ...descriptor,
          value: { apiKeyEnv: DEFAULT_API_KEY_REF, endpoint: 'https://new.example/alpha/search' },
          user: { endpoint: 'https://new.example/alpha/search' },
          revision: 5,
        }
      } else {
        expect(operations).toEqual([{ op: 'set', path: [], value: oldUser }])
        descriptor = {
          ...descriptor,
          value: { apiKeyEnv: DEFAULT_API_KEY_REF, ...oldUser },
          user: oldUser,
          revision: 6,
        }
      }
    })
    const settings: SettingsLike = {
      writable: true,
      describe: () => [descriptor],
      mutate,
    }
    const credentials: CredentialsLike = {
      describe: vi.fn(async () => ({ configured: false, writable: true })),
      resolve: vi.fn(),
      set: vi.fn(async () => { throw new Error('failed while writing new-secret') }),
    }
    const controller = new HostSettingsController(
      settings,
      credentials,
      SETTINGS_NAMESPACE,
      DEFAULT_API_KEY_REF,
    )

    const error = await controller.save({
      expectedRevision: 4,
      endpoint: 'https://new.example/alpha/search',
      model: '',
      apiKey: 'new-secret',
    }).catch((caught: unknown) => caught)

    expect(mutate).toHaveBeenCalledTimes(2)
    expect(descriptor.user).toEqual(oldUser)
    expect(String(error)).toContain('Failed to save Codex search settings')
    expect(String(error)).not.toContain('new-secret')
  })

  it('writes only the credential when the settings document is read-only', async () => {
    const settings: SettingsLike = {
      writable: false,
      describe: () => [{
        ns: SETTINGS_NAMESPACE,
        value: {
          apiKeyEnv: DEFAULT_API_KEY_REF,
          endpoint: 'https://fixed.example/alpha/search',
          model: 'fixed-model',
        },
        revision: 9,
      }],
      mutate: vi.fn(),
    }
    let configured = false
    const credentials: CredentialsLike = {
      describe: vi.fn(async () => ({ configured, writable: true })),
      resolve: vi.fn(),
      set: vi.fn(async () => { configured = true }),
    }
    const controller = new HostSettingsController(
      settings,
      credentials,
      SETTINGS_NAMESPACE,
      DEFAULT_API_KEY_REF,
    )

    const view = await controller.save({
      expectedRevision: 9,
      endpoint: 'https://fixed.example/alpha/search',
      model: 'fixed-model',
      apiKey: 'new-secret',
    })

    expect(settings.mutate).not.toHaveBeenCalled()
    expect(credentials.set).toHaveBeenCalledWith(DEFAULT_API_KEY_REF, 'new-secret')
    expect(view.credential.configured).toBe(true)
  })
})
