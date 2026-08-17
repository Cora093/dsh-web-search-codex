import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { CLIENT_SLOT_ID, PACKAGE_NAME } from '../src/shared.ts'

interface PackageManifest {
  name: string
  exports: Record<string, unknown>
  files: string[]
  dsh?: {
    bundle?: { patch?: string }
    client?: { platform?: string; inject?: string[] }
  }
}

describe('published plugin manifest', () => {
  it('keeps the package, client bundle, slot, and bundle patch identities aligned', async () => {
    const manifest = JSON.parse(await readFile('package.json', 'utf8')) as PackageManifest
    const patch = parse(await readFile('dsh.bundle.patch', 'utf8')) as Array<Record<string, unknown>>
    const bundleConfig = patch.find(row => row.id === 'web') as {
      id: string
      config: { searchProvider: string }
    }
    const insertion = patch.find(row => 'insert' in row) as {
      insert: Array<{ id: string; name: string; config: { apiKeyEnv: string } }>
    }

    expect(manifest.name).toBe(PACKAGE_NAME)
    expect(manifest.exports).not.toHaveProperty('./src/*')
    expect(manifest.files).toEqual(expect.arrayContaining([
      'lib/*.js',
      'lib/types/**/*.d.ts',
      'dsh.bundle.patch',
    ]))
    expect(manifest.dsh).toMatchObject({
      bundle: { patch: './dsh.bundle.patch' },
      client: { platform: 'web' },
    })
    expect(CLIENT_SLOT_ID).toBe('web-search-codex')
    expect(bundleConfig).toEqual({ id: 'web', config: { searchProvider: 'codex' } })
    expect(insertion.insert).toEqual([{
      id: 'web-search-codex',
      name: PACKAGE_NAME,
      config: { apiKeyEnv: 'CODEX_SEARCH_API_KEY' },
    }])
  })
})
