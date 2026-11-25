// AC 8 and AC 9 at the engine level, per docs/definitions.md. Default targets: band ≤ 15° (10 + 5),
// hold 3 s, attempt starts below 60°, reversal 10°.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { TargetsConfig } from '../config/schema';
import { KneeExtensionEngine } from './kneeExtension';

const config: TargetsConfig = JSON.parse(readFileSync('public/config/targets.json', 'utf8'));
const ke = config.exercises.kneeExtension;

/** Feeds (ms, flexion) pairs at 30 fps, linearly between knots. */
function run(engine: KneeExtensionEngine, knots: Array<[number, number]>) {
  const out = { reps: [] as number[], ended: [] as ReturnType<KneeExtensionEngine['step']>['ended'][] };
  for (let k = 1; k < knots.length; k++) {
    const [t0, f0] = knots[k - 1]!;
    const [t1, f1] = knots[k]!;
    for (let t = t0; t < t1; t += 1000 / 30) {
      const r = engine.step(t, f0 + ((f1 - f0) * (t - t0)) / (t1 - t0));
      if (r.repCounted) out.reps.push(t);
      if (r.ended) out.ended.push(r.ended);
    }
  }
  return out;
}

describe('knee extension engine', () => {
  it('counts a repetition when the hold completes, before the leg comes down (AC 8)', () => {
    const e = new KneeExtensionEngine(ke);
    const r = run(e, [[0, 90], [1000, 90], [2000, 8], [5500, 8], [6500, 90], [7000, 90]]);
    expect(r.reps).toHaveLength(1);
    expect(r.reps[0]).toBeGreaterThanOrEqual(2000 + 3000 - 200); // band entered just before 2 s
    expect(r.reps[0]).toBeLessThan(5500);
    expect(r.ended).toEqual([expect.objectContaining({ index: 0, counted: true, issues: [], holdMs: 3000 })]);
    expect(e.reps).toBe(1);
  });

  it('shows the hold counting down while the knee stays in the band', () => {
    const e = new KneeExtensionEngine(ke);
    run(e, [[0, 90], [1000, 90], [2000, 8], [3000, 8]]);
    const remaining = e.holdRemainingMs()!;
    expect(remaining).toBeGreaterThan(1000);
    expect(remaining).toBeLessThan(3000);
  });

  it('resets the timer on a hold break and logs hold_break if no hold completes', () => {
    const e = new KneeExtensionEngine(ke);
    const r = run(e, [[0, 90], [1000, 90], [2000, 8], [3500, 8], [3700, 20], [4000, 20], [5000, 90], [5500, 90]]);
    expect(r.reps).toHaveLength(0);
    expect(r.ended).toEqual([expect.objectContaining({ counted: false, issues: ['hold_break'] })]);
    expect(r.ended[0]!.holdMs).toBeGreaterThan(1300);
    expect(r.ended[0]!.holdMs).toBeLessThan(3000);
  });

  it('logs insufficient_range when the band is never reached', () => {
    const e = new KneeExtensionEngine(ke);
    const r = run(e, [[0, 90], [1000, 90], [2000, 25], [4000, 25], [5000, 90], [5500, 90]]);
    expect(r.reps).toHaveLength(0);
    expect(r.ended).toEqual([expect.objectContaining({ counted: false, issues: ['insufficient_range'], peak: expect.closeTo(25, 0) })]);
    expect(e.conditions()).toEqual([{ ruleId: 'KE-RANGE-LOW', attemptIndex: 0 }]);
  });

  it('treats the band edge as reached: flexion at target + tolerance counts (AC 9)', () => {
    const band = ke.targetFlexionAtMostDeg + ke.toleranceDeg;
    const e = new KneeExtensionEngine(ke);
    const r = run(e, [[0, 90], [1000, 90], [2000, band], [5500, band], [6500, 90], [7000, 90]]);
    expect(r.reps).toHaveLength(1);
    expect(e.conditions()).toEqual([]);
  });

  it('does not end the attempt when the knee settles back inside the band after over-reaching', () => {
    // Best 0°, then 12°: a 12° rise but still in the band, so the hold keeps running.
    const e = new KneeExtensionEngine(ke);
    const r = run(e, [[0, 90], [1000, 90], [1800, 0], [2000, 0], [2300, 12], [5500, 12], [6500, 90], [7000, 90]]);
    expect(r.reps).toHaveLength(1);
    expect(r.ended).toHaveLength(1);
  });

  it('ends an attempt on reversal and needs a return to rest before the next one starts', () => {
    const e = new KneeExtensionEngine(ke);
    // Reverses from 25° to 40° (≥ 10° rise), dips again to 25° without returning above 60°.
    const r = run(e, [[0, 90], [1000, 90], [2000, 25], [2500, 40], [3000, 25], [3500, 40], [4500, 90], [5000, 90]]);
    expect(r.ended).toHaveLength(1);
  });

  it('discards an uncounted attempt on tracking loss but keeps a counted one', () => {
    const e = new KneeExtensionEngine(ke);
    run(e, [[0, 90], [1000, 90], [2000, 8], [3000, 8]]); // mid-hold
    expect(e.discard(3000)).toBeNull();
    expect(e.reps).toBe(0);
    expect(e.state).toBe('reset');

    const e2 = new KneeExtensionEngine(ke);
    run(e2, [[0, 90], [1000, 90], [2000, 8], [5500, 8]]); // hold done, leg still up
    expect(e2.discard(5500)).toEqual(expect.objectContaining({ counted: true }));
    expect(e2.reps).toBe(1);
  });

  it('cannot start an attempt from an extended knee after a reset', () => {
    const e = new KneeExtensionEngine(ke);
    const r = run(e, [[0, 8], [4000, 8]]);
    expect(r.reps).toHaveLength(0);
    expect(e.state).toBe('reset');
  });
});
