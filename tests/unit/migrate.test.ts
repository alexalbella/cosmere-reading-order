// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { buildIdMap, migrate, parseArgs, run } from '../../scripts/migrate-upstream'

// Invented titles and links. Nothing here is upstream's data.
const upstream = () => ({
  books: [
    {
      label: 'Group',
      children: [
        {
          id: 'alpha',
          title: 'Alpha',
          categories: [],
          connections: [
            {
              type: 'major',
              target: 'beta',
              description: '<p>Shares a   thing &amp; more, see <a href="https://example.test/a?x=1&amp;y=2">here</a>.</p>',
            },
            { type: 'minor', target: 'gamma', description: 'No link at all' },
          ],
          appearances: [{ id: 'cameo', description: '<b>Seen</b> briefly <a href="http://example.test/b">src</a>' }],
        },
        {
          label: 'Inner',
          children: [
            {
              id: 'beta',
              title: 'Beta',
              'connections:': [{ type: 'egg', target: 'alpha', description: 'Typo key <a href="javascript:x">bad</a>' }],
            },
          ],
        },
      ],
    },
    { id: 'gamma', title: 'Gamma', appearances: ['cameo', 'unlisted'] },
  ],
  connections: [{ id: 'major' }],
  appearances: [{ id: 'cameo', description: 'List <a href="https://example.test/list">entry</a>' }],
})

describe('migrate', () => {
  test('walks the nested books tree', () => {
    expect(migrate(upstream(), 1).map((c) => c.from)).toEqual(['alpha', 'alpha', 'alpha', 'beta', 'gamma', 'gamma'])
  })

  test('reads the typo key "connections:" too', () => {
    const c = migrate(upstream(), 1).find((x) => x.from === 'beta')
    expect(c).toMatchObject({ to: 'alpha', type: 'egg' })
  })

  test('extracts hrefs as sources of kind upstream and strips HTML from the description', () => {
    const [first, second, , typo] = migrate(upstream(), 1)
    expect(first?.description.en).toBe('Shares a thing & more, see here .')
    expect(first?.sources).toEqual([{ url: 'https://example.test/a?x=1&y=2', kind: 'upstream' }])
    expect(second?.sources).toEqual([])
    expect(typo?.sources).toEqual([])
  })

  test('sets author upstream, tier confirmed, requires [from, to]', () => {
    const [c] = migrate(upstream(), 1)
    expect(c).toMatchObject({ author: 'upstream', tier: 'confirmed', requires: ['alpha', 'beta'] })
  })

  test('appearances become to: null, type appearance, with the list entry as fallback', () => {
    const all = migrate(upstream(), 1)
    const own = all[2]
    expect(own).toMatchObject({ to: null, type: 'appearance', requires: ['alpha'] })
    expect(own?.description.en).toBe('Seen briefly src')
    const [fromList, unlisted] = all.slice(4)
    expect(fromList?.description.en).toBe('List entry')
    expect(fromList?.sources).toEqual([{ url: 'https://example.test/list', kind: 'upstream' }])
    expect(unlisted?.description.en).toBe('')
  })

  test('ids are sequential c-NNNN from startId', () => {
    expect(migrate(upstream(), 98).map((c) => c.id)).toEqual([
      'c-0098',
      'c-0099',
      'c-0100',
      'c-0101',
      'c-0102',
      'c-0103',
    ])
  })

  test('leaves description.es and verifiedBy empty', () => {
    for (const c of migrate(upstream(), 1)) {
      expect(c).toMatchObject({ description: { es: '' }, verifiedBy: '', verifiedOn: '' })
    }
  })

  test('maps renamed ids on both ends and in requires, and keeps unmapped ids', () => {
    const [c] = migrate(upstream(), 1, { alpha: 'alfa', beta: 'beta-new' })
    expect(c).toMatchObject({ from: 'alfa', to: 'beta-new', requires: ['alfa', 'beta-new'] })
    expect(migrate(upstream(), 1, { alpha: 'alfa' })[0]?.to).toBe('beta')
  })

  test('emits self-connections and unknown targets instead of dropping them', () => {
    const data = {
      books: [
        {
          id: 'a',
          title: 'A',
          connections: [
            { type: 'minor', target: 'a', description: 'x' },
            { type: 'minor', target: 'nowhere', description: 'y' },
          ],
        },
      ],
    }
    expect(migrate(data, 1).map((c) => c.to)).toEqual(['a', 'nowhere'])
  })
})

describe('entity decoding', () => {
  const one = (description: string) =>
    migrate({ books: [{ id: 'a', connections: [{ type: 'minor', target: 'b', description }] }] }, 1)[0]
  test('decimal references', () => expect(one('it&#8217;s')?.description.en).toBe('it’s'))
  test('hex references', () => expect(one('it&#x27;s &#X41;')?.description.en).toBe("it's A"))
  test('named references', () => {
    expect(one('a&mdash;b &rsquo;c&hellip; &AMP;')?.description.en).toBe('a—b ’c… &')
  })
  test('out-of-range and unknown references stay as written', () => {
    expect(one('&#99999999; &#0; &bogus;')?.description.en).toBe('&#99999999; &#0; &bogus;')
  })
  test('hrefs are decoded too', () => {
    const c = one('<a href="https://example.test/x?a=1&#38;b=2&#x26;c=3">l</a>')
    expect(c?.sources[0]?.url).toBe('https://example.test/x?a=1&b=2&c=3')
  })
})

describe('buildIdMap', () => {
  test('maps aliases to their book, and the explicit map wins', () => {
    const books = [{ id: 'new-one', aliases: ['old-one', 'older'] }, { id: 'plain' }]
    expect(buildIdMap(books)).toEqual({ 'old-one': 'new-one', older: 'new-one' })
    expect(buildIdMap(books, { older: 'other' })).toEqual({ 'old-one': 'new-one', older: 'other' })
  })
})

describe('run', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mig-'))
    writeFileSync(join(dir, 'books.json'), JSON.stringify([{ id: 'beta-new', aliases: ['beta'] }]))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))
  const options = (dryRun: boolean) => ({
    dryRun,
    readUpstream: () => JSON.stringify(upstream()),
    booksFile: join(dir, 'books.json'),
    idMapFile: join(dir, 'id-map.json'),
    outFile: join(dir, 'out', 'batch-000.json'),
  })

  test('writes the batch and returns counts only', () => {
    const counts = run(options(false))
    expect(counts).toEqual({ connections: 3, appearances: 3, withoutSource: 3 })
    const written = JSON.parse(readFileSync(join(dir, 'out', 'batch-000.json'), 'utf8'))
    expect(written).toHaveLength(6)
    expect(written[0].to).toBe('beta-new')
  })

  test('reads the optional id-map file', () => {
    writeFileSync(join(dir, 'id-map.json'), JSON.stringify({ gamma: 'gamma-new' }))
    run(options(false))
    const written = JSON.parse(readFileSync(join(dir, 'out', 'batch-000.json'), 'utf8'))
    expect(written.some((c: { from: string }) => c.from === 'gamma-new')).toBe(true)
  })

  test('refuses to overwrite an existing batch unless forced', () => {
    run(options(false))
    const file = join(dir, 'out', 'batch-000.json')
    writeFileSync(file, '[]')
    expect(() => run(options(false))).toThrow('EXISTS')
    expect(readFileSync(file, 'utf8')).toBe('[]')
    run({ ...options(false), force: true })
    expect(JSON.parse(readFileSync(file, 'utf8'))).toHaveLength(6)
  })

  test('--dry-run writes nothing', () => {
    run(options(true))
    expect(existsSync(join(dir, 'out'))).toBe(false)
  })

  test('without an id-map file it maps nothing extra', () => {
    writeFileSync(join(dir, 'id-map.json'), JSON.stringify({ gamma: 'gamma-new' }))
    run({ ...options(false), idMapFile: undefined })
    const written = JSON.parse(readFileSync(join(dir, 'out', 'batch-000.json'), 'utf8'))
    expect(written.some((c: { from: string }) => c.from === 'gamma-new')).toBe(false)
  })
})

describe('parseArgs', () => {
  test('takes the id map from --id-map and names no default', () => {
    expect(parseArgs(['--id-map', 'map.json']).idMapFile).toBe('map.json')
    expect(parseArgs([]).idMapFile).toBeUndefined()
  })
  test('reads --dry-run and --force', () => {
    expect(parseArgs(['--dry-run', '--force'])).toMatchObject({ dryRun: true, force: true })
  })
  test('--id-map with no file, or a flag as the file, throws BAD_ARG', () => {
    expect(() => parseArgs(['--id-map'])).toThrow('BAD_ARG')
    expect(() => parseArgs(['--id-map', '--dry-run'])).toThrow('BAD_ARG')
  })
})
