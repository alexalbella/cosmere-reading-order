/** The width from which the circle is the default view. Below it the phone layout applies. CSS keeps its own literal. */
export const WIDE_VIEWPORT = 1280
export const WIDE_QUERY = `(min-width: ${WIDE_VIEWPORT}px)`
export const PHONE_QUERY = `(max-width: ${WIDE_VIEWPORT - 1}px)`
