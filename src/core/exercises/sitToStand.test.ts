// Sit-to-stand engine and calibration (AC 10, AC 11, AC 14), on progress series and synthetic traces.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sitToStandTrace, type StsSegment } from '../../../fixtures/synthetic/sitToStandTrace';
import type { TargetsConfig } from '../config/schema';
import { SitToStandCalibration, SitToStandEngine, SitToStandExercise, type SitToStandStep } from './sitToStand';

const config: TargetsConfig = JSON.parse(readFileSync('public/config/targets.json', 'utf8'));
const sts = config.exercises.sitToStand;

type Seg = { ms: number; p: number } | { ms: number; from: number; to: number };

/** Progress samples at 30 fps from a list of holds and linear ramps. */
function samples(segs: Seg[], fps = 30): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let start = 0;
  for (const s of segs) {
    const n = Math.round((s.ms * fps) / 1000);
    for (let i = 0; i < n; i++) {
      const k = i / n;
      out.push([start + (i * 1000) / fps, 'p' in s ? s.p : s.from + (s.to - s.from) * k]);
    }
    start += s.ms;
  }
  return out;
}

function run(segs: Seg[], cfg = sts) {
  const e = new SitToStandEngine(cfg);
  const steps: Array<SitToStandStep & { t: number; reps: number; conditions: string[] }> = [];
  for (const [t, p] of samples(segs)) {
    const r = e.step(t, p);
    steps.push({ ...r, t, reps: e.reps, conditions: e.conditions().map((c) => c.ruleId) });
  }
  const ended = steps.flatMap((s) => (s.ended ? [s.ended] : []));
  return { e, steps, ended };
}

const seated = (ms = 1000): Seg => ({ ms, p: 0 });
/** A full cycle with ramps `up` and `down` ms long, so measured times are 0.65 of each. */
const full = (up = 3000, down = 3500, peak = 1): Seg[] => [
  { ms: up, from: 0, to: peak }, { ms: 1000, p: peak }, { ms: down, from: peak, to: 0 }, seated(),
];

describe('sit-to-stand engine', () => {
  it('counts one repetition per full sit, stand, sit cycle, when seated again (AC 10)', () => {
    const { e, steps, ended } = run([seated(), ...full(), ...full(), ...full()]);
    expect(e.reps).toBe(3);
    const counts = steps.map((s) => s.reps).filter((r, i, a) => i === 0 || r !== a[i - 1]);
    expect(counts).toEqual([0, 1, 2, 3]);
    // The counter rises on the frame the patient is seated again, not while standing.
    for (const s of steps.filter((x) => x.repCounted)) expect(s.ended?.counted).toBe(true);
    expect(ended.map((a) => a.counted)).toEqual([true, true, true]);
    expect(ended[0]!.riseMs).toBeCloseTo(0.65 * 3000, -2);
    expect(ended[0]!.lowerMs).toBeCloseTo(0.65 * 3500, -2);
  });

  it('does not count a partial rise that never reaches standing (AC 10)', () => {
    const { e, ended } = run([seated(), ...full(3000, 3500, 0.7), ...full()]);
    expect(e.reps).toBe(1);
    expect(ended.map((a) => a.counted)).toEqual([false, true]);
    expect(ended[0]).toMatchObject({ index: 0, issues: [] });
    expect(ended[0]!.riseMs).toBeUndefined();
    expect(ended[0]!.peak).toBeCloseTo(0.7, 1);
  });

  it('counts a double bounce at the top once, timing the lower from the last time it left standing', () => {
    const { e, ended } = run([seated(), { ms: 2000, from: 0, to: 1 }, { ms: 500, from: 1, to: 0.5 }, { ms: 500, from: 0.5, to: 1 },
      { ms: 500, p: 1 }, { ms: 3000, from: 1, to: 0 }, seated()]);
    expect(e.reps).toBe(1);
    expect(ended).toHaveLength(1);
    expect(ended[0]!.lowerMs).toBeCloseTo(0.65 * 3000, -2);
  });

  it('does not count a bounce at the bottom that stays below sitFrac', () => {
    const { e, ended } = run([seated(), { ms: 300, from: 0, to: sts.sitFrac - 0.05 }, { ms: 300, from: sts.sitFrac - 0.05, to: 0 }, seated()]);
    expect(e.reps).toBe(0);
    expect(ended).toEqual([]);
  });

  it('waits until the patient is seated before an attempt can start', () => {
    // The set starts while standing (straight after the standing calibration): sitting down is not a rep.
    const { e, ended } = run([{ ms: 1000, p: 1 }, { ms: 3000, from: 1, to: 0 }, seated(), ...full()]);
    expect(e.reps).toBe(1);
    expect(ended).toHaveLength(1);
  });

  it('discards the attempt in progress on tracking loss and needs a seated frame before the next one (AC 17)', () => {
    const e = new SitToStandEngine(sts);
    for (const [t, p] of samples([seated(), { ms: 2000, from: 0, to: 1 }, { ms: 500, p: 1 }])) e.step(t, p);
    expect(e.state).toBe('standing');
    expect(e.discard()).toBeNull();
    expect(e.conditions()).toEqual([]);
    // Back from tracking loss while standing: sitting down does not complete the lost attempt.
    for (const [t, p] of samples([{ ms: 500, p: 1 }, { ms: 3000, from: 1, to: 0 }, seated()]).map(([t, p]) => [t + 10000, p])) {
      expect(e.step(t!, p!).ended).toBeNull();
    }
    expect(e.reps).toBe(0);
    expect(e.state).toBe('seated');
  });

  it('flags a rise or lower outside the configured tempo range, and not one inside it (AC 11)', () => {
    const cases: Array<[string, Seg[], string[], string[]]> = [
      ['in range', full(3000, 3500), [], []],
      ['fast rise', full(1000, 3500), ['too_fast'], ['STS-RISE-FAST']],
      ['slow rise', full(6000, 3500), ['too_slow'], ['STS-RISE-SLOW']],
      ['fast lower', full(3000, 1500), ['too_fast'], ['STS-LOWER-FAST']],
      ['slow lower', full(3000, 8000), ['too_slow'], ['STS-LOWER-SLOW']],
      ['fast rise and fast lower', full(1000, 1500), ['too_fast'], ['STS-RISE-FAST', 'STS-LOWER-FAST']],
    ];
    for (const [name, segs, issues, rules] of cases) {
      const { ended, steps } = run([seated(), ...segs]);
      expect(ended[0]!.issues, name).toEqual(issues);
      const seen = new Set(steps.flatMap((s) => s.conditions));
      expect([...seen], name).toEqual(rules);
      const good = steps.flatMap((s) => s.events.map((ev) => ev.ruleId));
      expect(good, name).toEqual(issues.length === 0 ? ['STS-TEMPO-GOOD'] : []);
    }
  });

  it('raises the rise condition when standing is reached and the lower condition when seated again', () => {
    const { steps } = run([seated(), ...full(1000, 1500)]);
    const riseAt = steps.find((s) => s.conditions.includes('STS-RISE-FAST'))!;
    const lowerAt = steps.find((s) => s.conditions.includes('STS-LOWER-FAST'))!;
    expect(riseAt.ended).toBeNull(); // while still standing, mid-attempt
    expect(lowerAt.ended?.counted).toBe(true); // the frame the repetition counts
    // Both last until the next attempt starts.
    const next = run([seated(), ...full(1000, 1500), ...full()]).steps;
    const start2 = next.find((s) => s.startedAttempt === 1)!;
    expect(start2.conditions).toEqual([]);
  });

  it('follows the configured thresholds and tempo ranges, not literals (AC 14)', () => {
    const segs = [seated(), ...full(3000, 3500, 0.8)];
    expect(run(segs).e.reps).toBe(0); // peak 0.8 is below standFrac 0.85
    expect(run(segs, { ...sts, standFrac: 0.75 }).e.reps).toBe(1);
    const fast = run([seated(), ...full(2000, 3500)]).ended[0]!; // 1.3 s rise
    expect(fast.issues).toEqual([]);
    expect(run([seated(), ...full(2000, 3500)], { ...sts, riseMs: [1500, 3000] }).ended[0]!.issues).toEqual(['too_fast']);
  });
});

describe('sit-to-stand calibration', () => {
  const video = { width: 640, height: 480 };

  function calibrate(segments: StsSegment[], cfg = config) {
    const ex = new SitToStandExercise(cfg, video);
    ex.beginCalibration();
    const stages: string[] = [];
    for (const f of sitToStandTrace({ segments }).frames) {
      const s = ex.calibrate(f, ex.measure(f));
      stages.push(s.stage);
      if (s.done) break;
    }
    return { ex, stages };
  }

  it('records the seated height, then a still standing height (two stages)', () => {
    const { ex, stages } = calibrate([{ ms: 2500, p: 0 }, { ms: 1500, from: 0, to: 1 }, { ms: 2500, p: 1 }]);
    const b = ex.calibration!.baseline;
    expect(b.seatedShoulderY).toBeCloseTo(220, 0);
    expect(b.trunkPx).toBeCloseTo(120, 0);
    expect(b.standingShoulderY).toBeCloseTo(124, -1);
    expect(stages.indexOf('standing')).toBeGreaterThan(0);
  });

  it('does not accept a still pose that has not risen minStandRise trunk lengths', () => {
    // Holding still at 0.3 of the 96 px stand rises about 29 px, below 0.4 × 120 px = 48 px.
    const low = calibrate([{ ms: 2500, p: 0 }, { ms: 600, from: 0, to: 0.3 }, { ms: 4000, p: 0.3 }]);
    expect(low.ex.calibration).toBeNull();
    // The same pose passes with a lower configured minimum.
    const cfg = structuredClone(config);
    cfg.exercises.sitToStand.minStandRise = 0.2;
    expect(calibrate([{ ms: 2500, p: 0 }, { ms: 600, from: 0, to: 0.3 }, { ms: 4000, p: 0.3 }], cfg).ex.calibration).not.toBeNull();
  });

  it('starts again from the seated stage after a reset', () => {
    const cal = new SitToStandCalibration(config.calibration, sts.minStandRise);
    const ex = new SitToStandExercise(config, video);
    const frames = sitToStandTrace({ segments: [{ ms: 2500, p: 0 }] }).frames;
    for (const f of frames) cal.step(f, ex.measure(f));
    expect(cal.stage).toBe('standing');
    cal.reset();
    expect(cal.stage).toBe('seated');
  });
});
