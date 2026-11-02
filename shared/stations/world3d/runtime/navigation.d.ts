import type { Vec3, Box } from "./model.js";
export declare function steerToward(position: Vec3, target: Vec3, boxes: Box[]): {
    x: number;
    z: number;
};
