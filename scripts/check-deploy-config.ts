import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REQUIRED_VARS = ['ACCESS_TEAM', 'ACCESS_AUD', 'id']

/** What is still unfilled in a wrangler.jsonc: values holding PLACEHOLDER, and empty Access vars and KV id. Comments are ignored. */
export function placeholdersIn(text: string): string[] {
  const code = text
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')
  const found = [...code.matchAll(/"([^"]*PLACEHOLDER[^"]*)"/g)].map((m) => m[1]!)
  for (const name of REQUIRED_VARS) {
    if (new RegExp(`"${name}"[ ]*:[ ]*""`).test(code)) found.push(`${name} is empty`)
  }
  return found
}

// Only when run as a script, so a test can import the function.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2] ?? 'wrangler.jsonc'
  const left = placeholdersIn(readFileSync(file, 'utf8'))
  if (left.length > 0) {
    console.error(`${file} still has placeholder values, so nothing is deployed:\n${left.map((p) => `  ${p}`).join('\n')}`)
    process.exit(1)
  }
  console.log(`${file}: no placeholders left.`)
}
