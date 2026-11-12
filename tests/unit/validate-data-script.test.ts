// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { fixtureCatalog } from '../fixtures/catalog'

const TSX = join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs')
const SCRIPT = join(process.cwd(), 'scripts', 'validate-data.ts')
const BUILD = join(process.cwd(), 'scripts', 'build-data.ts')

let dir: string
const write = (rel: string, value: unknown) => {
  const file = join(dir, rel)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value))
}
// A git hook exports GIT_INDEX_FILE and friends. Inherited, they point these
// temporary repos at the real repo's index, and `git rm` would empty it.
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')))
const run = (script: string, ...args: string[]) => {
  const r = spawnSync(process.execPath, [TSX, script, ...args], { cwd: dir, encoding: 'utf8', env: cleanEnv })
  return { code: r.status, out: `${r.stdout}${r.stderr}` }
}
const git = (...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t.test', ...args], { cwd: dir, stdio: 'ignore', env: cleanEnv })

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cro-'))
  const c = fixtureCatalog()
  write('data/books.json', c.books)
  write('data/meta.json', c.meta)
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('--prune', () => {
  test('writes quarantine before touching batches: a corrupt quarantine file loses nothing', () => {
    const c = fixtureCatalog()
    c.connections[0]!.sources = []
    write('data/connections/batch-001.json', c.connections)
    const today = new Date().toISOString().slice(0, 10)
    write(`.quarantine/${today}.json`, 'not json')
    const before = readFileSync(join(dir, 'data/connections/batch-001.json'), 'utf8')
    const r = run(SCRIPT, '--prune')
    expect(r.code).toBe(1)
    expect(readFileSync(join(dir, 'data/connections/batch-001.json'), 'utf8')).toBe(before)
  })
  test('moves the failing connection to quarantine and prints only counts and ids', () => {
    const c = fixtureCatalog()
    c.connections[0]!.sources = []
    write('data/connections/batch-001.json', c.connections)
    const r = run(SCRIPT, '--prune')
    expect(r.code).toBe(0)
    expect(r.out).toContain('c-0001')
    expect(r.out).not.toContain('LEAK')
    const left = JSON.parse(readFileSync(join(dir, 'data/connections/batch-001.json'), 'utf8')) as { id: string }[]
    expect(left.map((x) => x.id)).not.toContain('c-0001')
  })
  test('--quarantine writes the pruned entries to the folder it names', () => {
    const c = fixtureCatalog()
    c.connections[0]!.sources = []
    write('data/connections/batch-001.json', c.connections)
    const today = new Date().toISOString().slice(0, 10)
    const r = run(SCRIPT, '--prune', '--quarantine', 'notes/held')
    expect(r.code).toBe(0)
    expect(existsSync(join(dir, `notes/held/${today}.json`))).toBe(true)
    expect(existsSync(join(dir, '.quarantine'))).toBe(false)
    expect(existsSync(join(dir, 'research'))).toBe(false)
  })
  test('--quarantine with no folder fails closed and writes nothing', () => {
    const c = fixtureCatalog()
    c.connections[0]!.sources = []
    write('data/connections/batch-001.json', c.connections)
    const before = readFileSync(join(dir, 'data/connections/batch-001.json'), 'utf8')
    for (const args of [['--prune', '--quarantine'], ['--prune', '--quarantine', '--against']]) {
      const r = run(SCRIPT, ...args)
      expect(r.code).not.toBe(0)
      expect(r.out).toContain('BAD_ARG')
    }
    expect(existsSync(join(dir, '.quarantine'))).toBe(false)
    expect(readFileSync(join(dir, 'data/connections/batch-001.json'), 'utf8')).toBe(before)
  })
})

describe('--against', () => {
  beforeEach(() => {
    git('init', '-q', '-b', 'main')
    git('add', '-A')
    git('commit', '-q', '-m', 'one')
  })
  test('a missing ref exits 1', () => expect(run(SCRIPT, '--against', 'nope').code).toBe(1))
  test('no value exits 1', () => expect(run(SCRIPT, '--against').code).toBe(1))
  test('a flag as the value exits 1', () => expect(run(SCRIPT, '--against', '--prune').code).toBe(1))
  test('corrupt JSON at the ref exits 1', () => {
    write('data/books.json', '{broken')
    git('add', '-A')
    git('commit', '-q', '-m', 'bad')
    write('data/books.json', fixtureCatalog().books)
    expect(run(SCRIPT, '--against', 'HEAD').code).toBe(1)
  })
  test.each<[string, string]>([
    ['an object', '{"books":[]}'],
    ['null', 'null'],
    ['a number', '42'],
    ['a string', '"text"'],
  ])('books at the ref that are %s exit 1: the removal check is never skipped', (_name, content) => {
    write('data/books.json', content)
    git('add', '-A')
    git('commit', '-q', '-m', 'bad')
    write('data/books.json', fixtureCatalog().books)
    const r = run(SCRIPT, '--against', 'HEAD')
    expect(r.code).toBe(1)
    expect(r.out).toContain('BAD_REF_JSON')
  })
  test('a valid ref with the book removed reports BOOK_REMOVED', () => {
    const c = fixtureCatalog()
    write('data/books.json', c.books.filter((b) => b.id !== 'ash-road'))
    const r = run(SCRIPT, '--against', 'HEAD')
    expect(r.code).toBe(1)
    expect(r.out).toContain('BOOK_REMOVED ash-road')
  })
  test('a valid ref with no data/books.json counts as no previous catalogue', () => {
    git('rm', '-q', '-r', 'data')
    git('commit', '-q', '-m', 'none')
    write('data/books.json', fixtureCatalog().books)
    write('data/meta.json', fixtureCatalog().meta)
    expect(run(SCRIPT, '--against', 'HEAD').code).toBe(0)
  })
})

describe('a connection the engine would hide', () => {
  test('validate and build report it by id and fail', () => {
    const c = fixtureCatalog()
    c.connections[0]!.verifiedOn = 'banana'
    write('data/connections/batch-001.json', c.connections)
    for (const script of [SCRIPT, BUILD]) {
      const r = run(script)
      expect(r.code).toBe(1)
      expect(r.out).toContain('BAD_DATE c-0001')
      expect(r.out).not.toContain('LEAK')
    }
  })
})

describe('entries that are not objects', () => {
  test('connections: [null] is reported by position, and --prune quarantines it', () => {
    const c = fixtureCatalog()
    write('data/connections/batch-001.json', [null, ...c.connections])
    for (const script of [SCRIPT, BUILD]) {
      const r = run(script)
      expect(r.code).toBe(1)
      expect(r.out).toContain('NOT_AN_OBJECT conn#0')
      expect(r.out).not.toContain('LEAK')
    }

    const pruned = run(SCRIPT, '--prune')
    expect(pruned.code).toBe(0)
    expect(pruned.out).toContain('conn#0')
    expect(pruned.out).not.toContain('LEAK')
    const left = JSON.parse(readFileSync(join(dir, 'data/connections/batch-001.json'), 'utf8')) as { id: string }[]
    expect(left.map((x) => x.id)).toEqual(c.connections.map((x) => x.id))
    const today = new Date().toISOString().slice(0, 10)
    expect(JSON.parse(readFileSync(join(dir, `.quarantine/${today}.json`), 'utf8'))).toEqual([null])
  })

  test('books: [null] is reported by position and fails the run, pruned or not', () => {
    const c = fixtureCatalog()
    write('data/books.json', [null, ...c.books])
    for (const args of [[SCRIPT], [BUILD], [SCRIPT, '--prune']] as [string, ...string[]][]) {
      const r = run(...args)
      expect(r.code).toBe(1)
      expect(r.out).toContain('NOT_AN_OBJECT book#0')
    }
    expect(JSON.parse(readFileSync(join(dir, 'data/books.json'), 'utf8'))[0]).toBeNull()
  })
})

describe('malformed connection ids never reach script output', () => {
  test('validate and build print the position only', () => {
    const c = fixtureCatalog()
    c.connections[2]!.id = 'LEAK-PASTED description text'
    write('data/connections/batch-001.json', c.connections)
    for (const script of [SCRIPT, BUILD]) {
      const r = run(script)
      expect(r.code).toBe(1)
      expect(r.out).toContain('BAD_ID conn#2')
      expect(r.out).not.toContain('LEAK')
    }
  })
})

describe('a book renamed with its alias while the batches still use the old id', () => {
  const renamed = () => {
    const c = fixtureCatalog()
    const b = c.books.find((x) => x.id === 'ash-road')!
    b.id = 'ash-trail'
    b.aliases = ['ash-road']
    write('data/books.json', c.books)
    write('data/connections/batch-001.json', c.connections)
    return readFileSync(join(dir, 'data/connections/batch-001.json'), 'utf8')
  }

  test('fails with the code and the connection id, and prune neither drops nor moves anything', () => {
    const before = renamed()
    for (const args of [[], ['--prune']]) {
      const r = run(SCRIPT, ...args)
      expect(r.code).toBe(1)
      expect(r.out).toContain('REF_UNKNOWN c-0001')
      expect(r.out).not.toContain('LEAK')
    }
    expect(readFileSync(join(dir, 'data/connections/batch-001.json'), 'utf8')).toBe(before)
    expect(existsSync(join(dir, '.quarantine'))).toBe(false)
  })
})

describe('--prune with --against', () => {
  beforeEach(() => {
    git('init', '-q', '-b', 'main')
    git('add', '-A')
    git('commit', '-q', '-m', 'one')
  })

  test('a run that fails on a removed book writes nothing: no batch changed, no quarantine', () => {
    const c = fixtureCatalog()
    c.connections[1]!.sources = []
    write('data/books.json', c.books.filter((b) => b.id !== 'ash-road'))
    write('data/connections/batch-001.json', c.connections)
    const before = readFileSync(join(dir, 'data/connections/batch-001.json'), 'utf8')
    const r = run(SCRIPT, '--prune', '--against', 'HEAD')
    expect(r.code).toBe(1)
    expect(r.out).toContain('BOOK_REMOVED ash-road')
    expect(r.out).not.toContain('pruned')
    expect(readFileSync(join(dir, 'data/connections/batch-001.json'), 'utf8')).toBe(before)
    expect(existsSync(join(dir, '.quarantine'))).toBe(false)
  })

  test('a run that passes prunes and quarantines as without --against', () => {
    const c = fixtureCatalog()
    c.connections[0]!.sources = []
    write('data/connections/batch-001.json', c.connections)
    const r = run(SCRIPT, '--prune', '--against', 'HEAD')
    expect(r.code).toBe(0)
    expect(r.out).toContain('pruned 1')
    const left = JSON.parse(readFileSync(join(dir, 'data/connections/batch-001.json'), 'utf8')) as { id: string }[]
    expect(left.map((x) => x.id)).not.toContain('c-0001')
    expect(existsSync(join(dir, '.quarantine'))).toBe(true)
  })

  test('a failure that is not the removal, after pruning, writes nothing either', () => {
    const c = fixtureCatalog()
    c.connections[0]!.sources = []
    write('data/books.json', c.books.map((b) => (b.id === 'glass-harbour' ? { ...b, order: undefined } : b)))
    write('data/connections/batch-001.json', c.connections)
    const before = readFileSync(join(dir, 'data/connections/batch-001.json'), 'utf8')
    const r = run(SCRIPT, '--prune', '--against', 'HEAD')
    expect(r.code).toBe(1)
    expect(readFileSync(join(dir, 'data/connections/batch-001.json'), 'utf8')).toBe(before)
    expect(existsSync(join(dir, '.quarantine'))).toBe(false)
  })
})
