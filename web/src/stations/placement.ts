import * as THREE from "three";
import type { SphereLayout } from "../sphereLayout";
import { roadSides } from "../sphereLattice";
import { GAMES } from "@stations/games.js";
import type { GameDef } from "@stations/model";
export type Station = {
  key: string;
  def: GameDef;
  copy: number;
  dir: THREE.Vector3;
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  plaza: number;
};
export type Placement = {
  stations: Station[];
  fountains: { position: THREE.Vector3; rotation: THREE.Quaternion }[];
};
export function frame(dir: THREE.Vector3) {
  const east = new THREE.Vector3()
    .crossVectors(
      Math.abs(dir.y) < 0.9
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(1, 0, 0),
      dir,
    )
    .normalize();
  const north = new THREE.Vector3().crossVectors(east, dir).normalize();
  const rotation = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(east, dir, north),
  );
  return { east, north, rotation };
}
function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
export function placeStations(layout: SphereLayout): Placement {
  const games = GAMES.filter((g) => g.planet === layout.theme.id),
    stations: Station[] = [],
    fountains: Placement["fountains"] = [];
  if (!games.length) return { stations, fountains };
  const plots = new Set(layout.plots.map((p) => p.cell)),
    used: THREE.Vector3[] = [],
    copies = new Map<string, number>();
  const candidates = layout.lattice.cells
    .map((cell, index) => ({ cell, index }))
    .filter(
      (c) =>
        !plots.has(c.index) &&
        c.cell.size >= 52 &&
        layout.ground(c.cell.centre) > 0.5,
    );
  const safe = (dir: THREE.Vector3, cellIndex: number, radius: number) => {
    const cell = layout.lattice.cells[cellIndex];
    if (layout.ground(dir) <= 0.5) return false;
    for (let side = 0; side < 4; side++)
      if (roadSides(cell)[side]) {
        const a = layout.lattice.corners[cell.corners[side]],
          b = layout.lattice.corners[cell.corners[(side + 1) % 4]],
          normal = new THREE.Vector3().crossVectors(a, b).normalize();
        const sign = Math.sign(normal.dot(cell.centre));
        if (
          Math.asin(THREE.MathUtils.clamp(normal.dot(dir) * sign, -1, 1)) *
            layout.R <
          10 + radius
        )
          return false;
      }
    return layout.plots.every(
      (p) => p.dir.angleTo(dir) * layout.R > p.footprint * 0.71 + radius + 1,
    );
  };
  function choose(target: THREE.Vector3) {
    const sorted = [...candidates].sort(
      (a, b) =>
        a.cell.centre.distanceToSquared(target) -
          b.cell.centre.distanceToSquared(target) || a.index - b.index,
    );
    return sorted.find(({ cell, index }) => {
      if (used.some((d) => d.angleTo(cell.centre) * layout.R < 40))
        return false;
      return safe(cell.centre, index, 13);
    });
  }
  function put(def: GameDef, dir: THREE.Vector3, plaza: number) {
    const index = copies.get(def.id) ?? 0;
    copies.set(def.id, index + 1);
    const copy = (layout.copyBase ?? 0) + index;
    stations.push({
      key: `station:${def.planet}:${def.id}:${copy}`,
      def,
      copy,
      dir,
      position: dir.clone().multiplyScalar(layout.R + layout.ground(dir)),
      rotation: frame(dir).rotation,
      plaza,
    });
  }
  // the games sit inside the city, on cells the layout keeps free between the streamers; the four games alternate so each gets an equal share
  const order = layout.stationCells
    .map((index) => ({ index, order: hash(`${layout.theme.id}:${index}`) }))
    .sort((x, y) => x.order - y.order);
  order.forEach(({ index }, k) => {
    const cell = layout.lattice.cells[index];
    if (!safe(cell.centre, index, 10)) return;
    put(games[k % games.length], cell.centre, 100 + k);
  });
  return { stations, fountains };
}
