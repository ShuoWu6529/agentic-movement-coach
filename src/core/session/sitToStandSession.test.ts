// SetSession for sit-to-stand on synthetic traces (PLANS.md §8 M2): full-cycle counting (AC 10),
// tempo and tempo cues (AC 11), targets from config (AC 14), and the M1 gating, randomized-cue and
// log checks re-run for this exercise (AC 16–18, AC 20, R-S1).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cycle, sitToStandTrace, STS_RESUME, STS_SETTLE, type StsSegment } from '../../../fixtures/synthetic/sitToStandTrace';
import type { TargetsConfig } from '../config/schema';
import { buildSessionLog } from '../log/build';
import { logInvariantProblems } from '../log/invariants';
import { SessionLogSchema } from '../log/schema';
import { getRule } from '../rules/registry';
import type { SitToStandSummary } from '../summary';
import type { PoseTrace } from '../trace/schema';
import { replayTrace } from './replay';

const config: TargetsConfig = JSON.parse(readFileSync('public/config/targets.json', 'utf8'));

function withSts(patch: Partial<TargetsConfig['exercises']['sitToStand']>, base = config): TargetsConfig {
  const c = structuredClone(base);
  Object.assign(c.exercises.sitToStand, patch);
  return c;
}

const trace = (segments: StsSegment[], opts: { seed?: number; risePx?: number; leanPx?: number } = {}) =>
  sitToStandTrace({ segments, ...opts });

function run(t: PoseTrace, cfg = config) {
  const { session, snapshots } = replayTrace(t, { config: cfg, exercise: 'sitToStand', side: null });
  const result = session.result();
  const log = result
    ? buildSessionLog(
        result,
        {
          app: { version: 'test', gitSha: 'test' },
          config: { hash: '0'.repeat(64), value: cfg },
          device: { userAgent: 'vitest', camera: { w: 640, h: 480, fps: 30 }, clock: 'trace' },
          model: { variant: 'full', delegate: 'CPU' },
        },
        '',
      )
    : null;
  return { session, snapshots, result, log: log!, summary: result?.summary as SitToStandSummary };
}

type Log = ReturnType<typeof run>['log'];
const cueEvents = (log: Log) => log.events.filter((e): e is Extract<typeof e, { type: 'cue' }> => e.type === 'cue');
const attempts = (log: Log) => log.events.filter((e): e is Extract<typeof e, { type: 'attempt' }> => e.type === 'attempt');
const summaryT = (log: Log) =>
  log.events.find((e): e is Extract<typeof e, { type: 'phase' }> => e.type === 'phase' && e.phase === 'summary')!.t;
const phases = (log: Log) => log.events.filter((e) => e.type === 'phase').map((e) => (e as { phase: string }).phase);

describe('sit-to-stand set on synthetic traces', () => {
  it('walks framing → seated and standing calibration → countdown → active, counting each full cycle once (AC 10)', () => {
    const { log, result, snapshots, summary } = run(trace([...STS_SETTLE, ...cycle(), ...cycle(), ...cycle()]));
    expect(phases(log)).toEqual(['framing', 'calibration', 'countdown', 'active', 'summary']);
    const stages = snapshots.map((s) => s.calibrationStage).filter((s, i, a) => s !== null && s !== a[i - 1]);
    expect(stages).toEqual(['seated', 'standing']);
    expect(result!.calibration.baseline).toEqual(expect.objectContaining({
      seatedShoulderY: expect.any(Number), standingShoulderY: expect.any(Number), trunkPx: expect.any(Number),
    }));
    expect(summary.reps).toBe(3);
    // The counter rises by exactly one per cycle (AC 5, AC 10).
    const steps = snapshots.map((s) => s.reps).filter((r, i, a) => i === 0 || r !== a[i - 1]);
    expect(steps).toEqual([0, 1, 2, 3]);
    // The sit-down after the standing calibration is not a repetition.
    expect(attempts(log).map((a) => a.counted)).toEqual([true, true, true]);
    expect(log).toMatchObject({ exercise: 'sitToStand' });
    expect('side' in log).toBe(false);
  });

  it('does not count a partial rise that never reaches standing (AC 10)', () => {
    const { log, summary } = run(trace([...STS_SETTLE, ...cycle({ peak: 0.6 }), ...cycle(), ...cycle({ peak: 0.75 })]));
    expect(summary.reps).toBe(1);
    expect(attempts(log).map((a) => a.counted)).toEqual([false, true, false]);
    expect(summary.partialRises).toBe(2);
    expect(summary.adjust.join(' ')).toMatch(/2 rises did not reach standing/);
  });

  it('counts with a forward trunk lean during the rise', () => {
    const { summary } = run(trace([...STS_SETTLE, ...cycle(), ...cycle()], { leanPx: 15 }));
    expect(summary.reps).toBe(2);
  });

  it('cues a rise or lower outside the tempo range, not one inside it, and reports tempo in the summary (AC 11)', () => {
    const { log, summary } = run(trace([...STS_SETTLE, ...cycle(), ...cycle({ up: 1000 }), ...cycle({ up: 6000 }),
      ...cycle({ down: 1500 }), ...cycle({ down: 8000 })]), withSts({ reps: 10 }));
    const byAttempt = new Map<number, string[]>();
    for (const c of cueEvents(log)) {
      if (getRule(c.ruleId)?.kind !== 'advice') continue;
      byAttempt.set(c.attemptIndex!, [...(byAttempt.get(c.attemptIndex!) ?? []), c.ruleId]);
    }
    expect([...byAttempt.entries()]).toEqual([
      [1, ['STS-RISE-FAST']], [2, ['STS-RISE-SLOW']], [3, ['STS-LOWER-FAST']], [4, ['STS-LOWER-SLOW']],
    ]);
    expect(cueEvents(log).find((c) => c.attemptIndex === 0)?.ruleId).toBe('STS-TEMPO-GOOD');
    expect(attempts(log).map((a) => a.issues)).toEqual([[], ['too_fast'], ['too_slow'], ['too_fast'], ['too_slow']]);
    for (const c of cueEvents(log)) expect(getRule(c.ruleId)?.category ?? null).toBe(
      { 'STS-RISE-FAST': 'too_fast', 'STS-LOWER-FAST': 'too_fast', 'STS-RISE-SLOW': 'too_slow', 'STS-LOWER-SLOW': 'too_slow' }[c.ruleId] ?? null,
    );

    expect(summary.reps).toBe(5);
    expect(summary.riseMs).toHaveLength(5);
    expect(summary.meanRiseMs).toBeCloseTo(summary.riseMs.reduce((a, b) => a + b) / 5, 6);
    expect(summary.meanLowerMs).toBeGreaterThan(0);
    expect(summary.riseRange).toEqual(config.exercises.sitToStand.riseMs);
    expect(summary.adjust.join(' ')).toMatch(/quicker than the target time to stand up/);
    expect(summary.adjust.join(' ')).toMatch(/slower than the target time to sit down/);
    expect(summary.wentWell.join(' ')).toMatch(/1 repetition was at the target pace/);
    expect(logInvariantProblems(log)).toEqual([]);
  });

  it('shows the last repetition’s tempo cue before the summary, with counting stopped', () => {
    const cfg = withSts({ reps: 2 });
    const { log, summary, snapshots } = run(trace([...STS_SETTLE, ...cycle(), ...cycle({ down: 1500 }), ...cycle(), { ms: 4000, p: 0 }]), cfg);
    expect(summary.reps).toBe(2);
    const last = cueEvents(log).find((c) => c.ruleId === 'STS-LOWER-FAST')!;
    expect(last.attemptIndex).toBe(1);
    const end = { t: summaryT(log) };
    expect(end.t - last.confirmT).toBeGreaterThanOrEqual(config.cues.displayMs);
    expect(end.t - last.confirmT).toBeLessThan(config.cues.displayMs + 100);
    // The cue is on screen for the whole window, the counter stays at 2 and no third attempt starts.
    const window = log.frames.filter((f) => f.t >= last.confirmT && f.t < end.t);
    expect(window.every((f) => f.cue === 'STS-LOWER-FAST' && f.rep === 2)).toBe(true);
    expect(attempts(log)).toHaveLength(2);
    expect(snapshots.some((s) => s.finishing)).toBe(true);
    expect(log.frames.at(-1)).toMatchObject({ cue: null, rep: 2 });
    expect(logInvariantProblems(log)).toEqual([]);
  });

  it('ends the set on the last repetition when it has no tempo issue, with no cue on that frame', () => {
    const { log, summary } = run(trace([...STS_SETTLE, ...cycle(), ...cycle(), { ms: 4000, p: 0 }]), withSts({ reps: 2 }));
    expect(summary.reps).toBe(2);
    const lastAttempt = attempts(log).at(-1)!;
    const end = { t: summaryT(log) };
    expect(end.t).toBe(lastAttempt.t);
    expect(cueEvents(log).map((c) => c.attemptIndex)).toEqual([0]); // no positive cue for the final rep
    expect(log.frames.at(-1)).toMatchObject({ cue: null, rep: 2 });
  });

  it('ends the final-cue window at once when tracking drops, with no cue on the unreliable frame (R-S1)', () => {
    const cfg = withSts({ reps: 1 });
    const { log } = run(trace([...STS_SETTLE, ...cycle({ down: 1500, sit: 300 }), { ms: 2000, noPose: true }]), cfg);
    const last = cueEvents(log).find((c) => c.ruleId === 'STS-LOWER-FAST')!;
    const end = { t: summaryT(log) };
    expect(end.t - last.confirmT).toBeLessThan(config.cues.displayMs);
    expect(log.frames.at(-1)).toMatchObject({ trackingOk: false, cue: null });
    expect(logInvariantProblems(log)).toEqual([]);
  });

  it('changes the count and the tempo cues with the config, not the code (AC 14)', () => {
    const t = trace([...STS_SETTLE, ...cycle({ up: 2000 }), ...cycle({ up: 2000 }), ...cycle({ up: 2000 })]);
    expect(run(t).summary.reps).toBe(3);
    expect(run(t, withSts({ reps: 2 })).summary.reps).toBe(2);
    expect(cueEvents(run(t).log).filter((c) => c.ruleId === 'STS-RISE-FAST')).toEqual([]); // 1.3 s rises
    const strict = run(t, withSts({ riseMs: [1500, 3000] }));
    expect(cueEvents(strict.log).filter((c) => c.ruleId === 'STS-RISE-FAST').map((c) => c.attemptIndex)).toEqual([0, 1, 2]);
    expect(attempts(strict.log).every((a) => a.issues.includes('too_fast'))).toBe(true);
  });

  it('cues every fast repetition when reps come 2.5 s apart, which the old 3 s cooldown would skip', () => {
    const fast = { up: 900, stand: 100, down: 1300, sit: 200 }; // rise ≈ 0.6 s, lower ≈ 0.85 s
    const t = trace([...STS_SETTLE, ...cycle(fast), ...cycle(fast), ...cycle(fast), ...cycle(fast), { ms: 3000, p: 0 }]);
    const perAttempt = (cfg: TargetsConfig) => {
      const { log } = run(t, withSts({ reps: 10 }, cfg));
      const rules = (id: string) => cueEvents(log).filter((c) => c.ruleId === id).map((c) => c.attemptIndex);
      return { attempts: attempts(log).length, rise: rules('STS-RISE-FAST'), lower: rules('STS-LOWER-FAST') };
    };
    const now = perAttempt(config);
    expect(now.attempts).toBe(4);
    expect(now.rise).toEqual([0, 1, 2, 3]);
    expect(now.lower).toEqual([0, 1, 2, 3]);
    const old = structuredClone(config);
    old.cues.cooldownMs = 3000;
    expect(perAttempt(old).rise.length).toBeLessThan(4);
  });

  it('pauses within unreliableAfterMs, discards the rise in progress and keeps completed reps (AC 16, 17)', () => {
    const { log, summary } = run(trace([...STS_SETTLE, ...cycle(),
      { ms: 1500, from: 0, to: 0.7 }, { ms: 1500, noPose: true }, // covered mid-rise
      ...STS_RESUME, ...cycle()]));
    const lost = log.events.find((e) => e.type === 'tracking_lost')!;
    expect(lost.type === 'tracking_lost' && lost.t - lost.firstBadT).toBeGreaterThanOrEqual(config.tracking.unreliableAfterMs);
    expect(lost.type === 'tracking_lost' && lost.t - lost.firstBadT).toBeLessThanOrEqual(config.tracking.unreliableAfterMs + 40);
    // Resume runs the short framing check and then both calibration holds again.
    expect(phases(log)).toEqual(['framing', 'calibration', 'countdown', 'active', 'trackingLost', 'framing', 'calibration', 'countdown', 'active', 'summary']);
    expect(summary.reps).toBe(2);
    expect(attempts(log).map((a) => a.index)).toEqual([0, 2]); // attempt 1 was discarded
    expect(summary.trackingLosses).toBe(1);
  });

  it('does not count a stand completed while tracking was lost (AC 17)', () => {
    // Covered while standing; uncovered once seated again. The lost cycle is never counted.
    const { log, summary } = run(trace([...STS_SETTLE, { ms: 3000, from: 0, to: 1 }, { ms: 300, p: 1 },
      { ms: 2500, noPose: true }, ...STS_RESUME, ...cycle()]));
    expect(summary.reps).toBe(1);
    expect(attempts(log)).toHaveLength(1);
    const lostAt = log.events.find((e) => e.type === 'tracking_lost')!.t;
    const repsWhileLost = log.frames.filter((f) => f.t >= lostAt && !f.trackingOk).map((f) => f.rep);
    expect(new Set(repsWhileLost)).toEqual(new Set([0]));
  });

  it('recalibrates after Resume, so full stands still count when the camera moved during the pause', () => {
    // As in the owner's manual set: covering the camera tilted the laptop lid, and afterwards the
    // whole body sat 45 px lower in the picture at the same distance.
    const tilted = (segs: StsSegment[]) => segs.map((s) => ('noPose' in s ? s : { ...s, shiftY: 45 }));
    const { log, summary, result } = run(trace([...STS_SETTLE, ...cycle(), { ms: 1000, noPose: true },
      ...tilted([...STS_RESUME, ...cycle(), ...cycle()])]));
    expect(summary.reps).toBe(3);
    expect(attempts(log).map((a) => a.counted)).toEqual([true, true, true]);
    // The log keeps the calibration the set started with.
    expect(result!.calibration.t).toBeLessThan(log.events.find((e) => e.type === 'tracking_lost')!.t);
  });

  it('does not count a stand followed by walking toward the camera, which looks like sitting down', () => {
    // As in the owner's manual set: stand up, then walk to the laptop. The body grows in the picture,
    // then the shoulders drop within a frame or two while every joint is still visible, then no pose.
    const walkToLaptop: StsSegment[] = [
      ...STS_SETTLE, ...cycle(),
      { ms: 1000, from: 0, to: 1 }, { ms: 400, p: 1 },
      { ms: 900, p: 1, scaleTo: 1.8 },
      // In the real set the shoulders ended below their seated height (progress about −0.5).
      { ms: 70, from: 1, to: -0.5, scale: 1.8 }, { ms: 100, p: -0.5, scale: 1.8 },
      { ms: 1500, noPose: true }, { ms: 2000, p: 0 },
    ];
    const t = trace(walkToLaptop);
    const { log, summary, snapshots } = run(t);
    expect(summary.reps).toBe(1); // only the real cycle
    expect(attempts(log)).toHaveLength(1); // the approach discarded the second attempt
    const refused = snapshots.filter((s) => s.gate.reason === 'scale');
    expect(refused.length).toBeGreaterThan(0);
    const firstRefused = refused[0]!.t;
    const lost = log.events.find((e) => e.type === 'tracking_lost')!;
    expect(lost.type === 'tracking_lost' && lost.firstBadT).toBe(firstRefused);
    for (const f of log.frames.filter((x) => x.t >= firstRefused && x.t < firstRefused + 300)) {
      expect(f).toMatchObject({ trackingOk: false, cue: null, angles: { standProgress: null } });
    }
    expect(logInvariantProblems(log)).toEqual([]);
    // Without the guard, the approach would have counted as a second repetition.
    expect(run(t, withSts({ maxScaleChange: 1 })).summary.reps).toBe(2);
  });

  it('keeps counting when the body size stays within maxScaleChange', () => {
    const { summary } = run(trace([...STS_SETTLE, ...cycle(), { ms: 500, p: 0, scaleTo: 1.15 },
      ...cycle().map((s) => ({ ...s, scale: 1.15 })), ...cycle().map((s) => ({ ...s, scale: 1.15 }))]));
    expect(summary.reps).toBe(3);
  });

  it('keeps calibrating, and names the shoulder, when standing takes the shoulders out of the picture', () => {
    // Shoulders rise 215 px from y = 220, past the top margin of a 480 px frame.
    const { snapshots, result } = run(trace([...STS_SETTLE, { ms: 3000, p: 0 }], { risePx: 215 }));
    expect(result).toBeNull(); // the set never started
    const texts = snapshots.filter((s) => s.phase === 'calibration').map((s) => s.calibrationText).filter(Boolean);
    expect(texts.some((t) => /shoulder is at the edge of the picture/.test(t!))).toBe(true);
    expect(snapshots.some((s) => s.phase === 'countdown')).toBe(false);
  });

  it('never shows a movement cue on a frame whose gate failed, including during the debounce (R-S1, AC 16, 18)', () => {
    let seed = 11;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 20; k++) {
      const segs: StsSegment[] = [...STS_SETTLE];
      for (let n = 0; n < 6; n++) {
        const peak = rand() < 0.25 ? 0.4 + rand() * 0.4 : 1;
        segs.push({ ms: 600 + rand() * 5000, from: 0, to: peak });
        if (rand() < 0.35) segs.push({ ms: 50 + rand() * 900, noPose: true });
        else segs.push({ ms: 200 + rand() * 1500, p: peak });
        if (rand() < 0.25) segs.push({ ms: 50 + rand() * 600, lowVisibility: true, p: peak });
        segs.push({ ms: 600 + rand() * 6000, from: peak, to: 0 }, { ms: 200 + rand() * 2000, p: 0 });
      }
      const cfg = k % 3 === 0 ? withSts({ reps: 3 }) : config;
      const { log, snapshots } = run(trace(segs, { seed: k + 1 }), cfg);
      for (const s of snapshots) {
        if (!s.gate.ok && s.shown !== null) expect(getRule(s.shown)?.kind).toBe('status');
        if (!s.gate.ok) expect([s.lastRiseMs, s.lastLowerMs]).toEqual([null, null]);
      }
      expect(logInvariantProblems(log)).toEqual([]);
      expect(log.frames.filter((f) => !f.trackingOk).every((f) => f.angles.standProgress === null)).toBe(true);
    }
  });

  it('writes a log that validates against the schema, with progress, tempo and cue timing (AC 20, 21)', () => {
    const { log } = run(trace([...STS_SETTLE, ...cycle(), ...cycle({ up: 1000 }), { ms: 800, noPose: true }, ...STS_RESUME,
      { ms: 4500, p: 0 }, ...cycle()]));
    const parsed = SessionLogSchema.safeParse(log);
    expect(parsed.success, JSON.stringify(parsed.error?.issues.slice(0, 3))).toBe(true);
    expect(logInvariantProblems(log)).toEqual([]);
    for (const f of log.frames) expect(Object.keys(f.angles).sort()).toEqual(['shoulderWidthPx', 'shoulderY', 'standProgress']);
    for (const a of attempts(log).filter((x) => x.counted)) {
      expect(a.riseMs).toEqual(expect.any(Number));
      expect(a.lowerMs).toEqual(expect.any(Number));
    }
    const cue = cueEvents(log).find((c) => c.ruleId === 'STS-RISE-FAST')!;
    expect(log.frames.find((f) => f.t === cue.confirmT)?.cue).toBe('STS-RISE-FAST');
    expect(cue.onsetT).toBeLessThanOrEqual(cue.confirmT);
  });
});
