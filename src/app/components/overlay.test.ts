import { describe, expect, it } from 'vitest';
import { recordingContext } from '../../../test/fakes';
import { kneeTrace } from '../../../fixtures/synthetic/kneeTrace';
import { LM } from '../../core/pose';
import { drawPose } from './overlay';

const lm = kneeTrace({ side: 'left', segments: [{ ms: 40, flexion: 45 }], noisePx: 0 }).frames[0]!.lm!;
const required = [LM.leftHip, LM.leftKnee, LM.leftAnkle];

describe('skeleton overlay (AC 5)', () => {
  it('draws the skeleton and the required joints at their pixel positions', () => {
    const ctx = recordingContext();
    drawPose(ctx, lm, { width: 640, height: 480 }, required, true);
    const arcs = ctx.calls.filter((c) => c.op === 'arc');
    expect(arcs).toHaveLength(3);
    expect(arcs[1]!.args[0]).toBeCloseTo(406, 0); // knee x in pixels
    expect(arcs[1]!.args[1]).toBeCloseTo(264, 0);
    expect(ctx.calls.filter((c) => c.op === 'stroke').length).toBeGreaterThan(5);
  });

  it('clears and draws nothing without a pose, and fades when tracking is unreliable', () => {
    const ctx = recordingContext();
    drawPose(ctx, null, { width: 640, height: 480 }, required, false);
    expect(ctx.calls.map((c) => c.op)).toEqual(['clearRect']);

    const alphas: number[] = [];
    const faded = new Proxy(recordingContext(), {
      set(target, prop, value) {
        if (prop === 'globalAlpha') alphas.push(value as number);
        return Reflect.set(target, prop, value);
      },
    });
    drawPose(faded, lm, { width: 640, height: 480 }, required, false);
    expect(alphas[0]).toBeLessThan(1);
  });
});
