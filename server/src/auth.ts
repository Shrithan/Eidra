import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import type { Express, Response } from 'express';
import type { IncomingHttpHeaders } from 'node:http';
import { configured, credentials, token, helix, validateCredential } from './twitch.js';
import { sessions, persistSessions, follows } from './storage.js';
import type { Identity } from './theater.js';
import { watchTotals } from './watch.js';
import { ORIGINS, PUBLIC_URL, IS_DEPLOYED } from './origins.js';
const origin=PUBLIC_URL;
const redirect=process.env.TWITCH_REDIRECT_URI || (IS_DEPLOYED ? PUBLIC_URL+'/auth/twitch/callback' : 'http://localhost:2567/auth/twitch/callback');
const secret=process.env.SESSION_SECRET || randomBytes(32).toString('hex');
if(configured && !process.env.SESSION_SECRET) throw new Error('SESSION_SECRET is required with Twitch credentials');
const sign=(id:string)=>createHmac('sha256',secret).update(id).digest('hex');
function session(headers:IncomingHttpHeaders) {
  const value=headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('watchworld='))?.slice(11);
  if(!value)return; const [id,mac]=value.split('.');const expected=sign(id);
  if(!/^[a-f0-9]{64}$/.test(id) || !mac || !/^[a-f0-9]{64}$/.test(mac) || mac.length!==expected.length || !timingSafeEqual(Buffer.from(mac),Buffer.from(expected)))return;
  const s=sessions.get(id); if(!s || s.expires<Date.now()){sessions.delete(id);return;}return {id,...s};
}
export function identity(headers:IncomingHttpHeaders) {const user=session(headers)?.user;return user && credentials.has(user.id)?user:undefined;}
function createSession(res:Response,user?:Identity,state?:string) {
  const id=randomBytes(32).toString('hex');const maxAge=state?600000:86400000;
  sessions.set(id,{user,state,expires:Date.now()+maxAge});
  persistSessions();
  res.cookie('watchworld',`${id}.${sign(id)}`,{httpOnly:true,sameSite:'lax',secure:redirect.startsWith('https:'),maxAge,path:'/'});
}
export function installAuth(app:Express) {
  app.use(['/auth','/api/me'],(req,res,next)=>{
    if(!configured){res.status(501).json({error:'Twitch is not configured'});return;}
    if(!['GET','HEAD','OPTIONS'].includes(req.method) && req.headers.origin && !ORIGINS.includes(req.headers.origin)){res.status(403).json({error:'Origin denied'});return;}next();
  });
  app.get('/auth/twitch',(req,res)=>{
    // the login state travels in a signed cookie, so it survives the server restarting or a new deploy while you are on Twitch's page
    const state=randomBytes(32).toString('hex');
    res.cookie('watchworld_oauth',`${state}.${sign('oauth:'+state)}`,{httpOnly:true,sameSite:'lax',secure:redirect.startsWith('https:'),maxAge:600000,path:'/'});
    res.redirect('https://id.twitch.tv/oauth2/authorize?'+new URLSearchParams({client_id:process.env.TWITCH_CLIENT_ID!,redirect_uri:redirect,response_type:'code',scope:'user:read:chat user:write:chat user:read:follows',state}));
  });
  app.get('/auth/twitch/callback',async(req,res)=>{
    const raw=req.headers.cookie?.split(';').map(c=>c.trim()).find(c=>c.startsWith('watchworld_oauth='))?.slice(17);
    const [state,mac]=(raw??'').split('.');
    const good=Boolean(state && mac && /^[a-f0-9]{64}$/.test(state) && /^[a-f0-9]{64}$/.test(mac) && timingSafeEqual(Buffer.from(mac),Buffer.from(sign('oauth:'+state))));
    res.clearCookie('watchworld_oauth',{path:'/'});
    if(!good || typeof req.query.state!=='string' || req.query.state!==state){
      const reason=!raw?'no login cookie came back':!good?'login cookie was not valid':'state did not match';
      console.warn('[auth] oauth state rejected:',reason);
      // a first attempt can lose its cookie (cold start, a second tab, a blocked cookie): start over once before giving up
      if(!req.headers.cookie?.includes('watchworld_oauth_retry=1')){
        res.cookie('watchworld_oauth_retry','1',{httpOnly:true,sameSite:'lax',secure:redirect.startsWith('https:'),maxAge:120000,path:'/'});
        res.redirect('/auth/twitch');return;
      }
      res.clearCookie('watchworld_oauth_retry',{path:'/'});
      res.status(400).json({error:'Invalid OAuth state',reason});return;
    }
    res.clearCookie('watchworld_oauth_retry',{path:'/'});
    if(typeof req.query.code!=='string'){res.status(400).json({error:'OAuth authorization denied'});return;}
    try {
      const t=await token({grant_type:'authorization_code',code:req.query.code,redirect_uri:redirect});
      const r=await helix('users',t.access_token);const u=r.data[0];
      const user={id:u.id,login:u.login,displayName:u.display_name,avatar:u.profile_image_url};
      credentials.set(u.id,{user,access:t.access_token,refresh:t.refresh_token,expires:Date.now()+t.expires_in*1000});
      // This endpoint is user-scoped; retain only public channel names for the UI.
      try { const followed=await helix(`channels/followed?user_id=${encodeURIComponent(u.id)}&first=100`,t.access_token);
        follows.set(u.id,Array.isArray(followed.data)?followed.data.map((x:{broadcaster_login?:unknown;broadcaster_name?:unknown})=>({login:String(x.broadcaster_login??'').toLowerCase(),displayName:String(x.broadcaster_name??'')})).filter((x:{login:string})=>x.login):[]);
      } catch { follows.set(u.id,[]); }
      persistSessions();
      createSession(res,user);res.redirect(IS_DEPLOYED?'/':origin+'/');
    }catch{res.status(502).json({error:'Twitch authentication failed'});}
  });
  app.get('/api/me',async(req,res)=>{const user=identity(req.headers);if(!user){res.status(401).json({error:'Login required'});return;}try{await validateCredential(user.id);res.json(user);}catch{res.status(401).json({error:'Please log in with Twitch again'});}});
  app.get('/api/me/watch',(req,res)=>{const user=identity(req.headers);if(!user){res.status(401).json({error:'Login required'});return;}res.set('Cache-Control','no-store');res.json(watchTotals(user.id));});
  app.get('/api/me/follows',(req,res)=>{const user=identity(req.headers);if(!user){res.status(401).json({error:'Login required'});return;}res.json(follows.get(user.id)??[]);});
  app.post('/auth/logout',(req,res)=>{const s=session(req.headers);if(s){sessions.delete(s.id);if(s.user && ![...sessions.values()].some(other=>other.user?.id===s.user?.id))credentials.delete(s.user.id);}persistSessions();res.clearCookie('watchworld',{path:'/'});res.sendStatus(204);});
}
const cleanup=setInterval(()=>{for(const [id,s]of sessions)if(s.expires<Date.now())sessions.delete(id);for(const id of credentials.keys())if(![...sessions.values()].some(s=>s.user?.id===id))credentials.delete(id);persistSessions();},60000);cleanup.unref();
