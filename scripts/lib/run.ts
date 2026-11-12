import type { Problem } from '../../src/data/types'

/** Problems go to stderr as a code and an id, never as content. */
export function reportProblems(problems: Problem[]): void {
  for (const p of problems) console.error(`${p.code} ${p.id}`)
}

/**
 * Runs a script's main and sets the exit code. An error prints its message only: the data loader throws
 * file names and codes, never file content, and this is the one place that contract is kept.
 */
export function runMain(main: () => number): void {
  try {
    process.exitCode = main()
  } catch (e) {
    console.error(e instanceof Error ? e.message : 'ERROR')
    process.exitCode = 1
  }
}
