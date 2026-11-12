import { clampFuture, emptyState, mergeState, type ReadState } from '../src/state/merge'
import { MAX_STATE_BYTES, parseState } from '../src/state/transfer'
import { verifyAccess } from './access'

export interface Env {
  STATE: KVNamespace
  ACCESS_TEAM: string
  ACCESS_AUD: string
}

const NO_STORE = { 'Cache-Control': 'no-store' }

function reply(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers: { ...NO_STORE, ...headers } })
}

/** `Date` is the server's clock: with it a device whose own clock is wrong can date its marks down. */
function stateReply(state: ReadState, now: number): Response {
  return Response.json(state, { headers: { ...NO_STORE, Date: new Date(now).toUTCString() } })
}

/**
 * Corrupt stored JSON counts as empty, and bad entries in it are skipped. It stays where it is until a PUT
 * overwrites it, and `whole` says whether that would lose anything.
 */
async function readStored(env: Env, key: string): Promise<{ state: ReadState; raw: string; whole: boolean }> {
  const raw = await env.STATE.get(key)
  if (raw === null) return { state: emptyState(), raw: JSON.stringify(emptyState()), whole: true }
  const state = parseState(raw)
  return state ? { state, raw, whole: JSON.stringify(state) === raw } : { state: emptyState(), raw, whole: false }
}

/** KV allows one write per key per second, and says so in the message of what it throws. */
function isRateLimited(error: unknown): boolean {
  return error instanceof Error && error.message.includes('429')
}

/** The body as text, or the status that refuses it. The declared length is only a hint: what counts is what arrives. */
async function readBody(request: Request): Promise<string | 400 | 413> {
  if (Number(request.headers.get('Content-Length')) > MAX_STATE_BYTES) return 413
  if (!request.body) return 400
  const reader = request.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false })
  let size = 0
  let text = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return text + decoder.decode()
      size += value.byteLength
      if (size > MAX_STATE_BYTES) {
        await reader.cancel()
        return 413
      }
      text += decoder.decode(value, { stream: true })
    }
  } catch {
    return 400
  }
}

export async function handleState(request: Request, env: Env, identity: { email: string }, now: number): Promise<Response> {
  const key = `state:${identity.email}`
  if (request.method === 'GET') return stateReply((await readStored(env, key)).state, now)
  if (request.method !== 'PUT') return reply(405, { Allow: 'GET, PUT' })

  const body = await readBody(request)
  if (typeof body === 'number') return reply(body)
  const incoming = parseState(body)
  if (!incoming) return reply(400)
  const stored = await readStored(env, key)
  const merged = mergeState(stored.state, clampFuture(incoming, now))
  const text = JSON.stringify(merged)
  // Two good PUTs can add up to more than a request may carry, and then no client could ever send it back.
  if (new TextEncoder().encode(text).byteLength > MAX_STATE_BYTES) return reply(413)
  // Every load and return to the tab is a PUT. A write it does not need eats the day's quota, and
  // after a stale read it would put an old copy over another device's newer write.
  if (text !== stored.raw) {
    try {
      if (!stored.whole) await env.STATE.put(`state-unread:${identity.email}:${now}`, stored.raw)
      await env.STATE.put(key, text)
    } catch (error) {
      if (isRateLimited(error)) return reply(503, { 'Retry-After': '1' })
      throw error
    }
  }
  return stateReply(merged, now)
}

async function route(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url)
  if (!pathname.startsWith('/api/')) return reply(404)
  if (!env.ACCESS_TEAM || !env.ACCESS_AUD || !env.STATE) return reply(500)
  const identity = await verifyAccess(request, env)
  if (!identity) return reply(401)
  if (pathname !== '/api/state') return reply(404)
  return handleState(request, env, identity, Date.now())
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env)
    } catch (error) {
      // The name only: a message could carry the store's key, and the key holds the email.
      console.error(JSON.stringify({ message: 'state request failed', error: error instanceof Error ? error.name : 'unknown' }))
      return reply(500)
    }
  },
} satisfies ExportedHandler<Env>
