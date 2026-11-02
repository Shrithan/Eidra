import { useEffect, useMemo, useState } from 'react'
import { searchAll } from './sphereSearch'
import { streamsNow } from './streamStore'
import { clearHome, getHome, inviteLink, saveHome, subscribeHome, type Home } from './homePlanet'

/** Build your own planet: pick the streamers who live on it, name it, and send the link to friends. */
export function HomePanel({ onClose, onFly }: { onClose: () => void; onFly: () => void }) {
  const [home, setHome] = useState<Home | null>(getHome())
  useEffect(() => subscribeHome(() => setHome(getHome())), [])
  const [name, setName] = useState(home?.name ?? 'My planet')
  const [q, setQ] = useState('')
  const [copied, setCopied] = useState(false)
  const logins = home?.logins ?? []
  const byLogin = useMemo(() => new Map(streamsNow().map((s) => [s.login.toLowerCase(), s])), [home])
  const hits = useMemo(() => (q.trim().length >= 2 ? searchAll(streamsNow(), q).filter((h) => h.kind === 'streamer').slice(0, 6) : []), [q])
  const live = logins.filter((l) => byLogin.has(l))
  const link = home ? inviteLink(home) : ''
  const add = (login: string) => saveHome(name, [...logins, login])
  const remove = (login: string) => (logins.length > 1 ? saveHome(name, logins.filter((l) => l !== login)) : clearHome())
  return (
    <div className="home-backdrop" onClick={onClose}>
      <section className="home-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="My planet">
        <header>
          <h2>{home?.visiting ? `Visiting ${home.name}` : 'My planet'}</h2>
          <button onClick={onClose} aria-label="Close">✕</button>
        </header>
        {home?.visiting ? (
          <>
            <p>This is a friend's planet. Everything here works like any other planet, with games to play together.</p>
            <div className="home-row">
              <button onClick={() => { saveHome(home.name, home.logins); }}>Keep a copy as my planet</button>
              <button onClick={() => { onFly(); onClose() }}>Fly there</button>
            </div>
          </>
        ) : (
          <>
            <p>Add the streamers you want on your own planet. It works like the big planets, only smaller, with its own games, and you can invite your friends.</p>
            <label>Planet name
              <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onBlur={() => home && saveHome(name, logins)} />
            </label>
            <label>Add a streamer
              <input value={q} placeholder="Search a streamer or game" onChange={(e) => setQ(e.target.value)} />
            </label>
            {hits.length > 0 && (
              <ul className="home-hits">
                {hits.map((h) => h.kind === 'streamer' && (
                  <li key={h.stream.login}>
                    <span><b>{h.stream.displayName}</b> <small>{h.game} · {h.stream.viewers.toLocaleString()} watching</small></span>
                    <button disabled={logins.includes(h.stream.login.toLowerCase())} onClick={() => { add(h.stream.login); setQ('') }}>
                      {logins.includes(h.stream.login.toLowerCase()) ? 'Added' : 'Add'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="home-count">{live.length} streamer{live.length === 1 ? '' : 's'} on your planet{logins.length > live.length ? ` · ${logins.length - live.length} offline right now` : ''}</div>
            <ul className="home-list">
              {logins.map((l) => {
                const s = byLogin.get(l)
                return (
                  <li key={l} className={s ? '' : 'off'}>
                    <span><b>{s?.displayName ?? l}</b> <small>{s ? `${s.game} · ${s.viewers.toLocaleString()} watching` : 'offline'}</small></span>
                    <button onClick={() => remove(l)} aria-label={`Remove ${l}`}>✕</button>
                  </li>
                )
              })}
              {!logins.length && <li className="off"><span>No streamers yet. Search above to add the first one.</span></li>}
            </ul>
            {home && (
              <div className="home-row">
                <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
                <button onClick={() => { void navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) }) }}>{copied ? 'Copied!' : 'Copy invite link'}</button>
              </div>
            )}
            <div className="home-row">
              {home && live.length > 0 && <button className="primary" onClick={() => { onFly(); onClose() }}>Fly to my planet</button>}
              {home && <button className="danger" onClick={() => { clearHome(); onClose() }}>Delete planet</button>}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
