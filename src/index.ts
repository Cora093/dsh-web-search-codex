import type { IncomingMessage } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-session'
import { SettingsConflictError, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-web'
import z from '@deepseek-ai/schemastery'
import { HostSettingsController, type CredentialsLike, type SettingsLike } from './host-settings.ts'
import { CodexSearchProvider } from './provider.ts'
import {
  DEFAULT_API_KEY_REF,
  HOST_API_PREFIX,
  SETTINGS_NAMESPACE,
  unavailableCodexSettingsView,
  type CodexSettingsSave,
  type CodexSettingsValue,
} from './shared.ts'
import { isTrustedApiRequest } from './trust-fence.ts'
import { HostApiError, readJsonBody, writeError, writeJson, writeOk } from './wire.ts'

export { CodexSearchProvider, CODEX_PROVIDER_ID } from './provider.ts'
export type { CodexSearchProviderOptions, CodexSearchRequestBody } from './provider.ts'

export const name = 'web-search-codex'
export const inject = ['web', 'webServer', 'loader']

export interface Config extends CodexSettingsValue {}

export const Config: z<Config> = z.object({
  apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_REF),
  endpoint: z.string(),
  model: z.string(),
})

interface LoaderLike {
  entries(): Iterable<{ options: { name: string; config?: unknown } }>
}

interface WebServerLike {
  register(route: {
    kind: 'prefix'
    path: string
    handler: (request: IncomingMessage, response: import('node:http').ServerResponse) => void | Promise<void>
  }): () => void
}

interface AgentRegistryLike {
  currentInitiator(): {
    session: { requestContext(): { model?: string } | undefined }
  } | undefined
}

interface CredentialServiceLike {
  describe(ref: ReturnType<typeof credentialRef>): Promise<{ configured: boolean; writable: boolean }>
  resolve(ref: ReturnType<typeof credentialRef>): Promise<{ value: string } | undefined>
  set(ref: ReturnType<typeof credentialRef>, value: string): Promise<void>
}

function trustedHostsOf(ctx: Context): string[] {
  const loader = ctx.get('loader') as LoaderLike | undefined
  if (loader === undefined) return []
  for (const entry of loader.entries()) {
    if (entry.options.name !== 'connection') continue
    const config = entry.options.config as { trustedHosts?: unknown } | undefined
    return Array.isArray(config?.trustedHosts)
      ? config.trustedHosts.filter((host): host is string => typeof host === 'string')
      : []
  }
  return []
}

function credentialFace(ctx: Context): CredentialsLike {
  const service = (): CredentialServiceLike | undefined => ctx.get('credentials') as CredentialServiceLike | undefined
  return {
    describe: async (ref) => service() === undefined
      ? { configured: false, writable: false }
      : service()!.describe(credentialRef(ref)),
    resolve: async (ref) => service()?.resolve(credentialRef(ref)),
    set: async (ref, value) => {
      const credentials = service()
      if (credentials === undefined) throw new Error('credential store unavailable')
      await credentials.set(credentialRef(ref), value)
    },
  }
}

function parseSave(payload: unknown): CodexSettingsSave {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new HostApiError('bad-request', 'request body must be an object', 400)
  }
  const record = payload as Record<string, unknown>
  if (typeof record.expectedRevision !== 'number'
    || typeof record.endpoint !== 'string'
    || typeof record.model !== 'string'
    || record.apiKey !== undefined && typeof record.apiKey !== 'string') {
    throw new HostApiError('bad-request', 'invalid Codex search settings payload', 400)
  }
  return {
    expectedRevision: record.expectedRevision,
    endpoint: record.endpoint,
    model: record.model,
    ...typeof record.apiKey === 'string' ? { apiKey: record.apiKey } : {},
  }
}

export function apply(ctx: Context, config: Config = {}): void {
  let current = (): Config => config
  let settingsController: HostSettingsController | undefined
  const credentials = credentialFace(ctx)
  const namespace = settingsNamespace(SETTINGS_NAMESPACE)

  ctx.inject(['settings'], (settingsContext) => {
    const settings = settingsContext.settings
    const scope = settings.register(namespace, Config, { base: config })
    const controller = new HostSettingsController(
      settings as unknown as SettingsLike,
      credentials,
      namespace,
      DEFAULT_API_KEY_REF,
    )
    current = () => scope.get()
    settingsController = controller
    settingsContext.effect(() => () => {
      if (settingsController === controller) settingsController = undefined
      current = () => config
    }, 'web-search-codex: settings controller')
  })

  const provider = new CodexSearchProvider(() => {
    const value = current()
    const apiKeyRef = value.apiKeyEnv?.trim() || DEFAULT_API_KEY_REF
    return {
      ...value.endpoint === undefined ? {} : { endpoint: value.endpoint },
      ...value.model === undefined ? {} : { model: value.model },
      apiKeyRef,
      resolveApiKey: async () => {
        const resolved = await credentials.resolve(apiKeyRef)
        return resolved?.value ?? process.env[apiKeyRef]
      },
      resolveSessionModel: () => {
        const agents = ctx.get('agents') as AgentRegistryLike | undefined
        return agents?.currentInitiator()?.session.requestContext()?.model
      },
      recordRequest: (request) => {
        ctx.logger.info('web-search-codex request %o', request)
      },
    }
  })
  ctx.web.registerSearchProvider(provider)

  const trustedHosts = trustedHostsOf(ctx)
  const webServer = ctx.get('webServer') as WebServerLike
  ctx.effect(() => webServer.register({
    kind: 'prefix',
    path: HOST_API_PREFIX,
    handler: async (request, response) => {
      if (!isTrustedApiRequest(request, trustedHosts)) {
        writeJson(response, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } })
        return
      }
      if (request.method !== 'POST') {
        writeJson(response, 405, { ok: false, error: { code: 'method-not-allowed', message: 'method not allowed' } })
        return
      }
      const pathname = new URL(request.url ?? '/', 'http://dsh.internal').pathname
      const method = pathname.startsWith(`${HOST_API_PREFIX}/`)
        ? pathname.slice(HOST_API_PREFIX.length + 1)
        : undefined
      try {
        const payload = await readJsonBody(request)
        if (method === 'settings.get') {
          writeOk(response, await settingsController?.get() ?? unavailableCodexSettingsView())
          return
        }
        if (method === 'settings.save') {
          if (settingsController === undefined) {
            throw new HostApiError('settings-unavailable', 'Codex search settings are unavailable', 503)
          }
          writeOk(response, await settingsController.save(parseSave(payload)))
          return
        }
        throw new HostApiError('not-found', 'unknown Codex search settings method', 404)
      } catch (error: unknown) {
        if (error instanceof SettingsConflictError
          || typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'SETTINGS_CONFLICT') {
          writeError(response, new HostApiError('settings-conflict', 'Settings changed in another editor; reload and retry', 409))
          return
        }
        if (error instanceof TypeError) {
          writeError(response, new HostApiError('settings-rejected', error.message, 400))
          return
        }
        writeError(response, error)
      }
    },
  }), 'web-search-codex: settings API')
}
