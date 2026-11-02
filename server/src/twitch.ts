import type { Identity } from './theater.js';
export const configured=Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);
const clientId=process.env.TWITCH_CLIENT_ID!;
const clientSecret=process.env.TWITCH_CLIENT_SECRET!;
import { credentials, persistSessions, hypeRelayTimes } from './storage.js';
export { credentials } from './storage.js';
export async function token(body:Record<string,string>) {
  const r=await fetch('https://id.twitch.tv/oauth2/token',{method:'POST',body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,...body}),signal:AbortSignal.timeout(15000)});
  if(!r.ok) throw new Error(`Twitch token ${r.status}`); return r.json() as Promise<{access_token:string;refresh_token:string;expires_in:number}>;
}
let appToken='', appExpires=0;
export async function appAccess(force=false) {
  if(force || Date.now()>appExpires) { const t=await token({grant_type:'client_credentials'});appToken=t.access_token;appExpires=Date.now()+(t.expires_in-60)*1000; }
  return appToken;
}
const refreshes=new Map<string,Promise<string>>();
export async function userAccess(id:string,force=false):Promise<string> {
  const c=credentials.get(id); if(!c) throw new Error('Login required');
  if(!force && Date.now()<c.expires-60000) return c.access;
  if(refreshes.has(id)) return refreshes.get(id)!;
  const promise=(async()=>{const t=await token({grant_type:'refresh_token',refresh_token:c.refresh});c.access=t.access_token;c.refresh=t.refresh_token;c.expires=Date.now()+t.expires_in*1000;persistSessions();return c.access;})();
  refreshes.set(id,promise);try{return await promise;}finally{refreshes.delete(id);}
}
let helixReady=0;
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
export async function helix(path:string,access:string,body?:unknown,method?:'DELETE') {
  const verb=method??(body?'POST':'GET');
  for(let attempt=0;;attempt++) {
    if(verb==='GET' && helixReady>Date.now())await delay(helixReady-Date.now());
    const r=await fetch(`https://api.twitch.tv/helix/${path}`,{method:verb,headers:{'Client-Id':clientId,Authorization:`Bearer ${access}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
    const reset=Number(r.headers.get('Ratelimit-Reset'))*1000;
    if(r.headers.get('Ratelimit-Remaining')==='0' && reset>Date.now())helixReady=reset+250;
    if(r.status===429 && verb==='GET' && attempt<5) {
      const retry=Number(r.headers.get('Retry-After'))*1000;
      helixReady=Math.max(helixReady,Date.now()+Math.max(250,retry||0,reset-Date.now()||1000));
      await r.body?.cancel();continue;
    }
    if(!r.ok) {const error=new Error(`Twitch API ${r.status}`) as Error & {status:number};error.status=r.status;throw error;}
    return r.status===204?{}:r.json() as Promise<any>;
  }
}
export async function helixApp(path:string) {
 try{return await helix(path,await appAccess());}catch(error:any){if(error.status!==401)throw error;return helix(path,await appAccess(true));}
}
const users=new Map<string,string>();
export async function broadcaster(channel:string) {
  if(users.has(channel)) return users.get(channel)!;
  const result=await helix(`users?login=${encodeURIComponent(channel)}`,await appAccess());
  const id=result.data?.[0]?.id;if(!id) throw new Error('Unknown channel');users.set(channel,id);return id as string;
}
export async function sendChat(channel:string,user:Identity|undefined,text:string) {
  if(!configured) return;
  if(!user?.id) throw new Error('Login required');
  const body={broadcaster_id:await broadcaster(channel),sender_id:user.id,message:text};
  let result;
  try{result=await helix('chat/messages',await userAccess(user.id),body);}catch(error:any){if(error.status!==401)throw error;result=await helix('chat/messages',await userAccess(user.id,true),body);}
  if(!result.data?.[0]?.is_sent) throw new Error('Twitch rejected message');
}

const hypeSent=hypeRelayTimes;
export async function relayHype(channel:string,users:Identity[]) {
  if(process.env.HYPE_TO_TWITCH!=='1' || !configured || Date.now()-(hypeSent.get(channel)??0)<120000)return;
  const user=users.find(u=>credentials.has(u.id));if(!user)return;
  hypeSent.set(channel,Date.now());persistSessions();
  await sendChat(channel,user,'The Watchworld theatre is hyped! 🔥');
}

const validated=new Map<string,number>();
export async function validateCredential(id:string) {
  if(Date.now()-(validated.get(id)??0)<3600000)return;
  let access=await userAccess(id);
  let response=await fetch('https://id.twitch.tv/oauth2/validate',{headers:{Authorization:`OAuth ${access}`},signal:AbortSignal.timeout(15000)});
  if(response.status===401){
    access=await userAccess(id,true);
    response=await fetch('https://id.twitch.tv/oauth2/validate',{headers:{Authorization:`OAuth ${access}`},signal:AbortSignal.timeout(15000)});
  }
  if(!response.ok)throw new Error('Twitch session validation failed');
  const result=await response.json() as {user_id:string;client_id:string;scopes:string[]};
  if(result.user_id!==id || result.client_id!==clientId || !['user:read:chat','user:write:chat','user:read:follows'].every(s=>result.scopes.includes(s)))throw new Error('Twitch authorization changed');
  validated.set(id,Date.now());
}
const validationTimer=setInterval(()=>{for(const id of credentials.keys())void validateCredential(id).catch(()=>console.warn('A Twitch session needs reauthorization'));},3600000);validationTimer.unref();
