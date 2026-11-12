import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateCatalog } from '../src/data/validate'
import { loadData, ROOT } from './lib/load-data'
import { reportProblems, runMain } from './lib/run'

function main(): number {
  const { catalog } = loadData()
  const problems = validateCatalog(catalog)
  if (problems.length > 0) {
    reportProblems(problems)
    return 1
  }
  const out = join(ROOT, 'public', 'data')
  mkdirSync(out, { recursive: true })
  const write = (name: string, value: unknown) =>
    writeFileSync(join(out, name), JSON.stringify(value) + '\n')
  write('books.json', catalog.books)
  write('connections.json', catalog.connections)
  write('synopses.json', catalog.synopses)
  write('notes.json', catalog.notes)
  write('meta.json', catalog.meta)
  console.log(
    `data ok: ${catalog.books.length} books, ${catalog.connections.length} connections, ${catalog.synopses.length} synopses, ${catalog.notes.length} notes`,
  )
  return 0
}

runMain(main)
