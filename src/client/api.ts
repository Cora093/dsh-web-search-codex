import { HOST_API_PREFIX, type CodexSettingsSave, type CodexSettingsView } from '../shared.ts'

export class CodexSettingsApiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
  }
}

export interface CodexSettingsApi {
  get(signal?: AbortSignal): Promise<CodexSettingsView>
  save(input: CodexSettingsSave, signal?: AbortSignal): Promise<CodexSettingsView>
}

async function call<T>(method: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${HOST_API_PREFIX}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    ...signal === undefined ? {} : { signal },
  })
  const payload = await response.json().catch(() => null) as {
    ok?: boolean
    value?: unknown
    error?: { code?: string; message?: string }
  } | null
  if (!response.ok || payload?.ok !== true || payload.value === undefined) {
    throw new CodexSettingsApiError(
      payload?.error?.code ?? 'http',
      payload?.error?.message ?? `HTTP ${String(response.status)}`,
    )
  }
  return payload.value as T
}

export function createCodexSettingsApi(): CodexSettingsApi {
  return {
    get: signal => call('settings.get', {}, signal),
    save: (input, signal) => call('settings.save', input, signal),
  }
}
