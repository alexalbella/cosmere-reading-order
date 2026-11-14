// The ring makes its entrance once in a visit: the first ring drawn takes it, and no ring after that one does
// (coming back from the shelf draws a new ring, which simply is there).

let taken = false

/** True for the first caller of the visit, false for every other. */
export function takeFirstRing(): boolean {
  const first = !taken
  taken = true
  return first
}

/** For tests: the next ring is a first one again. */
export function resetFirstRing(): void {
  taken = false
}
