import { Board } from "./Board";
import { obj, list, num, str, type ViewProps } from "./util";
export default function Siege(p: ViewProps) {
  const s = p.snapshot,
    role = str(obj(s.assigned)[p.id]),
    definition = list(s.roles)
      .map(obj)
      .find((r) => r.id === role);
  return (
    <>
      <p>
        Wave {num(s.wave)} · {str(s.stage)} · Base {num(s.base).toFixed(0)} HP ·
        Role: <b>{role}</b> · Points {num(obj(s.points)[p.id])}
      </p>
      {s.hazard !== undefined && (
        <p>Danger: quadrant {num(s.hazard) + 1}. Move to another quadrant.</p>
      )}
      <div className="station-actions">
        {list(s.roles).map((v) => {
          const r = obj(v);
          return (
            <button
              key={str(r.id)}
              disabled={Object.entries(obj(s.assigned)).some(
                ([id, role]) => id !== p.id && role === r.id,
              )}
              onClick={() => p.send({ role: r.id })}
            >
              Role: {str(r.name)}
            </button>
          );
        })}
      </div>
      <div className="station-board">
        <Board {...p} />
      </div>
      {p.gameId === "shooter.horde" && (
        <button onClick={() => p.send({ action: "reload" })}>Reload</button>
      )}
      <div className="station-actions">
        {Object.keys(obj(s.down))
          .filter((key) => num(obj(s.down)[key]) > num(s.elapsed))
          .map((key) => (
            <button
              key={key}
              onClick={() => p.send({ action: "revive", player: key })}
            >
              Revive {key}
            </button>
          ))}
      </div>
      {s.stage === "upgrade" ? (
        <div className="station-actions">
          {["repair", "power", "speed"].map((upgrade) => (
            <button key={upgrade} onClick={() => p.send({ upgrade })}>
              {upgrade} (10 points)
            </button>
          ))}
        </div>
      ) : (
        <>
          <p>
            Use your role's actions on enemies. Required roles are shown beside
            each target.
          </p>
          {list(s.enemies).map((v) => {
            const e = obj(v);
            return (
              <div className="station-enemy" key={num(e.id)}>
                <span>
                  {str(e.kind)} · {num(e.hp)} HP{" "}
                  {e.parts
                    ? `· completed: ${list(e.parts).map(str).join(", ")}`
                    : ""}{" "}
                  {e.rotation !== undefined
                    ? `· rotate ${num(e.rotation)} / colour ${num(e.color)} (target 0)`
                    : ""}{" "}
                  {e.required ? `· needs ${str(e.required)}` : ""}
                </span>
                {list(definition?.buttons ?? ["act"])
                  .filter((b) => b !== "upgrade")
                  .map((b) => (
                    <button
                      disabled={!!e.required && e.required !== role}
                      key={str(b)}
                      onClick={() => p.send({ action: b, target: e.id })}
                    >
                      {str(b)}
                    </button>
                  ))}
              </div>
            );
          })}
          <div className="station-actions">
            {[0, 1, 2, 3].map((position) => (
              <button key={position} onClick={() => p.send({ position })}>
                Stand in quadrant {position + 1}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
