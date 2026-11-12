import { afterEach, describe, expect, test, vi } from 'vitest'
import { effectScope, nextTick, watch } from 'vue'
import { mount } from '@vue/test-utils'
import App from '../../src/App.vue'
import { useApp, type UseAppOptions } from '../../src/app/useApp'
import AppFooter from '../../src/components/AppFooter.vue'
import SettingsPanel from '../../src/components/SettingsPanel.vue'
import { clampFuture, emptyState, mergeState, type ReadState } from '../../src/state/merge'
import { parseState } from '../../src/state/transfer'
import {
  CHANGE_DELAY_MS,
  createSyncLoop,
  FOLLOW_DELAY_MS,
  forgetSignInMarker,
  RETRY_BASE_MS,
  RETRY_CAP_MS,
  settle,
  SIGN_IN_HREF,
  STALE_READ_MS,
  SYNC_TIMEOUT_MS,
  syncOnce,
  type SyncAnswer,
} from '../../src/sync/client'
import type { SyncStatus } from '../../src/sync/status'
import { fixtureCatalog } from '../fixtures/catalog'

const YEAR = 365 * 24 * 60 * 60 * 1000
const STATE_KEY = 'cosmere.state.v1'

/** The server's rule, over one stored state: what reaches it is dated down, then merged. */
function server(now: () => number) {
  let stored = emptyState()
  let writes = 0
  const fetchFn = vi.fn<typeof fetch>(async (_url, init) => {
    const incoming = parseState(String(init?.body))!
    const merged = mergeState(stored, clampFuture(incoming, now()))
    if (JSON.stringify(merged) !== JSON.stringify(stored)) writes += 1
    stored = merged
    return Response.json(stored, { headers: { Date: new Date(now()).toUTCString() } })
  })
  return { fetchFn, stored: () => stored, writes: () => writes, set: (s: ReadState) => (stored = s) }
}

function fakeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  }
}

const local = (): ReadState => ({
  marks: { mine: { status: 'read', at: 10 } },
  unlocks: { open: { on: true, at: 11 } },
})

const answering = (make: () => Response | Promise<Response>) => vi.fn<typeof fetch>(async () => make())
const json = (body: unknown, init?: ResponseInit) => Response.json(body, init)
const empty = (status: number) => new Response(null, { status })

/** What a browser hands back for a redirect under `redirect: 'manual'`: a status of 0 cannot be constructed. */
function opaqueRedirect(): Response {
  const res = new Response(null)
  Object.defineProperty(res, 'type', { value: 'opaqueredirect' })
  Object.defineProperty(res, 'status', { value: 0 })
  Object.defineProperty(res, 'ok', { value: false })
  return res
}

function sentBody(fetchFn: ReturnType<typeof answering>, call = 0): ReadState {
  const init = fetchFn.mock.calls[call]![1]!
  return parseState(String(init.body))!
}

/** What this device holds after a good answer: the loop's own settle of the local state and the server's copy. */
const settled = (sent: ReadState, answer: SyncAnswer): ReadState => settle(sent, answer.remote!, answer.serverNow)

describe('syncOnce', () => {
  test('ok merges the response', async () => {
    const remote = {
      marks: { mine: { status: 'none', at: 20 }, theirs: { status: 'reading', at: 5 } },
      unlocks: {},
    }
    const result = await syncOnce(local(), answering(() => json(remote)))
    expect(result.status).toBe('ok')
    expect(settled(local(), result)).toEqual({
      marks: { mine: { status: 'none', at: 20 }, theirs: { status: 'reading', at: 5 } },
      unlocks: { open: { on: true, at: 11 } },
    })
  })

  test('the empty answer keeps everything local', async () => {
    const result = await syncOnce(local(), answering(() => json({ marks: {}, unlocks: {} })))
    expect(result.status).toBe('ok')
    expect(settled(local(), result)).toEqual(local())
  })

  test('network error: offline, local untouched', async () => {
    const mine = local()
    const down = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    expect(await syncOnce(mine, down)).toEqual({ status: 'offline' })
    expect(mine).toEqual(local())
  })

  test('a connection lost halfway through the answer: offline', async () => {
    const res = new Response(
      new ReadableStream({
        pull(controller) {
          controller.error(new TypeError('connection lost'))
        },
      }),
    )
    expect(await syncOnce(local(), answering(() => res))).toEqual({ status: 'offline' })
  })

  test.each<[string, () => Response]>([
    ['401', () => empty(401)],
    ['403', () => empty(403)],
    ['an opaque redirect', opaqueRedirect],
    ['a visible redirect', () => new Response(null, { status: 302, headers: { Location: 'https://team.example/login' } })],
  ])('401, 403 or an opaque redirect: signin, local untouched (%s)', async (_name, make) => {
    const mine = local()
    expect(await syncOnce(mine, answering(make))).toEqual({ status: 'signin' })
    expect(mine).toEqual(local())
  })

  test.each([500, 502, 503])('5xx: error, local untouched (%s)', async (status) => {
    const mine = local()
    expect(await syncOnce(mine, answering(() => empty(status)))).toEqual({ status: 'error' })
    expect(mine).toEqual(local())
  })

  test('a refusal that asking again cannot change is an error marked permanent (400, 413)', async () => {
    for (const status of [400, 413]) {
      expect(await syncOnce(local(), answering(() => empty(status)))).toEqual({ status: 'error', permanent: true })
    }
  })

  test('another refusal is an error that may pass (429)', async () => {
    expect(await syncOnce(local(), answering(() => empty(429)))).toEqual({ status: 'error' })
  })

  test.each([404, 405])('a site with no sync (%s): idle, local untouched', async (status) => {
    const mine = local()
    expect(await syncOnce(mine, answering(() => empty(status)))).toEqual({ status: 'idle' })
    expect(mine).toEqual(local())
  })

  test.each<[string, () => Response]>([
    ['a page', () => new Response('<!doctype html><title>Sign in</title>', { headers: { 'Content-Type': 'text/html' } })],
    ['the wrong shape', () => json({ marks: [] })],
    ['null', () => json(null)],
  ])('an answer that is not a state: error, local untouched (%s)', async (_name, make) => {
    expect(await syncOnce(local(), answering(make))).toEqual({ status: 'error' })
  })

  test("requests use redirect: 'manual'", async () => {
    const fetchFn = answering(() => json({ marks: {}, unlocks: {} }))
    await syncOnce(local(), fetchFn)
    const [url, init] = fetchFn.mock.calls[0]!
    expect(url).toBe('/api/state')
    expect(init?.redirect).toBe('manual')
    expect(init?.method).toBe('PUT')
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json')
    expect(sentBody(fetchFn)).toEqual(local())
  })

  test('a request carries a time limit', async () => {
    const limit = vi.spyOn(AbortSignal, 'timeout')
    const fetchFn = answering(() => json({ marks: {}, unlocks: {} }))
    await syncOnce(local(), fetchFn)
    expect(limit).toHaveBeenCalledWith(SYNC_TIMEOUT_MS)
    expect(fetchFn.mock.calls[0]![1]?.signal).toBe(limit.mock.results[0]!.value)
    limit.mockRestore()
  })

  describe('a device whose clock runs a year ahead', () => {
    test('its mark stops beating later changes once it has synced', async () => {
      let clock = 1_800_000_000_000
      const { fetchFn, stored } = server(() => clock)

      // The fast device marks a book, dated a year from now.
      const fast: ReadState = { marks: { book: { status: 'read', at: clock + YEAR } }, unlocks: { book: { on: true, at: clock + YEAR } } }
      const first = await syncOnce(fast, fetchFn)
      expect(settled(fast, first).marks.book!.at).toBeLessThanOrEqual(clock)
      expect(settled(fast, first).unlocks.book!.at).toBeLessThanOrEqual(clock)

      // Another device changes it later, with a good clock.
      clock += 60_000
      await syncOnce({ marks: { book: { status: 'none', at: clock } }, unlocks: { book: { on: false, at: clock } } }, fetchFn)

      // The fast device syncs again, and the later change stands, there and on the server.
      clock += 60_000
      const again = await syncOnce(settled(fast, first), fetchFn)
      const held = settled(settled(fast, first), again)
      expect(held.marks.book!.status).toBe('none')
      expect(held.unlocks.book!.on).toBe(false)
      expect(stored().marks.book!.status).toBe('none')
    })

    test('a date within the five minutes the merge allows is left alone', async () => {
      const clock = 1_800_000_000_000
      const { fetchFn } = server(() => clock)
      const near = clock + 60_000
      const sent: ReadState = { marks: { book: { status: 'read', at: near } }, unlocks: {} }
      expect(settled(sent, await syncOnce(sent, fetchFn)).marks.book!.at).toBe(near)
    })

    test('with no clock in the answer it is a plain merge', async () => {
      const ahead = Date.now() + YEAR
      const mine: ReadState = { marks: { book: { status: 'read', at: ahead } }, unlocks: {} }
      const result = await syncOnce(mine, answering(() => json({ marks: {}, unlocks: {} })))
      expect(settled(mine, result).marks.book!.at).toBe(ahead)
    })
  })
})

describe('useApp and sync', () => {
  const stops: (() => void)[] = []

  afterEach(() => {
    stops.splice(0).forEach((stop) => stop())
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function make(fetchFn: unknown, options: Partial<UseAppOptions> = {}, mutate?: (c: ReturnType<typeof fixtureCatalog>) => void) {
    const catalog = fixtureCatalog()
    mutate?.(catalog)
    const scope = effectScope()
    const app = scope.run(() =>
      useApp({
        initial: { catalog, connectionsAvailable: true },
        storage: fakeStorage(),
        now: () => 1_000_000,
        fetchFn: fetchFn as typeof fetch,
        sync: true,
        ...options,
      }),
    )!
    stops.push(() => scope.stop())
    return { app, stop: () => scope.stop() }
  }

  const ok = () => answering(() => json({ marks: {}, unlocks: {} }))
  function comeToTheFront(): void {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
  }
  function goToTheBack(): void {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
  }
  const settle = async () => {
    await vi.advanceTimersByTimeAsync(0)
    await nextTick()
  }

  function deferred() {
    let release: (res: Response) => void = () => {}
    const promise = new Promise<Response>((resolve) => (release = resolve))
    return { promise, release }
  }

  test('without being asked the app never calls the endpoint', async () => {
    vi.useFakeTimers()
    const fetchFn = ok()
    const { app } = make(fetchFn, { sync: undefined })
    app.markBooks(['ash-road'], 'read')
    await vi.advanceTimersByTimeAsync(5000)
    window.dispatchEvent(new Event('online'))
    await settle()
    expect(fetchFn).not.toHaveBeenCalled()
    expect(app.syncStatus.value).toBe('idle')
  })

  test('it syncs on load', async () => {
    vi.useFakeTimers()
    const fetchFn = ok()
    const { app } = make(fetchFn)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(app.syncStatus.value).toBe('syncing')
    await settle()
    expect(app.syncStatus.value).toBe('ok')
  })

  test('it syncs 1.5 s after a change, once for a burst', async () => {
    vi.useFakeTimers()
    const fetchFn = ok()
    const { app } = make(fetchFn)
    await settle()
    fetchFn.mockClear()

    app.markBooks(['ash-road'], 'read')
    await vi.advanceTimersByTimeAsync(1000)
    app.markBooks(['glass-harbour'], 'read')
    await vi.advanceTimersByTimeAsync(1499)
    expect(fetchFn).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(Object.keys(sentBody(fetchFn).marks).sort()).toEqual(['ash-road', 'glass-harbour'])
  })

  test.each<[string, (app: ReturnType<typeof make>['app']) => void]>([
    ['undoing', (app) => app.undoLast()],
    ['unlocking', (app) => app.unlockBook('ash-road', true)],
    ['importing', (app) => void app.planImport('{"version":1,"marks":{"glass-harbour":{"status":"read","at":5}},"unlocks":{}}')?.apply(true)],
  ])('%s counts as a change', async (_name, change) => {
    vi.useFakeTimers()
    const fetchFn = ok()
    const { app } = make(fetchFn)
    app.markBooks(['ash-road'], 'read')
    await vi.advanceTimersByTimeAsync(1500)
    await settle()
    fetchFn.mockClear()

    change(app)
    await vi.advanceTimersByTimeAsync(1500)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  test('it syncs when the connection comes back', async () => {
    vi.useFakeTimers()
    const fetchFn = ok()
    make(fetchFn)
    await settle()
    fetchFn.mockClear()
    window.dispatchEvent(new Event('online'))
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  test('it syncs on becoming visible, not on being hidden', async () => {
    vi.useFakeTimers()
    const fetchFn = ok()
    make(fetchFn)
    await settle()
    fetchFn.mockClear()

    const visibility = vi.spyOn(document, 'visibilityState', 'get')
    visibility.mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(fetchFn).not.toHaveBeenCalled()

    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  test('never two at once: what arrives meanwhile runs once, afterwards, with the latest state', async () => {
    vi.useFakeTimers()
    const first = deferred()
    const fetchFn = vi.fn<typeof fetch>(async () => json({ marks: {}, unlocks: {} }))
    fetchFn.mockImplementationOnce(() => first.promise)
    const { app } = make(fetchFn)
    expect(fetchFn).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new Event('online'))
    window.dispatchEvent(new Event('online'))
    app.markBooks(['ash-road'], 'read')
    await vi.advanceTimersByTimeAsync(1500)
    expect(fetchFn).toHaveBeenCalledTimes(1)

    first.release(json({ marks: {}, unlocks: {} }))
    await settle()
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(sentBody(fetchFn, 1).marks['ash-road']?.status).toBe('read')
    await vi.advanceTimersByTimeAsync(5000)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  test('the answer does not start another sync', async () => {
    vi.useFakeTimers()
    const fetchFn = answering(() => json({ marks: { theirs: { status: 'read', at: 5 } }, unlocks: {} }))
    make(fetchFn)
    await settle()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  test('the answer replaces the state, and is saved', async () => {
    vi.useFakeTimers()
    const storage = fakeStorage()
    const fetchFn = answering(() => json({ marks: { 'glass-harbour': { status: 'read', at: 5 } }, unlocks: {} }))
    const { app } = make(fetchFn, { storage })
    const before = app.state.value
    await settle()
    expect(app.state.value).not.toBe(before)
    expect(app.markOf('glass-harbour')).toBe('read')
    expect(JSON.parse(storage.getItem('cosmere.state.v1')!).marks['glass-harbour']).toEqual({ status: 'read', at: 5 })
  })

  test('a mark held under an old id moves to the current one', async () => {
    vi.useFakeTimers()
    const fetchFn = answering(() => json({ marks: { 'old-road': { status: 'read', at: 5 } }, unlocks: {} }))
    const { app } = make(fetchFn, {}, (catalog) => {
      catalog.books.find((b) => b.id === 'ash-road')!.aliases = ['old-road']
    })
    await settle()
    expect(app.markOf('ash-road')).toBe('read')
    expect(app.state.value.marks['old-road']).toBeUndefined()
  })

  test('an alias with a dot in the answer moves to the current id', async () => {
    vi.useFakeTimers()
    const fetchFn = answering(() => json({ marks: { 'sa2.5': { status: 'read', at: 5 } }, unlocks: { 'sa2.5': { on: false, at: 6 } } }))
    const { app } = make(fetchFn, {}, (catalog) => {
      catalog.books.find((b) => b.id === 'ash-road')!.aliases = ['sa2.5']
    })
    await settle()
    expect(app.markOf('ash-road')).toBe('read')
    expect(app.state.value.unlocks['ash-road']).toEqual({ on: false, at: 6 })
    expect(app.state.value.marks['sa2.5']).toBeUndefined()
  })

  test('an answer that holds less than was sent does not start a round of sends', async () => {
    vi.useFakeTimers()
    const fetchFn = ok()
    const { app } = make(fetchFn)
    await settle()
    fetchFn.mockClear()
    app.markBooks(['ash-road'], 'read')
    await vi.advanceTimersByTimeAsync(CHANGE_DELAY_MS * 10)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  test('a change made while the request was out survives the answer, and goes out next', async () => {
    vi.useFakeTimers()
    const first = deferred()
    const fetchFn = vi.fn<typeof fetch>(async () => json({ marks: {}, unlocks: {} }))
    fetchFn.mockImplementationOnce(() => first.promise)
    const { app } = make(fetchFn)

    app.markBooks(['ash-road'], 'read')
    first.release(json({ marks: { theirs: { status: 'read', at: 5 } }, unlocks: {} }))
    await settle()
    expect(app.markOf('ash-road')).toBe('read')
    expect(app.state.value.marks.theirs?.status).toBe('read')

    await vi.advanceTimersByTimeAsync(1500)
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(sentBody(fetchFn, 1).marks['ash-road']?.status).toBe('read')
  })

  test.each<[string, () => Response, SyncStatus]>([
    ['an expired session', () => empty(401), 'signin'],
    ['an opaque redirect', opaqueRedirect, 'signin'],
    ['a server error', () => empty(500), 'error'],
    ['no sync on this site', () => empty(404), 'idle'],
  ])('%s leaves the marks as they were', async (_name, make_, status) => {
    vi.useFakeTimers()
    const { app } = make(answering(make_))
    app.markBooks(['ash-road'], 'read')
    const before = app.state.value
    await settle()
    expect(app.syncStatus.value).toBe(status)
    expect(app.state.value).toBe(before)
  })

  test.each([404, 405])('a site with no sync (%s) is asked once, and then only on returning to the front', async (status) => {
    vi.useFakeTimers()
    const fetchFn = answering(() => empty(status))
    const { app } = make(fetchFn)
    await settle()
    expect(app.syncStatus.value).toBe('idle')

    app.markBooks(['ash-road'], 'read')
    await vi.advanceTimersByTimeAsync(STALE_READ_MS * 2)
    window.dispatchEvent(new Event('online'))
    goToTheBack()
    await settle()
    expect(fetchFn).toHaveBeenCalledTimes(1)

    const seen: SyncStatus[] = []
    const unwatch = watch(app.syncStatus, (s) => void seen.push(s), { flush: 'sync' })
    comeToTheFront()
    expect(fetchFn).toHaveBeenCalledTimes(2)
    await settle()
    unwatch()
    expect(seen).toEqual([])
    expect(app.syncStatus.value).toBe('idle')
    expect(app.markOf('ash-road')).toBe('read')
  })

  test('a change made during the wake-up request gets its own send', async () => {
    vi.useFakeTimers()
    const wake = deferred()
    const fetchFn = vi.fn<typeof fetch>(async () => json({ marks: {}, unlocks: {} }))
    fetchFn.mockImplementationOnce(async () => empty(404))
    fetchFn.mockImplementationOnce(() => wake.promise)
    const { app } = make(fetchFn)
    await settle()
    expect(app.syncStatus.value).toBe('idle')

    comeToTheFront()
    expect(fetchFn).toHaveBeenCalledTimes(2)
    app.markBooks(['ash-road'], 'read')
    wake.release(json({ marks: {}, unlocks: {} }))
    await settle()
    expect(app.syncStatus.value).toBe('ok')

    await vi.advanceTimersByTimeAsync(CHANGE_DELAY_MS)
    expect(fetchFn).toHaveBeenCalledTimes(3)
    expect(sentBody(fetchFn, 2).marks['ash-road']?.status).toBe('read')
  })

  test('a change made during a wake-up request that finds no sync again stays here, with nothing scheduled', async () => {
    vi.useFakeTimers()
    const wake = deferred()
    const fetchFn = vi.fn<typeof fetch>(async () => empty(404))
    fetchFn.mockImplementationOnce(async () => empty(404))
    fetchFn.mockImplementationOnce(() => wake.promise)
    const { app } = make(fetchFn)
    await settle()
    comeToTheFront()
    app.markBooks(['ash-road'], 'read')
    wake.release(empty(404))
    await settle()
    await vi.advanceTimersByTimeAsync(CHANGE_DELAY_MS * 4)
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(app.syncStatus.value).toBe('idle')
    expect(app.markOf('ash-road')).toBe('read')
  })

  test('a 404 that was only passing heals on returning to the front', async () => {
    vi.useFakeTimers()
    const fetchFn = vi.fn<typeof fetch>(async () => json({ marks: {}, unlocks: {} }))
    fetchFn.mockImplementationOnce(async () => empty(404))
    const { app } = make(fetchFn)
    await settle()
    expect(app.syncStatus.value).toBe('idle')

    comeToTheFront()
    await settle()
    expect(app.syncStatus.value).toBe('ok')

    app.markBooks(['ash-road'], 'read')
    fetchFn.mockClear()
    await vi.advanceTimersByTimeAsync(CHANGE_DELAY_MS)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    window.dispatchEvent(new Event('online'))
    await settle()
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  test('a change made offline is sent by the next successful sync', async () => {
    vi.useFakeTimers()
    const fetchFn = vi.fn<typeof fetch>(async () => {
      throw new TypeError('Failed to fetch')
    })
    const { app } = make(fetchFn)
    await settle()
    expect(app.syncStatus.value).toBe('offline')

    app.markBooks(['ash-road'], 'read')
    await vi.advanceTimersByTimeAsync(1500)
    expect(app.syncStatus.value).toBe('offline')

    fetchFn.mockClear()
    fetchFn.mockImplementation(async () => json({ marks: {}, unlocks: {} }))
    window.dispatchEvent(new Event('online'))
    await settle()
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(sentBody(fetchFn).marks['ash-road']?.status).toBe('read')
    expect(app.syncStatus.value).toBe('ok')
  })

  test('a hung request gives up, and does not block what comes after', async () => {
    vi.useFakeTimers()
    // The real timeout runs on a clock the fake timers cannot reach.
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      const controller = new AbortController()
      setTimeout(() => controller.abort(new DOMException('timed out', 'TimeoutError')), ms)
      return controller.signal
    })
    const fetchFn = vi.fn<typeof fetch>(async () => json({ marks: {}, unlocks: {} }))
    fetchFn.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
        }),
    )
    const { app } = make(fetchFn)
    expect(fetchFn).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(SYNC_TIMEOUT_MS - 1)
    window.dispatchEvent(new Event('online'))
    expect(fetchFn).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    await settle()
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(app.syncStatus.value).toBe('ok')

    window.dispatchEvent(new Event('online'))
    await settle()
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })

  test('a date ahead of the server, saved on this device, is dated down there too', async () => {
    vi.useFakeTimers()
    const storage = fakeStorage()
    const ahead = Date.now() + YEAR
    storage.setItem(STATE_KEY, JSON.stringify({ marks: { 'ash-road': { status: 'read', at: ahead } }, unlocks: {} }))
    const { app } = make(server(() => Date.now()).fetchFn, { storage })
    await settle()
    expect(app.state.value.marks['ash-road']!.at).toBeLessThanOrEqual(Date.now())
    expect(JSON.parse(storage.getItem(STATE_KEY)!).marks['ash-road'].at).toBeLessThanOrEqual(Date.now())
  })

  test('a date ahead is dated down even when a change was made while the request was out', async () => {
    vi.useFakeTimers()
    const storage = fakeStorage()
    const ahead = Date.now() + YEAR
    storage.setItem(STATE_KEY, JSON.stringify({ marks: { 'ash-road': { status: 'read', at: ahead } }, unlocks: {} }))
    const first = deferred()
    const fetchFn = vi.fn<typeof fetch>(async () => json({ marks: {}, unlocks: {} }))
    fetchFn.mockImplementationOnce(() => first.promise)
    const { app } = make(fetchFn, { storage })

    app.markBooks(['glass-harbour'], 'read')
    const headers = { Date: new Date(Date.now()).toUTCString() }
    first.release(json({ marks: { 'ash-road': { status: 'read', at: Date.now() } }, unlocks: {} }, { headers }))
    await settle()
    expect(app.state.value.marks['ash-road']!.at).toBeLessThanOrEqual(Date.now())
    expect(app.markOf('glass-harbour')).toBe('read')
  })

  describe('two tabs on one device', () => {
    function device() {
      vi.useFakeTimers()
      const storage = fakeStorage()
      const remote = server(() => Date.now())
      let at = Date.now()
      const open = (fetchFn: unknown = remote.fetchFn) => make(fetchFn, { storage, now: () => ++at })
      const onDisk = (): ReadState => JSON.parse(storage.getItem(STATE_KEY)!) as ReadState
      return { storage, remote, open, onDisk }
    }
    const otherTabSaved = (key: string = STATE_KEY) => window.dispatchEvent(new StorageEvent('storage', { key }))

    test('a tab closed before its sync loses nothing: the other tab keeps the change and sends it', async () => {
      const { remote, open, onDisk } = device()
      const a = open()
      const b = open()
      await settle()

      a.app.markBooks(['ash-road'], 'read')
      a.stop()
      comeToTheFront()
      await settle()

      expect(b.app.markOf('ash-road')).toBe('read')
      expect(onDisk().marks['ash-road']?.status).toBe('read')
      expect(remote.stored().marks['ash-road']?.status).toBe('read')
    })

    test('a re-lock made in a tab that closed stays locked: it must not fail open', async () => {
      const { remote, open, onDisk } = device()
      const a = open()
      const b = open()
      await settle()
      a.app.unlockBook('ash-road', true)
      otherTabSaved()
      await vi.advanceTimersByTimeAsync(1500)
      expect(b.app.isUnlocked('ash-road')).toBe(true)

      a.app.unlockBook('ash-road', false)
      a.stop()
      comeToTheFront()
      await settle()

      expect(b.app.isUnlocked('ash-road')).toBe(false)
      expect(onDisk().unlocks['ash-road']?.on).toBe(false)
      expect(remote.stored().unlocks['ash-road']?.on).toBe(false)
    })

    test('what another tab saves while the request is out is not overwritten by the answer', async () => {
      const { open, onDisk } = device()
      const a = open()
      await settle()
      const first = deferred()
      const hanging = vi.fn<typeof fetch>(async () => json({ marks: {}, unlocks: {} }))
      hanging.mockImplementationOnce(() => first.promise)
      const b = open(hanging)
      expect(hanging).toHaveBeenCalledTimes(1)

      a.app.markBooks(['ash-road'], 'read')
      a.stop()
      first.release(json({ marks: {}, unlocks: {} }))
      await settle()

      expect(onDisk().marks['ash-road']?.status).toBe('read')
      expect(b.app.markOf('ash-road')).toBe('read')

      // Picked up after the request went out: nothing else would ever send it.
      await vi.advanceTimersByTimeAsync(CHANGE_DELAY_MS)
      expect(hanging).toHaveBeenCalledTimes(2)
      expect(sentBody(hanging, 1).marks['ash-road']?.status).toBe('read')
    })

    test('what another tab saved meanwhile needs no send of its own if the answer already holds it', async () => {
      const { open } = device()
      const a = open()
      await settle()
      const first = deferred()
      const hanging = vi.fn<typeof fetch>(async () => json({ marks: {}, unlocks: {} }))
      hanging.mockImplementationOnce(() => first.promise)
      const b = open(hanging)

      a.app.markBooks(['ash-road'], 'read')
      a.stop()
      first.release(json({ marks: { 'ash-road': a.app.state.value.marks['ash-road'] }, unlocks: {} }))
      await settle()
      expect(b.app.markOf('ash-road')).toBe('read')

      await vi.advanceTimersByTimeAsync(CHANGE_DELAY_MS * 2)
      expect(hanging).toHaveBeenCalledTimes(1)
    })

    test("a storage event brings the other tab's change in, and it goes out with the next sync", async () => {
      const { remote, open } = device()
      const a = open()
      const b = open()
      await settle()

      a.app.markBooks(['ash-road'], 'read')
      a.stop()
      otherTabSaved()
      expect(b.app.markOf('ash-road')).toBe('read')
      expect(remote.stored().marks['ash-road']).toBeUndefined()

      await vi.advanceTimersByTimeAsync(FOLLOW_DELAY_MS)
      expect(remote.stored().marks['ash-road']?.status).toBe('read')
    })

    test("a storage event merges: the later change wins, and this tab's own stays", async () => {
      const { open } = device()
      const a = open()
      const b = open()
      await settle()
      b.app.markBooks(['glass-harbour'], 'reading')
      a.app.markBooks(['ash-road'], 'read')
      otherTabSaved()
      expect(b.app.markOf('ash-road')).toBe('read')
      expect(b.app.markOf('glass-harbour')).toBe('reading')
    })

    test('a storage event that adds nothing changes nothing, and sends nothing', async () => {
      const { remote, open } = device()
      const b = open()
      await settle()
      remote.fetchFn.mockClear()
      const before = b.app.state.value
      otherTabSaved()
      expect(b.app.state.value).toBe(before)
      await vi.advanceTimersByTimeAsync(5000)
      expect(remote.fetchFn).not.toHaveBeenCalled()
    })

    test('what it takes in is saved', async () => {
      const { storage, open, onDisk } = device()
      const b = open()
      await settle()
      b.app.markBooks(['glass-harbour'], 'reading')
      // Another tab saved over it, not yet knowing this tab's change.
      storage.setItem(STATE_KEY, JSON.stringify({ marks: { 'ash-road': { status: 'read', at: 5 } }, unlocks: {} }))
      otherTabSaved()
      expect(onDisk().marks['ash-road']?.status).toBe('read')
      expect(onDisk().marks['glass-harbour']?.status).toBe('reading')
    })

    test('a change from another tab waits longer than one of its own, so that its own sync goes first', async () => {
      const { remote, open } = device()
      const a = open()
      const b = open()
      await settle()
      expect(FOLLOW_DELAY_MS).toBeGreaterThan(CHANGE_DELAY_MS)

      a.app.markBooks(['ash-road'], 'read')
      otherTabSaved()
      expect(b.app.markOf('ash-road')).toBe('read')
      remote.fetchFn.mockClear()

      await vi.advanceTimersByTimeAsync(CHANGE_DELAY_MS)
      expect(remote.fetchFn).toHaveBeenCalledTimes(1)
      expect(remote.writes()).toBe(1)

      // The one following finds nothing new: one write in all, however many tabs are open.
      await vi.advanceTimersByTimeAsync(FOLLOW_DELAY_MS)
      expect(remote.fetchFn.mock.calls.length).toBeGreaterThanOrEqual(2)
      expect(remote.writes()).toBe(1)
    })

    test('following another tab does not hold back a change waiting here', async () => {
      const { remote, open } = device()
      const a = open()
      const b = open()
      await settle()
      a.stop()
      b.app.markBooks(['glass-harbour'], 'reading')
      await vi.advanceTimersByTimeAsync(CHANGE_DELAY_MS - 500)
      a.app.markBooks(['ash-road'], 'read')
      otherTabSaved()
      remote.fetchFn.mockClear()
      await vi.advanceTimersByTimeAsync(500)
      expect(remote.fetchFn).toHaveBeenCalledTimes(1)
    })

    test('a change here does not wait for the longer delay of one being followed', async () => {
      const { remote, open } = device()
      const a = open()
      const b = open()
      await settle()
      a.app.markBooks(['ash-road'], 'read')
      a.stop()
      otherTabSaved()
      b.app.markBooks(['glass-harbour'], 'reading')
      remote.fetchFn.mockClear()
      await vi.advanceTimersByTimeAsync(CHANGE_DELAY_MS)
      expect(remote.fetchFn).toHaveBeenCalledTimes(1)
    })

    test('a tab restored from the back-forward cache takes in what it missed, so its next mark keeps a re-lock', async () => {
      const { open, onDisk } = device()
      const a = open()
      const b = open()
      await settle()
      a.app.unlockBook('ash-road', true)
      otherTabSaved()
      expect(b.app.isUnlocked('ash-road')).toBe(true)

      // Frozen in the cache, this tab hears nothing about the re-lock.
      a.app.unlockBook('ash-road', false)
      a.stop()
      expect(b.app.isUnlocked('ash-road')).toBe(true)

      window.dispatchEvent(new Event('pageshow'))
      expect(b.app.isUnlocked('ash-road')).toBe(false)
      b.app.markBooks(['glass-harbour'], 'read')
      expect(onDisk().unlocks['ash-road']?.on).toBe(false)
    })

    test('so does one on a site with no sync, whose loop is asleep', async () => {
      const { open } = device()
      const noSync = answering(() => empty(404))
      const a = open(noSync)
      const b = open(noSync)
      await settle()
      a.app.markBooks(['ash-road'], 'read')
      window.dispatchEvent(new Event('pageshow'))
      expect(b.app.markOf('ash-road')).toBe('read')
    })

    test('the pageshow listener goes with the app', async () => {
      const { open } = device()
      const a = open()
      const b = open()
      await settle()
      b.stop()
      a.app.markBooks(['ash-road'], 'read')
      window.dispatchEvent(new Event('pageshow'))
      expect(b.app.markOf('ash-road')).toBe('none')
    })

    test('a storage event for another key is ignored', async () => {
      const { open } = device()
      const a = open()
      const b = open()
      await settle()
      a.app.markBooks(['ash-road'], 'read')
      otherTabSaved('cosmere.prefs.v1')
      expect(b.app.markOf('ash-road')).toBe('none')
    })

    test('the listener goes with the app', async () => {
      const { open } = device()
      const a = open()
      const b = open()
      await settle()
      b.stop()
      a.app.markBooks(['ash-road'], 'read')
      otherTabSaved()
      expect(b.app.markOf('ash-road')).toBe('none')
    })

    test('a site with no sync still follows its other tabs', async () => {
      const { open } = device()
      const noSync = answering(() => empty(404))
      const a = open(noSync)
      const b = open(noSync)
      await settle()
      a.app.markBooks(['ash-road'], 'read')
      otherTabSaved()
      expect(b.app.markOf('ash-road')).toBe('read')
    })
  })

  describe('clocks', () => {
    test('a later change on a slow device beats what it replaces, on the server too', async () => {
      vi.useFakeTimers()
      const clock = Date.now()
      const remote = server(() => Date.now())
      remote.set({ marks: {}, unlocks: { 'ash-road': { on: true, at: clock } } })
      const { app } = make(remote.fetchFn, { now: () => Date.now() - YEAR })
      await settle()
      expect(app.isUnlocked('ash-road')).toBe(true)

      app.unlockBook('ash-road', false)
      await vi.advanceTimersByTimeAsync(CHANGE_DELAY_MS)
      await settle()
      expect(app.isUnlocked('ash-road')).toBe(false)
      expect(remote.stored().unlocks['ash-road']?.on).toBe(false)
    })

    test('a change made on a fast device with a request out beats the answer, whatever second the header rounds to', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(1_800_000_000_500)
      const clock = Date.now()
      const first = deferred()
      const fetchFn = vi.fn<typeof fetch>(async () => json({ marks: {}, unlocks: {} }))
      fetchFn.mockImplementationOnce(() => first.promise)
      const { app } = make(fetchFn, { now: () => Date.now() + YEAR })

      app.markBooks(['ash-road'], 'read')
      const answer = { marks: { 'ash-road': { status: 'none', at: clock } }, unlocks: {} }
      first.release(json(answer, { headers: { Date: new Date(clock).toUTCString() } }))
      await settle()

      expect(app.markOf('ash-road')).toBe('read')
      const at = app.state.value.marks['ash-road']!.at
      expect(at).toBe(clock + 1)
      await vi.advanceTimersByTimeAsync(CHANGE_DELAY_MS)
      expect(sentBody(fetchFn, 1).marks['ash-road']).toEqual({ status: 'read', at })
    })

    describe('a change on a fast device against a date the server kept, up to five minutes ahead', () => {
      const WITHIN = 3 * 60 * 1000

      test('a re-lock that lost to it settles here and goes out again, so that other devices get it', async () => {
        vi.useFakeTimers()
        const remote = server(() => Date.now())
        remote.set({ marks: {}, unlocks: { 'ash-road': { on: true, at: Date.now() + WITHIN } } })
        const { app } = make(remote.fetchFn, { now: () => Date.now() + YEAR })
        await settle()
        expect(app.isUnlocked('ash-road')).toBe(true)

        // The server dates the lock down to now, below the unlock, so there it loses for the moment.
        app.unlockBook('ash-road', false)
        await vi.advanceTimersByTimeAsync(CHANGE_DELAY_MS)
        await settle()
        expect(app.isUnlocked('ash-road')).toBe(false)
        expect(remote.stored().unlocks['ash-road']?.on).toBe(true)

        await vi.advanceTimersByTimeAsync(CHANGE_DELAY_MS)
        await settle()
        expect(remote.stored().unlocks['ash-road']?.on).toBe(false)
        expect(app.isUnlocked('ash-road')).toBe(false)

        // Settled on both sides: no more sends.
        remote.fetchFn.mockClear()
        await vi.advanceTimersByTimeAsync(CHANGE_DELAY_MS * 10)
        expect(remote.fetchFn).not.toHaveBeenCalled()
      })

      test('a mark too', async () => {
        vi.useFakeTimers()
        const remote = server(() => Date.now())
        remote.set({ marks: { 'ash-road': { status: 'read', at: Date.now() + WITHIN } }, unlocks: {} })
        const { app } = make(remote.fetchFn, { now: () => Date.now() + YEAR })
        await settle()

        app.markBooks(['ash-road'], 'none')
        await vi.advanceTimersByTimeAsync(CHANGE_DELAY_MS * 2)
        await settle()
        expect(app.markOf('ash-road')).toBe('none')
        expect(remote.stored().marks['ash-road']?.status).toBe('none')
      })
    })

    test('a date brought down in one tab reaches the other, and a later change then stands', async () => {
      vi.useFakeTimers()
      const storage = fakeStorage()
      const ahead = Date.now() + YEAR
      storage.setItem(STATE_KEY, JSON.stringify({ marks: { 'ash-road': { status: 'read', at: ahead } }, unlocks: {} }))
      const remote = server(() => Date.now())

      // This tab's first answer asks it to sign in, so it still holds the date a year ahead, with no retry coming.
      const flaky = vi.fn<typeof fetch>((...args) => remote.fetchFn(...args))
      flaky.mockImplementationOnce(async () => empty(401))
      const behind = make(flaky, { storage })
      await settle()
      expect(behind.app.state.value.marks['ash-road']!.at).toBe(ahead)

      // The other tab syncs and brings the date down on disk.
      make(remote.fetchFn, { storage })
      await settle()
      expect(JSON.parse(storage.getItem(STATE_KEY)!).marks['ash-road'].at).toBeLessThanOrEqual(Date.now())

      window.dispatchEvent(new StorageEvent('storage', { key: STATE_KEY }))
      await vi.advanceTimersByTimeAsync(FOLLOW_DELAY_MS)
      await settle()
      expect(behind.app.state.value.marks['ash-road']!.at).toBeLessThanOrEqual(Date.now())
      expect(JSON.parse(storage.getItem(STATE_KEY)!).marks['ash-road'].at).toBeLessThanOrEqual(Date.now())

      // Another device changes it later. The next sync here takes that, and does not beat it.
      await vi.advanceTimersByTimeAsync(60_000)
      remote.set({ marks: { 'ash-road': { status: 'none', at: Date.now() } }, unlocks: {} })
      await vi.advanceTimersByTimeAsync(1000)
      window.dispatchEvent(new Event('online'))
      await settle()
      expect(behind.app.markOf('ash-road')).toBe('none')
      expect(remote.stored().marks['ash-road']?.status).toBe('none')
    })
  })

  describe('retrying', () => {
    function failing(make_: () => Promise<Response>) {
      vi.useFakeTimers()
      // Hidden from the start, so that the follow-up after a return to the front stays out of the gaps.
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
      const times: number[] = []
      const fetchFn = vi.fn<typeof fetch>(async () => {
        times.push(Date.now())
        return make_()
      })
      return { fetchFn, times }
    }
    const gapsOf = (times: number[]) => times.slice(1).map((t, i) => t - times[i]!)

    test.each<[string, SyncStatus, () => Promise<Response>]>([
      ['a server error', 'error', async () => empty(500)],
      ['the store being busy', 'error', async () => empty(503)],
      ['no network', 'offline', async () => { throw new TypeError('Failed to fetch') }],
    ])('%s is retried, later each time, up to a cap', async (_name, status, answer) => {
      const { fetchFn, times } = failing(answer)
      const { app } = make(fetchFn)
      await vi.advanceTimersByTimeAsync(RETRY_CAP_MS * 5)
      expect(app.syncStatus.value).toBe(status)
      const gaps = gapsOf(times)
      expect(gaps.slice(0, 4)).toEqual([RETRY_BASE_MS, RETRY_BASE_MS * 2, RETRY_BASE_MS * 4, RETRY_BASE_MS * 8])
      expect(Math.max(...gaps)).toBe(RETRY_CAP_MS)
      expect(gaps.at(-1)).toBe(RETRY_CAP_MS)
    })

    test.each([400, 413])('a %s is not retried on a timer: the notice stays at error', async (status) => {
      const { fetchFn } = failing(async () => empty(status))
      const { app } = make(fetchFn)
      await vi.advanceTimersByTimeAsync(RETRY_CAP_MS * 3)
      expect(fetchFn).toHaveBeenCalledTimes(1)
      expect(app.syncStatus.value).toBe('error')
    })

    test('after a permanent refusal the next real change tries again', async () => {
      const { fetchFn } = failing(async () => empty(413))
      const { app } = make(fetchFn)
      await vi.advanceTimersByTimeAsync(RETRY_CAP_MS)
      expect(fetchFn).toHaveBeenCalledTimes(1)
      app.markBooks(['ash-road'], 'read')
      await vi.advanceTimersByTimeAsync(CHANGE_DELAY_MS + 1)
      expect(fetchFn).toHaveBeenCalledTimes(2)
      await vi.advanceTimersByTimeAsync(RETRY_CAP_MS * 3)
      expect(fetchFn).toHaveBeenCalledTimes(2)
    })

    test('it stops once one works, and starts from the beginning after the next failure', async () => {
      let down = true
      const { fetchFn, times } = failing(async () => (down ? empty(500) : json({ marks: {}, unlocks: {} })))
      const { app } = make(fetchFn)
      await vi.advanceTimersByTimeAsync(RETRY_BASE_MS * 3)
      expect(fetchFn).toHaveBeenCalledTimes(3)

      down = false
      await vi.advanceTimersByTimeAsync(RETRY_BASE_MS * 4)
      expect(app.syncStatus.value).toBe('ok')
      expect(fetchFn).toHaveBeenCalledTimes(4)
      await vi.advanceTimersByTimeAsync(RETRY_CAP_MS * 2)
      expect(fetchFn).toHaveBeenCalledTimes(4)

      down = true
      times.length = 0
      window.dispatchEvent(new Event('online'))
      await vi.advanceTimersByTimeAsync(RETRY_BASE_MS)
      expect(gapsOf(times)).toEqual([RETRY_BASE_MS])
    })

    test('a retry carries what was changed in the meantime', async () => {
      const { fetchFn } = failing(async () => empty(500))
      const { app } = make(fetchFn)
      await settle()
      app.markBooks(['ash-road'], 'read')
      await vi.advanceTimersByTimeAsync(CHANGE_DELAY_MS)
      const calls = fetchFn.mock.calls.length
      await vi.advanceTimersByTimeAsync(RETRY_BASE_MS * 2)
      expect(fetchFn.mock.calls.length).toBeGreaterThan(calls)
      expect(sentBody(fetchFn, calls).marks['ash-road']?.status).toBe('read')
    })

    test.each<[string, () => Promise<Response>]>([
      ['an expired session', async () => empty(401)],
      ['a site with no sync', async () => empty(404)],
    ])('%s is not retried', async (_name, answer) => {
      const { fetchFn } = failing(answer)
      make(fetchFn)
      await vi.advanceTimersByTimeAsync(RETRY_CAP_MS * 2)
      expect(fetchFn).toHaveBeenCalledTimes(1)
    })

    test('no retry outlives the app', async () => {
      const { fetchFn } = failing(async () => empty(500))
      const { stop } = make(fetchFn)
      await settle()
      stop()
      await vi.advanceTimersByTimeAsync(RETRY_CAP_MS * 2)
      expect(fetchFn).toHaveBeenCalledTimes(1)
    })
  })

  describe('hiding', () => {
    test('hiding with a change waiting sends it at once, to outlive the page', async () => {
      vi.useFakeTimers()
      const fetchFn = ok()
      const { app } = make(fetchFn)
      await settle()
      fetchFn.mockClear()

      app.markBooks(['ash-road'], 'read')
      goToTheBack()
      expect(fetchFn).toHaveBeenCalledTimes(1)
      expect(fetchFn.mock.calls[0]![1]?.keepalive).toBe(true)
      expect(sentBody(fetchFn).marks['ash-road']?.status).toBe('read')

      await settle()
      await vi.advanceTimersByTimeAsync(CHANGE_DELAY_MS * 2)
      expect(fetchFn).toHaveBeenCalledTimes(1)
    })

    test('hiding with nothing waiting sends nothing', async () => {
      vi.useFakeTimers()
      const fetchFn = ok()
      make(fetchFn)
      await settle()
      fetchFn.mockClear()
      goToTheBack()
      expect(fetchFn).not.toHaveBeenCalled()
    })

    test('hiding with a retry waiting does not count as a change waiting', async () => {
      vi.useFakeTimers()
      const fetchFn = answering(() => empty(500))
      make(fetchFn)
      await settle()
      fetchFn.mockClear()
      goToTheBack()
      expect(fetchFn).not.toHaveBeenCalled()
    })

    test('an ordinary sync is not keepalive', async () => {
      vi.useFakeTimers()
      const fetchFn = ok()
      make(fetchFn)
      expect(fetchFn.mock.calls[0]![1]?.keepalive).toBeFalsy()
      await settle()
    })

    test('hiding with a request out marks the change to go after it, still keepalive', async () => {
      vi.useFakeTimers()
      const first = deferred()
      const fetchFn = vi.fn<typeof fetch>(async () => json({ marks: {}, unlocks: {} }))
      fetchFn.mockImplementationOnce(() => first.promise)
      const { app } = make(fetchFn)
      app.markBooks(['ash-road'], 'read')
      goToTheBack()
      expect(fetchFn).toHaveBeenCalledTimes(1)
      first.release(json({ marks: {}, unlocks: {} }))
      await settle()
      expect(fetchFn).toHaveBeenCalledTimes(2)
      expect(fetchFn.mock.calls[1]![1]?.keepalive).toBe(true)
    })
  })

  describe('a stale read', () => {
    test('returning to the front syncs again once, about 70 s later', async () => {
      vi.useFakeTimers()
      const fetchFn = ok()
      make(fetchFn)
      await settle()
      goToTheBack()
      fetchFn.mockClear()

      comeToTheFront()
      expect(fetchFn).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(STALE_READ_MS - 1)
      expect(fetchFn).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(fetchFn).toHaveBeenCalledTimes(2)
      await vi.advanceTimersByTimeAsync(STALE_READ_MS * 3)
      expect(fetchFn).toHaveBeenCalledTimes(2)
    })

    test('so does loading the page in front', async () => {
      vi.useFakeTimers()
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
      const fetchFn = ok()
      make(fetchFn)
      await settle()
      await vi.advanceTimersByTimeAsync(STALE_READ_MS)
      expect(fetchFn).toHaveBeenCalledTimes(2)
    })

    test('hiding before then cancels it', async () => {
      vi.useFakeTimers()
      const fetchFn = ok()
      make(fetchFn)
      await settle()
      comeToTheFront()
      await settle()
      fetchFn.mockClear()
      goToTheBack()
      await vi.advanceTimersByTimeAsync(STALE_READ_MS * 2)
      expect(fetchFn).not.toHaveBeenCalled()
    })

    test('coming to the front twice makes one follow-up, counted from the last', async () => {
      vi.useFakeTimers()
      const fetchFn = ok()
      make(fetchFn)
      await settle()
      comeToTheFront()
      await vi.advanceTimersByTimeAsync(10_000)
      comeToTheFront()
      await settle()
      fetchFn.mockClear()
      await vi.advanceTimersByTimeAsync(STALE_READ_MS - 1)
      expect(fetchFn).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(STALE_READ_MS)
      expect(fetchFn).toHaveBeenCalledTimes(1)
    })

    test('it brings what the stale answer missed, and writes nothing when nothing changed', async () => {
      vi.useFakeTimers()
      const remote = server(() => Date.now())
      const { app } = make(remote.fetchFn)
      await settle()
      comeToTheFront()
      await settle()
      remote.set({ marks: { 'ash-road': { status: 'read', at: Date.now() } }, unlocks: {} })
      const writes = remote.writes()
      await vi.advanceTimersByTimeAsync(STALE_READ_MS)
      expect(app.markOf('ash-road')).toBe('read')
      expect(remote.writes()).toBe(writes)
    })

    test('a site with no sync is not asked by it', async () => {
      vi.useFakeTimers()
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
      const fetchFn = answering(() => empty(404))
      make(fetchFn)
      await settle()
      await vi.advanceTimersByTimeAsync(STALE_READ_MS * 2)
      expect(fetchFn).toHaveBeenCalledTimes(1)
    })
  })

  test('an answer with nothing new touches neither the state nor the disk', async () => {
    vi.useFakeTimers()
    const storage = fakeStorage()
    const remote = server(() => Date.now())
    const { app } = make(remote.fetchFn, { storage })
    await settle()
    app.markBooks(['ash-road'], 'read')
    await vi.advanceTimersByTimeAsync(CHANGE_DELAY_MS)
    await settle()

    const before = app.state.value
    const saved = vi.spyOn(storage, 'setItem')
    window.dispatchEvent(new Event('online'))
    await settle()
    expect(app.syncStatus.value).toBe('ok')
    expect(app.state.value).toBe(before)
    expect(saved).not.toHaveBeenCalled()
  })

  test('with the network down it reports offline and keeps the marks', async () => {
    vi.useFakeTimers()
    const down = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    const { app } = make(down)
    app.markBooks(['ash-road'], 'read')
    await settle()
    expect(app.syncStatus.value).toBe('offline')
    expect(app.markOf('ash-road')).toBe('read')
  })

  test('a notice stays up during a retry, so it neither flickers nor speaks twice', async () => {
    vi.useFakeTimers()
    const answer = deferred()
    const fetchFn = vi.fn<typeof fetch>(async () => empty(500))
    const { app } = make(fetchFn)
    await settle()
    expect(app.syncStatus.value).toBe('error')

    fetchFn.mockImplementationOnce(() => answer.promise)
    window.dispatchEvent(new Event('online'))
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(app.syncStatus.value).toBe('error')
    answer.release(json({ marks: {}, unlocks: {} }))
    await settle()
    expect(app.syncStatus.value).toBe('ok')
  })

  test('once the app is gone it stops listening and ignores a late answer', async () => {
    vi.useFakeTimers()
    const first = deferred()
    const fetchFn = vi.fn<typeof fetch>(async () => json({ marks: {}, unlocks: {} }))
    fetchFn.mockImplementationOnce(() => first.promise)
    const { app, stop } = make(fetchFn)
    app.markBooks(['ash-road'], 'read')
    stop()
    const before = app.state.value

    first.release(json({ marks: { theirs: { status: 'read', at: 5 } }, unlocks: {} }))
    await settle()
    expect(app.state.value).toBe(before)

    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(5000)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  test('the page asks for sync', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`)
      return empty(404)
    }))
    const wrapper = mount(App)
    await vi.waitFor(() => expect(calls).toContain('PUT /api/state'))
    wrapper.unmount()
  })
})

describe('the notices', () => {
  function footer(syncStatus: SyncStatus) {
    return mount(AppFooter, {
      props: { lang: 'es', updatedOn: '', visibleCount: 0, syncStatus, corrupt: false, lifted: null },
    })
  }
  test('the catalogue date shows only when it is a real day', () => {
    const date = (updatedOn: string) =>
      mount(AppFooter, { props: { lang: 'es', updatedOn, visibleCount: 0, syncStatus: 'idle', corrupt: false, lifted: null } }).find('.foot-date').text()
    expect(date('2026-02-28')).not.toBe('')
    expect(date('2026-02-31')).toBe('')
  })
  function settings(syncStatus: SyncStatus) {
    return mount(SettingsPanel, {
      props: { lang: 'es', includeRpg: false, syncStatus, importResult: null, pendingUnlocks: null },
    })
  }
  const signIn = (wrapper: ReturnType<typeof footer> | ReturnType<typeof settings>) =>
    wrapper.findAll('a').filter((a) => a.attributes('href') === SIGN_IN_HREF)

  test('signin says so quietly on the footer, with a link to sign in again', () => {
    const wrapper = footer('signin')
    const notice = wrapper.find('[role="status"]')
    expect(notice.text()).toContain('Hay que volver a entrar')
    expect(signIn(wrapper)).toHaveLength(1)
    expect(notice.find('a').text()).toBe('Volver a entrar')
  })

  test('signin says so in the settings, with the same link', () => {
    const wrapper = settings('signin')
    expect(wrapper.text()).toContain('Hay que volver a entrar')
    expect(signIn(wrapper)).toHaveLength(1)
  })

  test('the link speaks English when asked', () => {
    const wrapper = mount(AppFooter, {
      props: { lang: 'en', updatedOn: '', visibleCount: 0, syncStatus: 'signin', corrupt: false, lifted: null },
    })
    expect(signIn(wrapper)[0]!.text()).toBe('Sign in again')
  })

  test('an error is a quiet notice with no link', () => {
    const wrapper = footer('error')
    expect(wrapper.find('[role="status"]').text()).toContain('No se ha podido sincronizar')
    expect(signIn(wrapper)).toHaveLength(0)
    expect(signIn(settings('error'))).toHaveLength(0)
  })

  test.each<SyncStatus>(['idle', 'syncing', 'ok'])('%s puts nothing on the footer', (status) => {
    const wrapper = footer(status)
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    expect(signIn(wrapper)).toHaveLength(0)
  })

  test('a site with no sync reads as a device that keeps its own marks', () => {
    expect(settings('idle').text()).toContain('Lo leído se guarda en este aparato.')
  })
})

describe('the sync loop when something throws', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function loop(options: Partial<Parameters<typeof createSyncLoop>[0]> = {}) {
    const statuses: SyncStatus[] = []
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({ marks: {}, unlocks: {} }))
    const sync = createSyncLoop({
      read: () => emptyState(),
      adopt: () => {},
      report: (s) => void statuses.push(s),
      fetchFn,
      ...options,
    })
    return { sync, statuses, fetchFn }
  }

  test('a read that throws reports error and leaves the loop free', async () => {
    vi.useFakeTimers()
    const read = vi.fn<() => ReadState>(() => emptyState())
    read.mockImplementationOnce(() => {
      throw new Error('storage gone')
    })
    const { sync, statuses, fetchFn } = loop({ read })
    sync.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(statuses.at(-1)).toBe('error')
    expect(fetchFn).not.toHaveBeenCalled()

    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(statuses.at(-1)).toBe('ok')
    sync.stop()
  })

  test('a throw during a wake-up request leaves the loop awake, so that a change still goes out', async () => {
    vi.useFakeTimers()
    const read = vi.fn<() => ReadState>(() => emptyState())
    const { sync, statuses, fetchFn } = loop({ read })
    fetchFn.mockImplementationOnce(async () => new Response(null, { status: 404 }))
    sync.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(statuses.at(-1)).toBe('idle')

    read.mockImplementationOnce(() => {
      throw new Error('storage gone')
    })
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(statuses.at(-1)).toBe('error')

    sync.changed()
    await vi.advanceTimersByTimeAsync(CHANGE_DELAY_MS)
    expect(fetchFn).toHaveBeenCalledTimes(2)
    sync.stop()
  })

  test('an adopt that throws reports error, not syncing for ever', async () => {
    vi.useFakeTimers()
    const { sync, statuses, fetchFn } = loop({
      adopt: () => {
        throw new Error('quota')
      },
    })
    sync.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(statuses.at(-1)).toBe('error')

    await vi.advanceTimersByTimeAsync(RETRY_BASE_MS)
    expect(fetchFn).toHaveBeenCalledTimes(2)
    sync.stop()
  })
})

describe('forgetSignInMarker', () => {
  function win(href: string, replaceState: (...args: unknown[]) => void = () => {}) {
    return { location: { href } as Location, history: { replaceState } as unknown as History }
  }

  test('takes the marker off the address', () => {
    const replaceState = vi.fn()
    forgetSignInMarker(win('https://host/?signin=1', replaceState))
    expect(replaceState).toHaveBeenCalledWith(null, '', 'https://host/')
  })

  test('keeps the hash', () => {
    const replaceState = vi.fn()
    forgetSignInMarker(win('https://host/path?signin=1#there', replaceState))
    expect(replaceState).toHaveBeenCalledWith(null, '', 'https://host/path#there')
  })

  test('leaves any other address alone', () => {
    const replaceState = vi.fn()
    forgetSignInMarker(win('https://host/?spoilers=1', replaceState))
    expect(replaceState).not.toHaveBeenCalled()
  })

  test('a path that reads as another host stays on this origin', () => {
    const replaceState = vi.fn()
    forgetSignInMarker(win('https://host//evil.example/?signin', replaceState))
    expect(replaceState).toHaveBeenCalledWith(null, '', 'https://host//evil.example/')
  })

  test('it can never stop the mount', () => {
    const refuses = () => {
      throw new DOMException('refused', 'SecurityError')
    }
    expect(() => forgetSignInMarker(win('https://host/?signin', refuses))).not.toThrow()
    expect(() => forgetSignInMarker(win('not a url', refuses))).not.toThrow()
  })
})
