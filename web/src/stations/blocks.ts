import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { GameDef } from "@stations/model";

/** Local frame: x east, y up, z north. The player-facing front is +z. */
export const BLOCK_SIZE = 30;
const SCALE = 0.7;

type Part = {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: string;
  glow?: boolean;
};

const STONE = "#b9bcae",
  DARK = "#2b3142",
  WALL = "#e6e1d2",
  WOOD = "#7a5a3a";

function shade(hex: string, k: number) {
  return `#${new THREE.Color(hex).multiplyScalar(k).getHexString()}`;
}

function archetype(def: GameDef): Part[] {
  const a = def.theme.accent,
    dark = shade(a, 0.55),
    p: Part[] = [];
  const add = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
    glow = false,
  ) => p.push({ x, y, z, w, h, d, color, glow });
  switch (def.id.split(".")[1]) {
    case "zombies": {
      // Sandbagged bunker with a watchtower and a barricade
      add(0, 2.5, -4, 16, 5, 10, "#5d6b54");
      add(0, 5.2, -4, 17, 0.8, 11, "#3f4a39");
      add(-9, 7, -9, 3, 12, 3, "#6b5a3e");
      add(-9, 13.4, -9, 5, 0.8, 5, dark);
      add(-9, 15.4, -9, 1, 3, 1, "#ff5a5a", true);
      for (let i = 0; i < 7; i++) add(-9 + i * 3, 1.2, 8, 2.6, 1.8, 1.6, "#a79568");
      for (let i = 0; i < 4; i++) add(11, 1.2 + (i % 2) * 1.2, 2 - i * 3, 1.6, 1.2, 2.6, "#a79568");
      add(0, 2, 3.2, 4, 4, 0.5, DARK);
      add(0, 6.2, 3.5, 6, 0.8, 0.4, a, true);
      break;
    }
    case "duel": {
      // Walled firing ring with crates for cover
      for (const s of [-1, 1]) {
        add(s * 12, 3, 0, 1.4, 6, 24, "#6b6f78");
        add(0, 3, s * 12, 24, 6, 1.4, "#6b6f78");
        add(s * 12, 6.4, s * 12, 3, 1, 3, a, true);
      }
      add(0, 3, 12, 8, 6.2, 1.5, DARK);
      add(-4, 1.2, -3, 3, 2.4, 3, WOOD);
      add(4, 1.2, 3, 3, 2.4, 3, WOOD);
      add(0, 0.9, 0, 2, 1.8, 2, "#8c6f48");
      add(0, 9, -12, 10, 3, 0.8, a, true);
      break;
    }
    case "pool": {
      // Pool hall with a glowing green table-roof and neon sign
      add(0, 3, -3, 24, 6, 16, "#3b2a24");
      add(0, 6.4, -3, 25.5, 0.8, 17.5, dark);
      add(0, 7.3, -3, 14, 1, 8, "#1d7a4a");
      add(0, 8, -3, 15, 0.5, 9, "#4b2e1a");
      add(0, 11, 5.4, 12, 3, 0.5, a, true);
      add(-8, 2, 5.2, 5, 3.4, 0.4, "#9fd7ff");
      add(8, 2, 5.2, 5, 3.4, 0.4, "#9fd7ff");
      add(0, 2.2, 5.2, 3.2, 4.4, 0.5, DARK);
      for (let i = 0; i < 3; i++) add(-6 + i * 6, 1.2, 10, 1.6, 2.4, 1.6, "#2b2f3b");
      break;
    }
    case "chess": {
      // Checkerboard plaza with a pavilion and oversized pieces
      for (let r = 0; r < 6; r++)
        for (let c = 0; c < 6; c++)
          add(-12.5 + c * 5, 0.15, -5 + r * 4.6, 5, 0.2, 4.6, (r + c) % 2 ? "#3a3f4b" : "#f1e7cf");
      add(-9, 5, -14, 1.4, 10, 1.4, STONE);
      add(9, 5, -14, 1.4, 10, 1.4, STONE);
      add(0, 10.5, -14, 22, 1.4, 4, a);
      add(-4, 3, -3, 2, 6, 2, "#1d1f28");
      add(-4, 6.6, -3, 3, 1.2, 3, "#1d1f28");
      add(-4, 8, -3, 0.8, 2.4, 0.8, a, true);
      add(4, 2, 2, 2, 4, 2, "#f1e7cf");
      add(4, 4.6, 2, 3, 1.2, 3, "#f1e7cf");
      break;
    }
  }
  return p;
}

/** One distinct themed building on a paved plaza, merged into a single mesh. */
export function buildBlock(def: GameDef): THREE.BufferGeometry {
  const parts: Part[] = [
    // plaza slab sunk below ground so terraced terrain never shows through
    {
      x: 0,
      y: -2.5,
      z: 0,
      w: BLOCK_SIZE,
      h: 6,
      d: BLOCK_SIZE,
      color: STONE,
    },
    {
      x: 0,
      y: 0.55,
      z: 0,
      w: BLOCK_SIZE - 1,
      h: 0.3,
      d: BLOCK_SIZE - 1,
      color: shade(def.theme.accent, 0.35),
    },
    // lit path to the front
    { x: 0, y: 0.75, z: 11, w: 4, h: 0.1, d: 8, color: "#f2efe2" },
    ...archetype(def).map((q) => ({ ...q, y: q.y + 0.7 })),
  ];
  // corner lamps
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      parts.push({
        x: sx * 14,
        y: 3,
        z: sz * 14,
        w: 0.4,
        h: 5,
        d: 0.4,
        color: "#444",
      });
      parts.push({
        x: sx * 14,
        y: 5.7,
        z: sz * 14,
        w: 1.2,
        h: 0.8,
        d: 1.2,
        color: "#fff6c2",
        glow: true,
      });
    }
  const geos = parts.map((q) => {
    const g = new THREE.BoxGeometry(q.w, q.h, q.d).toNonIndexed();
    g.translate(q.x, q.y, q.z);
    g.scale(SCALE, SCALE, SCALE);
    const c = new THREE.Color(q.color),
      n = g.getAttribute("position").count,
      col = new Float32Array(n * 3),
      emit = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
      emit[i] = q.glow ? 1 : 0;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("glow", new THREE.BufferAttribute(emit, 1));
    g.deleteAttribute("uv");
    return g;
  });
  return mergeGeometries(geos, false)!;
}
