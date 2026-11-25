// Synthetic pose traces of a seated knee extension seen from the side (PLANS.md §4 fixtures/synthetic).
// No person is involved: the skeleton is drawn from a knee-flexion profile. Noise is hand-written
// Gaussian jitter until real team-member traces provide a noise model (M0.5 deferred).
//
// Geometry: the thigh is horizontal and the shin hangs from the knee, so knee flexion φ puts the shin
// along (cos φ, sin φ) in pixels (y down). φ = 0 is a straight leg, φ = 90 a shin pointing down.
// The chosen leg is the near leg: higher visibility than the far leg.

import { LM_STRIDE, NUM_LANDMARKS, WORLD_STRIDE, type PoseTrace, type TraceFrame } from '../../src/core/trace/schema';

export type Segment =
  /** Flexion held, or moved linearly from `from` to `to`, over `ms`. */
  | { ms: number; flexion: number }
  | { ms: number; from: number; to: number }
  /** No pose detected (camera covered). */
  | { ms: number; noPose: true; flexion?: number }
  /** Pose present but the chosen leg's joints score low (a required joint out of view). */
  | { ms: number; lowVisibility: true; flexion: number };

export interface KneeTraceOptions {
  side: 'left' | 'right';
  segments: Segment[];
  fps?: number;
  /** Image jitter, pixels (1 SD). */
  noisePx?: number;
  seed?: number;
  /** Visibility of the chosen (near) leg and of the far leg. */
  nearVisibility?: number;
  farVisibility?: number;
  width?: number;
  height?: number;
}

const HIP: [number, number] = [256, 264];
const THIGH_PX = 150;
const SHIN_PX = 150;
const PX_PER_M = 357;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

/** Flexion at time `ms` into the segment list, or null if the segment has no pose. */
function profileAt(segments: Segment[], ms: number): { flexion: number; mode: 'ok' | 'noPose' | 'lowVisibility' } | null {
  let start = 0;
  for (const s of segments) {
    if (ms < start + s.ms) {
      const k = (ms - start) / s.ms;
      if ('noPose' in s) return { flexion: s.flexion ?? 90, mode: 'noPose' };
      if ('lowVisibility' in s) return { flexion: s.flexion, mode: 'lowVisibility' };
      if ('from' in s) return { flexion: s.from + (s.to - s.from) * k, mode: 'ok' };
      return { flexion: s.flexion, mode: 'ok' };
    }
    start += s.ms;
  }
  return null;
}

export function totalMs(segments: Segment[]): number {
  return segments.reduce((sum, s) => sum + s.ms, 0);
}

export function kneeTrace(opts: KneeTraceOptions): PoseTrace {
  const fps = opts.fps ?? 30;
  const width = opts.width ?? 640;
  const height = opts.height ?? 480;
  const rand = mulberry32(opts.seed ?? 1);
  const noise = opts.noisePx ?? 0.8;
  const near = opts.nearVisibility ?? 0.95;
  const far = opts.farVisibility ?? 0.6;
  const isLeft = opts.side === 'left';
  const frames: TraceFrame[] = [];
  const duration = totalMs(opts.segments);

  for (let i = 0; ; i++) {
    const ms = (i * 1000) / fps;
    if (ms >= duration) break;
    const t = Math.round(ms * 10) / 10;
    const p = profileAt(opts.segments, ms)!;
    if (p.mode === 'noPose') {
      frames.push({ t, lm: null, world: null });
      continue;
    }
    const phi = (p.flexion * Math.PI) / 180;
    const knee: [number, number] = [HIP[0] + THIGH_PX, HIP[1]];
    const ankle: [number, number] = [knee[0] + SHIN_PX * Math.cos(phi), knee[1] + SHIN_PX * Math.sin(phi)];
    // The far leg rests at 90° flexion, slightly offset, as in a seated side view.
    const farKnee: [number, number] = [knee[0] - 6, knee[1] - 4];
    const farAnkle: [number, number] = [farKnee[0], farKnee[1] + SHIN_PX];

    const pts = new Map<number, { px: [number, number]; vis: number; z: number }>();
    const set = (i: number, px: [number, number], vis: number, z = 0) => pts.set(i, { px, vis, z });
    // Head and upper body.
    for (let k = 0; k <= 10; k++) set(k, [HIP[0] + 10 + (k % 3) * 4, 90 + k * 2], 0.9);
    const nearShoulder: [number, number] = [HIP[0] + 5, 140];
    const nearHip = HIP;
    const lowVis = p.mode === 'lowVisibility' ? 0.15 : near;
    // MediaPipe pairs: odd = left, even = right (11..32).
    const nearIdx = (leftIdx: number) => (isLeft ? leftIdx : leftIdx + 1);
    const farIdx = (leftIdx: number) => (isLeft ? leftIdx + 1 : leftIdx);
    set(nearIdx(11), nearShoulder, 0.9);
    set(farIdx(11), [nearShoulder[0] - 5, nearShoulder[1] - 3], 0.7, 0.15);
    set(nearIdx(13), [nearShoulder[0] + 10, 205], 0.9);
    set(farIdx(13), [nearShoulder[0] + 4, 202], 0.6, 0.15);
    set(nearIdx(15), [nearShoulder[0] + 40, 250], 0.9);
    set(farIdx(15), [nearShoulder[0] + 34, 247], 0.6, 0.15);
    for (const k of [17, 19, 21]) {
      set(nearIdx(k), [nearShoulder[0] + 45, 255], 0.8);
      set(farIdx(k), [nearShoulder[0] + 39, 252], 0.5, 0.15);
    }
    set(nearIdx(23), nearHip, lowVis);
    set(farIdx(23), [nearHip[0] - 6, nearHip[1] - 4], far, 0.15);
    set(nearIdx(25), knee, lowVis);
    set(farIdx(25), farKnee, far, 0.15);
    set(nearIdx(27), ankle, lowVis);
    set(farIdx(27), farAnkle, far, 0.15);
    set(nearIdx(29), [ankle[0] - 8, ankle[1] + 6], near * 0.9);
    set(farIdx(29), [farAnkle[0] - 8, farAnkle[1] + 6], far, 0.15);
    set(nearIdx(31), [ankle[0] + 18 * Math.sin(phi), ankle[1] - 18 * Math.cos(phi) + 4], near * 0.9);
    set(farIdx(31), [farAnkle[0] + 18, farAnkle[1]], far, 0.15);

    const lm = new Array<number>(NUM_LANDMARKS * LM_STRIDE).fill(0);
    const world = new Array<number>(NUM_LANDMARKS * WORLD_STRIDE).fill(0);
    for (let k = 0; k < NUM_LANDMARKS; k++) {
      const q = pts.get(k)!;
      const x = q.px[0] + noise * gaussian(rand);
      const y = q.px[1] + noise * gaussian(rand);
      const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
      lm.splice(k * LM_STRIDE, LM_STRIDE, r4(x / width), r4(y / height), r4(q.z), q.vis, 0.99);
      world.splice(k * WORLD_STRIDE, WORLD_STRIDE, r4((x - HIP[0]) / PX_PER_M), r4((y - HIP[1]) / PX_PER_M), r4(q.z));
    }
    frames.push({ t, lm, world });
  }

  return { schemaVersion: 1, model: { variant: 'full', delegate: 'CPU' }, video: { width, height }, frames };
}

/**
 * Seated at rest long enough, with the default config, for framing (stableMs 1 s), calibration
 * (durationMs 2 s) and the countdown (3 s) when Start is pressed as soon as framing passes.
 */
export const SETTLE: Segment[] = [{ ms: 6500, flexion: 90 }];

/** One extension: lift to `peak`, hold for `holdMs`, lower back to rest. */
export function extension(peak: number, holdMs: number, opts: { liftMs?: number; lowerMs?: number; restMs?: number } = {}): Segment[] {
  return [
    { ms: opts.liftMs ?? 1200, from: 90, to: peak },
    { ms: holdMs, flexion: peak },
    { ms: opts.lowerMs ?? 1200, from: peak, to: 90 },
    { ms: opts.restMs ?? 800, flexion: 90 },
  ];
}
