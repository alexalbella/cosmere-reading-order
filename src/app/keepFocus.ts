/**
 * When the element holding the focus is taken out of the page and nothing else has it, the focus
 * goes to what `next` names. Without this it falls to the body, and a keyboard starts over from the top.
 * Returns the function that stops watching.
 */
export function keepFocus(root: HTMLElement, next: () => HTMLElement | null): () => void {
  let held: Element | null = null
  const onFocus = (event: FocusEvent): void => {
    held = event.target instanceof Element ? event.target : null
  }
  // A press anywhere starts over: what the focus was on before it no longer matters.
  const onPress = (): void => {
    held = null
  }
  const observer = new MutationObserver(() => {
    if (held === null || held.isConnected || document.activeElement !== document.body) return
    held = null
    next()?.focus({ preventScroll: true })
  })
  root.addEventListener('focusin', onFocus)
  document.addEventListener('pointerdown', onPress, true)
  observer.observe(root, { childList: true, subtree: true })
  return () => {
    root.removeEventListener('focusin', onFocus)
    document.removeEventListener('pointerdown', onPress, true)
    observer.disconnect()
  }
}
