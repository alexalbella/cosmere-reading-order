import { describe, expect, test, vi } from 'vitest'
import { FETCH_TIMEOUT_MS, loadBooks, loadConnections, loadMeta } from '../../src/data/load'
import type { Catalog } from '../../src/data/types'
import { visible } from '../../src/spoilers/visible'
import { fixtureCatalog } from '../fixtures/catalog'

const fixture = fixtureCatalog()

function fetcher(files: Record<string, unknown>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input)
    const name = Object.keys(files).find((k) => url.endsWith(k))
    if (!name) return new Response('missing', { status: 404 })
    const body = files[name]
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200 })
  }) as typeof fetch
}

const ALL_READ = {
  marks: Object.fromEntries(fixture.books.map((b) => [b.id, { status: 'read' as const, at: 1 }])),
  unlocks: {},
}

const seen = (connections: unknown[] | null): string[] =>
  visible({ ...fixture, connections: (connections ?? []) as Catalog['connections'] }, ALL_READ.marks, ALL_READ.unlocks).map((c) => c.id)

describe('a request that hangs', () => {
  // Answers only when its signal aborts, like a connection that never comes back.
  const hanging = (() => {
    return ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))
      })) as typeof fetch
  })()

  test.each([
    ['books', () => loadBooks(hanging), null],
    ['connections', () => loadConnections(hanging), null],
    ['meta', () => loadMeta(hanging), { updatedOn: '' }],
  ] as const)('%s give up after the timeout and fail like a network error', async (_name, load, expected) => {
    // The runtime's own timeout timer is not the fake clock's: take the signal and fire it.
    const controller = new AbortController()
    const limit = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
    const pending = load()
    expect(limit).toHaveBeenCalledWith(FETCH_TIMEOUT_MS)
    controller.abort(new DOMException('timed out', 'TimeoutError'))
    expect(await pending).toEqual(expected)
    limit.mockRestore()
  })

  test('every request carries the signal', async () => {
    const calls: (RequestInit | undefined)[] = []
    const spy = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(init)
      return new Response('[]', { status: 200 })
    }) as typeof fetch
    await loadBooks(spy)
    await loadConnections(spy)
    await loadMeta(spy)
    expect(calls.map((c) => c?.signal instanceof AbortSignal)).toEqual([true, true, true])
  })
})

describe('the catalogue files, each on its own', () => {
  test('books fail: null', async () => {
    expect(await loadBooks(fetcher({ 'connections.json': fixture.connections, 'meta.json': fixture.meta }))).toBeNull()
  })
  test('books that are not a list: null', async () => {
    expect(await loadBooks(fetcher({ 'books.json': { oops: 1 } }))).toBeNull()
    expect(await loadBooks(fetcher({ 'books.json': 'not json' }))).toBeNull()
  })
  test('a network error gives nulls and an empty date, it does not throw', async () => {
    const down = (async () => {
      throw new TypeError('offline')
    }) as typeof fetch
    expect(await loadBooks(down)).toBeNull()
    expect(await loadConnections(down)).toBeNull()
    expect(await loadMeta(down)).toEqual({ updatedOn: '' })
  })
  test('everything present: books, connections and meta come through', async () => {
    const files = fetcher({ 'books.json': fixture.books, 'connections.json': fixture.connections, 'meta.json': fixture.meta })
    expect(await loadBooks(files)).toHaveLength(fixture.books.length)
    expect((await loadMeta(files)).updatedOn).toBe('2026-11-04')
    expect(seen(await loadConnections(files)).length).toBeGreaterThan(0)
  })
  test('files are fetched under the base path', async () => {
    const asked: string[] = []
    const spy = (async (input: RequestInfo | URL) => {
      asked.push(String(input))
      return new Response('[]', { status: 200 })
    }) as typeof fetch
    await Promise.all([loadBooks(spy), loadConnections(spy), loadMeta(spy)])
    expect(asked.sort()).toEqual(['/data/books.json', '/data/connections.json', '/data/meta.json'])
  })
  test('connections fetch fails: null', async () => {
    expect(await loadConnections(fetcher({ 'books.json': fixture.books, 'meta.json': fixture.meta }))).toBeNull()
  })
  test('connections JSON is corrupt: null', async () => {
    for (const bad of ['{oops', { not: 'a list' }, 'null']) {
      expect(await loadConnections(fetcher({ 'connections.json': bad }))).toBeNull()
    }
  })
  test('one malformed connection is dropped by isShowable later, others survive', async () => {
    const mixed = [fixture.connections[0], { id: 'c-9999', from: 'ash-road' }, 7, null, fixture.connections[1]]
    expect(seen(await loadConnections(fetcher({ 'connections.json': mixed })))).toEqual(['c-0001', 'c-0002'])
  })
  test('a missing or corrupt meta is tolerated', async () => {
    expect((await loadMeta(fetcher({}))).updatedOn).toBe('')
    expect((await loadMeta(fetcher({ 'meta.json': { updatedOn: 5 } }))).updatedOn).toBe('')
  })
})
