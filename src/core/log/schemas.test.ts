import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { configHash } from '../config/hash';
import { LM_STRIDE, NUM_LANDMARKS, PoseTraceSchema, WORLD_STRIDE } from '../trace/schema';
import { SessionLogSchema } from './schema';

const config = JSON.parse(readFileSync('public/config/targets.json', 'utf8'));

async function minimalLog() {
  return {
    schemaVersion: 2,
    app: { version: '0.0.0', gitSha: 'abc1234' },
    config: { hash: await configHash(config), value: config },
    exercise: 'kneeExtension',
    side: 'left',
    device: { userAgent: 'test', camera: { w: 640, h: 480, fps: 30 }, clock: 'captureTime' },
    model: { variant: 'full', delegate: 'GPU' },
    calibration: { t: 0, baseline: { kneeFlexion: 85 } },
    frames: [
      { t: 0, angles: { kneeFlexion: 84.9 }, state: 'rest', trackingOk: true, conf: 0.93, cue: null, rep: 0 },
      { t: 33, angles: { kneeFlexion: null }, state: 'rest', trackingOk: false, conf: 0.1, cue: null, rep: 0 },
    ],
    events: [
      { type: 'phase', t: 0, phase: 'active' },
      { type: 'attempt', t: 20, tStart: 5, index: 0, counted: false, peak: 22, holdMs: 0, issues: ['insufficient_range'] },
      { type: 'cue', ruleId: 'KE-RANGE-LOW', attemptIndex: 0, onsetT: 10, confirmT: 15, shownAt: 18 },
      { type: 'tracking_lost', t: 33, firstBadT: 33 },
      { type: 'tracking_recovered', t: 66 },
    ],
    observerNote: '',
  };
}

describe('session log schema v2', () => {
  it('accepts a minimal log with every event type', async () => {
    expect(SessionLogSchema.safeParse(await minimalLog()).success).toBe(true);
  });

  it('still accepts a log recorded in M1, whose embedded config is v1 (no minStandRise)', async () => {
    const log = await minimalLog();
    const v1 = structuredClone(config);
    v1.schemaVersion = 1;
    delete v1.exercises.sitToStand.minStandRise;
    expect(SessionLogSchema.safeParse({ ...log, config: { ...log.config, value: v1 } }).success).toBe(true);
    // Each version is checked against its own shape: v1 with the v2 field, or v2 without it, is rejected.
    expect(SessionLogSchema.safeParse({ ...log, config: { ...log.config, value: { ...v1, exercises: config.exercises } } }).success).toBe(false);
    expect(SessionLogSchema.safeParse({ ...log, config: { ...log.config, value: { ...config, exercises: v1.exercises } } }).success).toBe(false);
    expect(SessionLogSchema.safeParse({ ...log, config: { ...log.config, value: { ...config, schemaVersion: 3 } } }).success).toBe(false);
  });

  it('rejects an unknown schemaVersion and a missing observer note', async () => {
    const log = await minimalLog();
    expect(SessionLogSchema.safeParse({ ...log, schemaVersion: 1 }).success).toBe(false);
    expect(SessionLogSchema.safeParse({ ...log, schemaVersion: 3 }).success).toBe(false);
    const noNote: Partial<typeof log> = { ...log };
    delete noNote.observerNote;
    expect(SessionLogSchema.safeParse(noNote).success).toBe(false);
  });
});

describe('pose trace schema v1', () => {
  const frame = (t: number) => ({
    t,
    lm: Array(NUM_LANDMARKS * LM_STRIDE).fill(0.5),
    world: Array(NUM_LANDMARKS * WORLD_STRIDE).fill(0),
  });
  const trace = {
    schemaVersion: 1,
    model: { variant: 'lite', delegate: 'CPU' },
    video: { width: 640, height: 480 },
    frames: [frame(0), { t: 33, lm: null, world: null }],
  };

  it('accepts frames with and without a pose', () => {
    expect(PoseTraceSchema.safeParse(trace).success).toBe(true);
  });

  it('rejects a landmark array of the wrong length', () => {
    const bad = { ...trace, frames: [{ ...frame(0), lm: [0.5, 0.5] }] };
    expect(PoseTraceSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects half a pose', () => {
    for (const half of [{ ...frame(0), world: null }, { ...frame(0), lm: null }]) {
      expect(PoseTraceSchema.safeParse({ ...trace, frames: [half] }).success).toBe(false);
    }
  });

  it('rejects timestamps that repeat or go backwards', () => {
    for (const ts of [[0, 33, 33], [0, 33, 20]]) {
      const frames = ts.map((t) => ({ t, lm: null, world: null }));
      expect(PoseTraceSchema.safeParse({ ...trace, frames }).success).toBe(false);
    }
  });
});
