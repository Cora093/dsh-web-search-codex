import { describe, expect, it } from 'vitest'
import { appendAlphaSearchPath, canAppendAlphaSearchPath } from '../src/client/path.ts'

describe('alpha/search path helper', () => {
  it('appends exactly once and handles a trailing slash', () => {
    expect(appendAlphaSearchPath('https://host.example/v1')).toBe('https://host.example/v1/alpha/search')
    expect(appendAlphaSearchPath('https://host.example/v1/')).toBe('https://host.example/v1/alpha/search')
    expect(appendAlphaSearchPath('https://host.example/v1/alpha/search')).toBe('https://host.example/v1/alpha/search')
    expect(appendAlphaSearchPath('')).toBe('')
    expect(canAppendAlphaSearchPath('https://host.example/v1')).toBe(true)
    expect(canAppendAlphaSearchPath('https://host.example/v1/alpha/search')).toBe(false)
    expect(canAppendAlphaSearchPath('   ')).toBe(false)
  })
})
