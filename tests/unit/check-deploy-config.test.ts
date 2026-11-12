// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { placeholdersIn } from '../../scripts/check-deploy-config'

const READY = `{
  // PLACEHOLDER in a comment is only an explanation
  "vars": { "ACCESS_TEAM": "my-team", "ACCESS_AUD": "abc123" },
  "kv_namespaces": [{ "binding": "STATE", "id": "0123456789abcdef" }]
}`

describe('placeholdersIn', () => {
  test('a ready config has none, and a placeholder in a comment does not count', () => {
    expect(placeholdersIn(READY)).toEqual([])
  })

  test('names each placeholder value left in the config', () => {
    const text = READY.replace('"my-team"', '"PLACEHOLDER-team"').replace('"0123456789abcdef"', '"PLACEHOLDER-kv"')
    expect(placeholdersIn(text)).toEqual(['PLACEHOLDER-team', 'PLACEHOLDER-kv'])
  })

  test('an empty KV id counts as a placeholder', () => {
    expect(placeholdersIn(READY.replace('"0123456789abcdef"', '""'))).toEqual(['id is empty'])
  })

  test('an empty value counts as a placeholder', () => {
    expect(placeholdersIn(READY.replace('"abc123"', '""'))).toEqual(['ACCESS_AUD is empty'])
  })
})

describe('the script', () => {
  const run = (text: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'cdc-'))
    try {
      const file = join(dir, 'wrangler.jsonc')
      writeFileSync(file, text)
      const tsx = join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs')
      const r = spawnSync(process.execPath, [tsx, join(process.cwd(), 'scripts', 'check-deploy-config.ts'), file], { encoding: 'utf8' })
      return { code: r.status, out: `${r.stdout}${r.stderr}` }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  test('exits 1 and names the placeholder', () => {
    const r = run(READY.replace('"my-team"', '"PLACEHOLDER-team"'))
    expect(r.code).toBe(1)
    expect(r.out).toContain('PLACEHOLDER-team')
  })

  test('exits 0 on a ready config', () => {
    expect(run(READY).code).toBe(0)
  })
})
