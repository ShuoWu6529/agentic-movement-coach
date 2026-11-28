// Synthetic pose traces of a sit-to-stand seen from the front, about 45° to one side (PLANS.md §4
// fixtures/synthetic). No person is involved: the skeleton is drawn from a stand-progress profile.
// Noise is hand-written Gaussian jitter, as in kneeTrace.ts.
//
// Geometry (pixels, y down): seated, the shoulder midpoint is at y = 220 and the hip midpoint at
// y = 340 (trunk 120 px). Progress p raises shoulders and hips together by p × `risePx` (default 96,
// 0.8 trunk lengths), so p = 1 is standing. The legs are drawn with low visibility, as when the chair
// hides them (M0.5 S6); sit-to-stand does not require them.

import { LM_STRIDE, NUM_LANDMARKS, WORLD_STRIDE, type PoseTrace, type TraceFrame } from '../../src/core/trace/schema';

export type StsSegment =
  /** Progress held, or moved linearly from `from` to `to`, over `ms`. */
  | { ms: number; p: number }
  | { ms: number; from: number; to: number }
  /** No pose detected (camera covered). */
  | { ms: number; noPose: true }
  /** Pose present but the shoulders score low (a required joint out of view). */
  | { ms: number; lowVisibility: true; p: number };

export interface StsTraceOptions {
  segments: StsSegment[];
  fps?: number;
  /** Image jitter, pixels (1 SD). */
  noisePx?: number;
  seed?: number;
  /** Shoulder rise from seated to standing, pixels. */
  risePx?: number;
  /** Extra forward-and-down shoulder movement mid-rise (trunk lean), pixels at p = 0.5. */
  leanPx?: number;
  width?: number;
  height?: number;
}

const X0 = 330;
const SEATED_SHOULDER_Y = 220;
const SEATED_HIP_Y = 340;
const PX_PER_M = 300;

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

function profileAt(segments: StsSegment[], ms: number): { p: number; mode: 'ok' | 'noPose' | 'lowVisibility' } | null {
  let start = 0;
  for (const s of segments) {
    if (ms < start + s.ms) {
      const k = (ms - start) / s.ms;
      if ('noPose' in s) return { p: 0, mode: 'noPose' };
      if ('lowVisibility' in s) return { p: s.p, mode: 'lowVisibility' };
      if ('from' in s) return { p: s.from + (s.to - s.from) * k, mode: 'ok' };
      return { p: s.p, mode: 'ok' };
    }
    start += s.ms;
  }
  return null;
}

export function stsTotalMs(segments: StsSegment[]): number {
  return segments.reduce((sum, s) => sum + s.ms, 0);
}

export function sitToStandTrace(opts: StsTraceOptions): PoseTrace {
  const fps = opts.fps ?? 30;
  const width = opts.width ?? 640;
  const height = opts.height ?? 480;
  const rand = mulberry32(opts.seed ?? 1);
  const noise = opts.noisePx ?? 0.8;
  const rise = opts.risePx ?? 96;
  const leanPx = opts.leanPx ?? 0;
  const frames: TraceFrame[] = [];
  const duration = stsTotalMs(opts.segments);

  for (let i = 0; ; i++) {
    const ms = (i * 1000) / fps;
    if (ms >= duration) break;
    const t = Math.round(ms * 10) / 10;
    const prof = profileAt(opts.segments, ms)!;
    if (prof.mode === 'noPose') {
      frames.push({ t, lm: null, world: null });
      continue;
    }
    const p = prof.p;
    const lean = leanPx * Math.sin(Math.PI * Math.min(1, Math.max(0, p)));
    const sy = SEATED_SHOULDER_Y - p * rise + lean;
    const hy = SEATED_HIP_Y - p * rise;
    const sx = X0 + lean;
    const shoulderVis = prof.mode === 'lowVisibility' ? 0.15 : 0.95;

    const pts = new Map<number, { px: [number, number]; vis: number; z: number }>();
    const set = (k: number, px: [number, number], vis: number, z = 0) => pts.set(k, { px, vis, z });
    // Face (0–10) above the shoulders.
    for (let k = 0; k <= 10; k++) set(k, [sx - 10 + (k % 5) * 5, sy - 70 + Math.floor(k / 5) * 12], 0.95);
    // MediaPipe pairs: odd = left, even = right. Seen at 45°, the right side is nearer the camera.
    set(11, [sx + 32, sy + 3], shoulderVis, 0.1);
    set(12, [sx - 32, sy - 3], shoulderVis, -0.1);
    set(13, [sx + 38, sy + 60], 0.8, 0.1);
    set(14, [sx - 38, sy + 58], 0.9, -0.1);
    set(15, [sx + 40, sy + 110], 0.7, 0.1);
    set(16, [sx - 40, sy + 108], 0.85, -0.1);
    for (const k of [17, 19, 21]) set(k, [sx + 42, sy + 118], 0.6, 0.1);
    for (const k of [18, 20, 22]) set(k, [sx - 42, sy + 116], 0.7, -0.1);
    set(23, [X0 + 24, hy + 2], 0.9, 0.1);
    set(24, [X0 - 24, hy - 2], 0.92, -0.1);
    // Legs: the chair and the far leg are in the way, so the model scores them low.
    const kneeY = SEATED_HIP_Y + 5 - p * rise * 0.5;
    set(25, [X0 + 70, kneeY], 0.3, 0.1);
    set(26, [X0 + 50, kneeY], 0.45, -0.1);
    set(27, [X0 + 72, 440], 0.2, 0.1);
    set(28, [X0 + 50, 440], 0.35, -0.1);
    for (const k of [29, 31]) set(k, [X0 + 80, 452], 0.15, 0.1);
    for (const k of [30, 32]) set(k, [X0 + 58, 452], 0.3, -0.1);

    const lm = new Array<number>(NUM_LANDMARKS * LM_STRIDE).fill(0);
    const world = new Array<number>(NUM_LANDMARKS * WORLD_STRIDE).fill(0);
    for (let k = 0; k < NUM_LANDMARKS; k++) {
      const q = pts.get(k)!;
      const x = q.px[0] + noise * gaussian(rand);
      const y = q.px[1] + noise * gaussian(rand);
      const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
      lm.splice(k * LM_STRIDE, LM_STRIDE, r4(x / width), r4(y / height), r4(q.z), q.vis, 0.99);
      world.splice(k * WORLD_STRIDE, WORLD_STRIDE, r4((x - X0) / PX_PER_M), r4((y - hy) / PX_PER_M), r4(q.z));
    }
    frames.push({ t, lm, world });
  }

  return { schemaVersion: 1, model: { variant: 'full', delegate: 'CPU' }, video: { width, height }, frames };
}

/**
 * Framing and two-stage calibration with the default config, when Start is pressed as soon as framing
 * passes: seated for framing (1 s) and the seated hold (2 s); stand up and hold still (2 s); then sit
 * down during the countdown (3 s). The set starts seated.
 */
export const STS_SETTLE: StsSegment[] = [
  { ms: 3600, p: 0 },
  { ms: 1500, from: 0, to: 1 },
  { ms: 2600, p: 1 },
  { ms: 1500, from: 1, to: 0 },
  { ms: 2500, p: 0 },
];

/**
 * One sit, stand, sit cycle. `up` and `down` are the ramp durations; the measured rise and lower times
 * are the part of each ramp between `sitFrac` and `standFrac` (0.65 of it with the default config).
 */
export function cycle(opts: { up?: number; stand?: number; down?: number; sit?: number; peak?: number } = {}): StsSegment[] {
  const peak = opts.peak ?? 1;
  return [
    { ms: opts.up ?? 3000, from: 0, to: peak },
    { ms: opts.stand ?? 1000, p: peak },
    { ms: opts.down ?? 3500, from: peak, to: 0 },
    { ms: opts.sit ?? 1000, p: 0 },
  ];
}
