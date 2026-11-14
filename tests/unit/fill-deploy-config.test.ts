// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { placeholdersIn } from '../../scripts/check-deploy-config'
import { fillDeployConfig } from '../../scripts/fill-deploy-config'

// Invented values. Nothing here is a real deployment.
const TEMPLATE = `{
  // PLACEHOLDER in a comment is only an explanation
  "routes": [{ "pattern": "PLACEHOLDER-hostname", "custom_domain": true }],
  "vars": { "ACCESS_TEAM": "PLACEHOLDER-team", "ACCESS_AUD": "PLACEHOLDER-aud" },
  "kv_namespaces": [{ "binding": "STATE", "id": "PLACEHOLDER-kv" }]
}`
const ALL = { hostname: 'reading.example.org', accessTeam: 'my-team', accessAud: 'abc123', kvId: '0123456789abcdef' }

describe('fillDeployConfig', () => {
  test('fills every placeholder and leaves none', () => {
    const out = fillDeployConfig(TEMPLATE, ALL)
    expect(placeholdersIn(out)).toEqual([])
    expect(out).toContain('"pattern": "reading.example.org"')
    expect(out).toContain('"ACCESS_TEAM": "my-team"')
    expect(out).toContain('"ACCESS_AUD": "abc123"')
    expect(out).toContain('"id": "0123456789abcdef"')
  })

  test('names every missing value by its secret name', () => {
    expect(() => fillDeployConfig(TEMPLATE, { hostname: 'reading.example.org' })).toThrow('missing: ACCESS_TEAM, ACCESS_AUD, KV_ID')
    expect(() => fillDeployConfig(TEMPLATE, { ...ALL, kvId: '' })).toThrow('missing: KV_ID')
  })

  test('refuses a value that could break out of its JSON string', () => {
    expect(() => fillDeployConfig(TEMPLATE, { ...ALL, hostname: 'x","evil":"y' })).toThrow('bad: SITE_HOSTNAME')
    expect(() => fillDeployConfig(TEMPLATE, { ...ALL, accessAud: 'a b' })).toThrow('bad: ACCESS_AUD')
  })
})

// These start the real script in a process of its own: past the default five seconds when the whole suite runs beside them.
vi.setConfig({ testTimeout: 30_000 })

describe('the script', () => {
  const run = (env: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), 'fdc-'))
    try {
      const file = join(dir, 'wrangler.jsonc')
      writeFileSync(file, TEMPLATE)
      const tsx = join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs')
      const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !['SITE_HOSTNAME', 'ACCESS_TEAM', 'ACCESS_AUD', 'KV_ID'].includes(k)))
      const r = spawnSync(process.execPath, [tsx, join(process.cwd(), 'scripts', 'fill-deploy-config.ts'), file], {
        encoding: 'utf8',
        env: { ...clean, ...env },
      })
      return { code: r.status, out: `${r.stdout}${r.stderr}`, stdout: r.stdout, text: readFileSync(file, 'utf8') }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  test('fills the file it names and never prints a value', () => {
    const r = run({ SITE_HOSTNAME: ALL.hostname, ACCESS_TEAM: ALL.accessTeam, ACCESS_AUD: ALL.accessAud, KV_ID: ALL.kvId })
    expect(r.code).toBe(0)
    expect(placeholdersIn(r.text)).toEqual([])
    expect(r.stdout.trim()).toMatch(/wrangler\.jsonc filled\.$/)
    for (const value of Object.values(ALL)) expect(r.out).not.toContain(value)
  })

  test('exits 1, names what is missing, and leaves the file untouched', () => {
    const r = run({ SITE_HOSTNAME: ALL.hostname })
    expect(r.code).toBe(1)
    expect(r.out).toContain('missing: ACCESS_TEAM, ACCESS_AUD, KV_ID')
    expect(r.text).toBe(TEMPLATE)
  })
})
