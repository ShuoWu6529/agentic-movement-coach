// Watchdog (PLANS.md §2 principle 2). The core only sees time in frames, so when frames stop arriving
// (camera stall, background tab, muted track, orientation change) the watchdog injects "no pose"
// frames, and the reliability gate still closes and the set still pauses (AC 16).
//
// A stall is a wall-clock gap with no delivered frame longer than `stallMs`. Injected frames carry
// t = last frame's t + the wall time since it was delivered, so they never overtake the capture time
// of a frame that arrives after the stall.

import type { PoseFrame } from '../core/pose';
import type { TargetsConfig } from '../core/config/schema';

/** No frame for two frame intervals at the configured minimum frame rate (docs/definitions.md). */
export function stallMsFor(tracking: TargetsConfig['tracking']): number {
  return (2 * 1000) / tracking.minFps;
}

export interface Watchdog {
  /** Call for every real frame passed on to the session. */
  seen(t: number): void;
  stop(): void;
}

export function startWatchdog(opts: {
  stallMs: number;
  inject: (f: PoseFrame) => void;
  wallNow?: () => number;
  intervalMs?: number;
}): Watchdog {
  const wallNow = opts.wallNow ?? (() => performance.now());
  let lastT: number | null = null;
  let lastWall = wallNow();
  const timer = setInterval(() => {
    if (lastT === null) return;
    const w = wallNow();
    if (w - lastWall > opts.stallMs) {
      const t = lastT + (w - lastWall);
      lastT = t;
      lastWall = w;
      opts.inject({ t, lm: null, world: null });
    }
  }, opts.intervalMs ?? 50);
  return {
    seen(t) {
      lastT = t;
      lastWall = wallNow();
    },
    stop() {
      clearInterval(timer);
    },
  };
}
