export type LocationSource = 'optin' | 'language' | 'seed' | 'researched'
export type GeoLocation = { lat:number; lng:number; city:string; source:LocationSource; country?:string; confidence?:'high'|'medium'|'low'|'none'; precision?:'city'|'country'; sources?:{url:string;title:string}[] }
export type Stream = {
  id: string
  login: string
  displayName: string
  title: string
  game: string
  viewers: number
  avgViewers?: number
  language: string
  thumbnail?: string
  location: GeoLocation | null
  planet?: { id:string; slot:{lat:number;lng:number} }
  demo?: boolean
}

export type Me = { id: string; login: string; displayName: string; avatar?: string }

const s = (
  login: string, displayName: string, title: string, game: string, viewers: number,
  language: string, city: string, lat: number, lng: number,
  source: 'optin' | 'language' | 'seed' = 'seed',
): Stream => ({
  id: login, login, displayName, title, game, viewers, avgViewers: viewers, language,
  location: { lat, lng, city, source },
})

// Used when the server is down or returns nothing, so the web app never blocks on the backend.
export const MOCK_STREAMS: Stream[] = [
  s('watchworld_cozy', 'CozyCorner', 'A small cozy demo', 'Art', 18, 'en', 'Madison', 43.07, -89.4),
  s('watchworld_arcade', 'ArcadeFriends', 'Community games demo', 'Retro', 120, 'en', 'Chicago', 41.88, -87.63),
  s('shroud', 'shroud', 'Ranked grind', 'Valorant', 21400, 'en', 'Vancouver', 49.28, -123.12),
  s('pokimane', 'pokimane', 'Chatting and games', 'Just Chatting', 18200, 'en', 'Los Angeles', 34.05, -118.24),
  s('xqc', 'xQc', 'Variety', 'Just Chatting', 40100, 'en', 'Montreal', 45.5, -73.57),
  s('ibai', 'ibai', 'La Velada', 'Just Chatting', 52000, 'es', 'Madrid', 40.42, -3.7),
  s('gaules', 'gaules', 'CS2 major', 'Counter-Strike 2', 33800, 'pt', 'Sao Paulo', -23.55, -46.63),
  s('kato_junichi0817', 'kato', 'Shogi night', 'Just Chatting', 4100, 'ja', 'Tokyo', 35.68, 139.69),
  s('auronplay', 'AuronPlay', 'Late show', 'Just Chatting', 27600, 'es', 'Mexico City', 19.43, -99.13),
  s('kaicenat', 'KaiCenat', 'Subathon', 'Just Chatting', 61000, 'en', 'New York', 40.71, -74.0),
  s('sodapoppin', 'sodapoppin', 'Wow classic', 'World of Warcraft', 9100, 'en', 'Austin', 30.27, -97.74),
  s('rubius', 'Rubius', 'Minecraft', 'Minecraft', 15300, 'es', 'Buenos Aires', -34.6, -58.38),
  s('lirik', 'LIRIK', 'Indie night', 'Variety', 7300, 'en', 'Madison', 43.07, -89.4, 'seed'),
  s('ninja', 'Ninja', 'Fortnite zero build', 'Fortnite', 11200, 'en', 'Chicago', 41.88, -87.63),
  s('ilgamer', 'ilGamer', 'Notte di FIFA', 'EA FC', 2900, 'it', 'Rome', 41.9, 12.5, 'language'),
  s('dakotaz', 'dakotaz', 'Apex', 'Apex Legends', 6400, 'en', 'Sydney', -33.87, 151.21),
  s('vedal987', 'Vedal', 'Neuro sings', 'Just Chatting', 12800, 'en', 'London', 51.51, -0.13),
  s('lagos_live', 'LagosLive', 'IRL market tour', 'IRL', 1800, 'en', 'Lagos', 6.52, 3.38, 'seed'),
  s('mumbai_plays', 'MumbaiPlays', 'Hindi gaming', 'BGMI', 5200, 'hi', 'Mumbai', 19.08, 72.88),
  s('seoul_cafe', 'SeoulCafe', 'Study with me', 'Just Chatting', 3400, 'ko', 'Seoul', 37.57, 126.98),
]


// Synthetic off-Earth demos; never pretend these are real geographic locations.
for(const [genre,game] of [['chatterra','Just Chatting'],['arcadia','Retro'],['warzone','VALORANT'],['mythos','World of Warcraft'],['strata','Chess'],['harmonia','Music'],['craftus','Minecraft'],['odyssey','Special Events']]) {
  MOCK_STREAMS.push({planet:{id:genre,slot:{lat:Math.sin(genre.length*7)*50,lng:genre.charCodeAt(0)*7%360-180}},id:'watchworld_'+genre,login:'watchworld_'+genre,displayName:genre[0].toUpperCase()+genre.slice(1)+' Demo',title:'Explore a genre planet',game,viewers:80,avgViewers:80,language:'en',location:null,demo:true});
}

export type StreamFilters={limit?:number;offset?:number;planet?:string;language?:string;game?:string;q?:string;bbox?:string}
export async function fetchStreams(filters:StreamFilters={},signal?:AbortSignal):Promise<{streams:Stream[];mock:boolean;total:number;hasMore:boolean}> {
 const params=new URLSearchParams(Object.entries(filters).filter(([,v])=>v!==undefined && v!=='').map(([k,v])=>[k,String(v)]))
 try {
  const response=await fetch('/api/streams?'+params,{signal});if(!response.ok)throw new Error(String(response.status))
  const streams=await response.json() as Stream[];if(!Array.isArray(streams))throw new Error('Invalid streams')
  return {streams,mock:response.headers.get('X-Watchworld-Mock')==='true',total:Number(response.headers.get('X-Total-Count')??streams.length),hasMore:response.headers.get('X-Has-More')==='true'}
 }catch(error){
  if(signal?.aborted)throw error
  const candidates=MOCK_STREAMS.filter(s=>(!filters.planet||filters.planet==='all'||(filters.planet==='earth'?Boolean(s.location):s.planet?.id===filters.planet))&&(!filters.q||`${s.login} ${s.displayName} ${s.game} ${s.location?.city??''}`.toLowerCase().includes(filters.q.toLowerCase())))
  const offset=filters.offset??0,limit=filters.limit??2000;return {streams:candidates.slice(offset,offset+limit),mock:true,total:candidates.length,hasMore:offset+limit<candidates.length}
 }
}
export async function fetchPlanets(signal?:AbortSignal){const r=await fetch('/api/planets',{signal});if(!r.ok)throw new Error('Cannot load planets');return r.json() as Promise<{id:string;name:string;color:string;count:number}[]>}
export async function fetchMe(): Promise<Me | null> {
  try {
    const r = await fetch('/api/me')
    return r.ok ? ((await r.json()) as Me) : null
  } catch {
    return null
  }
}
export async function fetchWatch(): Promise<Record<string,number>> { try { const r=await fetch('/api/me/watch',{credentials:'include'}); return r.ok ? await r.json() as Record<string,number> : {} } catch { return {} } }
export type TwitchFollow = { login:string; displayName:string }
export async function fetchFollows(): Promise<TwitchFollow[]> { try { const r=await fetch('/api/me/follows'); return r.ok ? await r.json() as TwitchFollow[] : [] } catch { return [] } }

export type CityChoice = { city: string; country: string; lat: number; lng: number }
async function locationRequest(method: 'POST' | 'DELETE', city?: CityChoice) {
  const response = await fetch('/api/me/location', {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...(city ? { body: JSON.stringify({ city: city.city, lat: city.lat, lng: city.lng }) } : {}),
  })
  if (!response.ok) {
    if (response.status === 401) throw new Error('Please log in with Twitch again.')
    if (response.status === 501) throw new Error('Twitch login is not configured yet.')
    throw new Error('Could not update your city. Please try again.')
  }
}
export const saveLocation = (city: CityChoice) => locationRequest('POST', city)
export const removeLocation = () => locationRequest('DELETE')
export async function logout() {
  const response = await fetch('/auth/logout', { method: 'POST', credentials: 'include' })
  if (!response.ok) throw new Error('Could not log out. Please try again.')
}
