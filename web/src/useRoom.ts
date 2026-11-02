import { useCallback, useEffect, useRef, useState } from 'react'
import { Client, Room } from 'colyseus.js'

export type Player = { id: string; name: string; seat: number; x: number; y: number; yaw?: number; color: string; look?: string }
export type ChatLine = { id: number; kind: 'room' | 'twitch' | 'system'; name: string; text: string; color?: string }
export type TwitchUpdate = { id: number; category: 'notification' | 'channel' | 'stream' | 'account'; title: string; detail: string; receivedAt: number }
export type FloatingEmote = { id: number; playerId: string; emoji: string }
export type WaveEvent = { id: number; playerId: string; targetId?: string }
export type Bubble = { id: number; text: string }
export type Hype = { id: number; level: number }
export type DirectMessage = { id: number; fromId: string; from: string; toId: string; to: string; text: string }
export type PlanetInvite = { fromId:string; from:string; code:string }
export type PlanetVisitRequest = { fromId:string; from:string }

export const EMOJIS = ['👏', '🔥', '😂', '❤️', '🎉', '😮', '👋', '🫡']
export const SEATS = 24 // 3 rows of 8; layout lives in World.tsx

const COLORS = ['#ff6b6b', '#ffd93d', '#6bcB77', '#4d96ff', '#c77dff', '#ff9f43', '#2ec4b6', '#f368e0']
import { colyseusUrl } from './net'

let uid = 0
const nextId = () => ++uid

/**
 * Talks to the Colyseus `theater` room (see CONTRACT.md). If the server is not reachable the hook
 * falls back to a local-only room with a few ambient viewers so the UI is always demoable.
 */
export function useRoom(channel: string, name: string, capacityHint = 24, look = '') {
  const roomRef = useRef<Room | null>(null)
  const lookRef = useRef(look)
  lookRef.current = look
  // equipping something while in the room tells everyone else straight away
  useEffect(() => { roomRef.current?.send('look', look) }, [look])
  const [players, setPlayers] = useState<Record<string, Player>>({})
  const playersRef = useRef(players)
  playersRef.current = players
  const [selfId, setSelfId] = useState('me')
  const [chat, setChat] = useState<ChatLine[]>([])
  const [updates, setUpdates] = useState<TwitchUpdate[]>([])
  const [emotes, setEmotes] = useState<FloatingEmote[]>([])
  const [waves, setWaves] = useState<WaveEvent[]>([])
  const [bubbles, setBubbles] = useState<Record<string, Bubble>>({})
  const [hype, setHype] = useState<Hype | null>(null)
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([])
  const [planetInvite, setPlanetInvite] = useState<PlanetInvite | null>(null)
  const [visitRequest, setVisitRequest] = useState<PlanetVisitRequest | null>(null)
  const [mode, setMode] = useState<'connecting' | 'live' | 'offline'>('connecting')
  const [capacity, setCapacity] = useState<number | null>(null)
  const selfRef = useRef('me')

  const pushChat = useCallback((l: Omit<ChatLine, 'id'>) => {
    setChat((c) => [...c.slice(-80), { ...l, id: nextId() }])
  }, [])

  const pushUpdate = useCallback((u: Omit<TwitchUpdate, 'id' | 'receivedAt'>) => {
    setUpdates((items) => [...items.slice(-39), { ...u, id: nextId(), receivedAt: Date.now() }])
  }, [])

  const pushEmote = useCallback((playerId: string, emoji: string) => {
    const id = nextId()
    setEmotes((e) => [...e, { id, playerId, emoji }])
    setTimeout(() => setEmotes((e) => e.filter((x) => x.id !== id)), 2600)
  }, [])

  const showBubble = useCallback((playerId: string, text: string) => {
    const id = nextId()
    setBubbles((b) => ({ ...b, [playerId]: { id, text: text.slice(0, 80) } }))
    setTimeout(() => setBubbles((b) => (b[playerId]?.id === id ? Object.fromEntries(Object.entries(b).filter(([k]) => k !== playerId)) : b)), 6000)
  }, [])

  const pushWave = useCallback((playerId: string, targetId?: string) => {
    const id = nextId()
    setWaves((w) => [...w, { id, playerId, targetId }])
    setTimeout(() => setWaves((w) => w.filter((x) => x.id !== id)), 2000)
    if (targetId && targetId === selfRef.current && playerId !== targetId) {
      const who = playersRef.current[playerId]?.name ?? 'Someone'
      pushChat({ kind: 'system', name: '', text: `${who} waved at you 👋` })
    }
  }, [pushChat])

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | undefined

    const goOffline = () => {
      if (cancelled) return
      setMode('offline')
      setSelfId('me')
      selfRef.current = 'me'
      const bots: Record<string, Player> = {
        me: { id: 'me', name, seat: -1, x: 0.5, y: 0.84, yaw: 0, color: COLORS[3] },
      }
      ;[['QuestBot (test)', 0.12], ['Dev', 0.2], ['Sol', 0.46], ['Ayo', 0.52], ['Jun', 0.8]].forEach(([n, f], i) => {
        const seat = Math.min(capacityHint - 1, Math.floor((f as number) * capacityHint))
        bots[`bot${i}`] = { id: `bot${i}`, name: n as string, seat, x: 0.5, y: 0.5, yaw: 0, color: COLORS[i] }
      })
      setPlayers(bots)
      pushChat({ kind: 'system', name: '', text: 'Offline demo room: server not reachable, other viewers are simulated.' })
      const lines = ['this is wild', 'LETS GOOO', 'first time here, love the room', 'who else came from the globe?', 'W stream']
      timer = setInterval(() => {
        const i = Math.floor(Math.random() * 5)
        const text = lines[Math.floor(Math.random() * lines.length)]
        pushChat({ kind: 'room', name: ['Mika', 'Dev', 'Sol', 'Ayo', 'Jun'][i], text, color: COLORS[i] })
        showBubble(`bot${i}`, text)
        if (Math.random() < 0.5) pushEmote(`bot${i}`, EMOJIS[Math.floor(Math.random() * EMOJIS.length)])
        if (Math.random() < 0.25) pushWave(`bot${i}`)
      }, 3500)
    }

    let retry: ReturnType<typeof setTimeout> | undefined
    let offline = false
    const goOfflineOnce = () => {
      if (offline) return
      offline = true
      goOffline()
    }
    const scheduleRetry = () => {
      if (!cancelled) retry = setTimeout(connect, 3000)
    }
    const client = new Client(colyseusUrl())
    const timeout = setTimeout(goOfflineOnce, 3000)
    const connect = () => client
      .joinOrCreate('theater', { channel: channel.toLowerCase(), name, look: lookRef.current })
      .then((room) => {
        clearTimeout(timeout)
        if (cancelled) return room.leave()
        if (offline) {
          offline = false
          if (timer) { clearInterval(timer); timer = undefined }
          setBubbles({})
          pushChat({ kind: 'system', name: '', text: 'Reconnected to the room.' })
        }
        roomRef.current = room
        setMode('live')
        setSelfId(room.sessionId)
        selfRef.current = room.sessionId
        const sync = () => {
          const state = room.state as any
          if (typeof state?.capacity === 'number' && state.capacity > 0) setCapacity(state.capacity)
          const players = state?.players
          if (!players) return
          const next: Record<string, Player> = {}
          players.forEach((p: any, id: string) => {
            next[id] = { id, name: p.name, seat: p.seat, x: p.x, y: p.y, yaw: typeof p.yaw === 'number' ? p.yaw : undefined, color: p.color, look: p.look || undefined }
          })
          setPlayers(next)
        }
        room.onStateChange(sync)
        sync()
        room.onMessage('emote', (m: { playerId: string; emoji: string }) => pushEmote(m.playerId, m.emoji))
        room.onMessage('wave', (m: { playerId: string; targetId?: string }) => pushWave(m.playerId, m.targetId))
        room.onMessage('hype', (m: { level: number }) => setHype({ id: nextId(), level: m.level }))
        room.onMessage('system', (m: { text: string }) => pushChat({ kind: 'system', name: '', text: m.text }))
        room.onMessage('room_chat', (m: { playerId?: string; name: string; text: string }) => {
          pushChat({ kind: 'room', name: m.name, text: m.text })
          if (m.playerId) showBubble(m.playerId, m.text)
        })
        room.onMessage('twitch_chat', (m: { user: string; text: string; color?: string }) =>
          pushChat({ kind: 'twitch', name: m.user, text: m.text, color: m.color }))
        room.onMessage('twitch_update', (m: Omit<TwitchUpdate, 'id' | 'receivedAt'>) => pushUpdate(m))
        room.onMessage('direct', (message: DirectMessage) => setDirectMessages((items) => [...items.slice(-79), message]))
        room.onMessage('planet_invite', (message: PlanetInvite) => setPlanetInvite(message))
        room.onMessage('planet_visit_request', (message: PlanetVisitRequest) => setVisitRequest(message))
        room.onLeave(() => {
          if (roomRef.current === room) roomRef.current = null
          if (!cancelled) { goOfflineOnce(); scheduleRetry() }
        })
      })
      .catch((err) => {
        console.warn('[room] join failed, going offline', err)
        clearTimeout(timeout)
        goOfflineOnce()
        scheduleRetry()
      })
    connect()

    return () => {
      cancelled = true
      clearTimeout(timeout)
      if (retry) clearTimeout(retry)
      if (timer) clearInterval(timer)
      roomRef.current?.leave()
      roomRef.current = null
    }
  }, [channel, name, capacityHint, pushChat, pushEmote, pushWave, pushUpdate, showBubble])

  const sit = useCallback((seat: number) => {
    if (roomRef.current) return roomRef.current.send('sit', { seat })
    setPlayers((p) => {
      if (Object.values(p).some((x) => x.seat === seat)) return p
      return { ...p, me: { ...p.me, seat } }
    })
  }, [])

  const move = useCallback((x: number, y: number, yaw = 0) => {
    if (roomRef.current) return roomRef.current.send('move', { x, y, yaw })
    setPlayers((p) => ({ ...p, me: { ...p.me, seat: -1, x, y, yaw } }))
  }, [])

  const emote = useCallback((emoji: string) => {
    if (roomRef.current) return roomRef.current.send('emote', { emoji })
    pushEmote('me', emoji)
  }, [pushEmote])

  const wave = useCallback((targetId?: string) => {
    if (roomRef.current) return roomRef.current.send('wave', { targetId })
    pushWave('me', targetId)
  }, [pushWave])

  const say = useCallback((text: string) => {
    if (roomRef.current) return roomRef.current.send('chat', { text })
    // Never present a local demo echo as Twitch chat: it is misleading when the
    // game server/Twitch credentials are unavailable.
    pushChat({ kind: 'system', name: '', text: 'Message not sent: reconnect to the Orbyx server to post in Twitch chat.' })
  }, [name, pushChat, showBubble])
  const direct = useCallback((targetId: string, text: string) => {
    const clean = text.trim().slice(0, 280); if (!clean || !targetId) return
    if (roomRef.current) return roomRef.current.send('direct', { targetId, text: clean })
    const target = playersRef.current[targetId]; const mine = playersRef.current.me
    if (target && mine) { setDirectMessages((items) => [...items, { id: nextId(), fromId: 'me', from: mine.name, toId: targetId, to: target.name, text: clean }]); if(targetId==='bot0')setTimeout(()=>setDirectMessages(items=>[...items,{id:nextId(),fromId:'bot0',from:target.name,toId:'me',to:mine.name,text:'Test bot received that — messaging works.'}]),450) }
  }, [])
  const invitePlanet = useCallback((targetId:string,code:string)=>{if(roomRef.current)roomRef.current.send('planet_invite',{targetId,code});else if(targetId==='bot0')pushChat({kind:'system',name:'',text:'QuestBot accepted the test planet invite.'})},[pushChat])
  const requestVisit = useCallback((targetId:string)=>{if(roomRef.current)roomRef.current.send('planet_visit_request',{targetId});else if(targetId==='bot0')pushChat({kind:'system',name:'',text:'QuestBot received the test visit request.'})},[pushChat])

  return { players, selfId, chat, updates, directMessages, planetInvite, setPlanetInvite, visitRequest, setVisitRequest, emotes, waves, bubbles, hype, mode, capacity, sit, move, emote, wave, say, direct, invitePlanet, requestVisit }
}
