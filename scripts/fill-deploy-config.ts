import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The four values a deployment needs that are not in the repository. */
export interface DeployValues {
  hostname: string
  accessTeam: string
  accessAud: string
  kvId: string
}

// Each value, the secret that carries it in CI, and the placeholder it replaces in wrangler.jsonc.
const FIELDS: { key: keyof DeployValues; secret: string; placeholder: string }[] = [
  { key: 'hostname', secret: 'SITE_HOSTNAME', placeholder: 'PLACEHOLDER-hostname' },
  { key: 'accessTeam', secret: 'ACCESS_TEAM', placeholder: 'PLACEHOLDER-team' },
  { key: 'accessAud', secret: 'ACCESS_AUD', placeholder: 'PLACEHOLDER-aud' },
  { key: 'kvId', secret: 'KV_ID', placeholder: 'PLACEHOLDER-kv' },
]

// A value lands inside a JSON string: anything that could end that string is refused.
const SAFE = /^[A-Za-z0-9._-]+$/

/**
 * wrangler.jsonc with its placeholders replaced. Every missing value is named in one error, by the secret that
 * should carry it, and an error message never holds a value.
 */
export function fillDeployConfig(text: string, values: Partial<DeployValues>): string {
  const missing = FIELDS.filter((f) => !values[f.key]).map((f) => f.secret)
  if (missing.length > 0) throw new Error(`missing: ${missing.join(', ')}`)
  const bad = FIELDS.filter((f) => !SAFE.test(values[f.key]!)).map((f) => f.secret)
  if (bad.length > 0) throw new Error(`bad: ${bad.join(', ')}`)
  return FIELDS.reduce((out, f) => out.replaceAll(f.placeholder, values[f.key]!), text)
}

// Only when run as a script, so a test can import the function.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2] ?? 'wrangler.jsonc'
  try {
    const filled = fillDeployConfig(readFileSync(file, 'utf8'), {
      hostname: process.env.SITE_HOSTNAME,
      accessTeam: process.env.ACCESS_TEAM,
      accessAud: process.env.ACCESS_AUD,
      kvId: process.env.KV_ID,
    })
    writeFileSync(file, filled)
    console.log(`${file} filled.`)
  } catch (e) {
    console.error(e instanceof Error ? e.message : 'ERROR')
    process.exit(1)
  }
}
