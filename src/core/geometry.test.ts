import { describe, expect, it } from 'vitest';
import { kneeTrace } from '../../fixtures/synthetic/kneeTrace';
import { interiorAngle2d, kneeFlexion2d, kneeFlexion3d } from './geometry';

describe('knee flexion', () => {
  it.each([0, 10, 45, 90])('measures %i° from a synthetic side view, in 2D and 3D', (deg) => {
    const f = kneeTrace({ side: 'right', segments: [{ ms: 50, flexion: deg }], noisePx: 0 }).frames[0]!;
    expect(kneeFlexion2d(f.lm!, 'right', 640, 480)).toBeCloseTo(deg, 0);
    expect(kneeFlexion3d(f.world!, 'right')).toBeCloseTo(deg, 0);
  });

  it('scales normalized coordinates to pixels before measuring', () => {
    // A right angle in pixels on a 640 × 480 frame is not a right angle in normalized units.
    const a = { x: 0, y: 0.5, z: 0, visibility: 1 };
    const b = { x: 0.5, y: 0.5, z: 0, visibility: 1 };
    const c = { x: 0.5 + 0.75 * 0.5, y: 0.5 + 0.5, z: 0, visibility: 1 }; // 240 px right, 240 px down
    expect(interiorAngle2d(a, b, c, 640, 480)).toBeCloseTo(135, 5);
  });

  it('returns null for a degenerate leg', () => {
    const lm = new Array(33 * 5).fill(0.5);
    expect(kneeFlexion2d(lm, 'left', 640, 480)).toBeNull();
  });
});
