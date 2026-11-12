/** Only http and https become links, and never through v-html. Anything else gives null. */
export function safeUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null
  } catch {
    return null
  }
}

/** A link's site, as a person names it. */
export function host(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '')
}
