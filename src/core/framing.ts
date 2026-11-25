// Framing check (R-F6, AC 3, AC 19, PLANS.md §3). It passes only after `framing.stableMs` of
// continuously reliable frames at an effective frame rate of at least `tracking.minFps`, with the
// chosen side's leg joints more visible than the other side's (the model can swap near and far legs;
// mandatory while M0.5 is deferred). Brightness only chooses the message; it never passes the check.

import type { TargetsConfig } from './config/schema';
import { imagePoint, jointLabel, legJoints, otherSide, type PoseFrame } from './pose';
import type { GateResult } from './reliability';
import type { Side } from './types';

export type FramingIssue =
  | { kind: 'noPose' }
  | { kind: 'dim' }
  | { kind: 'joint'; joint: number; problem: 'outOfFrame' | 'lowVisibility' }
  | { kind: 'side' }
  | { kind: 'slow'; fps: number }
  | { kind: 'settling' };

export interface FramingStatus {
  passed: boolean;
  issue: FramingIssue | null;
}

const FPS_WINDOW_MS = 1000;

/** Mean visibility of one leg's hip, knee and ankle. */
function legVisibility(lm: readonly number[], side: Side): number {
  const j = legJoints(side);
  return (imagePoint(lm, j.hip).visibility + imagePoint(lm, j.knee).visibility + imagePoint(lm, j.ankle).visibility) / 3;
}

export function chosenSideMoreVisible(lm: readonly number[], side: Side): boolean {
  return legVisibility(lm, side) > legVisibility(lm, otherSide(side));
}

export class FramingCheck {
  private stableSince: number | null = null;
  private times: number[] = [];

  constructor(
    private readonly config: TargetsConfig,
    private readonly side: Side,
  ) {}

  reset(): void {
    this.stableSince = null;
    this.times = [];
  }

  /** Effective frame rate over the last second of frames that carried a pose. */
  fps(): number {
    const n = this.times.length;
    if (n < 2) return 0;
    const span = this.times[n - 1]! - this.times[0]!;
    return span > 0 ? ((n - 1) * 1000) / span : 0;
  }

  step(frame: PoseFrame, gate: GateResult): FramingStatus {
    if (frame.lm) {
      this.times.push(frame.t);
      while (this.times.length > 0 && this.times[0]! < frame.t - FPS_WINDOW_MS) this.times.shift();
    }

    const issue = this.findIssue(frame, gate);
    if (issue) {
      this.stableSince = null;
      return { passed: false, issue };
    }
    this.stableSince ??= frame.t;
    if (frame.t - this.stableSince < this.config.framing.stableMs) {
      return { passed: false, issue: { kind: 'settling' } };
    }
    const fps = this.fps();
    if (fps < this.config.tracking.minFps) return { passed: false, issue: { kind: 'slow', fps } };
    return { passed: true, issue: null };
  }

  private findIssue(frame: PoseFrame, gate: GateResult): FramingIssue | null {
    if (!gate.ok) {
      if (frame.luma !== undefined && frame.luma < this.config.framing.minLuma) return { kind: 'dim' };
      if (gate.reason === 'noPose' || gate.joint === null) return { kind: 'noPose' };
      return { kind: 'joint', joint: gate.joint, problem: gate.reason === 'outOfFrame' ? 'outOfFrame' : 'lowVisibility' };
    }
    if (frame.lm && !chosenSideMoreVisible(frame.lm, this.side)) return { kind: 'side' };
    return null;
  }
}

/** What to fix, in plain words (AC 3). */
export function framingMessage(issue: FramingIssue, side: Side): string {
  switch (issue.kind) {
    case 'noPose':
      return "We can't see you yet. Sit so your whole body is in the picture.";
    case 'dim':
      return 'The room looks dim. Turn on more light or face a window.';
    case 'joint':
      return issue.problem === 'outOfFrame'
        ? `Your ${jointLabel(issue.joint)} is at the edge of the picture. Move the camera back a little.`
        : `We can't see your ${jointLabel(issue.joint)} clearly. Make sure nothing blocks it and the room is bright enough.`;
    case 'side':
      return `Turn so your ${side} side faces the camera, with your ${side} leg nearer to it.`;
    case 'slow':
      return 'Tracking is running slowly on this device. Close other apps or tabs, then try again.';
    case 'settling':
      return 'Good. Hold still for a moment…';
  }
}
