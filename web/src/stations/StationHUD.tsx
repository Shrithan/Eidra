import { BOTS } from "../net";
import WorldGame from "./world3d/WorldGame";
import { useRef, useEffect, useState } from "react";
import type { Station } from "./placement";
import { useStation } from "./useStation";
import Arena from "./engines/Arena";
import Track from "./engines/Track";
import Table from "./engines/Table";
import Pulse from "./engines/Pulse";
import Siege from "./engines/Siege";
import Workshop from "./engines/Workshop";
import Pool from "./engines/Pool";
import Chess from "./engines/Chess";
import { obj, num, str } from "./engines/util";
export type StationSession = ReturnType<typeof useStation>;
export function StationHUD({
  station,
  session,
  onLeave,
}: {
  station: Station;
  session: StationSession;
  onLeave: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const [coins, setCoins] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/stations/me", { signal: controller.signal })
      .then(async (r) => {
        if (r.ok) {
          const data = (await r.json()) as { coins: number };
          setCoins(data.coins);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [session.result]);
  const {
    phase,
    players,
    timer,
    practice,
    snapshot,
    result,
    send,
    sessionId: id,
  } = session;
  const props = {
    snapshot,
    send,
    id,
    accent: station.def.theme.accent,
    themeProps: station.def.theme.props,
    gameId: station.def.id,
  };
  const names = new Map(players.map((p) => [p.id, p.name]));
  return (
    <div className="station-backdrop">
      <section
        ref={panel}
        onKeyDown={(e) => {
          if (e.key !== "Tab") return;
          const nodes = panel.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input,select,[tabindex="0"]',
          );
          if (!nodes?.length) return;
          const first = nodes[0],
            last = nodes[nodes.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }}
        className="station-hud"
        role="dialog"
        aria-modal="true"
        aria-label={station.def.name}
        style={{ borderColor: station.def.theme.accent }}
      >
        <header>
          <div>
            <small>
              {station.def.planet.toUpperCase()} ·{" "}
              {station.def.engine.toUpperCase()}
            </small>
            <h2>{station.def.name}</h2>
          </div>
          <button autoFocus onClick={onLeave}>
            Leave (Esc)
          </button>
        </header>
        <p>{station.def.blurb}</p>
        {coins !== null && <p>Wallet: {coins} coins</p>}
        <p aria-live="polite">
          {phase.toUpperCase()} · {timer.toFixed(0)} s{" "}
          {practice ? "· Practice — no coins or weekly records" : ""}
        </p>
        {session.notice && <p role="status">{session.notice}</p>}
        {station.def.id === "arcade.street-brawl" && session.error && (
          <button onClick={() => void session.join(station, true)}>
            Watch fight
          </button>
        )}
        {players.find((p) => p.id === id)?.spectator && phase === "play" && (
          <div>
            <p>
              Predict the winner with five cosmetic room coins. Your wallet is
              unaffected.
            </p>
            {players
              .filter((p) => !p.spectator)
              .map((p) => (
                <button key={p.id} onClick={() => session.bet(p.id)}>
                  Back {p.name}
                </button>
              ))}
          </div>
        )}
        {session.error && <p role="alert">{session.error}</p>}
        {!session.joined && !session.error && <p>Joining station…</p>}
        {(phase === "lobby" || phase === "countdown") && (
          <>
            <ul>
              {players.map((p) => (
                <li key={p.id}>
                  {p.name}
                  {p.bot ? " [Bot]" : p.spectator ? " [Spectator]" : ""}
                  {!p.connected ? " — reconnecting" : ""}
                  {p.ready ? " ✓ ready" : ""}
                </li>
              ))}
            </ul>
            <p>
              {players.filter((p) => !p.spectator).length}/
              {station.def.maxPlayers} players. The countdown starts at{" "}
              {station.def.minPlayers} and starts early when full.
            </p>
            <button
              disabled={!session.joined}
              onClick={() => session.ready(false)}
            >
              Ready
            </button>
            {BOTS && phase === "lobby" && players.length === 1 && (
              <button
                disabled={!session.joined}
                onClick={() => session.ready(true)}
              >
                Solo practice with bots
              </button>
            )}
          </>
        )}
        {phase === "play" && (
          <>
            {station.def.space === "3d" ? (
              <WorldGame {...props} />
            ) : station.def.engine === "arena" ? (
              <Arena {...props} />
            ) : station.def.engine === "track" ? (
              <Track {...props} />
            ) : station.def.engine === "pulse" ? (
              <Pulse {...props} />
            ) : station.def.engine === "pool" ? (
              <Pool {...props} />
            ) : station.def.config.rules === "chess" ? (
              <Chess {...props} />
            ) : station.def.engine === "table" ? (
              <Table {...props} />
            ) : station.def.engine === "siege" ? (
              <Siege {...props} />
            ) : (
              <Workshop {...props} entry={str(station.def.config.entry)} />
            )}
            <aside className="station-scores">
              {Object.entries(obj(snapshot.scores))
                .sort((a, b) => num(b[1]) - num(a[1]))
                .map(([key, score]) => (
                  <span key={key}>
                    {names.get(key) ?? key}: {num(score).toFixed(0)}
                  </span>
                ))}
            </aside>
          </>
        )}
        {phase === "results" && result && (
          <>
            <h3>
              {result.voided ? "Round voided — too few players" : "Results"}
            </h3>
            <ol>
              {result.rank.map((key) => (
                <li key={key}>
                  {names.get(key) ?? key} · {result.scores[key]?.toFixed(0)}{" "}
                  points
                </li>
              ))}
            </ol>
            <p>{result.highlight}</p>
            {snapshot.adventure && (
              <div>
                <p>{str(obj(snapshot.adventure).question)}</p>
                {(obj(snapshot.adventure).choices as string[]).map(
                  (label, choice) => (
                    <button key={label} onClick={() => send({ choice })}>
                      {label}
                    </button>
                  ),
                )}
                <p>{str(obj(obj(snapshot.adventure).outcomes)[id])}</p>
              </div>
            )}
            <p>
              {result.practice
                ? "Practice results are not recorded."
                : "Eligible Twitch accounts receive coins and weekly scores."}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
