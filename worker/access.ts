import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from 'jose'
import type { Env } from './index'

const TOKEN_HEADER = 'Cf-Access-Jwt-Assertion'

/** What a token can be at fault for. Anything else (the keys could not be fetched, say) says nothing about who this is. */
const BAD_TOKEN = [
  errors.JOSEAlgNotAllowed,
  errors.JOSENotSupported,
  errors.JWKSMultipleMatchingKeys,
  errors.JWKSNoMatchingKey,
  errors.JWSInvalid,
  errors.JWSSignatureVerificationFailed,
  errors.JWTClaimValidationFailed,
  errors.JWTExpired,
  errors.JWTInvalid,
]

/** Kept between requests, so the isolate reuses jose's cache of the keys. Holds no request state. */
const keySets = new Map<string, JWTVerifyGetKey>()

function keysOf(team: string): JWTVerifyGetKey {
  let keys = keySets.get(team)
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`https://${team}.cloudflareaccess.com/cdn-cgi/access/certs`))
    keySets.set(team, keys)
  }
  return keys
}

/**
 * Who Access says this is, or null for a bad or absent token: this is the only code that decides identity.
 * A failure that is not the token's throws, so that it answers 5xx. It never allows, and it does not ask a
 * person who is signed in to sign in again. A Worker with Static Assets does not receive `ctx.access`, so
 * the token is checked here.
 */
export async function verifyAccess(request: Request, env: Env, keys?: JWTVerifyGetKey): Promise<{ email: string } | null> {
  const token = request.headers.get(TOKEN_HEADER)
  // jose skips the check of a claim it is given no value for: without these it would accept any audience.
  if (!token || !env.ACCESS_TEAM || !env.ACCESS_AUD) return null
  try {
    const { payload } = await jwtVerify(token, keys ?? keysOf(env.ACCESS_TEAM), {
      issuer: `https://${env.ACCESS_TEAM}.cloudflareaccess.com`,
      audience: env.ACCESS_AUD,
      algorithms: ['RS256'],
      requiredClaims: ['exp'],
    })
    return typeof payload.email === 'string' && payload.email !== '' ? { email: payload.email.toLowerCase() } : null
  } catch (error) {
    if (BAD_TOKEN.some((kind) => error instanceof kind)) return null
    throw error
  }
}
