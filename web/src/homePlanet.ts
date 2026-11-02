import type { Stream } from './api'

export type Home = { name: string; logins: string[]; visiting: boolean }
const KEY = 'watchworld:home'
const listeners = new Set<() => void>()
let home: Home | null = null
let loaded = false

const encode = (h: { name: string; logins: string[] }) => btoa(unescape(encodeURIComponent(JSON.stringify({ n: h.name, s: h.logins })))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const decode = (code: string): { name: string; logins: string[] } | null => {
  try {
    const raw = JSON.parse(decodeURIComponent(escape(atob(code.replace(/-/g, '+').replace(/_/g, '/')))))
    if (!raw || !Array.isArray(raw.s)) return null
    return { name: String(raw.n ?? 'Friend planet').slice(0, 40), logins: raw.s.map((x: unknown) => String(x).toLowerCase().slice(0, 40)).slice(0, 120) }
  } catch { return null }
}

function load() {
  if (loaded) return
  loaded = true
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (saved && Array.isArray(saved.logins)) home = { name: String(saved.name ?? 'My planet'), logins: saved.logins, visiting: false }
  } catch { /* private mode */ }
  // an invite link opens somebody's planet without touching your own
  const code = new URLSearchParams(location.search).get('home')
  const invited = code ? decode(code) : null
  if (invited) home = { ...invited, visiting: true }
}
export const getHome = () => { load(); return home }
export const subscribeHome = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }
function set(next: Home | null) {
  home = next
  if (next && !next.visiting) try { localStorage.setItem(KEY, JSON.stringify({ name: next.name, logins: next.logins })) } catch { /* ignore */ }
  if (!next) try { localStorage.removeItem(KEY) } catch { /* ignore */ }
  listeners.forEach((l) => l())
}
export const saveHome = (name: string, logins: string[]) => set({ name: name.trim().slice(0, 40) || 'My planet', logins: [...new Set(logins.map((l) => l.toLowerCase()))].slice(0, 120), visiting: false })
export const clearHome = () => set(null)
export const homeCode = (h: Home) => encode(h)
export const inviteLink = (h: Home) => `${location.origin}${location.pathname}?home=${encode(h)}`
/** The presence shard friends on the same planet share. */
export const homeShard = (h: Home) => `home-${hashOf(encode(h))}`
export function hashOf(s: string) { let x = 2166136261; for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619); return (x >>> 0) % 90 }
export const homeStreams = (h: Home, all: Stream[]) => {
  const want = new Set(h.logins)
  return all.filter((s) => want.has(s.login.toLowerCase()))
}

/** Put a streamer on your own planet (making the planet if you do not have one yet), or take them off again. */
export function toggleStream(login: string): 'added' | 'removed' | 'visiting' {
  const h = getHome()
  const l = login.toLowerCase()
  if (h?.visiting) return 'visiting'
  if (h?.logins.includes(l)) { saveHome(h.name, h.logins.filter((x) => x !== l)); if (!getHome()!.logins.length) clearHome(); return 'removed' }
  saveHome(h?.name ?? 'My planet', [...(h?.logins ?? []), l])
  return 'added'
}
export const onMyPlanet = (login: string) => { const h = getHome(); return !!h && !h.visiting && h.logins.includes(login.toLowerCase()) }
