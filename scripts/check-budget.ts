import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const LIMIT = 100 * 1024
const dist = join(import.meta.dirname, '..', 'dist')
const html = readFileSync(join(dist, 'index.html'), 'utf8')

// JS the page loads directly: module scripts and modulepreloads.
const refs = new Set<string>()
for (const m of html.matchAll(/<script[^>]*\ssrc="([^"]+\.js)"/g)) refs.add(m[1]!)
for (const m of html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+\.js)"/g)) refs.add(m[1]!)

let total = 0
for (const ref of refs) {
  total += gzipSync(readFileSync(join(dist, ref.replace(/^\//, '')))).length
}

if (refs.size === 0) {
  // Nothing found is not a pass: the page or the pattern has changed, and the budget is checking nothing.
  console.error('no scripts found in the built page')
  process.exit(1)
}

const kb = (total / 1024).toFixed(1)
console.log(`first-load JS: ${kb} KB gzipped (budget ${LIMIT / 1024} KB, ${refs.size} files)`)
if (total > LIMIT) {
  console.error('over budget')
  process.exit(1)
}
