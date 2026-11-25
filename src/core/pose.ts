// Pose frames and landmark access for the core. Landmarks stay in the camera's real (unmirrored)
// orientation (PLANS.md §2 principle 7). MediaPipe's "left" landmarks are the person's anatomical left.

import { LM_STRIDE, WORLD_STRIDE } from './trace/schema';
import type { Side } from './types';

/** One input frame to the core. `t` is the only clock the core sees (PLANS.md §2 principle 2). */
export interface PoseFrame {
  /** ms from session start, frame capture time. */
  t: number;
  /** 33 × (x, y, z, visibility, presence), x and y normalized to the frame; null when no pose. */
  lm: readonly number[] | null;
  /** 33 × (x, y, z) in metres, hip-centred; null when no pose. */
  world: readonly number[] | null;
  /** Mean frame brightness (0–255), when the adapter measured it. Only chooses a framing message. */
  luma?: number;
}

export const LM = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

/** Lines of the skeleton overlay. */
export const SKELETON_EDGES: ReadonlyArray<readonly [number, number]> = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
];

export interface ImagePoint {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface WorldPoint {
  x: number;
  y: number;
  z: number;
}

export function imagePoint(lm: readonly number[], i: number): ImagePoint {
  const o = i * LM_STRIDE;
  return { x: lm[o] ?? NaN, y: lm[o + 1] ?? NaN, z: lm[o + 2] ?? NaN, visibility: lm[o + 3] ?? 0 };
}

export function worldPoint(world: readonly number[], i: number): WorldPoint {
  const o = i * WORLD_STRIDE;
  return { x: world[o] ?? NaN, y: world[o + 1] ?? NaN, z: world[o + 2] ?? NaN };
}

export interface LegJoints {
  hip: number;
  knee: number;
  ankle: number;
}

export function legJoints(side: Side): LegJoints {
  return side === 'left'
    ? { hip: LM.leftHip, knee: LM.leftKnee, ankle: LM.leftAnkle }
    : { hip: LM.rightHip, knee: LM.rightKnee, ankle: LM.rightAnkle };
}

export function otherSide(side: Side): Side {
  return side === 'left' ? 'right' : 'left';
}

const JOINT_LABEL: Record<number, string> = {
  [LM.leftHip]: 'left hip',
  [LM.rightHip]: 'right hip',
  [LM.leftKnee]: 'left knee',
  [LM.rightKnee]: 'right knee',
  [LM.leftAnkle]: 'left ankle',
  [LM.rightAnkle]: 'right ankle',
};

export function jointLabel(i: number): string {
  return JOINT_LABEL[i] ?? `landmark ${i}`;
}
