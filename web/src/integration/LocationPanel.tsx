import { useState } from 'react'
import { removeLocation, saveLocation, type Me, type Stream } from '../api'
import cities from './cities.json'
import './integration.css'

type Props = { me: Me; streams: Stream[]; onChanged: () => Promise<void> }
export default function LocationPanel({ me, streams, onChanged }: Props) {
  const own = streams.find(s => s.login === me.login && s.location?.source === 'optin')
  const [choice, setChoice] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState(false)
  async function update(remove = false) {
    const city = cities.find(c => `${c.city}, ${c.country}` === choice)
    if (!remove && !city) { setError(true); setStatus('Choose a city from the list.'); return }
    setBusy(true); setError(false); setStatus('')
    try {
      if (remove) await removeLocation()
      else await saveLocation(city!)
      await onChanged()
      setStatus(remove ? 'Your city opt-in was removed. A separately researched public location may still appear.' : 'City saved. Your pin appears while your Twitch stream is live.')
      if (remove) setChoice('')
    } catch (e) { setError(true); setStatus((e as Error).message) }
    finally { setBusy(false) }
  }
  return <details className="ww-location">
    <summary>Your map location{own ? ` · ${own.location!.city}` : ''}</summary>
    <div className="ww-location-body">
      <p>Share a city for your live stream. We never ask for your address. Other viewers see an approximate, jittered city pin.</p>
      <label htmlFor="ww-city">City</label>
      <input id="ww-city" list="ww-cities" placeholder="Search 230 cities" value={choice} onChange={e => setChoice(e.target.value)} disabled={busy} autoComplete="off" />
      <datalist id="ww-cities">{cities.map(c => <option key={`${c.city}-${c.country}`} value={`${c.city}, ${c.country}`} />)}</datalist>
      <div className="ww-location-actions">
        <button disabled={busy || !choice} onClick={() => void update()}>Share this city</button>
        <button disabled={busy} onClick={() => void update(true)}>Remove me from the map</button>
      </div>
      <small>Public researched locations and labeled demos may remain after removing an opt-in.</small>
      <p role={error ? 'alert' : 'status'} className={error ? 'ww-error' : 'ww-status'}>{busy ? 'Updating…' : status}</p>
    </div>
  </details>
}
