// What a SetSession needs from an exercise (PLANS.md §6: computeMetrics → step → rule evaluation).
// Each exercise owns its measurements, calibration, engine and summary; the session owns the phases,
// the reliability gate, the cue gate and the log, so gating works the same for every exercise.

import type { Baseline } from '../calibration';
import type { PoseFrame } from '../pose';
import type { GateReason } from '../reliability';
import type { CueCandidate } from '../rules/cueGate';
import type { IssueCategory } from '../rules/registry';
import type { KneeSummary, SitToStandSummary } from '../summary';
import type { BuiltExerciseId, Side } from '../types';

/** One attempt (docs/definitions.md), logged as an `attempt` event when it ends. */
export interface AttemptRecord {
  index: number;
  tStart: number;
  tEnd: number;
  counted: boolean;
  /** Best value reached: smallest knee flexion, or highest stand progress. */
  peak: number;
  holdMs?: number;
  riseMs?: number;
  lowerMs?: number;
  issues: IssueCategory[];
}

export interface ExerciseStep {
  /** Index of the attempt that started on this frame, if any. */
  startedAttempt: number | null;
  ended: AttemptRecord | null;
  /** Instant cue events on this frame (positive feedback). */
  events: CueCandidate[];
}

/** Sit-to-stand calibrates seated, then standing; knee extension only seated. */
export type CalibrationStage = 'seated' | 'standing';

export interface CalibrationStep {
  done: boolean;
  /** 0..1 of the current stage. */
  progress: number;
  stage: CalibrationStage;
}

/** Live readouts for the set screen. Fields an exercise doesn't measure are null. */
export interface LiveReadout {
  /** Primary knee flexion this frame. */
  angle: number | null;
  holdRemainingMs: number | null;
  /** Rise and lower time of the last completed repetition. */
  lastRiseMs: number | null;
  lastLowerMs: number | null;
}

export type Measures = Record<string, number | null>;

export interface Exercise {
  readonly id: BuiltExerciseId;
  readonly side: Side | null;
  readonly joints: readonly number[];
  /** Side for the framing side check (side-view exercises only), or null. */
  readonly framingSide: Side | null;
  readonly targetReps: number;
  readonly state: string;
  readonly reps: number;
  readonly calibration: Baseline | null;

  /** This frame's measurements; called on reliable frames only. Always returns the same keys. */
  measure(f: PoseFrame): Measures;
  /** The same keys, all null, for an unreliable frame. */
  blank(): Measures;
  /** Measurements as written to the log (rounded). */
  logged(m: Measures): Measures;

  beginCalibration(): void;
  /** Restarts calibration from its first stage (unreliable frame). */
  resetCalibration(): void;
  calibrationStage(): CalibrationStage;
  calibrate(f: PoseFrame, m: Measures): CalibrationStep;

  /**
   * An exercise's own reliability check for frames in the active set, after the joint gate passed.
   * A reason makes the frame unreliable, exactly like a failed gate (R-S1); null means it is fine.
   */
  checkInSet(m: Measures): GateReason | null;
  /** The engine's input this frame, or null when it can't be computed (handled as unreliable). */
  input(m: Measures): number | null;
  step(t: number, value: number): ExerciseStep;
  /** Advice conditions that hold now, for the cue gate. */
  conditions(): CueCandidate[];
  /** Tracking loss or end of set: drops the attempt in progress, or closes it if it already counted. */
  discard(t: number): AttemptRecord | null;
  live(value: number | null): LiveReadout;
  summary(attempts: readonly AttemptRecord[], trackingLosses: number): KneeSummary | SitToStandSummary;
}
