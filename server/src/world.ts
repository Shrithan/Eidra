import { Room, type Client, type AuthContext } from '@colyseus/core';
import { Schema, MapSchema, defineTypes } from '@colyseus/schema';
import { identity } from './auth.js';
import { cleanLook } from './look.js';

/** Everyone standing on one planet (or one friend group's planet): positions, names and world chat. See CONTRACT.md. */
export class WorldPlayer extends Schema {
  name = '';
  color = '#ffffff';
  px = 0; py = 1; pz = 0;
  fx = 0; fy = 0; fz = -1;
  alt = 0;
  /** One id per browser, so two tabs of the same browser are one person. */
  uid = '';
  /** The outfit, as JSON: see look.ts. */
  look = '';
}
defineTypes(WorldPlayer, { look: 'string', uid: 'string', name: 'string', color: 'string', px: 'number', py: 'number', pz: 'number', fx: 'number', fy: 'number', fz: 'number', alt: 'number' });
export class WorldState extends Schema {
  players = new MapSchema<WorldPlayer>();
}
defineTypes(WorldState, { players: { map: WorldPlayer } });

import { ORIGINS as origins } from './origins.js';
const clean = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : '';
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const vec = (v: unknown): [number, number, number] | null => {
  if (!Array.isArray(v) || v.length !== 3) return null;
  const [x, y, z] = v.map(num);
  if (x === null || y === null || z === null) return null;
  const l = Math.hypot(x, y, z);
  return l > 1e-6 ? [x / l, y / l, z / l] : null;
};
const EMOTES = new Set(['wave', 'laugh', 'heart', 'cheer', 'like', 'dance']);
const COLORS = ['#ff6b6b', '#ffb86b', '#ffd84d', '#6bdc8b', '#18d6c4', '#5aa9ff', '#a98bff', '#f56bd6'];
const colorOf = (id: string) => COLORS[[...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % COLORS.length];

export class WorldRoom extends Room<WorldState> {
  maxClients = 100;
  private moves = new Map<string, { start: number; count: number }>();
  private lastChat = new Map<string, number>();
  private lastEmote = new Map<string, number>();

  onCreate(options: { shard?: unknown }) {
    const shard = typeof options.shard === 'string' && /^[a-z0-9-]{1,40}$/.test(options.shard) ? options.shard : 'main';
    this.setState(new WorldState());
    this.setMetadata({ shard });
    this.setPatchRate(50);
    this.onMessage('move', (client, data: { p?: unknown; f?: unknown; alt?: unknown }) => {
      const now = Date.now();
      const m = this.moves.get(client.sessionId) ?? { start: now, count: 0 };
      if (now - m.start > 1000) { m.start = now; m.count = 0 }
      if (++m.count > 25) return;
      this.moves.set(client.sessionId, m);
      const p = vec(data?.p), f = vec(data?.f), alt = num(data?.alt);
      const player = this.state.players.get(client.sessionId);
      if (!player || !p || !f || alt === null) return;
      [player.px, player.py, player.pz] = p;
      [player.fx, player.fy, player.fz] = f;
      player.alt = Math.max(0, Math.min(200, alt));
    });
    this.onMessage('emote', (client, data: { kind?: unknown; to?: unknown }) => {
      const kind = typeof data?.kind === 'string' && EMOTES.has(data.kind) ? data.kind : '';
      if (!kind) return;
      const now = Date.now();
      if (now - (this.lastEmote.get(client.sessionId) ?? 0) < 700) return;
      this.lastEmote.set(client.sessionId, now);
      const to = typeof data?.to === 'string' && this.state.players.has(data.to) ? data.to : undefined;
      this.broadcast('emote', { id: client.sessionId, name: this.state.players.get(client.sessionId)?.name ?? 'Guest', kind, to });
    });
    this.onMessage('chat', (client, data: { text?: unknown }) => {
      const text = clean(data?.text, 200);
      if (!text) return;
      const now = Date.now();
      if (now - (this.lastChat.get(client.sessionId) ?? 0) < 1500) {
        client.send('system', { text: 'You are sending messages too fast' });
        return;
      }
      this.lastChat.set(client.sessionId, now);
      this.broadcast('chat', { id: client.sessionId, name: this.state.players.get(client.sessionId)?.name ?? 'Guest', text });
    });
    this.onMessage('look', (client, data) => { const p = this.state.players.get(client.sessionId); if (p) p.look = cleanLook(data); });
    this.onMessage('direct',(client,data:{targetId?:unknown;text?:unknown})=>{
      const targetId=typeof data?.targetId==='string'?data.targetId:'';const text=clean(data?.text,280);const from=this.state.players.get(client.sessionId),to=this.state.players.get(targetId);
      if(!from||!to||!text||targetId===client.sessionId)return;
      const payload={fromId:client.sessionId,from:from.name,toId:targetId,to:to.name,text};client.send('direct',payload);this.clients.find(c=>c.sessionId===targetId)?.send('direct',payload);
    });
    this.onMessage('planet_invite',(client,data:{targetId?:unknown;code?:unknown})=>{const targetId=typeof data?.targetId==='string'?data.targetId:'';const code=typeof data?.code==='string'?data.code:'';const from=this.state.players.get(client.sessionId);if(!from||!this.state.players.has(targetId)||code.length>3000)return;this.clients.find(c=>c.sessionId===targetId)?.send('planet_invite',{from:from.name,code});});
  }

  onAuth(_client: Client, _options: unknown, context: AuthContext) {
    if (context.headers.origin && !origins.includes(context.headers.origin)) throw new Error('Origin denied');
    return identity(context.headers) ?? true;
  }

  onJoin(client: Client, options: { name?: unknown; uid?: unknown; look?: unknown }) {
    const player = new WorldPlayer();
    player.look = cleanLook(options?.look);
    player.uid = clean(options?.uid, 40);
    const user = client.auth && typeof client.auth === 'object' ? (client.auth as { displayName?: string }) : undefined;
    player.name = user?.displayName ? clean(user.displayName, 40) : `${clean(options?.name, 30) || 'Guest'} (guest)`;
    player.color = colorOf(client.sessionId);
    this.state.players.set(client.sessionId, player);
    client.send('system', { text: `${this.state.players.size} here` });
    this.broadcast('system', { text: `${player.name} joined` }, { except: client });
  }

  onLeave(client: Client) {
    const left = this.state.players.get(client.sessionId)?.name;
    this.state.players.delete(client.sessionId);
    if (left) this.broadcast('system', { text: `${left} left` });
    this.lastEmote.delete(client.sessionId);
    this.moves.delete(client.sessionId);
    this.lastChat.delete(client.sessionId);
  }
}
