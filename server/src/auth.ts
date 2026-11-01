import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import type { Express, Response } from 'express';
import type { IncomingHttpHeaders } from 'node:http';
import { configured, credentials, token, helix, validateCredential } from './twitch.js';
import { sessions, persistSessions } from './storage.js';
import type { Identity } from './theater.js';
const origin='http://localhost:5173';
const redirect=process.env.TWITCH_REDIRECT_URI || 'http://localhost:2567/auth/twitch/callback';
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
    if(!['GET','HEAD','OPTIONS'].includes(req.method) && req.headers.origin && req.headers.origin!==origin){res.status(403).json({error:'Origin denied'});return;}next();
  });
  app.get('/auth/twitch',(req,res)=>{
    const old=session(req.headers);if(old)sessions.delete(old.id);
    const state=randomBytes(32).toString('hex');createSession(res,undefined,state);
    res.redirect('https://id.twitch.tv/oauth2/authorize?'+new URLSearchParams({client_id:process.env.TWITCH_CLIENT_ID!,redirect_uri:redirect,response_type:'code',scope:'user:read:chat user:write:chat',state}));
  });
  app.get('/auth/twitch/callback',async(req,res)=>{
    const s=session(req.headers);
    if(!s?.state || typeof req.query.state!=='string' || req.query.state!==s.state){res.status(400).json({error:'Invalid OAuth state'});return;}
    sessions.delete(s.id);persistSessions();
    if(typeof req.query.code!=='string'){res.status(400).json({error:'OAuth authorization denied'});return;}
    try {
      const t=await token({grant_type:'authorization_code',code:req.query.code,redirect_uri:redirect});
      const r=await helix('users',t.access_token);const u=r.data[0];
      const user={id:u.id,login:u.login,displayName:u.display_name,avatar:u.profile_image_url};
      credentials.set(u.id,{user,access:t.access_token,refresh:t.refresh_token,expires:Date.now()+t.expires_in*1000});
      createSession(res,user);res.redirect(origin+'/');
    }catch{res.status(502).json({error:'Twitch authentication failed'});}
  });
  app.get('/api/me',async(req,res)=>{const user=identity(req.headers);if(!user){res.status(401).json({error:'Login required'});return;}try{await validateCredential(user.id);res.json(user);}catch{res.status(401).json({error:'Please log in with Twitch again'});}});
  app.post('/auth/logout',(req,res)=>{const s=session(req.headers);if(s){sessions.delete(s.id);if(s.user && ![...sessions.values()].some(other=>other.user?.id===s.user?.id))credentials.delete(s.user.id);}persistSessions();res.clearCookie('watchworld',{path:'/'});res.sendStatus(204);});
}
const cleanup=setInterval(()=>{for(const [id,s]of sessions)if(s.expires<Date.now())sessions.delete(id);for(const id of credentials.keys())if(![...sessions.values()].some(s=>s.user?.id===id))credentials.delete(id);persistSessions();},60000);cleanup.unref();
