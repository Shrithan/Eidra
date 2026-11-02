/** What each genre planet looks like: its land, sea, sky, trees and the colours of its buildings. */
export type Theme = {
  id: string // matches the genre group id
  name: string
  tagline: string
  color: string // signature colour: legend, orbit ring, label
  sky: { zenith: string; horizon: string }
  fog: string
  atmosphere: string
  water: string
  sun: { color: string; intensity: number }
  palette: { sand: string; bed: string; grassA: string; grassB: string; forest: string; rockA: string; rockB: string; snow: string }
  trees: { oak: string[]; pine: string[] }
  houses: string[] // facade colours, one picked per game so every district has variety
  mountains: number // 1 = normal; more = taller ranges
  lakes: number // 1 = normal; more = more water
  forest: number // 1 = normal tree density
}

export const THEMES: Theme[] = [
  {
    id: 'chat', name: 'Chat Isles', tagline: 'Sunny islands where everyone talks', color: '#ff9f6b',
    sky: { zenith: '#4aa8ff', horizon: '#ffe6c8' }, fog: '#ffe9d2', atmosphere: '#ffc98a', water: '#33c9d6', sun: { color: '#fff1d0', intensity: 2.4 },
    palette: { sand: '#f3e2a9', bed: '#2f9fb0', grassA: '#8fd35a', grassB: '#6fc24f', forest: '#43a049', rockA: '#9a8f86', rockB: '#7f766e', snow: '#fffaf0' },
    trees: { oak: ['#7fd250', '#5cc04a', '#a3d94f', '#ffb347'], pine: ['#3b8f48', '#2f7d46'] },
    houses: ['#ffb36b', '#ff8f8f', '#ffd36b', '#8fd9a8', '#7fc8ff'],
    mountains: 1.4, lakes: 1.6, forest: 1.1,
  },
  {
    id: 'creative', name: 'Creator Coast', tagline: 'Blossom meadows and pastel towns', color: '#f56bd6',
    sky: { zenith: '#7dbaff', horizon: '#ffd6ec' }, fog: '#ffe3f1', atmosphere: '#ff9ed2', water: '#7fb2ff', sun: { color: '#fff0f6', intensity: 2.3 },
    palette: { sand: '#f7e3c2', bed: '#5a7fd0', grassA: '#b9e58a', grassB: '#9ad27c', forest: '#6bb86e', rockA: '#b8a6c8', rockB: '#9a88ac', snow: '#ffffff' },
    trees: { oak: ['#ff9ec8', '#ffb7d9', '#f78fb8', '#ffd1e6'], pine: ['#7bbf86', '#5fae79'] },
    houses: ['#ffb3d9', '#c9b3ff', '#b3e3ff', '#ffe0a8', '#b8f0cf'],
    mountains: 1.4, lakes: 1.2, forest: 1.2,
  },
  {
    id: 'strategy', name: 'Strategy Heights', tagline: 'Cold highlands of stone and snow', color: '#5aa9ff',
    sky: { zenith: '#5aa0ff', horizon: '#dff0ff' }, fog: '#e4f2ff', atmosphere: '#8fc8ff', water: '#6fb7e8', sun: { color: '#f4f9ff', intensity: 2.2 },
    palette: { sand: '#e3dcc6', bed: '#3b86b8', grassA: '#9ccf8a', grassB: '#82bd7b', forest: '#2f7d57', rockA: '#9aa7b8', rockB: '#7e8b9d', snow: '#ffffff' },
    trees: { oak: ['#6ebd7a', '#59a96f'], pine: ['#2f7d57', '#26684c', '#3a8c66'] },
    houses: ['#8fb8ff', '#c4d6ff', '#e8eefc', '#7fa0d9', '#a8d0ff'],
    mountains: 1.5, lakes: 1.0, forest: 0.9,
  },
  {
    id: 'rpg', name: 'Realm of Quests', tagline: 'Misty mountains and deep forests', color: '#a98bff',
    sky: { zenith: '#6a58c8', horizon: '#e8c8ff' }, fog: '#d9c9f5', atmosphere: '#b79cff', water: '#5a6bd8', sun: { color: '#ffeedd', intensity: 2.1 },
    palette: { sand: '#d9cfae', bed: '#3a4aa8', grassA: '#6fae5a', grassB: '#5a9a52', forest: '#2f6f4a', rockA: '#7d7a90', rockB: '#656278', snow: '#efeaff' },
    trees: { oak: ['#4f9a56', '#3f8a4c', '#7d5bd6'], pine: ['#1f5f45', '#2a6e4f'] },
    houses: ['#cfc6e0', '#b7a7e6', '#d8cfae', '#a9b6d9', '#e6d3b3'],
    mountains: 1.6, lakes: 0.8, forest: 1.4,
  },
  {
    id: 'sandbox', name: 'Sandbox Lands', tagline: 'Green blocks as far as you can see', color: '#6bdc8b',
    sky: { zenith: '#4fb3ff', horizon: '#d6f0ff' }, fog: '#e0f3ff', atmosphere: '#8fe0ff', water: '#3ba7ff', sun: { color: '#fff6dc', intensity: 2.4 },
    palette: { sand: '#f0dd9a', bed: '#2f86c8', grassA: '#6cd04a', grassB: '#58bb43', forest: '#3d9a3f', rockA: '#8f9199', rockB: '#767880', snow: '#f7fbff' },
    trees: { oak: ['#5cc04a', '#4fb046', '#78cf55', '#3f9e4a'], pine: ['#2f7d46', '#3a8f4a'] },
    houses: ['#7ed957', '#ffd23f', '#ff9a3c', '#6bc5ff', '#b98cff'],
    mountains: 1.4, lakes: 1.0, forest: 1.3,
  },
  {
    id: 'arcade', name: 'Arcade & Sports', tagline: 'Canyon mesas and neon-bright towns', color: '#ffd84d',
    sky: { zenith: '#ff9e5e', horizon: '#ffe3a8' }, fog: '#ffe2b8', atmosphere: '#ffb05a', water: '#2fd0c0', sun: { color: '#fff0c8', intensity: 2.6 },
    palette: { sand: '#f1c36b', bed: '#1f9a98', grassA: '#d9b25a', grassB: '#c9a24d', forest: '#8f9d3e', rockA: '#c47a4a', rockB: '#a8633d', snow: '#fff2d8' },
    trees: { oak: ['#a7b43f', '#d9a441', '#8fa03a'], pine: ['#6f8a35', '#7d9a3a'] },
    houses: ['#ff4fa3', '#ffd23f', '#3df5ff', '#ff8f3d', '#a26bff'],
    mountains: 1.4, lakes: 0.6, forest: 0.5,
  },
  {
    id: 'shooter', name: 'Battlefront', tagline: 'Dusty ridgelines and ruined towns', color: '#ff5a5a',
    sky: { zenith: '#8e9eb0', horizon: '#e6d9c4' }, fog: '#d8cdbb', atmosphere: '#d9b79a', water: '#5c7f8f', sun: { color: '#ffe6c4', intensity: 2.2 },
    palette: { sand: '#c9b58b', bed: '#3f5f6e', grassA: '#8b8f5a', grassB: '#767a4c', forest: '#5b6a3a', rockA: '#8a7f78', rockB: '#6c625c', snow: '#e8e4dc' },
    trees: { oak: ['#6f7f3c', '#8a8f4a', '#5f6e35'], pine: ['#4a5a30', '#566a35'] },
    houses: ['#9aa384', '#bdb08a', '#8a8f8f', '#c97c5d', '#7d8794'],
    mountains: 1.4, lakes: 0.5, forest: 0.6,
  },
  {
    id: 'horror', name: 'Haunted Hollow', tagline: 'Twilight forests and fog', color: '#18d6c4',
    sky: { zenith: '#2a1b4d', horizon: '#c46aa8' }, fog: '#6a4a7a', atmosphere: '#a36bff', water: '#2b6f78', sun: { color: '#b9aaff', intensity: 1.5 },
    palette: { sand: '#8a8f7a', bed: '#1d4a55', grassA: '#3d6b5a', grassB: '#34594c', forest: '#1f4a45', rockA: '#56516a', rockB: '#454058', snow: '#cfd6f0' },
    trees: { oak: ['#3a5f4f', '#2f4f45', '#5a3f6e'], pine: ['#1f4a45', '#26473f'] },
    houses: ['#6d5a8c', '#8f6fa8', '#4f6b7a', '#a05a7e', '#5c4b73'],
    mountains: 1.4, lakes: 1.2, forest: 1.5,
  },
  {
    id: 'other', name: 'Frontier', tagline: 'A grey moon at the edge of the system', color: '#9aa0aa',
    sky: { zenith: '#1a2030', horizon: '#6a7388' }, fog: '#7b8498', atmosphere: '#8f9bb5', water: '#4a6a80', sun: { color: '#ffffff', intensity: 2.2 },
    palette: { sand: '#b7b9bd', bed: '#3a4f60', grassA: '#8d9298', grassB: '#7b8087', forest: '#6a7078', rockA: '#a3a7ad', rockB: '#868a91', snow: '#f0f2f5' },
    trees: { oak: ['#7a8a6a', '#6a7a5c'], pine: ['#5a6a58', '#4f5f52'] },
    houses: ['#b8c0cc', '#9aa6b5', '#d6dae0', '#a8b4c8'],
    mountains: 1.4, lakes: 0.3, forest: 0.3,
  },
]

export const themeOf = (groupId: string) => THEMES.find((t) => t.id === groupId) ?? THEMES[THEMES.length - 1]

/** The look of a player's own planet: soft meadows and a warm sky. */
export const homeTheme = (name: string): Theme => ({
  id: 'home', name: name || 'My planet', tagline: 'A planet of your own', color: '#ffd84d',
  sky: { zenith: '#5aa8ff', horizon: '#ffe9b8' }, fog: '#fff0cc', atmosphere: '#ffd58a', water: '#3cc8d8', sun: { color: '#fff3d6', intensity: 2.4 },
  palette: { sand: '#f6e6b0', bed: '#2f9fb4', grassA: '#86d65a', grassB: '#6cc552', forest: '#3f9f4a', rockA: '#a69a8e', rockB: '#877d72', snow: '#fffaf0' },
  trees: { oak: ['#7fd250', '#ffb347', '#ff8fa8', '#a3d94f'], pine: ['#3b8f48', '#2f7d46'] },
  houses: ['#ffb36b', '#8fd9a8', '#7fc8ff', '#ffd36b', '#ff9fc2'],
  mountains: 1.4, lakes: 1.3, forest: 1.1,
})
