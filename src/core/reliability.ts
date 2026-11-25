// Per-frame reliability gate (R-F8, R-S1, PLANS.md §3). Fail closed: a frame is unreliable if no pose
// is detected, if any required joint scores below `tracking.minVisibility`, or if any required joint
// lies closer than `tracking.boundsMargin` to the frame edge.

import type { TargetsConfig } from './config/schema';
import { imagePoint, legJoints } from './pose';
import type { Side } from './types';

export type GateReason = 'noPose' | 'outOfFrame' | 'lowVisibility';

export interface GateResult {
  ok: boolean;
  reason: GateReason | null;
  /** Lowest visibility over the required joints; 0 when there is no pose. */
  conf: number;
  /** The joint that failed (out of frame takes precedence over low visibility). */
  joint: number | null;
}

/** Joints that must be tracked reliably. Only knee extension is built so far (M1). */
export function requiredJoints(exercise: 'kneeExtension', side: Side): number[] {
  switch (exercise) {
    case 'kneeExtension': {
      const j = legJoints(side);
      return [j.hip, j.knee, j.ankle];
    }
  }
}

export function gateFrame(
  lm: readonly number[] | null,
  joints: readonly number[],
  tracking: TargetsConfig['tracking'],
): GateResult {
  if (!lm) return { ok: false, reason: 'noPose', conf: 0, joint: null };
  const m = tracking.boundsMargin;
  let conf = Number.POSITIVE_INFINITY;
  let lowest: number | null = null;
  let outside: number | null = null;
  for (const i of joints) {
    const p = imagePoint(lm, i);
    const v = Number.isFinite(p.visibility) ? p.visibility : 0;
    if (v < conf) {
      conf = v;
      lowest = i;
    }
    const inside = p.x >= m && p.x <= 1 - m && p.y >= m && p.y <= 1 - m; // NaN fails
    if (!inside && outside === null) outside = i;
  }
  if (joints.length === 0) conf = 0;
  if (outside !== null) return { ok: false, reason: 'outOfFrame', conf, joint: outside };
  if (conf < tracking.minVisibility) return { ok: false, reason: 'lowVisibility', conf, joint: lowest };
  return { ok: true, reason: null, conf, joint: null };
}
