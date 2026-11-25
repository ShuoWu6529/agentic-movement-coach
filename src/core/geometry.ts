// Joint angles (R-F2), clinical goniometer convention (docs/definitions.md): knee flexion is 0° when
// the knee is fully straight and grows as it bends.
//
// Two versions are computed. The image-plane angle is primary for knee extension, because the side
// view puts the leg in the image plane. The world-landmark angle is logged next to it so M1–M3 live
// testing can choose the primary angle per exercise (PLANS.md §10).

import { imagePoint, legJoints, worldPoint, type ImagePoint, type WorldPoint } from './pose';
import type { Side } from './types';

const DEG = 180 / Math.PI;

function angleBetween(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const na = Math.hypot(ax, ay, az);
  const nb = Math.hypot(bx, by, bz);
  if (!(na > 0) || !(nb > 0)) return NaN;
  const cos = Math.min(1, Math.max(-1, (ax * bx + ay * by + az * bz) / (na * nb)));
  return Math.acos(cos) * DEG;
}

/**
 * Interior angle at `b` in the image plane, in degrees. Normalized coordinates are scaled to pixels
 * first, because x and y are fractions of different lengths unless the frame is square.
 */
export function interiorAngle2d(a: ImagePoint, b: ImagePoint, c: ImagePoint, width: number, height: number): number {
  return angleBetween((a.x - b.x) * width, (a.y - b.y) * height, 0, (c.x - b.x) * width, (c.y - b.y) * height, 0);
}

export function interiorAngle3d(a: WorldPoint, b: WorldPoint, c: WorldPoint): number {
  return angleBetween(a.x - b.x, a.y - b.y, a.z - b.z, c.x - b.x, c.y - b.y, c.z - b.z);
}

const finiteOrNull = (v: number): number | null => (Number.isFinite(v) ? v : null);

/** Knee flexion from image landmarks (primary for the side view). Null when it can't be computed. */
export function kneeFlexion2d(lm: readonly number[], side: Side, width: number, height: number): number | null {
  const j = legJoints(side);
  const inner = interiorAngle2d(imagePoint(lm, j.hip), imagePoint(lm, j.knee), imagePoint(lm, j.ankle), width, height);
  return finiteOrNull(180 - inner);
}

/** Knee flexion from world landmarks (logged for comparison). */
export function kneeFlexion3d(world: readonly number[], side: Side): number | null {
  const j = legJoints(side);
  const inner = interiorAngle3d(worldPoint(world, j.hip), worldPoint(world, j.knee), worldPoint(world, j.ankle));
  return finiteOrNull(180 - inner);
}
