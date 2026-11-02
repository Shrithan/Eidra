import { rayBox } from "./physics.js";
export function steerToward(position, target, boxes) {
    const dx = target.x - position.x, dz = target.z - position.z, distance = Math.hypot(dx, dz);
    if (distance < 0.2)
        return { x: 0, z: 0 };
    const origin = { x: position.x, y: position.y + 0.9, z: position.z }, dir = { x: dx / distance, y: 0, z: dz / distance };
    let blocker, closest = Math.min(distance, 5);
    for (const box of boxes) {
        const hit = rayBox(origin, dir, box, closest);
        if (hit && hit.distance < closest) {
            blocker = box;
            closest = hit.distance;
        }
    }
    if (!blocker)
        return { x: dir.x, z: dir.z };
    const corners = [-1, 1].flatMap((x) => [-1, 1].map((z) => ({
        x: blocker.x + x * (blocker.w / 2 + 0.9),
        z: blocker.z + z * (blocker.d / 2 + 0.9),
    })));
    const route = corners
        .filter((p) => {
        const x = p.x - position.x, z = p.z - position.z, d = Math.hypot(x, z);
        if (d < 0.2)
            return false;
        return !boxes.some((b) => {
            const hit = rayBox(origin, { x: x / d, y: 0, z: z / d }, b, d);
            return hit && hit.distance < d - 0.15;
        });
    })
        .sort((a, b) => Math.hypot(a.x - position.x, a.z - position.z) +
        Math.hypot(a.x - target.x, a.z - target.z) -
        Math.hypot(b.x - position.x, b.z - position.z) -
        Math.hypot(b.x - target.x, b.z - target.z))[0];
    if (!route)
        return { x: -dir.z, z: dir.x };
    const x = route.x - position.x, z = route.z - position.z, d = Math.hypot(x, z);
    return { x: x / d, z: z / d };
}
