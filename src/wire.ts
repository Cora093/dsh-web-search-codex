import type { IncomingMessage, ServerResponse } from 'node:http'

export class HostApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

const MAX_BODY_BYTES = 64 * 1024

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of request) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
    total += buffer.length
    if (total > MAX_BODY_BYTES) throw new HostApiError('bad-request', 'request body too large', 400)
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new HostApiError('bad-request', 'request body is not valid JSON', 400)
  }
}

export function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}

export function writeOk(response: ServerResponse, value: unknown): void {
  writeJson(response, 200, { ok: true, value })
}

export function writeError(response: ServerResponse, error: unknown): void {
  if (error instanceof HostApiError) {
    writeJson(response, error.status, { ok: false, error: { code: error.code, message: error.message } })
    return
  }
  writeJson(response, 500, {
    ok: false,
    error: { code: 'internal', message: 'Codex search settings request failed' },
  })
}
