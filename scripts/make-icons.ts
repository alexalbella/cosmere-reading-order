import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '@playwright/test'
import { ROOT } from './lib/load-data'

// Renders the seal on the default leather into the app's icons. Run it by hand after changing the seal:
// `npx tsx scripts/make-icons.ts`. The outputs are committed, so a build never needs a browser.

const TEAL = '#00394a'
const GOLD = '#e2c070'

interface Icon {
  file: string
  size: number
  /** Share of the side the seal takes. A maskable icon keeps it inside the round safe zone. */
  scale: number
  seal: 'seal.svg' | 'seal-small.svg'
}

const ICONS: Icon[] = [
  { file: 'icon-192.png', size: 192, scale: 0.74, seal: 'seal.svg' },
  { file: 'icon-512.png', size: 512, scale: 0.74, seal: 'seal.svg' },
  { file: 'icon-maskable-512.png', size: 512, scale: 0.56, seal: 'seal.svg' },
  { file: 'apple-touch-icon.png', size: 180, scale: 0.7, seal: 'seal.svg' },
  { file: 'favicon-32.png', size: 32, scale: 0.88, seal: 'seal-small.svg' },
]

function page(icon: Icon): string {
  const svg = readFileSync(join(ROOT, 'public', icon.seal), 'utf8')
  // Single quotes inside the style attribute, which is itself in double quotes.
  const mask = `url('data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg).replaceAll("'", '%27')}')`
  const side = Math.round(icon.size * icon.scale)
  return `<!doctype html><html><body style="margin:0"><div style="width:${icon.size}px;height:${icon.size}px;background:${TEAL};display:grid;place-items:center"><div style="width:${side}px;height:${side}px;background:${GOLD};-webkit-mask:${mask} center / contain no-repeat;mask:${mask} center / contain no-repeat"></div></div></body></html>`
}

async function main(): Promise<void> {
  const browser = await chromium.launch()
  for (const icon of ICONS) {
    const tab = await browser.newPage({ viewport: { width: icon.size, height: icon.size }, deviceScaleFactor: 1 })
    await tab.setContent(page(icon))
    // The mask is an image: give it time to decode before the shot.
    await tab.waitForTimeout(400)
    await tab.screenshot({ path: join(ROOT, 'public', 'icons', icon.file), clip: { x: 0, y: 0, width: icon.size, height: icon.size } })
    await tab.close()
  }
  await browser.close()
  console.log(`icons: ${ICONS.length}`)
}

void main()
