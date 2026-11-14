// Motes that drift off a title when its book is marked read. Pure decoration: they know a point and a colour, never
// a book. Each is removed when its animation ends, and none is made when the reader asked for less motion or the
// browser cannot animate.

export const MAX_MOTES = 22

const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'

export interface MoteOptions {
  /** Where the motes are put. The page's body by default, since they are placed against the window. */
  host?: HTMLElement
  /** The dice, for a test to fix. */
  random?: () => number
}

function welcome(): boolean {
  return typeof matchMedia === 'function' && !matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Sends the motes off from `from` (window pixels) in `colour`. Returns how many were made. */
export function motes(from: { x: number; y: number }, colour: string, options: MoteOptions = {}): number {
  if (!welcome() || typeof document === 'undefined') return 0
  const host = options.host ?? document.body
  const random = options.random ?? Math.random
  let made = 0
  for (let i = 0; i < MAX_MOTES; i++) {
    const mote = document.createElement('i')
    if (typeof mote.animate !== 'function') break
    mote.className = 'mote'
    mote.setAttribute('aria-hidden', 'true')
    mote.style.setProperty('--c', colour)
    mote.style.left = `${from.x}px`
    mote.style.top = `${from.y}px`
    host.appendChild(mote)
    const angle = random() * Math.PI * 2
    const reach = 30 + random() * 70
    const dx = (Math.cos(angle) * reach).toFixed(1)
    const dy = (Math.sin(angle) * reach - 30).toFixed(1)
    const animation = mote.animate(
      [
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.2)`, opacity: 0 },
      ],
      { duration: Math.round(900 + random() * 600), delay: Math.round(220 + random() * 120), easing: EASE, fill: 'both' },
    )
    const leave = (): void => mote.remove()
    animation.onfinish = leave
    animation.oncancel = leave
    made++
  }
  return made
}
