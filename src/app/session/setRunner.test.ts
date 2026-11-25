// SetRunner with a live clock: the watchdog's "no pose" frames are part of the exported trace, so a
// replay of the trace gives the same result as the live session (PR #8 review).

import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { kneeTrace, SETTLE } from '../../../fixtures/synthetic/kneeTrace';
import { manualSource } from '../../../test/fakes';
import type { TargetsConfig } from '../../core/config/schema';
import { replayTrace } from '../../core/session/replay';
import type { SetResult } from '../../core/session/setSession';
import type { PoseTrace } from '../../core/trace/schema';
import { SetRunner } from './setRunner';

const config: TargetsConfig = JSON.parse(readFileSync('public/config/targets.json', 'utf8'));

afterEach(() => vi.useRealTimers());

describe('SetRunner with a stalled camera', () => {
  it('exports the watchdog frames, so replaying the trace matches the live count', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance', 'requestAnimationFrame'] });
    const src = manualSource();
    const t0 = performance.now();
    src.now = () => performance.now() - t0;
    let finished: { result: SetResult; trace: PoseTrace | null } | null = null;
    const runner = new SetRunner(config, 'left', src, {
      onPhase: () => {},
      onFinish: (result, trace) => (finished = { result, trace }),
    }, { start: true, resume: false });
    runner.start();

    let clock = 0;
    const play = (frames: PoseTrace['frames']) => {
      for (const f of frames) {
        vi.advanceTimersByTime(f.t - clock);
        clock = f.t;
        src.push(f);
      }
    };
    const shift = (tr: PoseTrace, by: number) => tr.frames.map((f) => ({ ...f, t: f.t + by }));

    // Settle, lift into the band and hold 1 s; then the camera stalls for 4 s mid-hold; then frames
    // resume with the knee still in the band for 2.5 s (enough to finish a 3 s hold if the gap were
    // read as continuous holding).
    const before = kneeTrace({ side: 'left', segments: [...SETTLE, { ms: 1200, from: 90, to: 5 }, { ms: 1000, flexion: 5 }] });
    play(before.frames);
    const stallStart = clock;
    vi.advanceTimersByTime(4000);
    clock += 4000;
    play(shift(kneeTrace({ side: 'left', segments: [{ ms: 2500, flexion: 5 }], seed: 9 }), clock + 1));
    runner.endSet();

    const live = finished!;
    expect(live.result.summary.reps).toBe(0);
    expect(live.result.summary.trackingLosses).toBe(1);

    const trace = live.trace!;
    const stalled = trace.frames.filter((f) => f.t > stallStart && f.t < stallStart + 4000);
    expect(stalled.length).toBeGreaterThan(10);
    expect(stalled.every((f) => f.lm === null && f.world === null)).toBe(true);

    const auto = { start: true, resume: false };
    const replayed = replayTrace(trace, { config, side: 'left', auto }).session.result()!;
    expect(replayed.summary.reps).toBe(live.result.summary.reps);
    expect(replayed.summary.trackingLosses).toBe(1);

    // Without the watchdog frames, the gap would read as one continuous hold and count a rep.
    const withoutStall = { ...trace, frames: trace.frames.filter((f) => !(f.t > stallStart && f.t < stallStart + 4000)) };
    expect(replayTrace(withoutStall, { config, side: 'left', auto }).session.result()!.summary.reps).toBe(1);
  });
});
