import { clampAgainst, mergeState, sameState, type ReadState } from '../state/merge'
import { parseState } from '../state/transfer'
import type { SyncStatus } from './status'

const ENDPOINT = '/api/state'
/** How long a change made here waits, so that a burst goes out as one. */
export const CHANGE_DELAY_MS = 1500
/**
 * How long a change seen in another tab waits. Longer, so that tab's own sync goes first and this one
 * finds nothing new: KV refuses a second write to one key within a second.
 */
export const FOLLOW_DELAY_MS = 5000
/** A request that hangs would hold the loop for good: every later trigger waits for the one under way. */
export const SYNC_TIMEOUT_MS = 15_000
export const RETRY_BASE_MS = 5000
export const RETRY_CAP_MS = 5 * 60 * 1000
/** KV can answer from a copy up to 60 s old. A sync this long after coming to the front sees what the first could not. */
export const STALE_READ_MS = 70_000

/**
 * Where the sign-in notice links. Access signs people in on a navigation, but the service worker answers
 * navigations from its cache, so a plain reload would never reach it. The marker makes the worker let this
 * one through (`navigateFallbackDenylist` in vite.config.ts); `forgetSignInMarker` takes it off the address
 * again, and nothing else reads it.
 */
export const SIGN_IN_HREF = './?signin=1'

/**
 * The sign-in link has done its job. Left in the address, it would keep reloads from the service worker.
 * It runs before the app mounts and must never stop it: `//host/` as a path reads as another origin, so the
 * address is built whole, and whatever is refused all the same is simply left as it is.
 */
export function forgetSignInMarker(win: Pick<Window, 'location' | 'history'> = window): void {
  try {
    const url = new URL(win.location.href)
    if (!url.searchParams.has('signin')) return
    url.search = ''
    win.history.replaceState(null, '', url.href)
  } catch {
    // An untidy address never costs the page.
  }
}

export interface SyncAnswer {
  status: SyncStatus
  /** The Worker refused this state for good (400, 413): sending it again would only be refused again. */
  permanent?: true
  /** The server's copy, and its clock if it told it: for settling a state that has moved on since. */
  remote?: ReadState
  serverNow?: number
}

/**
 * A date ahead of the server's clock was dated down there. Kept here it would go out again and be dated
 * down to a newer now each time, beating every later change from another device.
 */
export function settle(current: ReadState, remote: ReadState, serverNow: number | undefined): ReadState {
  return mergeState(serverNow === undefined ? current : clampAgainst(current, serverNow, remote), remote)
}

/**
 * Sends the local state and returns the server's copy, to be settled with `settle`. The device is the source of truth,
 * so anything but a good answer leaves it alone, and whatever could not be sent goes in the next request.
 */
export async function syncOnce(
  local: ReadState,
  fetchFn: typeof fetch = (...args) => fetch(...args),
  keepalive = false,
): Promise<SyncAnswer> {
  let res: Response
  let text: string
  try {
    res = await fetchFn(ENDPOINT, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(local),
      // Following Access's redirect to its login page would fail as CORS, and look like being offline.
      redirect: 'manual',
      signal: AbortSignal.timeout(SYNC_TIMEOUT_MS),
      keepalive,
    })
    if (res.type === 'opaqueredirect' || res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400)) {
      return { status: 'signin' }
    }
    // No Worker behind this site: a dev server, or a version that runs local only. Nothing to report.
    if (res.status === 404 || res.status === 405) return { status: 'idle' }
    if (res.status === 400 || res.status === 413) return { status: 'error', permanent: true }
    if (!res.ok) return { status: 'error' }
    text = await res.text()
  } catch {
    return { status: 'offline' }
  }
  const remote = parseState(text)
  if (!remote) return { status: 'error' }

  const parsed = Date.parse(res.headers.get('Date') ?? '')
  const serverNow = Number.isNaN(parsed) ? undefined : parsed
  return { status: 'ok', remote, serverNow }
}

export interface SyncLoopOptions {
  /** Everything this device knows right now, including what another tab has saved. */
  read(): ReadState
  /** Takes the state after a sync. It is not a change: it must not call `changed`. */
  adopt(next: ReadState): void
  report(status: SyncStatus): void
  fetchFn?: typeof fetch
}

export interface SyncLoop {
  /** Syncs now, and from here on when the connection returns or the page comes to the front. */
  start(): void
  /** Syncs a moment after the last change made here. */
  changed(): void
  /** Syncs after a longer moment, for something seen in another tab, whose own sync should go first. */
  follow(): void
  stop(): void
}

export function createSyncLoop(options: SyncLoopOptions): SyncLoop {
  let sendTimer: ReturnType<typeof setTimeout> | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let staleTimer: ReturnType<typeof setTimeout> | undefined
  /** The send timer is for a change made here, which something from another tab must not hold back. */
  let changeWaiting = false
  let retries = 0
  let busy = false
  let again = false
  let againKeepalive = false
  let stopped = false
  /** The last answer said this site has no sync. Only coming to the front asks again: it may have been passing. */
  let asleep = false
  let shown: SyncStatus = 'idle'

  function report(status: SyncStatus): void {
    shown = status
    options.report(status)
  }

  function send(delay: number): void {
    clearTimeout(sendTimer)
    sendTimer = setTimeout(() => void run(), delay)
  }

  /** Nothing waits to be sent any more. */
  function cancelPending(): void {
    clearTimeout(sendTimer)
    sendTimer = undefined
    changeWaiting = false
  }

  function changed(): void {
    if (stopped || asleep) return
    changeWaiting = true
    send(CHANGE_DELAY_MS)
  }

  function follow(): void {
    if (stopped || asleep || changeWaiting) return
    send(FOLLOW_DELAY_MS)
  }

  function retryLater(): void {
    const delay = Math.min(RETRY_BASE_MS * 2 ** retries, RETRY_CAP_MS)
    retries += 1
    retryTimer = setTimeout(() => void run(), delay)
  }

  async function run(keepalive = false): Promise<void> {
    if (stopped) return
    if (busy) {
      again = true
      againKeepalive ||= keepalive
      return
    }
    busy = true
    cancelPending()
    clearTimeout(retryTimer)
    // A notice stays up during a retry, so that it neither flickers nor is announced twice.
    if (!asleep && (shown === 'idle' || shown === 'ok')) report('syncing')
    let status: SyncStatus = 'error'
    let permanent = false
    try {
      const sent = options.read()
      const result = await syncOnce(sent, options.fetchFn, keepalive)
      if (stopped) return
      // Awake from here on, or a change made during the request that woke it could not schedule its send.
      asleep = result.status === 'idle'
      if (result.remote) {
        // Read again, not what was sent: a change made meanwhile, here or in another tab, stays.
        const next = settle(options.read(), result.remote, result.serverNow)
        options.adopt(next)
        // What the server's copy lacks goes out: a change made meanwhile, or a date that lost to the server's clamp
        // and settled above it here. Unless it is what just went, which would only be answered the same.
        if (!sameState(next, result.remote) && !sameState(next, sent)) changed()
      }
      status = result.status
      permanent = result.permanent === true
    } catch {
      // Reported as an error below, and retried.
      asleep = false
    } finally {
      busy = false
    }
    report(status)
    if (asleep) {
      cancelPending()
      again = false
      return
    }
    // A refusal for good waits for the next real change, or a reload: the timer would only be refused again.
    if (!permanent && (status === 'error' || status === 'offline')) retryLater()
    else retries = 0
    if (again) {
      const flush = againKeepalive
      again = false
      againKeepalive = false
      void run(flush)
    }
  }

  function comeBackForStaleRead(): void {
    clearTimeout(staleTimer)
    staleTimer = setTimeout(() => {
      if (!asleep) void run()
    }, STALE_READ_MS)
  }

  function onOnline(): void {
    if (!asleep) void run()
  }

  function onVisibility(): void {
    if (document.visibilityState === 'visible') {
      void run()
      comeBackForStaleRead()
    } else {
      clearTimeout(staleTimer)
      // The page may not come back: what is waiting goes now, in a request that outlives it.
      if (sendTimer !== undefined) void run(true)
    }
  }

  return {
    start() {
      window.addEventListener('online', onOnline)
      document.addEventListener('visibilitychange', onVisibility)
      void run()
      if (document.visibilityState === 'visible') comeBackForStaleRead()
    },
    changed,
    follow,
    stop() {
      stopped = true
      clearTimeout(sendTimer)
      clearTimeout(retryTimer)
      clearTimeout(staleTimer)
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisibility)
    },
  }
}
