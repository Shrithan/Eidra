import { createHash } from 'node:crypto';
export const PLANETS=[
 {id:'chatterra',name:'Chatterra',color:'#ed9fbb',categories:['Just Chatting','Talk Shows & Podcasts','IRL','Travel & Outdoors','Pools, Hot Tubs, and Beaches']},
 {id:'arcadia',name:'Arcadia',color:'#ffbd59',categories:['Retro','Street Fighter 6','Tekken 8','Super Smash Bros. Ultimate','Super Mario Bros. Wonder','Celeste','Hollow Knight','Fighting Games','Platformers']},
 {id:'warzone',name:'Warzone',color:'#f16c5b',categories:['VALORANT','Valorant','Counter-Strike 2','Fortnite','Apex Legends','Overwatch 2','Overwatch','Call of Duty: Warzone','PUBG: BATTLEGROUNDS','Escape from Tarkov','Tom Clancy’s Rainbow Six Siege','Deadlock']},
 {id:'mythos',name:'Mythos',color:'#b59afa',categories:['World of Warcraft','Final Fantasy XIV Online','Diablo IV','Path of Exile','Path of Exile 2','Elden Ring','Baldur’s Gate 3','Genshin Impact','Hades II','Lost Ark','Old School RuneScape']},
 {id:'strata',name:'Strata',color:'#8bb9f4',categories:['League of Legends','Dota 2','Teamfight Tactics','Hearthstone','Chess','StarCraft II','Age of Empires II','Magic: The Gathering','Strategy','Card Games']},
 {id:'harmonia',name:'Harmonia',color:'#92e3ce',categories:['Music','Art','DJs','Makers & Crafting','Software and Game Development']},
 {id:'craftus',name:'Craftus',color:'#b2ce76',categories:['Minecraft','Rust','ARK: Survival Ascended','Terraria','Stardew Valley','The Sims 4','Grand Theft Auto V','Cities: Skylines II','Farming Simulator 25','DayZ','Palworld']},
 {id:'odyssey',name:'Odyssey',color:'#b9abc8',categories:[]},
] as const;
export type PlanetId=typeof PLANETS[number]['id'];
export const PLANET_IDS=PLANETS.map(p=>p.id) as [PlanetId,...PlanetId[]];
const categories=new Map(PLANETS.flatMap(p=>p.categories.map(c=>[c.toLowerCase(),p.id] as const)));
export function planetForGame(game:string):PlanetId{return categories.get(game.toLowerCase())??'odyssey';}
export function planetSlot(login:string){const bytes=createHash('sha256').update(login.toLowerCase()).digest();const u=bytes.readUInt32BE(0)/0x100000000,v=bytes.readUInt32BE(4)/0x100000000;return {lat:Math.round(Math.asin(2*u-1)*180/Math.PI*100)/100,lng:Math.round((360*v-180)*100)/100};}
