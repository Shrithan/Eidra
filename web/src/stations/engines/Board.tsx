import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { obj, list, num, str, type ViewProps } from "./util";
export function Board({
  snapshot: s,
  id,
  accent,
  themeProps = [],
  gameId,
}: Omit<ViewProps, "send">) {
  const engine = str(s.engine),
    fighters = obj(s.fighters),
    runners = obj(s.runners),
    radius = num(s.radius, 18);
  return (
    <Canvas
      orthographic
      camera={{
        position: [0, 60, 35],
        zoom: engine === "arena" ? 260 / radius : 12,
      }}
    >
      <ambientLight intensity={1.7} />
      <directionalLight position={[10, 20, 10]} intensity={2} />
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        {s.shape === "circle" ? (
          <circleGeometry args={[radius, 48]} />
        ) : (
          <planeGeometry
            args={engine === "arena" ? [radius * 2, radius * 2] : [30, 50]}
          />
        )}
        <meshStandardMaterial color="#213650" flatShading />
      </mesh>
      {engine === "arena" &&
        Object.entries(fighters).map(([key, v]) => {
          const p = obj(v);
          return p.alive ? (
            <group
              key={key}
              position={[num(p.x), 0.7, num(p.z)]}
              rotation={[0, -num(p.aim), 0]}
            >
              <mesh>
                <boxGeometry args={[1, 1.4, 1]} />
                <meshStandardMaterial color={key === id ? accent : "#d5e2ff"} />
              </mesh>
              <mesh position={[0.7, 0, 0]}>
                <boxGeometry args={[0.5, 0.3, 0.3]} />
                <meshStandardMaterial color="#192039" />
              </mesh>
            </group>
          ) : null;
        })}
      {engine === "arena" &&
        list(s.shots).map((v, i) => {
          const p = obj(v);
          return (
            <mesh key={i} position={[num(p.x), 0.7, num(p.z)]}>
              <boxGeometry args={[0.3, 0.3, 0.3]} />
              <meshStandardMaterial color="#ffd84d" />
            </mesh>
          );
        })}
      {engine === "arena" &&
        Object.entries(obj(s.tiles)).map(([tile, owner]) => {
          const [x, z] = tile.split(",").map(Number);
          return (
            <mesh
              key={tile}
              position={[x, 0.02, z]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[1, 1]} />
              <meshStandardMaterial color={owner === id ? accent : "#ef83bf"} />
            </mesh>
          );
        })}
      {engine === "arena" &&
        list(s.towers).map((v, i) => {
          const t = obj(v);
          return num(t.hp) > 0 ? (
            <mesh key={`tower${i}`} position={[num(t.x), 2, num(t.z)]}>
              <boxGeometry args={[2, 4, 2]} />
              <meshStandardMaterial color={num(t.team) ? "#ef83bf" : accent} />
            </mesh>
          ) : null;
        })}
      {engine === "arena" &&
        list(s.minions).map((v, i) => {
          const t = obj(v);
          return (
            <mesh key={`minion${i}`} position={[num(t.x), 0.5, num(t.z)]}>
              <boxGeometry args={[0.6, 1, 0.6]} />
              <meshStandardMaterial color={num(t.team) ? "#ef83bf" : accent} />
            </mesh>
          );
        })}
      {gameId === "arcade.pong-royale" && (
        <mesh position={[num(obj(s.ball).x), 0.6, num(obj(s.ball).z)]}>
          <boxGeometry args={[0.8, 0.8, 0.8]} />
          <meshStandardMaterial color="#ffd84d" />
        </mesh>
      )}
      {gameId === "shooter.hot-zone" && (
        <mesh
          position={[
            Math.sin(num(s.elapsed) * 0.2) * radius * 0.4,
            0.05,
            Math.cos(num(s.elapsed) * 0.2) * radius * 0.4,
          ]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <circleGeometry args={[4, 24]} />
          <meshStandardMaterial color="#6bdc8b" />
        </mesh>
      )}
      {engine === "arena" &&
        Object.entries(obj(s.broken)).map(([tile, at]) => {
          const [x, z] = tile.split(",").map(Number);
          return (
            <mesh
              key={`broken${tile}`}
              position={[x, 0.04, z]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[1, 1]} />
              <meshStandardMaterial
                color={num(at) < num(s.elapsed) ? "#081322" : "#ff6b6b"}
              />
            </mesh>
          );
        })}
      {engine === "track" &&
        Object.entries(runners).map(([key, v], i) => {
          const p = obj(v);
          const me = obj(runners[id]);
          const z = (num(p.distance) - num(me.distance)) * 0.12;
          return Math.abs(z) < 25 ? (
            <mesh key={key} position={[num(p.lane) * 6 + i * 0.5, 1, -z]}>
              <boxGeometry args={[1.4, 1.4, 2]} />
              <meshStandardMaterial color={key === id ? accent : "#d5e2ff"} />
            </mesh>
          ) : null;
        })}
      {engine === "track" &&
        list(s.course).map((v, i) => {
          const p = obj(v),
            me = obj(runners[id]),
            z = (num(p.at) - num(me.distance)) * 0.12;
          return z > -5 && z < 25 ? (
            <mesh key={i} position={[num(p.lane) * 6, 0.6, -z]}>
              <boxGeometry args={[2, 1.2, 1]} />
              <meshStandardMaterial
                color={
                  ["battery", "boost"].includes(str(p.kind))
                    ? "#6bdc8b"
                    : "#ff6b6b"
                }
              />
            </mesh>
          ) : null;
        })}
      {engine === "pulse" &&
        list(s.cues).map((v, i) => {
          const c = obj(v),
            y = (num(c.at) - num(s.serverTime)) * 0.007;
          return (
            <mesh key={i} position={[((num(c.answer) % 4) - 1.5) * 5, 0.8, -y]}>
              <boxGeometry args={[3, 0.7, 1]} />
              <meshStandardMaterial color={accent} />
            </mesh>
          );
        })}
      {engine === "siege" &&
        list(s.enemies).map((v, i) => {
          const e = obj(v);
          return (
            <mesh
              key={i}
              position={[(num(e.lane) - 1) * 4, 1, 15 - num(e.progress) * 30]}
            >
              <boxGeometry args={[1.5, 2, 1.5]} />
              <meshStandardMaterial color="#ff6b6b" />
            </mesh>
          );
        })}
      {themeProps.map((name, i) => (
        <group key={name} position={[-12 + i * 24, 0, 15]}>
          <mesh position={[0, 0.4, 0]}>
            <boxGeometry args={[2, 0.8, 2]} />
            <meshStandardMaterial color={accent} />
          </mesh>
          <mesh position={[0, 1.5, 0]}>
            <boxGeometry
              args={
                name.includes("tower") || name.includes("sword")
                  ? [0.4, 3, 0.4]
                  : [1.2, 1.4, 1.2]
              }
            />
            <meshStandardMaterial color="#d5e2ff" flatShading />
          </mesh>
        </group>
      ))}
      <OrbitControls
        enablePan={false}
        enableZoom={false}
        enableRotate={false}
      />
    </Canvas>
  );
}
