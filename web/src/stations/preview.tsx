import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import * as THREE from "three";
import { GAMES } from "@stations/games.js";
import { useStation } from "./useStation";
import { StationHUD } from "./StationHUD";
import type { Station } from "./placement";
import "./stations.css";
function Preview() {
  const session = useStation(),
    [id, setId] = useState(GAMES[0].id),
    [station, setStation] = useState<Station | null>(null);
  useEffect(() => {
    if (!station) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        session.leave();
        setStation(null);
        return;
      }
      if (
        ["INPUT", "SELECT", "TEXTAREA"].includes(
          (e.target as HTMLElement)?.tagName,
        ) ||
        e.key === "Tab" ||
        (e.key === "Enter" && (e.target as HTMLElement)?.tagName === "BUTTON")
      )
        return;
      e.preventDefault();
      window.dispatchEvent(
        new CustomEvent("station:key", {
          detail: { key: e.key, up: e.type === "keyup", repeat: e.repeat },
        }),
      );
    };
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", key);
    };
  }, [station, session.leave]);
  function join() {
    const def = GAMES.find((g) => g.id === id)!;
    const s: Station = {
      key: `station:${def.planet}:${def.id}:99000`,
      def,
      copy: 99000,
      dir: new THREE.Vector3(0, 1, 0),
      position: new THREE.Vector3(),
      rotation: new THREE.Quaternion(),
      plaza: 0,
    };
    setStation(s);
    void session.join(s);
  }
  return (
    <main
      style={{
        background: "#142139",
        color: "white",
        minHeight: "100vh",
        padding: 30,
        fontFamily: "system-ui",
      }}
    >
      <h1>Station playtest</h1>
      <p>
        Development-only game picker. Open two tabs and choose the same game to
        test multiplayer, or start solo practice.
      </p>
      <label>
        Game{" "}
        <select value={id} onChange={(e) => setId(e.target.value)}>
          {GAMES.map((g) => (
            <option key={g.id} value={g.id}>
              {g.planet} · {g.name}
            </option>
          ))}
        </select>
      </label>
      <button onClick={join}>Join station</button>
      {station && (
        <StationHUD
          station={station}
          session={session}
          onLeave={() => {
            session.leave();
            setStation(null);
          }}
        />
      )}
    </main>
  );
}
if (import.meta.env.DEV)
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <Preview />
    </React.StrictMode>,
  );
