// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, test } from 'vitest'
import { placeholdersIn } from '../../scripts/check-deploy-config'

const ROOT = process.cwd()
const CONNECTIONS_ACCESS = [
  /\.connections\b/, // catalog.connections
  /\[\s*['"`]connections['"`]\s*\]/, // catalog['connections']
  /\{\s*(?:[\w$]+(?:\s*:\s*[\w$]+)?\s*,\s*)*connections\b/, // const { books, connections } = catalog
  /connections\.json/, // the data file itself
]
const ALLOWED_DIRS = ['src/spoilers/', 'src/data/']
const ALLOWED_FILES = ['src/app/useApp.ts']

function filesUnderSrc(): string[] {
  return readdirSync(join(ROOT, 'src'), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(ROOT, join(entry.parentPath, entry.name)).split(sep).join('/'))
}

function breaksTheRule(file: string, text: string): boolean {
  const allowed = ALLOWED_FILES.includes(file) || ALLOWED_DIRS.some((dir) => file.startsWith(dir))
  return !allowed && CONNECTIONS_ACCESS.some((pattern) => pattern.test(text))
}

describe('architecture', () => {
  test('nothing outside the engine, the data layer and useApp touches .connections', () => {
    const offenders = filesUnderSrc().filter((file) => breaksTheRule(file, readFileSync(join(ROOT, file), 'utf8')))
    expect(offenders).toEqual([])
  })

  test('nothing in the app imports the worker, so the build cannot bundle it', () => {
    const imports = /(?:from\s+|import\s*\(?\s*)['"`][^'"`]*\bworker\//
    expect(imports.test("import x from '../../worker/index'")).toBe(true)
    expect(imports.test("await import('../worker/access')")).toBe(true)
    const offenders = filesUnderSrc().filter((file) => imports.test(readFileSync(join(ROOT, file), 'utf8')))
    expect(offenders).toEqual([])
  })

  test('the scan reaches real files, nested and of every kind', () => {
    const files = filesUnderSrc()
    expect(files).toContain('src/main.ts')
    expect(files).toContain('src/App.vue')
    expect(files).toContain('src/design/worlds.ts')
  })

  test.each([
    "catalog['connections']",
    'catalog["connections"]',
    'catalog[`connections`]',
    "catalog?.[ 'connections' ]",
    'const { connections } = catalog',
    'const { books, connections } = catalog',
    'const { meta: m, connections: c } = catalog',
    'const {\n  books,\n  connections,\n} = catalog',
    'function draw({ connections }: Catalog) {}',
    "fetch('/data/connections.json')",
    "import data from '../../public/data/connections.json'",
  ])('catches %j outside the allowed folders', (text) => {
    expect(breaksTheRule('src/views/Shelf.vue', text)).toBe(true)
    expect(breaksTheRule('src/spoilers/visible.ts', text)).toBe(false)
    expect(breaksTheRule('src/data/load.ts', text)).toBe(false)
    expect(breaksTheRule('src/app/useApp.ts', text)).toBe(false)
  })

  test.each([
    'const { connectionsOf } = useApp()',
    'const { visibleConnections } = useApp()',
    "{{ t('connections') }}",
    "t('connections.title')",
    "{ es: 'conexiones', en: 'connections' }",
    'function draw() { const connections = lines() }',
    '// the connections drawn on the circle',
  ])('leaves %j alone', (text) => {
    expect(breaksTheRule('src/views/Shelf.vue', text)).toBe(false)
  })

  test('the rule draws its boundaries where it says', () => {
    expect(breaksTheRule('src/views/Shelf.vue', 'catalog.connections')).toBe(true)
    expect(breaksTheRule('src/views/Shelf.vue', 'catalog?.connections.length')).toBe(true)
    expect(breaksTheRule('src/spoilers-old/x.ts', 'catalog.connections')).toBe(true)
    expect(breaksTheRule('src/app/other.ts', 'catalog.connections')).toBe(true)
    expect(breaksTheRule('src/views/Shelf.vue', 'state.connectionsAvailable')).toBe(false)
    expect(breaksTheRule('src/spoilers/visible.ts', 'catalog.connections')).toBe(false)
    expect(breaksTheRule('src/data/load.ts', 'catalog.connections')).toBe(false)
    expect(breaksTheRule('src/app/useApp.ts', 'catalog.connections')).toBe(false)
  })
})

describe('wrangler.jsonc', () => {
  const config = JSON.parse(readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf8').replace(/^\s*\/\/.*$/gm, '')) as Record<string, unknown>

  test('observability is off: spans record KV keys, and the key holds the email', () => {
    expect(config.observability).toEqual({ enabled: false })
  })

  test('the Worker has no address but the one Access guards', () => {
    expect(config.workers_dev).toBe(false)
    expect(config.preview_urls).toBe(false)
  })

  test('the four deploy values are placeholders: the real ones come from the secrets at deploy time', () => {
    expect(placeholdersIn(readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf8'))).toEqual([
      'PLACEHOLDER-hostname',
      'PLACEHOLDER-team',
      'PLACEHOLDER-aud',
      'PLACEHOLDER-kv',
    ])
  })
})

describe('public/_headers', () => {
  const text = readFileSync(join(ROOT, 'public', '_headers'), 'utf8')

  test('it applies to every path', () => {
    expect(text.split('\n')[0]).toBe('/*')
  })

  test('nothing in the policy allows inline code, eval or another origin', () => {
    const policy = /Content-Security-Policy: (.*)/.exec(text)![1]!
    expect(policy).toContain("default-src 'none'")
    expect(policy).toContain("script-src 'self'")
    expect(policy).toContain("frame-ancestors 'none'")
    expect(policy).not.toMatch(/unsafe-|\bhttps?:|\*/)
  })

  test('nosniff and no referrer come with it', () => {
    expect(text).toContain('X-Content-Type-Options: nosniff')
    expect(text).toContain('Referrer-Policy: no-referrer')
  })
})

describe('the data check in CI', () => {
  const workflow = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8').replace(/\r\n/g, '\n')
  const step = workflow.slice(workflow.indexOf('- name: Validate the data'), workflow.indexOf('- run: npm run build'))

  test("on a push to main it compares with the push's own before, and elsewhere with origin/main", () => {
    expect(step).toContain('BEFORE: ${{ github.event.before }}')
    expect(step).toContain('against=origin/main')
    expect(step).toContain('[ "$EVENT" = push ] && [ "$REF" = refs/heads/main ]; then against="$BEFORE"')
    expect(step).toContain('validate:data -- --against "$against"')
  })

  test('the expression is handed in through env, never spliced into the script', () => {
    expect(step.slice(step.indexOf('run: |'))).not.toContain('${{')
  })

  test('a before of all zeros, a new branch, compares with nothing', () => {
    expect(step).toContain('0000000000000000000000000000000000000000')
    expect(step).toMatch(/then\n\s+npm run validate:data\n/)
  })
})

describe('the deploy job', () => {
  const workflow = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8').replace(/\r\n/g, '\n')

  test('after the deploy it fails unless Access still answers for the connections file', () => {
    const deploy = workflow.indexOf('npx wrangler deploy')
    const check = workflow.lastIndexOf('$SITE_HOSTNAME/data/connections.json')
    expect(deploy).toBeGreaterThan(-1)
    expect(check).toBeGreaterThan(deploy)
    const step = workflow.slice(deploy)
    expect(step).toContain('curl')
    expect(step).toContain('cloudflareaccess\\.com')
    expect(step).toContain('exit 1')
  })

  test('before the deploy the same probe stops it when the site is open, and lets a first deploy through', () => {
    const deploy = workflow.indexOf('npx wrangler deploy')
    const first = workflow.indexOf('$SITE_HOSTNAME/data/connections.json')
    expect(first).toBeGreaterThan(-1)
    expect(first).toBeLessThan(deploy)
    const step = workflow.slice(workflow.lastIndexOf('- if: steps.gate.outputs.go', first), deploy)
    expect(step).toContain('cloudflareaccess\\.com')
    expect(step).toContain('exit 1')
    expect(step).toContain('-o /dev/null')
    // curl's exit 6 is a host that does not resolve.
    expect(step).toContain('"$code" = 6')
  })

  test('that check runs with no token, and never prints a body', () => {
    const step = workflow.slice(workflow.indexOf('npx wrangler deploy') + 'npx wrangler deploy'.length)
    expect(step).not.toContain('CLOUDFLARE_API_TOKEN')
    expect(step).toContain('-o /dev/null')
  })

  test('every https url in the workflow is the secret hostname or the Access pattern', () => {
    const urls = workflow.match(/https:\/\/[^\s'"]+/g) ?? []
    expect(urls.length).toBeGreaterThan(0)
    for (const u of urls) expect(u.startsWith('https://$SITE_HOSTNAME/') || u.startsWith('https://[^/]+')).toBe(true)
  })

  test('the hostname reaches each probe from the secrets, never from a literal', () => {
    const probes = workflow.split('\n').filter((line) => line.includes('$SITE_HOSTNAME/data/connections.json'))
    expect(probes).toHaveLength(2)
    expect(workflow.match(/SITE_HOSTNAME: \$\{\{ secrets\.SITE_HOSTNAME \}\}/g)?.length).toBeGreaterThanOrEqual(3)
  })

  test('the config is filled from the secrets before it is checked', () => {
    const fill = workflow.indexOf('npx tsx scripts/fill-deploy-config.ts')
    const check = workflow.indexOf('npx tsx scripts/check-deploy-config.ts')
    expect(fill).toBeGreaterThan(-1)
    expect(fill).toBeLessThan(check)
    const step = workflow.slice(workflow.lastIndexOf('- if:', fill), fill)
    for (const name of ['SITE_HOSTNAME', 'ACCESS_TEAM', 'ACCESS_AUD', 'KV_ID']) expect(step).toContain(`${name}: \${{ secrets.${name} }}`)
  })
})

describe('the name and the unofficial notice', () => {
  test('the page and the installed app are called the Cosmere reading order, never just «Cosmere»', () => {
    expect(readFileSync(join(ROOT, 'index.html'), 'utf8')).toContain('<title>Orden de lectura del Cosmere</title>')
    const config = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8')
    expect(config).toContain("name: 'Orden de lectura del Cosmere'")
    expect(config).not.toMatch(/short_name: 'Cosmere'/)
  })

  test('the installed app says it is an unofficial fan site', () => {
    expect(readFileSync(join(ROOT, 'vite.config.ts'), 'utf8')).toMatch(/description: '[^']*no oficial[^']*Dragonsteel[^']*'/)
  })
})

describe('the browser install in CI', () => {
  const workflow = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8').replace(/\r\n/g, '\n')

  test('retries before failing', () => {
    expect(workflow).toMatch(/for i in 1 2 3; do npx playwright install --with-deps chromium && break/)
  })
})
