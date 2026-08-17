import { describe, expect, it } from 'vitest'
import { isTrustedApiRequest } from '../src/trust-fence.ts'

describe('isTrustedApiRequest', () => {
  it('accepts loopback and configured LAN authorities but rejects cross-site browser requests', () => {
    expect(isTrustedApiRequest({ headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' } }, []))
      .toBe(true)
    expect(isTrustedApiRequest({ headers: { host: '192.168.1.8:3000', origin: 'http://192.168.1.8:3000' } }, ['192.168.1.8:3000']))
      .toBe(true)
    expect(isTrustedApiRequest({
      headers: { host: '127.0.0.1:3000', 'sec-fetch-site': 'cross-site' },
    }, [])).toBe(false)
    expect(isTrustedApiRequest({
      headers: { host: '127.0.0.1:3000', origin: 'https://attacker.example' },
    }, [])).toBe(false)
  })
})
