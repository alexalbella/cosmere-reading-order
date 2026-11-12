import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildSprite, spriteSources } from './lib/sprite'
import { ROOT } from './lib/load-data'
import { runMain } from './lib/run'

// Turns the drawings in src/imagery/svg/ into src/imagery/SpriteSheet.vue, the hidden sheet of symbols the page
// loads after its first paint. Run it after adding or changing a drawing: `npx tsx scripts/make-sprite.ts`.
function main(): number {
  const sources = spriteSources(join(ROOT, 'src', 'imagery', 'svg'))
  writeFileSync(join(ROOT, 'src', 'imagery', 'SpriteSheet.vue'), buildSprite(sources))
  console.log(`sprite: ${sources.length} symbols`)
  return 0
}

runMain(main)
