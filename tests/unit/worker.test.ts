// @vitest-environment node
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { errors, exportJWK, exportSPKI, generateKeyPair, SignJWT, type JWTVerifyGetKey } from 'jose'
import { verifyAccess } from '../../worker/access'
import worker, { handleState, type Env } from '../../worker/index'

const TEAM = 'test-team'
const AUD = 'test-aud'
const ISSUER = `https://${TEAM}.cloudflareaccess.com`
const EMAIL = 'reader@example.com'
const ORIGIN = 'https://cosmere.example.test'
const STATE_URL = `${ORIGIN}/api/state`
const NOW = 1_800_000_000_000
const YEAR = 365 * 24 * 60 * 60 * 1000
const CAP = 256 * 1024

type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>
let pair: KeyPair
let other: KeyPair
let keys: JWTVerifyGetKey

beforeAll(async () => {
  pair = await generateKeyPair('RS256')
  other = await generateKeyPair('RS256')
  keys = async () => pair.publicKey
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

interface TokenOptions {
  email?: string | null
  audience?: string
  issuer?: string
  expires?: string | number | null
  key?: KeyPair['privateKey']
  kid?: string
}

function token(options: TokenOptions = {}): Promise<string> {
  const { email = EMAIL, audience = AUD, issuer = ISSUER, expires = '1h', key = pair.privateKey, kid = 'k1' } = options
  const jwt = new SignJWT(email === null ? {} : { email })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
  if (expires !== null) jwt.setExpirationTime(expires)
  return jwt.sign(key)
}

function fakeKv(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed))
  const get = vi.fn(async (key: string) => data.get(key) ?? null)
  const put = vi.fn(async (key: string, value: string) => void data.set(key, value))
  return { data, get, put, kv: { get, put } as unknown as KVNamespace }
}

function envWith(kv: KVNamespace, overrides: Partial<Env> = {}): Env {
  return { STATE: kv, ACCESS_TEAM: TEAM, ACCESS_AUD: AUD, ...overrides }
}

function emptyEnv(): Env {
  return envWith(fakeKv().kv)
}

/** Serves the local public key at the Access certs URL, as the real default export will fetch it. */
async function serveCerts() {
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }
  const certs = vi.fn<typeof fetch>(async () => Response.json({ keys: [jwk] }))
  vi.stubGlobal('fetch', certs)
  return certs
}

function put(body: BodyInit | null, headers: Record<string, string> = {}): Request {
  return new Request(STATE_URL, { method: 'PUT', body, headers })
}

function spaces(bytes: number, chunk = 64 * 1024): ReadableStream<Uint8Array> {
  let sent = 0
  return new ReadableStream({
    pull(controller) {
      if (sent >= bytes) return controller.close()
      const size = Math.min(chunk, bytes - sent)
      sent += size
      controller.enqueue(new Uint8Array(size).fill(0x20))
    },
  })
}

const identity = { email: EMAIL }
const stateKey = (email: string) => `state:${email}`
const body = (marks: object = {}, unlocks: object = {}) => JSON.stringify({ marks, unlocks })

describe('verifyAccess', () => {
  const request = (jwt: string | null) =>
    new Request(STATE_URL, { headers: jwt === null ? {} : { 'Cf-Access-Jwt-Assertion': jwt } })

  test('a good token gives the verified email, lowercased', async () => {
    const jwt = await token({ email: 'Reader@Example.COM' })
    expect(await verifyAccess(request(jwt), emptyEnv(), keys)).toEqual({ email: 'reader@example.com' })
  })

  test.each<[string, () => TokenOptions]>([
    ['the wrong audience', () => ({ audience: 'another-app' })],
    ['the wrong issuer', () => ({ issuer: 'https://another-team.cloudflareaccess.com' })],
    ['a past expiry', () => ({ expires: Math.floor(Date.now() / 1000) - 60 })],
    ['no expiry at all', () => ({ expires: null })],
    ['no email', () => ({ email: null })],
    ['an empty email', () => ({ email: '' })],
    ["another key's signature", () => ({ key: other.privateKey })],
  ])('a token with %s is null', async (_name, options) => {
    const jwt = await token(options())
    expect(await verifyAccess(request(jwt), emptyEnv(), keys)).toBeNull()
  })

  test('an email that is not a string is null', async () => {
    const jwt = await new SignJWT({ email: 7 })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(ISSUER)
      .setAudience(AUD)
      .setExpirationTime('1h')
      .sign(pair.privateKey)
    expect(await verifyAccess(request(jwt), emptyEnv(), keys)).toBeNull()
  })

  test('no token, or garbage, is null', async () => {
    expect(await verifyAccess(request(null), emptyEnv(), keys)).toBeNull()
    expect(await verifyAccess(request('not-a-token'), emptyEnv(), keys)).toBeNull()
  })

  test('an unsigned token is null', async () => {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const header = encode({ alg: 'none' })
    const claims = encode({ email: EMAIL, iss: ISSUER, aud: AUD, exp: Math.floor(Date.now() / 1000) + 3600 })
    expect(await verifyAccess(request(`${header}.${claims}.`), emptyEnv(), keys)).toBeNull()
  })

  test('Cf-Access-Authenticated-User-Email is ignored', async () => {
    const forged = (jwt: string | null) =>
      new Request(STATE_URL, {
        headers: {
          'Cf-Access-Authenticated-User-Email': 'someone-else@example.com',
          ...(jwt === null ? {} : { 'Cf-Access-Jwt-Assertion': jwt }),
        },
      })
    expect(await verifyAccess(forged(null), emptyEnv(), keys)).toBeNull()
    expect(await verifyAccess(forged(await token()), emptyEnv(), keys)).toEqual(identity)
  })

  test('HS256 with the public key as its secret is null', async () => {
    const secret = new TextEncoder().encode(await exportSPKI(pair.publicKey))
    const jwt = await new SignJWT({ email: EMAIL })
      .setProtectedHeader({ alg: 'HS256', kid: 'k1' })
      .setIssuer(ISSUER)
      .setAudience(AUD)
      .setExpirationTime('1h')
      .sign(secret)
    // Even a key function that hands over those very bytes, the case `algorithms` is there for.
    expect(await verifyAccess(request(jwt), emptyEnv(), async () => secret)).toBeNull()
    expect(await verifyAccess(request(jwt), emptyEnv(), keys)).toBeNull()
    await serveCerts()
    expect(await verifyAccess(request(jwt), emptyEnv())).toBeNull()
  })

  test.each<[string, Error]>([
    ['a time-out', new errors.JWKSTimeout()],
    ['a network failure', new TypeError('fetch failed')],
    ['a key set that makes no sense', new errors.JWKSInvalid()],
    ['an answer that is not 200', new errors.JOSEError('Expected 200 OK')],
  ])('%s fetching the keys says nothing about the token: it throws, never null and never allowed', async (_name, failure) => {
    const broken: JWTVerifyGetKey = async () => {
      throw failure
    }
    await expect(verifyAccess(request(await token()), emptyEnv(), broken)).rejects.toBe(failure)
  })

  test.each([
    ['three parts of nothing', 'a.b.c'],
    ['an empty signature', 'e30.e30.'],
    ['a header that is not JSON', `${Buffer.from('nope').toString('base64url')}.e30.e30`],
    ['claims that are not JSON', `${Buffer.from('{"alg":"RS256"}').toString('base64url')}.${Buffer.from('nope').toString('base64url')}.e30`],
    ['an algorithm nobody knows', `${Buffer.from('{"alg":"XX1"}').toString('base64url')}.e30.e30`],
    ['a header that is an array', `${Buffer.from('[]').toString('base64url')}.e30.e30`],
    ['a critical extension nobody knows', `${Buffer.from('{"alg":"RS256","crit":["x"],"x":1}').toString('base64url')}.e30.e30`],
  ])('a malformed token is a bad token, not a server failure: %s', async (_name, jwt) => {
    expect(await verifyAccess(request(jwt), emptyEnv(), keys)).toBeNull()
    await serveCerts()
    expect(await verifyAccess(request(jwt), emptyEnv())).toBeNull()
  })

  test('a token signed by a key the team does not have is null', async () => {
    await serveCerts()
    const team = 'unknown-key-team'
    const env = envWith(fakeKv().kv, { ACCESS_TEAM: team })
    const jwt = await token({ issuer: `https://${team}.cloudflareaccess.com`, kid: 'somebody-else', key: other.privateKey })
    expect(await verifyAccess(request(jwt), env)).toBeNull()
  })

  // jose skips the audience check when it is given no audience, and a team literally named
  // "undefined" could sign for the issuer the template would build: this is where it would open up.
  test.each<[string, Partial<Env>, TokenOptions]>([
    ['ACCESS_AUD', { ACCESS_AUD: undefined }, {}],
    ['an empty ACCESS_AUD', { ACCESS_AUD: '' }, { audience: '' }],
    ['ACCESS_TEAM', { ACCESS_TEAM: undefined }, { issuer: 'https://undefined.cloudflareaccess.com' }],
    ['an empty ACCESS_TEAM', { ACCESS_TEAM: '' }, { issuer: 'https://.cloudflareaccess.com' }],
  ])('without %s even a token that fits it is null', async (_name, overrides, options) => {
    const env = envWith(fakeKv().kv, overrides)
    expect(await verifyAccess(request(await token(options)), env, keys)).toBeNull()
  })

  test('the keys come from the team, once, and are kept between requests', async () => {
    const certs = await serveCerts()
    const team = 'cached-team'
    const env = envWith(fakeKv().kv, { ACCESS_TEAM: team })
    const jwt = await token({ issuer: `https://${team}.cloudflareaccess.com` })
    expect(await verifyAccess(request(jwt), env)).toEqual(identity)
    expect(await verifyAccess(request(jwt), env)).toEqual(identity)
    expect(certs).toHaveBeenCalledTimes(1)
    expect(String(certs.mock.calls[0]![0])).toBe(`https://${team}.cloudflareaccess.com/cdn-cgi/access/certs`)
  })

})

describe('the worker', () => {
  async function call(path: string, init: RequestInit, env: Env, jwt?: string): Promise<Response> {
    const headers = new Headers(init.headers)
    if (jwt) headers.set('Cf-Access-Jwt-Assertion', jwt)
    return worker.fetch(new Request(`${ORIGIN}${path}`, { ...init, headers }), env)
  }

  test('no token: 401', async () => {
    await serveCerts()
    const { kv, get, put: write } = fakeKv()
    expect((await call('/api/state', {}, envWith(kv))).status).toBe(401)
    expect(get).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
  })

  test('an identity header alone does not get in: 401', async () => {
    await serveCerts()
    const { kv, get } = fakeKv()
    const res = await call('/api/state', { headers: { 'Cf-Access-Authenticated-User-Email': EMAIL } }, envWith(kv))
    expect(res.status).toBe(401)
    expect(get).not.toHaveBeenCalled()
  })

  test.each<[string, string, () => Promise<Response>]>([
    ['are down', 'certs-down-team', async () => { throw new TypeError('down') }],
    ['answer an error', 'certs-500-team', async () => new Response('no', { status: 500 })],
    ['answer nonsense', 'certs-junk-team', async () => Response.json({ nope: true })],
  ])('certs that %s: 500, because this person has not been signed out', async (_name, team, answer) => {
    vi.stubGlobal('fetch', vi.fn(answer))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { kv, get } = fakeKv()
    const env = envWith(kv, { ACCESS_TEAM: team })
    const res = await call('/api/state', {}, env, await token({ issuer: `https://${team}.cloudflareaccess.com` }))
    expect(res.status).toBe(500)
    expect(get).not.toHaveBeenCalled()
  })

  test('wrong audience: 401', async () => {
    await serveCerts()
    const res = await call('/api/state', {}, emptyEnv(), await token({ audience: 'another-app' }))
    expect(res.status).toBe(401)
  })

  test('expired: 401', async () => {
    await serveCerts()
    const res = await call('/api/state', {}, emptyEnv(), await token({ expires: Math.floor(Date.now() / 1000) - 60 }))
    expect(res.status).toBe(401)
  })

  test('a good token reaches the state, through the real key set', async () => {
    await serveCerts()
    const res = await call('/api/state', {}, emptyEnv(), await token())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ marks: {}, unlocks: {} })
  })

  test.each<[string, Partial<Record<keyof Env, undefined>>]>([
    ['ACCESS_TEAM', { ACCESS_TEAM: undefined }],
    ['ACCESS_AUD', { ACCESS_AUD: undefined }],
    ['STATE', { STATE: undefined }],
  ])('missing env vars: 500, never allows (%s)', async (_name, missing) => {
    await serveCerts()
    const { kv, get, put: write } = fakeKv()
    const env = { ...envWith(kv), ...missing } as Env
    const allowed = await token()
    expect((await call('/api/state', {}, env, allowed)).status).toBe(500)
    expect((await call('/api/state', {}, env)).status).toBe(500)
    expect((await call('/api/state', { method: 'PUT', body: body() }, env, allowed)).status).toBe(500)
    expect(get).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
  })

  test.each(['/api/other', '/api/state/', '/api/state/x', '/api/'])('other paths under /api: 404 (%s)', async (path) => {
    await serveCerts()
    const res = await call(path, {}, emptyEnv(), await token())
    expect(res.status).toBe(404)
  })

  test('other paths under /api tell nothing without a token: 401', async () => {
    await serveCerts()
    expect((await call('/api/other', {}, emptyEnv())).status).toBe(401)
  })

  test('anything else that reaches the worker: 404', async () => {
    expect((await call('/', {}, emptyEnv())).status).toBe(404)
    expect((await call('/data/books.json', {}, emptyEnv())).status).toBe(404)
  })

  test('other methods on /api/state: 405', async () => {
    await serveCerts()
    const jwt = await token()
    for (const method of ['POST', 'DELETE', 'PATCH']) {
      const res = await call('/api/state', { method }, emptyEnv(), jwt)
      expect(res.status).toBe(405)
      expect(res.headers.get('Allow')).toBe('GET, PUT')
    }
  })

  test('every answer carries Cache-Control: no-store', async () => {
    await serveCerts()
    const jwt = await token()
    const answers = await Promise.all([
      call('/api/state', {}, emptyEnv()),
      call('/api/state', {}, emptyEnv(), jwt),
      call('/api/state', { method: 'PUT', body: body() }, emptyEnv(), jwt),
      call('/api/state', { method: 'PUT', body: 'nope' }, emptyEnv(), jwt),
      call('/api/state', { method: 'POST' }, emptyEnv(), jwt),
      call('/api/other', {}, emptyEnv(), jwt),
      call('/elsewhere', {}, emptyEnv()),
      call('/api/state', {}, { ...emptyEnv(), ACCESS_AUD: '' }, jwt),
    ])
    expect(answers.map((a) => a.status)).toEqual([401, 200, 200, 400, 405, 404, 404, 500])
    for (const answer of answers) expect(answer.headers.get('Cache-Control')).toBe('no-store')
  })

  test('a store that fails: 500, and the log holds no email, body or token', async () => {
    await serveCerts()
    const { kv, put: write } = fakeKv()
    write.mockRejectedValue(new Error(`cannot write ${stateKey(EMAIL)}`))
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const jwt = await token()
    const secret = body({ 'some-book': { status: 'read', at: 1 } })
    const res = await call('/api/state', { method: 'PUT', body: secret }, envWith(kv), jwt)
    expect(res.status).toBe(500)
    expect(await res.text()).toBe('')
    const text = JSON.stringify(logged.mock.calls)
    expect(text).not.toContain(EMAIL)
    expect(text).not.toContain('some-book')
    expect(text).not.toContain(jwt)
  })
})

describe('handleState', () => {
  test('GET returns the stored state, or an empty one', async () => {
    const stored = { marks: { a: { status: 'read', at: 5 } }, unlocks: { b: { on: true, at: 6 } } }
    const { kv, put: write } = fakeKv({ [stateKey(EMAIL)]: JSON.stringify(stored) })
    const res = await handleState(new Request(STATE_URL), envWith(kv), identity, NOW)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('application/json')
    expect(await res.json()).toEqual(stored)
    expect(write).not.toHaveBeenCalled()

    const fresh = await handleState(new Request(STATE_URL), emptyEnv(), identity, NOW)
    expect(await fresh.json()).toEqual({ marks: {}, unlocks: {} })
  })

  test('a state reply tells the server clock', async () => {
    const res = await handleState(new Request(STATE_URL), emptyEnv(), identity, NOW)
    expect(Date.parse(res.headers.get('Date')!)).toBe(NOW)
  })

  test('corrupt stored JSON counts as empty, and only a PUT overwrites it', async () => {
    for (const corrupt of ['{nope', '[]', '{"marks":[],"unlocks":{}}']) {
      const { kv, data, put: write } = fakeKv({ [stateKey(EMAIL)]: corrupt })
      const got = await handleState(new Request(STATE_URL), envWith(kv), identity, NOW)
      expect(await got.json()).toEqual({ marks: {}, unlocks: {} })
      expect(write).not.toHaveBeenCalled()
      expect(data.get(stateKey(EMAIL))).toBe(corrupt)

      const mark = { a: { status: 'read', at: 5 } }
      const res = await handleState(put(body(mark)), envWith(kv), identity, NOW)
      expect(await res.json()).toEqual({ marks: mark, unlocks: {} })
      expect(JSON.parse(data.get(stateKey(EMAIL))!)).toEqual({ marks: mark, unlocks: {} })
    }
  })

  test('PUT merges with stored and returns the merge', async () => {
    const stored = {
      marks: { kept: { status: 'read', at: 5 }, older: { status: 'reading', at: 5 }, newer: { status: 'read', at: 9 } },
      unlocks: { u: { on: false, at: 9 } },
    }
    const { kv, data } = fakeKv({ [stateKey(EMAIL)]: JSON.stringify(stored) })
    const incoming = {
      older: { status: 'read', at: 7 },
      newer: { status: 'none', at: 8 },
      added: { status: 'skipped', at: 1 },
    }
    const res = await handleState(put(body(incoming, { u: { on: true, at: 2 } })), envWith(kv), identity, NOW)
    expect(res.status).toBe(200)
    const expected = {
      marks: {
        kept: { status: 'read', at: 5 },
        older: { status: 'read', at: 7 },
        newer: { status: 'read', at: 9 },
        added: { status: 'skipped', at: 1 },
      },
      unlocks: { u: { on: false, at: 9 } },
    }
    expect(await res.json()).toEqual(expected)
    expect(JSON.parse(data.get(stateKey(EMAIL))!)).toEqual(expected)
  })

  describe('a PUT that changes nothing never writes', () => {
    const marks = { a: { status: 'read', at: 5 }, b: { status: 'reading', at: 6 } }
    const unlocks = { c: { on: true, at: 7 } }

    async function seeded() {
      const store = fakeKv()
      await handleState(put(body(marks, unlocks)), envWith(store.kv), identity, NOW)
      expect(store.put).toHaveBeenCalledTimes(1)
      store.put.mockClear()
      return store
    }

    test.each<[string, string]>([
      ['the same state', body(marks, unlocks)],
      ['the same state, its ids in another order', body({ b: marks.b, a: marks.a }, unlocks)],
      ['less than is stored', body({ a: marks.a })],
      ['older entries', body({ a: { status: 'none', at: 1 } }, { c: { on: false, at: 1 } })],
      ['nothing at all', body()],
    ])('%s', async (_name, sent) => {
      const { kv, put: write } = await seeded()
      const res = await handleState(put(sent), envWith(kv), identity, NOW)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ marks, unlocks })
      expect(write).not.toHaveBeenCalled()
    })

    test('nothing on an empty store', async () => {
      const { kv, put: write } = fakeKv()
      const res = await handleState(put(body()), envWith(kv), identity, NOW)
      expect(await res.json()).toEqual({ marks: {}, unlocks: {} })
      expect(write).not.toHaveBeenCalled()
    })

    test('a device with nothing new does not put a stale read over a newer write', async () => {
      const { kv, data, get, put: write } = await seeded()
      const stale = data.get(stateKey(EMAIL))!
      await handleState(put(body({ d: { status: 'read', at: 9 } })), envWith(kv), identity, NOW)
      const newer = data.get(stateKey(EMAIL))!
      write.mockClear()

      get.mockResolvedValueOnce(stale)
      await handleState(put(body(marks, unlocks)), envWith(kv), identity, NOW)
      expect(write).not.toHaveBeenCalled()
      expect(data.get(stateKey(EMAIL))).toBe(newer)
    })

    test('a real change still writes, once', async () => {
      const { kv, put: write } = await seeded()
      await handleState(put(body({ a: { status: 'none', at: 8 } })), envWith(kv), identity, NOW)
      expect(write).toHaveBeenCalledTimes(1)
    })
  })

  test('the store refusing a second write within the second: 503, to be retried', async () => {
    const { kv, put: write } = fakeKv()
    write.mockRejectedValueOnce(new Error('KV PUT failed: 429 Too Many Requests'))
    const res = await handleState(put(body({ a: { status: 'read', at: 1 } })), envWith(kv), identity, NOW)
    expect(res.status).toBe(503)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(res.headers.get('Retry-After')).toBe('1')
  })

  test('the store failing any other way is not hidden as busy', async () => {
    const { kv, put: write } = fakeKv()
    const failure = new Error('KV PUT failed: 500 Internal Server Error')
    write.mockRejectedValueOnce(failure)
    await expect(handleState(put(body({ a: { status: 'read', at: 1 } })), envWith(kv), identity, NOW)).rejects.toBe(failure)
  })

  describe('the cap holds for the merged state, not only for one PUT', () => {
    const many = (from: number, count: number) =>
      Object.fromEntries(Array.from({ length: count }, (_, i) => [`stored-book-${from + i}`, { status: 'read', at: 5 }]))

    test('good PUTs that together go over: the one that would is a 413, and nothing is written', async () => {
      const { kv, data, put: write } = fakeKv()
      const first = await handleState(put(body(many(0, 2500))), envWith(kv), identity, NOW)
      expect(first.status).toBe(200)
      const kept = data.get(stateKey(EMAIL))
      write.mockClear()

      const second = await handleState(put(body(many(2500, 2500))), envWith(kv), identity, NOW)
      expect(second.status).toBe(200)
      const third = await handleState(put(body(many(5000, 2500))), envWith(kv), identity, NOW)
      expect(third.status).toBe(413)
      expect(third.headers.get('Cache-Control')).toBe('no-store')
      expect(write).toHaveBeenCalledTimes(1)
      expect(data.get(stateKey(EMAIL))).not.toBe(kept)
    })

    test('what fits exactly is kept: what is stored can always be sent back', async () => {
      const { kv, data } = fakeKv()
      await handleState(put(body(many(0, 2500))), envWith(kv), identity, NOW)
      await handleState(put(body(many(2500, 2500))), envWith(kv), identity, NOW)
      const stored = data.get(stateKey(EMAIL))!
      expect(stored.length).toBeLessThanOrEqual(CAP)
      const res = await handleState(put(stored), envWith(kv), identity, NOW)
      expect(res.status).toBe(200)
    })
  })

  test('ids that are not book ids are dropped by the server', async () => {
    const { kv, data } = fakeKv()
    const sent = body({ good: { status: 'read', at: 1 }, 'Not An Id': { status: 'read', at: 1 }, '../up': { status: 'read', at: 1 } })
    const res = await handleState(put(sent), envWith(kv), identity, NOW)
    const expected = { marks: { good: { status: 'read', at: 1 } }, unlocks: {} }
    expect(await res.json()).toEqual(expected)
    expect(JSON.parse(data.get(stateKey(EMAIL))!)).toEqual(expected)
  })

  test('an alias with a dot is kept by the server, which does not know the catalogue', async () => {
    const { kv, data, put: write } = fakeKv()
    const dotted = { 'sa2.5': { status: 'read', at: 1 } }
    const res = await handleState(put(body(dotted)), envWith(kv), identity, NOW)
    expect(await res.json()).toEqual({ marks: dotted, unlocks: {} })

    // Stored, it reads whole: nothing is copied aside, and nothing is rewritten for it.
    write.mockClear()
    await handleState(put(body(dotted)), envWith(kv), identity, NOW)
    expect(write).not.toHaveBeenCalled()
    await handleState(put(body({ other: { status: 'read', at: 2 } })), envWith(kv), identity, NOW)
    expect(write).toHaveBeenCalledTimes(1)
    expect(JSON.parse(data.get(stateKey(EMAIL))!).marks['sa2.5']).toEqual(dotted['sa2.5'])
  })

  describe('a stored document that could not be read whole', () => {
    const copyPrefix = `state-unread:${EMAIL}:`
    const change = body({ a: { status: 'read', at: 5 } })

    test.each([
      ['not JSON', '{nope'],
      ['the wrong shape', '[]'],
      ['a bad entry among good ones', '{"marks":{"good":{"status":"read","at":1},"bad":{"status":"finished","at":1}},"unlocks":{}}'],
      ['an id that is not a book id', '{"marks":{"Not An Id":{"status":"read","at":1}},"unlocks":{}}'],
    ])('%s is copied aside, before anything is written over it', async (_name, raw) => {
      const { kv, data, put: write } = fakeKv({ [stateKey(EMAIL)]: raw })
      await handleState(put(change), envWith(kv), identity, NOW)
      expect(write.mock.calls[0]).toEqual([`${copyPrefix}${NOW}`, raw])
      expect(write.mock.calls[1]![0]).toBe(stateKey(EMAIL))
      expect(data.get(`${copyPrefix}${NOW}`)).toBe(raw)
      expect(data.get(stateKey(EMAIL))).not.toBe(raw)
    })

    test('if the copy fails, the original stays', async () => {
      const { kv, data, put: write } = fakeKv({ [stateKey(EMAIL)]: '{nope' })
      const failure = new Error('KV PUT failed: 500')
      write.mockRejectedValueOnce(failure)
      await expect(handleState(put(change), envWith(kv), identity, NOW)).rejects.toBe(failure)
      expect(data.get(stateKey(EMAIL))).toBe('{nope')
    })

    test('a whole document is not copied', async () => {
      const whole = body({ a: { status: 'read', at: 1 } })
      const { kv, put: write } = fakeKv({ [stateKey(EMAIL)]: whole })
      await handleState(put(body({ b: { status: 'read', at: 2 } })), envWith(kv), identity, NOW)
      expect(write).toHaveBeenCalledTimes(1)
      expect(write.mock.calls[0]![0]).toBe(stateKey(EMAIL))
    })

    test('a GET copies nothing', async () => {
      const { kv, put: write } = fakeKv({ [stateKey(EMAIL)]: '{nope' })
      await handleState(new Request(STATE_URL), envWith(kv), identity, NOW)
      expect(write).not.toHaveBeenCalled()
    })
  })

  test('PUT clamps timestamps a year ahead', async () => {
    const { kv, data } = fakeKv()
    const ahead = NOW + YEAR
    const res = await handleState(
      put(body({ a: { status: 'read', at: ahead } }, { b: { on: true, at: ahead } })),
      envWith(kv),
      identity,
      NOW,
    )
    const expected = { marks: { a: { status: 'read', at: NOW } }, unlocks: { b: { on: true, at: NOW } } }
    expect(await res.json()).toEqual(expected)
    expect(JSON.parse(data.get(stateKey(EMAIL))!)).toEqual(expected)

    // And it no longer beats a later change.
    const later = NOW + 1000
    const next = await handleState(put(body({ a: { status: 'none', at: later } })), envWith(kv), identity, later)
    expect(await next.json()).toMatchObject({ marks: { a: { status: 'none', at: later } } })
  })

  test('two emails do not share state', async () => {
    const { kv, data } = fakeKv()
    const env = envWith(kv)
    const alice = { email: 'alice@example.com' }
    const bob = { email: 'bob@example.com' }
    await handleState(put(body({ a: { status: 'read', at: 1 } })), env, alice, NOW)
    const got = await handleState(new Request(STATE_URL), env, bob, NOW)
    expect(await got.json()).toEqual({ marks: {}, unlocks: {} })
    await handleState(put(body({ b: { status: 'read', at: 2 } })), env, bob, NOW)
    expect(JSON.parse(data.get(stateKey(alice.email))!).marks).toEqual({ a: { status: 'read', at: 1 } })
    expect(JSON.parse(data.get(stateKey(bob.email))!).marks).toEqual({ b: { status: 'read', at: 2 } })
  })

  describe('body above 256 KB: 413', () => {
    function streamed(stream: ReadableStream<Uint8Array>, headers: Record<string, string> = {}): Request {
      return new Request(STATE_URL, { method: 'PUT', body: stream, headers, duplex: 'half' } as RequestInit)
    }

    test('by the length it declares, without reading it', async () => {
      const { kv, put: write } = fakeKv()
      const stream = spaces(10)
      const res = await handleState(streamed(stream, { 'Content-Length': String(CAP + 1) }), envWith(kv), identity, NOW)
      expect(res.status).toBe(413)
      expect(write).not.toHaveBeenCalled()
    })

    test('by what arrives, when it declares nothing', async () => {
      const { kv, put: write } = fakeKv()
      const res = await handleState(streamed(spaces(CAP + 1)), envWith(kv), identity, NOW)
      expect(res.status).toBe(413)
      expect(write).not.toHaveBeenCalled()
    })

    test('by what arrives, when it declares less', async () => {
      const res = await handleState(streamed(spaces(CAP + 1), { 'Content-Length': '10' }), emptyEnv(), identity, NOW)
      expect(res.status).toBe(413)
    })

    test('reading stops at the cap', async () => {
      let pulled = 0
      let cancelled = false
      const endless = new ReadableStream<Uint8Array>({
        pull(controller) {
          pulled += 64 * 1024
          controller.enqueue(new Uint8Array(64 * 1024))
        },
        cancel() {
          cancelled = true
        },
      })
      const res = await handleState(streamed(endless), emptyEnv(), identity, NOW)
      expect(res.status).toBe(413)
      expect(cancelled).toBe(true)
      expect(pulled).toBeLessThan(CAP * 2)
    })

    test('exactly 256 KB is read', async () => {
      const text = body()
      const padded = text + ' '.repeat(CAP - text.length)
      const res = await handleState(put(padded), emptyEnv(), identity, NOW)
      expect(res.status).toBe(200)
    })
  })

  test.each<[string, BodyInit | null]>([
    ['no body', null],
    ['not json', 'nope'],
    ['an array', '[]'],
    ['null', 'null'],
    ['a string', '"marks"'],
    ['marks that are not an object', '{"marks":[],"unlocks":{}}'],
    ['unlocks missing', '{"marks":{}}'],
    ['invalid UTF-8', new Uint8Array([0x7b, 0xff, 0xfe, 0x7d])],
  ])('malformed body: 400 (%s)', async (_name, sent) => {
    const { kv, put: write } = fakeKv()
    const res = await handleState(put(sent), envWith(kv), identity, NOW)
    expect(res.status).toBe(400)
    expect(write).not.toHaveBeenCalled()
  })

  test('bad entries are dropped by the rules of an import, and a __proto__ key stays out', async () => {
    const { kv, data } = fakeKv()
    const sent =
      '{"marks":{"good":{"status":"read","at":1},"bad":{"status":"finished","at":1},"__proto__":{"status":"read","at":1}},"unlocks":{"worse":{"on":"yes","at":1}}}'
    const res = await handleState(put(sent), envWith(kv), identity, NOW)
    const expected = { marks: { good: { status: 'read', at: 1 } }, unlocks: {} }
    expect(await res.json()).toEqual(expected)
    expect(JSON.parse(data.get(stateKey(EMAIL))!)).toEqual(expected)
    expect(({} as Record<string, unknown>).status).toBeUndefined()
  })
})
