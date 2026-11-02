import { mulberry32 } from "./engines/common.js";
import { ORIGINS, BOTS } from "../origins.js";
import { roundDuration } from "../../../shared/stations/duration.js";
import { Room, type Client, type AuthContext } from "@colyseus/core";
import { Schema, MapSchema, defineTypes } from "@colyseus/schema";
import { gamesById } from "./catalog.js";
import { identity } from "../auth.js";
import { createRunner, type Runner } from "./engines/index.js";
import { botInput } from "./bots.js";
import { stationStore } from "./store.js";
import { randomInt, randomUUID } from "node:crypto";
import { db } from "../db.js";
import { weekOf } from "./persistence.js";
import { queryStreams, parseStreamQuery } from "../streams.js";
import type { GameDef } from "../../../shared/stations/model.d.ts";
export class StationPlayer extends Schema {
  id = "";
  name = "";
  bot = false;
  ready = false;
  connected = true;
  spectator = false;
}
defineTypes(StationPlayer, {
  id: "string",
  name: "string",
  bot: "boolean",
  ready: "boolean",
  connected: "boolean",
  spectator: "boolean",
});
export class StationState extends Schema {
  phase = "lobby";
  planet = "";
  game = "";
  copy = 0;
  timer = 0;
  players = new MapSchema<StationPlayer>();
}
defineTypes(StationState, {
  phase: "string",
  planet: "string",
  game: "string",
  copy: "number",
  timer: "number",
  players: { map: StationPlayer },
});
export const occupancy = new Map<
  string,
  {
    roomId: string;
    planet: string;
    game: string;
    copy: number;
    players: number;
    maxPlayers: number;
    phase: string;
    timer: number;
    stationId: string;
  }
>();
export function cleanText(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .trim()
    .slice(0, 80);
}
export class StationRoom extends Room<StationState> {
  private def!: GameDef;
  private runner?: Runner;
  private kicked = new Set<string>();
  private bets = new Map<string, { playerId: string; amount: number }>();
  private users = new Map<string, { id: string; name: string }>();
  private botIds = new Set<string>();
  private practice = false;
  private deadline = 0;
  private frames = 0;
  private snapshotAccumulator = 0;
  private seed = 0;
  private roundId = "";
  private lastSnapshots = new Map<string, string>();
  private latency = new Map<
    string,
    { nonce: number; sent: number; ms: number }
  >();
  private limits = new Map<
    string,
    { start: number; count: number; violations: number }
  >();
  onCreate(options: { planet?: unknown; game?: unknown; copy?: unknown }) {
    const def =
      typeof options.game === "string"
        ? gamesById.get(options.game)
        : undefined;
    if (!def || options.planet !== def.planet)
      throw new Error("Unknown station game or planet");
    const copy = options.copy ?? 0;
    if (
      typeof copy !== "number" ||
      !Number.isSafeInteger(copy) ||
      copy < 0 ||
      copy > 100000
    )
      throw new Error("Invalid station copy");
    this.def = def;
    this.maxClients =
      def.maxPlayers + (def.id === "arcade.street-brawl" ? 30 : 0);
    const roomId = `station-${def.planet}-${def.id.replaceAll(".", "-")}-${copy}`;
    if (occupancy.has(roomId))
      throw new Error("Station is full or already reserved");
    this.roomId = roomId;
    const state = new StationState();
    state.planet = def.planet;
    state.game = def.id;
    state.copy = copy;
    this.setState(state);
    this.setMetadata({
      planet: def.planet,
      game: def.id,
      copy,
      stationId: `station:${def.planet}:${def.id}:${copy}`,
    });
    this.onMessage("*", (client, type, data: unknown) => {
      if (!this.accept(client, data)) return;
      if (type === "leave") {
        void client.leave();
        return;
      }
      if (type === "ready") {
        const player = this.state.players.get(client.sessionId);
        if (player?.spectator) return;
        if (player) player.ready = true;
        if (
          BOTS &&
          this.state.phase === "lobby" &&
          this.activePlayers().length === 1 &&
          (data as { practice?: unknown })?.practice === true
        ) {
          this.practice = true;
          this.fillBots();
          if (this.def.id !== "arcade.street-brawl") void this.lock();
          this.countdown();
        }
      } else if (type === "input") {
        if (
          this.state.phase === "play" ||
          (this.state.phase === "results" && this.def.id === "rpg.quest-board")
        ) {
          this.runner?.input(client.sessionId, data, Date.now());
          if (this.state.phase === "results")
            for (const c of this.clients)
              c.send("snapshot", this.runner?.snapshot(c.sessionId));
        }
      } else if (type === "pong") {
        const timing = this.latency.get(client.sessionId);
        if (timing && (data as { nonce?: unknown })?.nonce === timing.nonce) {
          timing.ms = Math.min(250, (Date.now() - timing.sent) / 2);
          this.runner?.latency(client.sessionId, timing.ms);
        }
      } else if (type === "bet") {
        const bet = (data ?? {}) as { playerId?: unknown; amount?: unknown };
        const p = this.state.players.get(client.sessionId);
        if (
          !p?.spectator ||
          this.state.phase !== "play" ||
          this.state.timer < this.def.roundSeconds - 5 ||
          typeof bet.playerId !== "string" ||
          typeof bet.amount !== "number" ||
          !Number.isSafeInteger(bet.amount) ||
          bet.amount < 1 ||
          bet.amount > 100 ||
          this.state.players.get(bet.playerId)?.spectator !== false ||
          this.bets.has(client.sessionId)
        ) {
          this.violation(client);
          return;
        }
        this.bets.set(client.sessionId, {
          playerId: bet.playerId,
          amount: bet.amount,
        });
        client.send("event", {
          type: "bet",
          text: "Prediction locked. These are cosmetic room coins.",
        });
      } else this.violation(client);
    });
    this.setSimulationInterval(() => this.step(), 50);
    this.publish();
  }
  onAuth(
    _client: Client,
    options: { copy?: unknown; spectator?: unknown },
    context: AuthContext,
  ) {
    if (
      context.headers.origin &&
      !ORIGINS.includes(context.headers.origin)
    )
      throw new Error("Origin denied");
    if ((options.copy ?? 0) !== this.state.copy)
      throw new Error("Use an explicit station copy");
    if (options.spectator === true) {
      if (this.def.id !== "arcade.street-brawl")
        throw new Error("Spectators are only available for Street Brawl");
    } else if (
      this.activePlayers().length >= this.def.maxPlayers ||
      this.state.phase === "play" ||
      this.state.phase === "results"
    )
      throw new Error("Fighter seats are full; choose Watch fight");
    return identity(context.headers) ?? true;
  }
  onJoin(client: Client, options: { name?: unknown; spectator?: unknown }) {
    const player = new StationPlayer();
    player.id = client.sessionId;
    player.spectator = options.spectator === true;
    const user = identityFromAuth(client.auth);
    player.name =
      cleanText(
        user?.displayName ??
          (typeof options.name === "string" ? options.name : "Guest"),
      ) || "Guest";
    this.state.players.set(client.sessionId, player);
    this.limits.set(client.sessionId, {
      start: Date.now(),
      count: 0,
      violations: 0,
    });
    const auth = client.auth as { id?: string };
    if (user && typeof auth.id === "string")
      this.users.set(client.sessionId, { id: auth.id, name: player.name });
    client.send("phase", {
      phase: this.state.phase,
      timer: this.state.timer,
      available: true,
      practice: this.practice,
    });
    if (this.activePlayers().length >= this.def.minPlayers) this.countdown();
    this.publish();
  }
  async onLeave(client: Client, consented: boolean) {
    const player = this.state.players.get(client.sessionId);
    if (!consented && player && !this.kicked.has(client.sessionId)) {
      player.connected = false;
      this.publish();
      try {
        await this.allowReconnection(client, 20);
        player.connected = true;
        this.publish();
        return;
      } catch {
        /* Seat reservation expired. */
      }
    }
    this.users.delete(client.sessionId);
    this.limits.delete(client.sessionId);
    this.latency.delete(client.sessionId);
    if (
      BOTS &&
      !player?.spectator &&
      this.state.phase === "play" &&
      ["arena", "track", "pulse"].includes(this.def.engine)
    ) {
      this.practice = true;
      this.botIds.add(client.sessionId);
      if (player) {
        player.bot = true;
        player.name = "Bot";
        player.connected = true;
      }
      this.runner?.depart(client.sessionId, true);
    } else {
      this.state.players.delete(client.sessionId);
      this.runner?.depart(client.sessionId, false);
    }
    const humans = [...this.state.players.values()].filter(
      (p) => !p.bot && !p.spectator && p.connected,
    ).length;
    if (!humans) {
      void this.disconnect();
      return;
    }
    if (
      this.state.phase === "play" &&
      !this.practice &&
      this.activePlayers().length < this.def.minPlayers
    )
      this.finish(true);
    if (
      this.state.phase === "countdown" &&
      this.activePlayers().length < this.def.minPlayers
    )
      this.phase("lobby", 0);
    this.publish();
  }
  onDispose() {
    occupancy.delete(this.roomId);
  }
  private activePlayers() {
    return [...this.state.players.values()].filter((p) => !p.spectator);
  }
  private fillBots() {
    while (
      this.activePlayers().length <
      Math.min(
        this.def.maxPlayers,
        Math.max(
          this.def.minPlayers,
          this.def.engine === "siege" && Array.isArray(this.def.config.roles)
            ? this.def.config.roles.length
            : 0,
        ),
      )
    ) {
      const p = new StationPlayer();
      p.id = `bot-${this.state.players.size}`;
      p.name = "Bot";
      p.bot = true;
      p.ready = true;
      this.state.players.set(p.id, p);
      this.botIds.add(p.id);
    }
  }
  private phase(phase: string, seconds: number) {
    this.state.phase = phase;
    this.deadline = Date.now() + seconds * 1000;
    this.state.timer = seconds;
    this.broadcast("phase", {
      phase,
      timer: seconds,
      available: true,
      practice: this.practice,
    });
  }
  private countdown() {
    if (this.state.phase === "lobby") this.phase("countdown", 15);
    if (this.activePlayers().length >= this.def.maxPlayers) this.start();
  }
  private streamerNames() {
    const names = queryStreams(parseStreamQuery({ limit: "100" }))
      .streams.filter((s) => /chat|irl|talk|podcast/i.test(s.game))
      .map((s) => s.displayName);
    const rng = mulberry32(this.seed);
    for (let i = names.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [names[i], names[j]] = [names[j], names[i]];
    }
    return names.slice(0, 4);
  }
  private start() {
    this.seed = randomInt(0, 2147483647);
    this.roundId = randomUUID();
    this.bets.clear();
    this.lastSnapshots.clear();
    const gameDef =
      this.def.id === "chat.who-said-it"
        ? {
            ...this.def,
            config: {
              ...this.def.config,
              streamers: this.streamerNames(),
            },
          }
        : this.def;
    this.runner = createRunner(
      gameDef,
      this.activePlayers().map((p) => ({
        id: p.id,
        name: p.name,
        bot: p.bot,
      })),
      this.seed,
    );
    this.practice ||= this.botIds.size > 0;
    if (this.def.id !== "arcade.street-brawl") void this.lock();
    this.phase("play", roundDuration(this.def, this.activePlayers().length));
    this.broadcast("event", {
      type: "start",
      text: this.practice
        ? "Practice round — no coins or weekly scores"
        : "Round started",
      seed: this.seed,
    });
  }
  private finish(voided = false) {
    if (this.state.phase !== "play" || !this.runner) return;
    for (const client of this.clients)
      client.send("snapshot", this.runner.snapshot(client.sessionId));
    const result = this.runner.result();
    if (!voided) {
      try {
        stationStore.record(
          this.roundId,
          this.def.id,
          result,
          this.users,
          this.practice,
        );
      } catch {
        this.broadcast("event", {
          type: "error",
          text: "Score could not be saved",
        });
      }
      if (this.def.id === "other.map-makers" && !this.practice) {
        const snap = this.runner.snapshot(result.rank[0]) as {
          winnerPath?: unknown;
        };
        if (snap.winnerPath)
          db.prepare("INSERT OR REPLACE INTO station_art VALUES(?,?,?)").run(
            this.def.id,
            weekOf(),
            JSON.stringify(snap.winnerPath),
          );
      }
    }
    for (const [id, bet] of this.bets) {
      const client = this.clients.find((c) => c.sessionId === id);
      client?.send("event", {
        type: "bet",
        text:
          !voided && result.rank[0] === bet.playerId
            ? `Correct prediction: ${bet.amount * 2} cosmetic room coins`
            : "Prediction finished. Cosmetic coins never change your wallet.",
      });
    }
    this.broadcast("result", {
      ...result,
      practice: this.practice,
      voided,
      seed: this.seed,
    });
    this.phase("results", 8);
  }
  private step() {
    const now = Date.now();
    this.frames++;
    this.state.timer =
      this.state.phase === "lobby"
        ? 0
        : Math.max(0, (this.deadline - now) / 1000);
    if (this.state.phase === "countdown" && now >= this.deadline) this.start();
    if (this.state.phase === "play" && this.runner) {
      if (this.def.space === "3d" || this.frames % 4 === 0)
        for (const id of this.botIds)
          this.runner.input(
            id,
            botInput(
              this.def,
              this.runner.snapshot(id),
              id,
              this.seed + this.frames,
            ),
            now,
          );
      this.runner.tick(0.05, now);
      this.snapshotAccumulator += 0.05;
      if (
        this.snapshotAccumulator >= (this.def.space === "3d" ? 1 / 15 : 0.1)
      ) {
        this.snapshotAccumulator -= this.def.space === "3d" ? 1 / 15 : 0.1;
        for (const client of this.clients) {
          const snapshot = this.runner.snapshot(client.sessionId);
          const { elapsed: _elapsed, ...changed } = snapshot as Record<
            string,
            unknown
          >;
          const serialized = JSON.stringify({
            ...changed,
            second: Math.floor(Number(_elapsed ?? 0)),
          });
          const fast =
            this.def.space === "3d" ||
            ["arena", "track", "pulse"].includes(this.def.engine);
          if (fast || this.lastSnapshots.get(client.sessionId) !== serialized) {
            client.send("snapshot", snapshot);
            this.lastSnapshots.set(client.sessionId, serialized);
          }
        }
      }
      if (this.runner.done() || now >= this.deadline) this.finish();
    }
    if (this.state.phase === "results" && now >= this.deadline) {
      for (const id of this.botIds) this.state.players.delete(id);
      this.botIds.clear();
      this.practice = false;
      this.runner = undefined;
      for (const p of this.state.players.values()) p.ready = false;
      void this.unlock();
      this.phase("lobby", 0);
      if (this.activePlayers().length >= this.def.minPlayers) this.countdown();
    }
    if (this.frames % 100 === 0)
      for (const c of this.clients) {
        const timing = {
          nonce: randomInt(1, 2147483647),
          sent: now,
          ms: this.latency.get(c.sessionId)?.ms ?? 0,
        };
        this.latency.set(c.sessionId, timing);
        c.send("ping", { nonce: timing.nonce });
      }
    this.publish();
  }
  private violation(client: Client) {
    const limit = this.limits.get(client.sessionId);
    if (limit && ++limit.violations >= 5) {
      this.kicked.add(client.sessionId);
      void client.leave(4008);
    } else
      client.send("event", {
        type: "invalid",
        text: "Invalid or excessive station input",
      });
  }
  private accept(client: Client, data: unknown): boolean {
    const limit = this.limits.get(client.sessionId);
    if (!limit) return false;
    const now = Date.now();
    if (now - limit.start >= 1000) {
      limit.start = now;
      limit.count = 0;
    }
    let valid = false;
    try {
      const encoded = JSON.stringify(data ?? null);
      valid =
        Buffer.byteLength(encoded) <= 512 &&
        !/[\u0000-\u001f\u007f-\u009f]/.test(
          typeof data === "string" ? data : "",
        );
      const check = (value: unknown): boolean =>
        typeof value === "string"
          ? value.length <= 80 && !/[\u0000-\u001f\u007f-\u009f]/.test(value)
          : Array.isArray(value)
            ? value.every(check)
            : value !== null && typeof value === "object"
              ? Object.values(value).every(check)
              : typeof value === "number"
                ? Number.isFinite(value)
                : true;
      valid = valid && check(data);
    } catch {
      valid = false;
    }
    if (++limit.count > 60 || !valid) {
      this.violation(client);
      return false;
    }
    return true;
  }
  private publish() {
    occupancy.set(this.roomId, {
      roomId: this.roomId,
      planet: this.state.planet,
      game: this.def.id,
      copy: this.state.copy,
      players: this.activePlayers().length,
      maxPlayers: this.def.maxPlayers,
      phase: this.state.phase,
      timer: this.state.timer,
      stationId: `station:${this.state.planet}:${this.def.id}:${this.state.copy}`,
    });
  }
}
function identityFromAuth(auth: unknown): { displayName: string } | undefined {
  if (
    auth &&
    typeof auth === "object" &&
    "displayName" in auth &&
    typeof auth.displayName === "string"
  )
    return { displayName: auth.displayName };
}
