// Framing check (AC 3, AC 19, PLANS.md §3). The side check is mandatory while M0.5 is deferred.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { kneeTrace } from '../../fixtures/synthetic/kneeTrace';
import { sitToStandTrace } from '../../fixtures/synthetic/sitToStandTrace';
import type { TargetsConfig } from './config/schema';
import { FramingCheck, framingMessage, type FramingStatus } from './framing';
import { LM } from './pose';
import { gateFrame, requiredJoints } from './reliability';
import { LM_STRIDE, type PoseTrace } from './trace/schema';

const config: TargetsConfig = JSON.parse(readFileSync('public/config/targets.json', 'utf8'));
const joints = requiredJoints('kneeExtension', 'left');

function check(trace: PoseTrace, cfg = config, luma?: number): FramingStatus[] {
  const f = new FramingCheck(cfg, 'left');
  return trace.frames.map((fr) => f.step({ ...fr, luma }, gateFrame(fr.lm, joints, cfg.tracking)));
}

function withLandmark(trace: PoseTrace, i: number, patch: { x?: number; y?: number; vis?: number }): PoseTrace {
  return {
    ...trace,
    frames: trace.frames.map((f) => {
      if (!f.lm) return f;
      const lm = [...f.lm];
      if (patch.x !== undefined) lm[i * LM_STRIDE] = patch.x;
      if (patch.y !== undefined) lm[i * LM_STRIDE + 1] = patch.y;
      if (patch.vis !== undefined) lm[i * LM_STRIDE + 3] = patch.vis;
      return { ...f, lm };
    }),
  };
}

const still = (ms: number, extra = {}) => kneeTrace({ side: 'left', segments: [{ ms, flexion: 90 }], ...extra });

describe('framing check', () => {
  it('passes only after stableMs of reliable frames (AC 19)', () => {
    const s = check(still(2000));
    const firstPass = s.findIndex((x) => x.passed);
    expect(firstPass).toBeGreaterThan(0);
    const t = still(2000).frames[firstPass]!.t;
    expect(t).toBeGreaterThanOrEqual(config.framing.stableMs);
    expect(s.slice(0, firstPass).every((x) => !x.passed)).toBe(true);
  });

  it('names a required joint that is out of frame and passes once it is back (AC 3)', () => {
    const bad = withLandmark(still(1500), LM.leftAnkle, { y: 0.995 });
    const s = check(bad);
    expect(s.some((x) => x.passed)).toBe(false);
    const issue = s.at(-1)!.issue!;
    expect(issue).toEqual({ kind: 'joint', joint: LM.leftAnkle, problem: 'outOfFrame' });
    expect(framingMessage(issue, 'left')).toMatch(/left ankle/);

    const good = still(1500);
    const f = new FramingCheck(config, 'left');
    const seq = [...bad.frames, ...good.frames.map((fr) => ({ ...fr, t: fr.t + 1500 }))];
    const out = seq.map((fr) => f.step(fr, gateFrame(fr.lm, joints, config.tracking)));
    expect(out.slice(0, bad.frames.length).some((x) => x.passed)).toBe(false);
    expect(out.at(-1)!.passed).toBe(true);
  });

  it('names a required joint with low visibility', () => {
    const s = check(withLandmark(still(1500), LM.leftKnee, { vis: 0.2 }));
    expect(s.at(-1)!.issue).toEqual({ kind: 'joint', joint: LM.leftKnee, problem: 'lowVisibility' });
  });

  it('fails when the chosen side is not the more visible one (near and far legs swapped)', () => {
    const swapped = still(2000, { nearVisibility: 0.6, farVisibility: 0.95 });
    const s = check(swapped);
    expect(s.some((x) => x.passed)).toBe(false);
    expect(s.at(-1)!.issue).toEqual({ kind: 'side' });
    expect(framingMessage({ kind: 'side' }, 'left')).toMatch(/left side faces the camera/);
  });

  it('says it cannot see the patient when there is no pose', () => {
    const s = check(kneeTrace({ side: 'left', segments: [{ ms: 1500, noPose: true }] }));
    expect(s.at(-1)!.issue).toEqual({ kind: 'noPose' });
  });

  it('chooses the lighting message in a dim room, and never passes on brightness alone (AC 19)', () => {
    const s = check(kneeTrace({ side: 'left', segments: [{ ms: 2000, noPose: true }] }), config, 10);
    expect(s.at(-1)!.issue).toEqual({ kind: 'dim' });
    expect(s.some((x) => x.passed)).toBe(false);
    // Dim but confidently tracked: passes (brightness only picks the message).
    expect(check(still(2000), config, 10).at(-1)!.passed).toBe(true);
  });

  it('fails below the frame-rate floor', () => {
    const s = check(still(3000, { fps: 8 }));
    expect(s.some((x) => x.passed)).toBe(false);
    expect(s.at(-1)!.issue).toEqual({ kind: 'slow', fps: expect.closeTo(8, 0) });
  });

  it('uses trunk joints only for sit-to-stand, with no side check (M2)', () => {
    const trunk = requiredJoints('sitToStand', null);
    expect(trunk.sort((a, b) => a - b)).toEqual([LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip]);
    // The synthetic chair hides the legs (visibility 0.2–0.45), as in M0.5 S6; framing still passes.
    const tr = sitToStandTrace({ segments: [{ ms: 2000, p: 0 }] });
    const f = new FramingCheck(config, null);
    const out = tr.frames.map((fr) => f.step(fr, gateFrame(fr.lm, trunk, config.tracking)));
    expect(out.at(-1)!.passed).toBe(true);
    const lowShoulder = withLandmark(tr, LM.rightShoulder, { vis: 0.2 });
    const g = new FramingCheck(config, null);
    const bad = lowShoulder.frames.map((fr) => g.step(fr, gateFrame(fr.lm, trunk, config.tracking)));
    expect(bad.at(-1)!.issue).toEqual({ kind: 'joint', joint: LM.rightShoulder, problem: 'lowVisibility' });
    expect(framingMessage(bad.at(-1)!.issue!, null)).toMatch(/right shoulder/);
  });
});
