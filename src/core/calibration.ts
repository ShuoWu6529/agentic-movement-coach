// Neutral calibration (R-F7, AC 4, PLANS.md §6). Averages `calibration.durationMs` of reliable,
// still frames into a baseline. An unreliable frame, or any required joint moving more than
// `calibration.maxMotion` (frame fraction) from where the run began, restarts it.
// For knee extension the baseline is the resting knee angle, which is logged only. Sit-to-stand runs
// it twice, seated then standing (exercises/sitToStand.ts).

import type { TargetsConfig } from './config/schema';
import { imagePoint, type PoseFrame } from './pose';

export interface CalibrationStatus {
  done: boolean;
  /** 0..1 of the duration. */
  progress: number;
  /** True when this frame restarted calibration because the patient moved. */
  moved: boolean;
}

export interface Baseline {
  t: number;
  baseline: Record<string, number>;
}

export class Calibration {
  private startT: number | null = null;
  private anchor: Array<{ x: number; y: number }> = [];
  private sums: Record<string, { sum: number; n: number }> = {};
  private result: Baseline | null = null;

  constructor(
    private readonly cfg: TargetsConfig['calibration'],
    private readonly joints: readonly number[],
  ) {}

  get baseline(): Baseline | null {
    return this.result;
  }

  reset(): void {
    this.startT = null;
    this.anchor = [];
    this.sums = {};
  }

  /** `angles` are this frame's measured angles; null entries are skipped. Call only on reliable frames. */
  step(frame: PoseFrame, angles: Record<string, number | null>): CalibrationStatus {
    if (this.result) return { done: true, progress: 1, moved: false };
    if (!frame.lm) {
      this.reset();
      return { done: false, progress: 0, moved: false };
    }
    const lm = frame.lm;
    let moved = false;
    if (this.startT !== null) {
      moved = this.joints.some((j, k) => {
        const p = imagePoint(lm, j);
        const a = this.anchor[k]!;
        return Math.hypot(p.x - a.x, p.y - a.y) > this.cfg.maxMotion;
      });
      if (moved) this.reset();
    }
    if (this.startT === null) {
      this.startT = frame.t;
      this.anchor = this.joints.map((j) => {
        const p = imagePoint(lm, j);
        return { x: p.x, y: p.y };
      });
    }
    for (const [k, v] of Object.entries(angles)) {
      if (v === null) continue;
      const acc = (this.sums[k] ??= { sum: 0, n: 0 });
      acc.sum += v;
      acc.n++;
    }
    const elapsed = frame.t - this.startT;
    if (elapsed >= this.cfg.durationMs) {
      const baseline: Record<string, number> = {};
      for (const [k, acc] of Object.entries(this.sums)) baseline[k] = acc.sum / acc.n;
      this.result = { t: frame.t, baseline };
      return { done: true, progress: 1, moved };
    }
    return { done: false, progress: Math.max(0, elapsed / this.cfg.durationMs), moved };
  }
}
