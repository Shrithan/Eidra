import { colyseusUrl } from "../net";
import { useCallback, useEffect, useRef, useState } from "react";
import { Client, type Room } from "colyseus.js";
import type { Phase, GameResult } from "@stations/model";
import type { Station } from "./placement";
export type Player = {
  id: string;
  name: string;
  bot: boolean;
  ready: boolean;
  connected: boolean;
  spectator: boolean;
};
export type Snapshot = Record<string, unknown>;
export type Result = GameResult & {
  practice: boolean;
  voided: boolean;
  seed: number;
};
export function useStation() {
  const room = useRef<Room | null>(null),
    generation = useRef(0);
  const [phase, setPhase] = useState<Phase>("lobby"),
    [snapshot, setSnapshot] = useState<Snapshot>({}),
    [result, setResult] = useState<Result | null>(null),
    [players, setPlayers] = useState<Player[]>([]),
    [timer, setTimer] = useState(0),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [joined, setJoined] = useState(false),
    [practice, setPractice] = useState(false),
    [sessionId, setSessionId] = useState("");
  const leave = useCallback(() => {
    generation.current++;
    const r = room.current;
    room.current = null;
    void r?.leave();
    setJoined(false);
    setPlayers([]);
    setSnapshot({});
    setResult(null);
  }, []);
  const join = useCallback(
    async (station: Station, spectator = false) => {
      leave();
      const ticket = generation.current;
      setError("");
      setPhase("lobby");
      try {
        const client = new Client(colyseusUrl());
        const r = await client.joinOrCreate("station", {
          planet: station.def.planet,
          game: station.def.id,
          copy: station.copy,
          name: "Visitor",
          spectator,
        });
        function attach(r: Room) {
          if (ticket !== generation.current) {
            void r.leave();
            return;
          }
          room.current = r;
          setSessionId(r.sessionId);
          setJoined(true);
          setError("");
          r.onStateChange((state) => {
            if (room.current !== r) return;
            setPlayers(Array.from(state.players.values()) as Player[]);
            setTimer(state.timer);
            setPhase(state.phase);
          });
          r.onMessage(
            "phase",
            (data: { phase: Phase; timer: number; practice: boolean }) => {
              setPhase(data.phase);
              setTimer(data.timer);
              setPractice(data.practice);
              if (data.phase === "countdown" || data.phase === "lobby")
                setResult(null);
            },
          );
          r.onMessage("snapshot", (data: Snapshot) => setSnapshot(data));
          r.onMessage("result", (data: Result) => setResult(data));
          r.onMessage("ping", (data: { nonce: number }) =>
            r.send("pong", data),
          );
          r.onMessage("event", (data: { type: string; text: string }) => {
            if (data.type === "bet") setNotice(data.text);
            if (data.type === "error" || data.type === "invalid")
              setError(data.text);
          });
          r.onError((_code, message) =>
            setError(message || "Connection error"),
          );
          r.onLeave((code) => {
            if (room.current !== r) return;
            if (code === 1000 || code === 4008) {
              room.current = null;
              setJoined(false);
              setError(
                code === 4008
                  ? "Disconnected for excessive input"
                  : "Disconnected",
              );
              return;
            }
            const token = r.reconnectionToken;
            room.current = null;
            setJoined(false);
            setError("Reconnecting…");
            void (async () => {
              const until = Date.now() + 19000;
              while (ticket === generation.current && Date.now() < until) {
                try {
                  attach(await client.reconnect(token));
                  return;
                } catch {
                  await new Promise((resolve) => setTimeout(resolve, 750));
                }
              }
              if (ticket === generation.current)
                setError("Connection lost. Leave and join the station again.");
            })();
          });
        }
        attach(r);
      } catch (e) {
        if (ticket === generation.current)
          setError(e instanceof Error ? e.message : "Could not join");
      }
    },
    [leave],
  );
  const send = useCallback(
    (value: unknown) => room.current?.send("input", value),
    [],
  );
  const ready = useCallback(
    (solo = false) => room.current?.send("ready", { practice: solo }),
    [],
  );
  useEffect(() => leave, [leave]);
  return {
    phase,
    notice,
    bet: (playerId: string) =>
      room.current?.send("bet", { playerId, amount: 5 }),
    snapshot,
    send,
    result,
    players,
    timer,
    error,
    joined,
    practice,
    sessionId,
    join,
    leave,
    ready,
  };
}
