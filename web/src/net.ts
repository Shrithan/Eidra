/** Where the game server is. On your own machine it is port 2567; for anyone else it is the same address as the page, through /colyseus. */
export const colyseusUrl = () => {
  const { protocol, host, hostname } = location
  // built and served by the game server itself: the rooms live at the same address as the page; the dev server forwards /colyseus
  if (import.meta.env.PROD) return `${protocol === 'https:' ? 'wss' : 'ws'}://${host}`
  return hostname === 'localhost' || hostname === '127.0.0.1' ? `ws://${hostname}:2567` : `${protocol === 'https:' ? 'wss' : 'ws'}://${host}/colyseus`
}

/** The deployed site runs with no bots at all: VITE_BOTS=0 at build time. */
export const BOTS = import.meta.env.VITE_BOTS !== '0'
