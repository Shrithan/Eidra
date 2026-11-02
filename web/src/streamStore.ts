import { fetchStreams, type Stream } from './api'

const PAGE = 5000
const MAX_STREAMS = 250000

let all: Stream[] = []
let done = false
let promise: Promise<void> | null = null
const listeners = new Set<() => void>()

/** Every live stream, fetched once and shared by the world and the search bar. The busiest page lands first. */
export function loadAllStreams(signal?: AbortSignal): Promise<void> {
  if (promise) return promise
  promise = (async () => {
    const seen = new Set<string>()
    const take = (list: Stream[]) => { for (const s of list) if (!seen.has(s.login)) { seen.add(s.login); all.push(s) } }
    const first = await fetchStreams({ planet: 'all', limit: PAGE, offset: 0 }, signal)
    take(first.streams)
    listeners.forEach((l) => l())
    if (!first.hasMore || !first.streams.length) { done = true; return }
    const pages = Math.min(Math.ceil(MAX_STREAMS / PAGE), Math.ceil(first.total / PAGE))
    const rest = await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, (_, i) => fetchStreams({ planet: 'all', limit: PAGE, offset: (i + 1) * PAGE }, signal).then((r) => r.streams)))
    for (const list of rest) take(list)
    all = all.slice(0, MAX_STREAMS)
    done = true
    listeners.forEach((l) => l())
  })().catch((e) => { promise = null; throw e })
  return promise
}

export const streamsNow = () => all
export function addStreams(streams: Stream[]) { const known=new Set(all.map(s=>s.login)); let changed=false; for(const s of streams)if(!known.has(s.login)){all.push(s);known.add(s.login);changed=true} if(changed)listeners.forEach(l=>l()) }
export const streamsDone = () => done
export function onStreams(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } }
