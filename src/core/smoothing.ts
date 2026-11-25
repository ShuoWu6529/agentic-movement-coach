// Landmark smoothing (PLANS.md §6: frame source → detect → smoothing → per-frame gate).
// An exponential moving average over positions only. Visibility and presence pass through raw, so
// the reliability gate always judges the model's own scores for this frame (fail closed).
// A frame without a pose resets the filter, so a stale position never leaks into a later frame.

import { LM_STRIDE, WORLD_STRIDE } from './trace/schema';
import type { PoseFrame } from './pose';

export class EmaSmoother {
  private lm: number[] | null = null;
  private world: number[] | null = null;

  constructor(private readonly alpha: number) {}

  reset(): void {
    this.lm = null;
    this.world = null;
  }

  apply(frame: PoseFrame): PoseFrame {
    if (!frame.lm || !frame.world) {
      this.reset();
      return frame;
    }
    const a = this.alpha;
    const lm = Array.from(frame.lm);
    if (this.lm) {
      for (let o = 0; o < lm.length; o += LM_STRIDE) {
        for (let k = 0; k < 3; k++) lm[o + k] = a * lm[o + k]! + (1 - a) * this.lm[o + k]!;
      }
    }
    const world = Array.from(frame.world);
    if (this.world) {
      for (let o = 0; o < world.length; o += WORLD_STRIDE) {
        for (let k = 0; k < 3; k++) world[o + k] = a * world[o + k]! + (1 - a) * this.world[o + k]!;
      }
    }
    this.lm = lm;
    this.world = world;
    return { ...frame, lm, world };
  }
}
