import { mkdirSync, readFileSync, writeFileSync, renameSync, chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import type { Identity } from './theater.js';
export const dataDir=process.env.WATCHWORLD_DATA_DIR ? resolve(process.env.WATCHWORLD_DATA_DIR) : fileURLToPath(new URL('../data/',import.meta.url));
type Session={user?:Identity;state?:string;expires:number};
export type Credential={user:Identity;access:string;refresh:string;expires:number};
const path=resolve(dataDir,'sessions.json');
let saved:{sessions?:[string,Session][];credentials?:[string,Credential][];hypeRelayTimes?:[string,number][]}={};
try{saved=JSON.parse(readFileSync(path,'utf8'));chmodSync(path,0o600);}catch(e:any){if(e.code!=='ENOENT')throw new Error('Cannot load session store');}
export const hypeRelayTimes=new Map<string,number>(saved.hypeRelayTimes || []);
export const sessions=new Map<string,Session>(saved.sessions || []);
export const credentials=new Map<string,Credential>(saved.credentials || []);
export function persistSessions(){
  mkdirSync(dataDir,{recursive:true,mode:0o700});
  writeFileSync(path+'.tmp',JSON.stringify({sessions:[...sessions],credentials:[...credentials],hypeRelayTimes:[...hypeRelayTimes]}),{mode:0o600});
  renameSync(path+'.tmp',path);
}
