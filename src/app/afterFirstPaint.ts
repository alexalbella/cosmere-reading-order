/**
 * Runs once the page has had its chance to paint, so what is not needed for that first paint does not compete with
 * it for the connection. A hidden tab paints nothing, so a timer stands in for the frame.
 */
export function afterFirstPaint(run: () => void): void {
  let done = false
  const once = (): void => {
    if (done) return
    done = true
    run()
  }
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(once))
  setTimeout(once, 200)
}
