import './env.js';
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { sendChat, configured, relayHype } from './twitch.js';
import { subscribeChat } from './bridge.js';
import { Theater, services } from './theater.js';
import { queryStreams, parseStreamQuery, getPlanets, indexStatus, startPoller, setCity, deleteCity, refreshStreams, channelCapacity } from './streams.js';
import { refreshChannel } from './catalog.js';
import { startResearch } from './research.js';
import { installAuth, identity } from './auth.js';
export const app = express();
app.use(cors({ origin: 'http://localhost:5173', credentials: true, exposedHeaders:['X-Total-Count','X-Has-More','X-Watchworld-Mock'] }));
app.use(express.json({limit:'8kb'}));
app.get('/api/streams', (req,res)=>{try{const result=queryStreams(parseStreamQuery(req.query));res.set({'X-Total-Count':String(result.total),'X-Has-More':String(result.hasMore),'X-Watchworld-Mock':String(!configured)}).json(result.streams);}catch(error){res.status(400).json({error:(error as Error).message});}});
app.get('/api/planets',(_req,res)=>res.json(getPlanets()));
app.get('/api/index-status',(_req,res)=>res.json(indexStatus()));
installAuth(app);
app.post('/api/me/location',async(req,res)=>{
  const user=identity(req.headers);if(!user){res.status(401).json({error:'Login required'});return;}
  try{await setCity(user.id,user.login,req.body);await refreshChannel(user.login).catch(()=>{});res.sendStatus(204);}catch{res.status(400).json({error:'Expected city and valid lat/lng'});}
});
app.delete('/api/me/location',async(req,res)=>{
  const user=identity(req.headers);if(!user){res.status(401).json({error:'Login required'});return;}
  try{await deleteCity(user.id);res.sendStatus(204);}catch{res.status(500).json({error:'Could not remove city'});}
});
startPoller();
startResearch();
services.authenticate=async request=>identity(request.headers);
services.capacity=channelCapacity;
services.chat=sendChat;
services.sendingConfigured=configured;
services.hype=relayHype;
services.subscribe=subscribeChat;
const httpServer=createServer(app);
matchMaker.controller.getCorsHeaders=()=>({'Access-Control-Allow-Origin':'http://localhost:5173'});
export const game=new Server({transport:new WebSocketTransport({server:httpServer})});
game.define('theater',Theater).filterBy(['channel']);
await game.listen(2567);
console.log('Watchworld :2567');
