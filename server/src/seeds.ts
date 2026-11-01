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
  MOCK_STREAMS.push({id:'watchworld_'+genre,login:'watchworld_'+genre,displayName:genre[0].toUpperCase()+genre.slice(1)+' Demo',title:'Explore a genre planet',game,viewers:80,avgViewers:80,language:'en',location:null,demo:true});
}
