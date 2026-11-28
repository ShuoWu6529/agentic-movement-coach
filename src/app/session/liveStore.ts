// Live readout store (PLANS.md §2 principle 6). The frame loop runs outside React; only discrete
// changes (phase, rep, cue, messages, buttons) and a throttled angle/timer readout reach React.

import { useSyncExternalStore } from 'react';
import type { CalibrationStage } from '../../core/exercises/exercise';
import type { SetPhase } from '../../core/session/phases';
import type { RuleId } from '../../core/rules/registry';

export interface LiveView {
  phase: SetPhase;
  resuming: boolean;
  trackingOk: boolean;
  framingText: string | null;
  canStart: boolean;
  calibrationProgress: number;
  calibrationStage: CalibrationStage | null;
  /** What to fix when tracking fails during calibration. */
  calibrationText: string | null;
  countdownRemainingS: number | null;
  /** Whole degrees of knee flexion; null while tracking is unreliable. */
  angle: number | null;
  reps: number;
  targetReps: number;
  /** Tenths of a second left on the hold timer; null when no hold runs. */
  holdRemainingS: number | null;
  /** Rise and lower time of the last sit-to-stand repetition, tenths of a second; null when unreliable. */
  lastRiseS: number | null;
  lastLowerS: number | null;
  shown: RuleId | null;
  readyToResume: boolean;
}

const THROTTLE_MS = 100;

function sameDiscrete(a: LiveView, b: LiveView): boolean {
  return (
    a.phase === b.phase && a.resuming === b.resuming && a.trackingOk === b.trackingOk && a.framingText === b.framingText &&
    a.canStart === b.canStart && a.countdownRemainingS === b.countdownRemainingS && a.reps === b.reps &&
    a.shown === b.shown && a.readyToResume === b.readyToResume && (a.holdRemainingS === null) === (b.holdRemainingS === null) &&
    (a.angle === null) === (b.angle === null) && a.calibrationStage === b.calibrationStage &&
    a.calibrationText === b.calibrationText && a.lastRiseS === b.lastRiseS && a.lastLowerS === b.lastLowerS
  );
}

export class LiveStore {
  private view: LiveView | null = null;
  private lastEmit = -Infinity;
  private listeners = new Set<() => void>();

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): LiveView | null => this.view;

  publish(next: LiveView, wallNow = performance.now()): void {
    const prev = this.view;
    if (prev && sameDiscrete(prev, next) && wallNow - this.lastEmit < THROTTLE_MS) return;
    this.view = next;
    this.lastEmit = wallNow;
    for (const fn of this.listeners) fn();
  }
}

export function useLiveView(store: LiveStore): LiveView | null {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
