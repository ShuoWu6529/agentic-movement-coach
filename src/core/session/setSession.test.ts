// SetSession on synthetic traces: counting, targets from config (AC 14), gating (AC 16–18, R-S1),
// the log (AC 20) and the summary (AC 6).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extension, kneeTrace, SETTLE, type Segment } from '../../../fixtures/synthetic/kneeTrace';
import type { TargetsConfig } from '../config/schema';
import { buildSessionLog } from '../log/build';
import { logInvariantProblems } from '../log/invariants';
import { SessionLogSchema } from '../log/schema';
import { getRule } from '../rules/registry';
import type { KneeSummary } from '../summary';
import type { PoseTrace } from '../trace/schema';
import { replayTrace } from './replay';
import { SetSession, type SetSnapshot } from './setSession';

const config: TargetsConfig = JSON.parse(readFileSync('public/config/targets.json', 'utf8'));

function withKnee(patch: Partial<TargetsConfig['exercises']['kneeExtension']>, base = config): TargetsConfig {
  const c = structuredClone(base);
  Object.assign(c.exercises.kneeExtension, patch);
  return c;
}

const trace = (segments: Segment[], side: 'left' | 'right' = 'left', seed = 1) => kneeTrace({ side, segments, seed });

function run(t: PoseTrace, cfg = config, side: 'left' | 'right' = 'left') {
  const { session, snapshots } = replayTrace(t, { config: cfg, exercise: 'kneeExtension', side });
  const result = session.result()!;
  const log = buildSessionLog(
    result,
    {
      app: { version: 'test', gitSha: 'test' },
      config: { hash: '0'.repeat(64), value: cfg },
      device: { userAgent: 'vitest', camera: { w: 640, h: 480, fps: 30 }, clock: 'trace' },
      model: { variant: 'full', delegate: 'CPU' },
    },
    '',
  );
  return { session, snapshots, result, log, summary: result.summary as KneeSummary };
}

const cueEvents = (log: ReturnType<typeof run>['log']) =>
  log.events.filter((e): e is Extract<typeof e, { type: 'cue' }> => e.type === 'cue');

describe('set session on synthetic traces', () => {
  it('walks framing → calibration → countdown → active → summary and counts each held rep once', () => {
    const { log, result, snapshots, summary } = run(trace([...SETTLE, ...extension(5, 3500), ...extension(8, 3500), ...extension(10, 3500)]));
    expect(log.events.filter((e) => e.type === 'phase').map((e) => (e as { phase: string }).phase)).toEqual([
      'framing', 'calibration', 'countdown', 'active', 'summary',
    ]);
    expect(result.summary.reps).toBe(3);
    // The counter rises by exactly one per completed hold (AC 5, AC 8).
    const steps = snapshots.map((s) => s.reps).filter((r, i, a) => i === 0 || r !== a[i - 1]);
    expect(steps).toEqual([0, 1, 2, 3]);
    expect(result.calibration.baseline.kneeFlexion).toBeCloseTo(90, 0);
    expect(summary.bestFlexion).toBeLessThan(8);
    expect(result.summary.wentWell.length).toBeGreaterThan(0);
  });

  it('shows the knee angle continuously during the set and a hold timer that counts down (AC 8)', () => {
    const { snapshots } = run(trace([...SETTLE, ...extension(5, 3500)]));
    const active = snapshots.filter((s) => s.phase === 'active');
    expect(active.every((s) => s.angle !== null)).toBe(true);
    const timers = active.map((s) => s.holdRemainingMs).filter((v): v is number => v !== null);
    expect(timers.length).toBeGreaterThan(30);
    expect(timers[0]).toBeGreaterThan(timers.at(-1)!);
  });

  it('cues insufficient range below the target, and not at target ± tolerance (AC 9)', () => {
    const short = run(trace([...SETTLE, ...extension(25, 2000)]));
    const cues = cueEvents(short.log);
    expect(cues.map((c) => c.ruleId)).toEqual(['KE-RANGE-LOW']);
    expect(getRule(cues[0]!.ruleId)?.category).toBe('insufficient_range');
    expect(short.log.events).toContainEqual(expect.objectContaining({ type: 'attempt', index: cues[0]!.attemptIndex, issues: ['insufficient_range'] }));

    const band = config.exercises.kneeExtension.targetFlexionAtMostDeg + config.exercises.kneeExtension.toleranceDeg;
    for (const peak of [band - 2, config.exercises.kneeExtension.targetFlexionAtMostDeg]) {
      const ok = run(trace([...SETTLE, ...extension(peak, 3500)]));
      expect(cueEvents(ok.log).map((c) => c.ruleId)).not.toContain('KE-RANGE-LOW');
      expect(ok.result.summary.reps).toBe(1);
    }
  });

  it('clears an insufficient-range cue when the next attempt starts, so it never shows at the target (AC 9)', () => {
    // A short attempt, then a quick second lift that reaches the band well within cues.displayMs of the cue.
    const { log } = run(trace([...SETTLE, ...extension(25, 1500, { lowerMs: 800, restMs: 100 }), ...extension(5, 3500, { liftMs: 600 })]));
    const cue = cueEvents(log).find((c) => c.ruleId === 'KE-RANGE-LOW');
    expect(cue?.attemptIndex).toBe(0);
    const next = log.events.find((e) => e.type === 'attempt' && e.index === 1) as { tStart: number } | undefined;
    expect(next).toBeDefined();
    expect(next!.tStart - cue!.confirmT).toBeLessThan(config.cues.displayMs); // the cue would still be up without the fix
    const shown = log.frames.filter((f) => f.cue === 'KE-RANGE-LOW');
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every((f) => f.t < next!.tStart)).toBe(true);
    const band = config.exercises.kneeExtension.targetFlexionAtMostDeg + config.exercises.kneeExtension.toleranceDeg;
    expect(shown.every((f) => (f.angles.kneeFlexion ?? Infinity) > band)).toBe(true);
  });

  it('cues a broken hold', () => {
    const { log } = run(trace([...SETTLE, { ms: 1200, from: 90, to: 8 }, { ms: 1500, flexion: 8 }, { ms: 300, from: 8, to: 25 },
      { ms: 1000, flexion: 25 }, { ms: 1000, from: 25, to: 90 }, { ms: 800, flexion: 90 }]));
    expect(cueEvents(log).map((c) => c.ruleId)).toEqual(['KE-HOLD-BREAK']);
    expect(log.events).toContainEqual(expect.objectContaining({ type: 'attempt', issues: ['hold_break'] }));
  });

  it('changes count, hold length and cue timing with the config, not the code (AC 14)', () => {
    const t = trace([...SETTLE, ...extension(12, 2500), ...extension(12, 2500), ...extension(12, 2500)]);
    const a = run(t, withKnee({ holdSeconds: 2, reps: 10 }));
    const b = run(t, withKnee({ holdSeconds: 3, reps: 10 }));
    const c = run(t, withKnee({ holdSeconds: 2, reps: 2 }));
    expect(a.result.summary.reps).toBe(3);
    expect(b.result.summary.reps).toBe(0); // 2.5 s holds fall short of 3 s
    expect(c.result.summary.reps).toBe(2); // the set ends at the configured total
    expect(a.summary.holdsMs.every((h) => h === 2000)).toBe(true);

    const tight = withKnee({ targetFlexionAtMostDeg: 5, toleranceDeg: 2 });
    expect(cueEvents(run(t, tight).log).map((e) => e.ruleId)).toContain('KE-RANGE-LOW');
    expect(cueEvents(run(t, withKnee({ holdSeconds: 2 })).log).map((e) => e.ruleId)).not.toContain('KE-RANGE-LOW');

    const slowCue = structuredClone(config);
    slowCue.cues.dwellMs['KE-RANGE-LOW'] = 600;
    const short = trace([...SETTLE, ...extension(30, 1500)]);
    const fast = cueEvents(run(short).log)[0]!;
    const slow = cueEvents(run(short, slowCue).log)[0]!;
    expect(slow.onsetT).toBe(fast.onsetT);
    expect(slow.confirmT - fast.confirmT).toBeGreaterThanOrEqual(300);
  });

  it('pauses within unreliableAfterMs of the first bad frame and keeps completed reps (AC 16, 17)', () => {
    const { log, result } = run(trace([...SETTLE, ...extension(5, 3500), { ms: 1500, noPose: true }, { ms: 2500, flexion: 90 },
      ...SETTLE.map((s) => ({ ...s, ms: 4500 })), ...extension(5, 3500)]));
    const lost = log.events.find((e) => e.type === 'tracking_lost')!;
    expect(lost.type === 'tracking_lost' && lost.t - lost.firstBadT).toBeLessThanOrEqual(config.tracking.unreliableAfterMs + 40);
    expect(lost.type === 'tracking_lost' && lost.t - lost.firstBadT).toBeGreaterThanOrEqual(config.tracking.unreliableAfterMs);
    const phases = log.events.filter((e) => e.type === 'phase').map((e) => (e as { phase: string }).phase);
    expect(phases).toEqual(['framing', 'calibration', 'countdown', 'active', 'trackingLost', 'framing', 'countdown', 'active', 'summary']);
    expect(log.events.some((e) => e.type === 'tracking_recovered')).toBe(true);
    expect(result.summary.reps).toBe(2);
    expect(result.summary.trackingLosses).toBe(1);
    expect(result.summary.adjust.join(' ')).toMatch(/lost sight/);
  });

  it('discards an attempt when tracking drops mid-hold, even if it comes back quickly (AC 17)', () => {
    const { log, result } = run(trace([...SETTLE, { ms: 1200, from: 90, to: 5 }, { ms: 1500, flexion: 5 },
      { ms: 150, noPose: true }, { ms: 2500, flexion: 5 }, { ms: 1200, from: 5, to: 90 }, { ms: 800, flexion: 90 }]));
    expect(log.events.some((e) => e.type === 'tracking_lost')).toBe(false); // shorter than the debounce
    expect(result.summary.reps).toBe(0);
    expect(log.events.filter((e) => e.type === 'attempt')).toEqual([]);
  });

  it('also treats a required joint dropping out of view as unreliable', () => {
    const { log } = run(trace([...SETTLE, { ms: 1200, from: 90, to: 5 }, { ms: 1000, lowVisibility: true, flexion: 5 }, { ms: 500, flexion: 90 }]));
    expect(log.events.some((e) => e.type === 'tracking_lost')).toBe(true);
    expect(log.frames.filter((f) => !f.trackingOk).every((f) => f.angles.kneeFlexion === null)).toBe(true);
  });

  it('never shows a movement cue on a frame whose gate failed, including during the debounce (R-S1, AC 16, 18)', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 25; k++) {
      const segs: Segment[] = [...SETTLE];
      for (let n = 0; n < 6; n++) {
        const peak = 2 + rand() * 30;
        segs.push({ ms: 600 + rand() * 900, from: 90, to: peak });
        segs.push(rand() < 0.35 ? { ms: 50 + rand() * 900, noPose: true } : { ms: 300 + rand() * 3500, flexion: peak });
        if (rand() < 0.25) segs.push({ ms: 50 + rand() * 600, lowVisibility: true, flexion: peak });
        segs.push({ ms: 600 + rand() * 900, from: peak, to: 90 }, { ms: 300 + rand() * 1500, flexion: 90 });
      }
      const { log, snapshots } = run(trace(segs, k % 2 ? 'left' : 'right', k + 1), config, k % 2 ? 'left' : 'right');
      for (const s of snapshots) {
        if (!s.gate.ok && s.shown !== null) expect(getRule(s.shown)?.kind).toBe('status');
        if (!s.gate.ok) expect(s.angle).toBeNull();
      }
      expect(logInvariantProblems(log)).toEqual([]);
    }
  });

  it('cannot start before framing passes, and never starts the set before calibration completes (AC 4)', () => {
    const t = trace([{ ms: 300, flexion: 90 }, { ms: 6000, flexion: 90 }]);
    const s = new SetSession({ config, exercise: 'kneeExtension', side: 'left', video: t.video });
    s.step(t.frames[0]!);
    expect(s.startSet()).toBe(false);
    let started = false;
    const seen: SetSnapshot['phase'][] = [];
    for (const f of t.frames.slice(1)) {
      const snap = s.step(f)!;
      if (snap.canStart && !started) started = s.startSet();
      seen.push(s.phase);
    }
    const firstCountdown = seen.indexOf('countdown');
    expect(seen.lastIndexOf('calibration')).toBe(firstCountdown - 1);
    expect(seen.indexOf('active')).toBeGreaterThan(firstCountdown);
    expect(s.endSet()).toBe(true);
  });

  it('restarts calibration when the patient moves, and returns to framing if tracking drops in the countdown', () => {
    const moving = run(trace([{ ms: 1100, flexion: 90 }, { ms: 1000, flexion: 90 }, { ms: 600, from: 90, to: 40 }, { ms: 600, from: 40, to: 90 }, { ms: 6000, flexion: 90 }]));
    const phases = moving.log.events.filter((e) => e.type === 'phase');
    const cal = phases.find((e) => e.type === 'phase' && e.phase === 'calibration')!;
    const cd = phases.find((e) => e.type === 'phase' && e.phase === 'countdown')!;
    expect(cd.t - cal.t).toBeGreaterThan(config.calibration.durationMs + 1000);

    const dropped = run(trace([{ ms: 3500, flexion: 90 }, { ms: 200, noPose: true }, { ms: 10000, flexion: 90 }]));
    const seq = dropped.log.events.filter((e) => e.type === 'phase').map((e) => (e as { phase: string }).phase);
    expect(seq.slice(0, 5)).toEqual(['framing', 'calibration', 'countdown', 'framing', 'calibration']);
  });

  it('produces a summary with a note for a set with no repetitions (AC 6)', () => {
    const t = trace([...SETTLE, { ms: 3000, flexion: 90 }]);
    const { result, summary } = run(t);
    expect(result.summary.reps).toBe(0);
    expect(result.summary.wentWell.length + result.summary.adjust.length).toBeGreaterThan(0);
    expect(Math.abs(summary.bestFlexion! - 90)).toBeLessThan(3);
  });

  it('writes a log that validates against the schema and keeps its invariants (AC 18, AC 20)', () => {
    const { log } = run(trace([...SETTLE, ...extension(5, 3500), ...extension(25, 1500), { ms: 1000, noPose: true },
      { ms: 2500, flexion: 90 }, { ms: 4500, flexion: 90 }, ...extension(5, 3500)]));
    const parsed = SessionLogSchema.safeParse(log);
    expect(parsed.success, JSON.stringify(parsed.error?.issues.slice(0, 3))).toBe(true);
    expect(logInvariantProblems(log)).toEqual([]);
    for (const f of log.frames) {
      expect(f).toEqual(expect.objectContaining({ t: expect.any(Number), state: expect.any(String), trackingOk: expect.any(Boolean), conf: expect.any(Number) }));
      expect('kneeFlexion' in f.angles).toBe(true);
    }
    const cue = cueEvents(log)[0]!;
    expect(log.frames.find((f) => f.t === cue.confirmT)?.cue).toBe(cue.ruleId);
  });

  it('commits no cue on the frame that completes the last repetition, since the summary replaces the screen', () => {
    const { log, result } = run(trace([...SETTLE, ...extension(5, 3500), ...extension(5, 3500)]), withKnee({ reps: 2 }));
    expect(result.summary.reps).toBe(2);
    const done = cueEvents(log).filter((c) => c.ruleId === 'KE-HOLD-DONE');
    expect(done.map((c) => c.attemptIndex)).toEqual([0]);
    expect(log.frames.at(-1)).toMatchObject({ rep: 2, cue: null });
    expect(logInvariantProblems(log)).toEqual([]);
  });

  it('lets the display adapter record when a cue reached the screen', () => {
    const t = trace([...SETTLE, ...extension(25, 1500)]);
    const s = new SetSession({ config, exercise: 'kneeExtension', side: 'left', video: t.video });
    for (const f of t.frames) {
      const snap = s.step(f);
      if (snap?.canStart) s.startSet();
      if (snap?.commit) s.markCueShown(snap.commit.seq, snap.t + 12);
    }
    s.endSet();
    const cue = s.result()!.events.find((e) => e.type === 'cue')!;
    expect(cue.type === 'cue' && cue.shownAt - cue.confirmT).toBe(12);
  });

  it('flags an advice cue on an unreliable frame in a tampered log', () => {
    const { log } = run(trace([...SETTLE, ...extension(5, 3500)]));
    const bad = structuredClone(log);
    bad.frames[bad.frames.length - 1] = { ...bad.frames.at(-1)!, trackingOk: false, cue: 'KE-RANGE-LOW' };
    expect(logInvariantProblems(bad).join()).toMatch(/advice cue KE-RANGE-LOW on a frame with unreliable tracking/);
  });
});
