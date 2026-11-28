// Seated knee extension engine (R-EX1, AC 8, AC 9). Implements docs/definitions.md:
//
// - An attempt starts when flexion drops below `startFlexionDeg`.
// - The target band is flexion ≤ `targetFlexionAtMostDeg` + `toleranceDeg`.
// - Staying in the band continuously for `holdSeconds` completes the hold and counts a repetition at
//   once (the counter increments when the hold completes, AC 8).
// - Leaving the band before the hold completes is a hold break; the hold timer resets.
// - The attempt ends when flexion returns above `startFlexionDeg`, or when, outside the band, it has
//   risen by `reversalDeg` from the best (smallest) value reached.
// - Issues: never reached the band → insufficient_range; reached it but never completed a hold →
//   hold_break.
//
// The engine only sees reliable frames. On tracking loss the caller calls `discard`, which drops the
// attempt in progress unless its repetition was already counted (completed repetitions are kept).

import { Calibration, type Baseline } from '../calibration';
import type { TargetsConfig } from '../config/schema';
import { kneeFlexion2d, kneeFlexion3d } from '../geometry';
import type { PoseFrame } from '../pose';
import { requiredJoints } from '../reliability';
import type { CueCandidate } from '../rules/cueGate';
import type { IssueCategory } from '../rules/registry';
import { buildSummary, type KneeSummary } from '../summary';
import type { Side } from '../types';
import type { AttemptRecord, CalibrationStep, Exercise, ExerciseStep, LiveReadout, Measures } from './exercise';

export type KneeState = 'reset' | 'rest' | 'extending' | 'holding' | 'held';

/** A knee attempt: `peak` is the best (smallest) flexion; `holdMs` the completed or longest partial hold. */
export type KneeAttemptRecord = AttemptRecord & { holdMs: number };

export interface KneeStepResult {
  /** Index of the attempt that started on this frame, if any. */
  startedAttempt: number | null;
  repCounted: boolean;
  /** Index of the attempt whose repetition was counted on this frame. */
  countedAttempt: number | null;
  ended: KneeAttemptRecord | null;
}

interface Attempt {
  index: number;
  tStart: number;
  best: number;
  reachedBand: boolean;
  counted: boolean;
  holdStart: number | null;
  holdMs: number;
  maxHoldMs: number;
}

export class KneeExtensionEngine {
  private st: KneeState = 'reset';
  private attempt: Attempt | null = null;
  private nextIndex = 0;
  private repCount = 0;
  /** Live conditions for the cue gate; each lasts until the next attempt starts. */
  private rangeLow: CueCandidate | null = null;
  private holdBreak: CueCandidate | null = null;
  private lastT = 0;

  constructor(private readonly cfg: TargetsConfig['exercises']['kneeExtension']) {}

  get state(): KneeState {
    return this.st;
  }

  get reps(): number {
    return this.repCount;
  }

  private get band(): number {
    return this.cfg.targetFlexionAtMostDeg + this.cfg.toleranceDeg;
  }

  private get holdTargetMs(): number {
    return this.cfg.holdSeconds * 1000;
  }

  /** Remaining hold time while a hold runs, for the countdown timer (AC 8); null otherwise. */
  holdRemainingMs(): number | null {
    const a = this.attempt;
    if (!a || a.counted || a.holdStart === null) return null;
    return Math.max(0, this.holdTargetMs - (this.lastT - a.holdStart));
  }

  conditions(): CueCandidate[] {
    const out: CueCandidate[] = [];
    if (this.rangeLow) out.push(this.rangeLow);
    if (this.holdBreak) out.push(this.holdBreak);
    return out;
  }

  step(t: number, flexion: number): KneeStepResult {
    this.lastT = t;
    const result: KneeStepResult = { startedAttempt: null, repCounted: false, countedAttempt: null, ended: null };

    if (this.st === 'reset') {
      if (flexion >= this.cfg.startFlexionDeg) this.st = 'rest';
      return result;
    }
    if (this.st === 'rest') {
      if (flexion >= this.cfg.startFlexionDeg) return result;
      this.attempt = {
        index: this.nextIndex++, tStart: t, best: flexion, reachedBand: false, counted: false,
        holdStart: null, holdMs: 0, maxHoldMs: 0,
      };
      this.rangeLow = null;
      this.holdBreak = null;
      this.st = 'extending';
      result.startedAttempt = this.attempt.index;
    }

    const a = this.attempt!;
    a.best = Math.min(a.best, flexion);
    const inBand = flexion <= this.band;
    if (inBand) {
      a.reachedBand = true;
      this.holdBreak = null;
    }

    if (!a.counted) {
      if (inBand) {
        a.holdStart ??= t;
        a.holdMs = t - a.holdStart;
        a.maxHoldMs = Math.max(a.maxHoldMs, a.holdMs);
        if (a.holdMs >= this.holdTargetMs) {
          a.counted = true;
          this.repCount++;
          result.repCounted = true;
          result.countedAttempt = a.index;
          this.st = 'held';
        } else {
          this.st = 'holding';
        }
      } else {
        if (a.holdStart !== null) {
          // Hold break: the timer resets, and the condition holds until the band is re-entered.
          a.holdStart = null;
          a.holdMs = 0;
          this.holdBreak = { ruleId: 'KE-HOLD-BREAK', attemptIndex: a.index };
        }
        this.st = 'extending';
      }
    }

    const returned = flexion >= this.cfg.startFlexionDeg;
    const reversed = !inBand && flexion - a.best >= this.cfg.reversalDeg;
    if (returned || reversed) {
      result.ended = this.close(t);
      this.st = returned ? 'rest' : 'reset';
    }
    return result;
  }

  private close(t: number): KneeAttemptRecord {
    const a = this.attempt!;
    this.attempt = null;
    const issues: IssueCategory[] = [];
    if (!a.reachedBand) {
      issues.push('insufficient_range');
      this.rangeLow = { ruleId: 'KE-RANGE-LOW', attemptIndex: a.index };
    } else if (!a.counted) {
      issues.push('hold_break');
    }
    if (a.counted) this.holdBreak = null;
    return {
      index: a.index, tStart: a.tStart, tEnd: t, counted: a.counted, peak: a.best,
      holdMs: a.counted ? this.holdTargetMs : a.maxHoldMs, issues,
    };
  }

  /**
   * Tracking loss or end of set. An attempt whose repetition was already counted is closed and kept;
   * any other attempt in progress is discarded (docs/definitions.md). Live conditions are cleared,
   * and a new attempt can only start after the knee has returned to rest.
   */
  discard(t: number): KneeAttemptRecord | null {
    let kept: KneeAttemptRecord | null = null;
    if (this.attempt?.counted) kept = this.close(t);
    this.attempt = null;
    this.rangeLow = null;
    this.holdBreak = null;
    this.st = 'reset';
    return kept;
  }
}

const round1 = (v: number | null): number | null => (v === null ? null : Math.round(v * 10) / 10);

/** Seated knee extension as a SetSession exercise: side view, one leg, image-plane flexion primary. */
export class KneeExtensionExercise implements Exercise {
  readonly id = 'kneeExtension' as const;
  readonly joints: readonly number[];
  private readonly engine: KneeExtensionEngine;
  private cal: Calibration;
  private best: number | null = null;

  constructor(
    private readonly config: TargetsConfig,
    readonly side: Side,
    private readonly video: { width: number; height: number },
  ) {
    this.joints = requiredJoints('kneeExtension', side);
    this.engine = new KneeExtensionEngine(config.exercises.kneeExtension);
    this.cal = new Calibration(config.calibration, this.joints);
  }

  get framingSide(): Side {
    return this.side;
  }
  get targetReps(): number {
    return this.config.exercises.kneeExtension.reps;
  }
  get state(): string {
    return this.engine.state;
  }
  get reps(): number {
    return this.engine.reps;
  }
  get calibration(): Baseline | null {
    return this.cal.baseline;
  }

  measure(f: PoseFrame): Measures {
    if (!f.lm || !f.world) return this.blank();
    return {
      kneeFlexion: kneeFlexion2d(f.lm, this.side, this.video.width, this.video.height),
      kneeFlexion3d: kneeFlexion3d(f.world, this.side),
    };
  }
  blank(): Measures {
    return { kneeFlexion: null, kneeFlexion3d: null };
  }
  logged(m: Measures): Measures {
    return { kneeFlexion: round1(m.kneeFlexion ?? null), kneeFlexion3d: round1(m.kneeFlexion3d ?? null) };
  }

  beginCalibration(): void {
    this.cal = new Calibration(this.config.calibration, this.joints);
  }
  resetCalibration(): void {
    this.cal.reset();
  }
  calibrationStage(): 'seated' {
    return 'seated';
  }
  calibrate(f: PoseFrame, m: Measures): CalibrationStep {
    if (this.input(m) === null) {
      this.cal.reset();
      return { done: false, progress: 0, stage: 'seated' };
    }
    const s = this.cal.step(f, m);
    return { done: s.done, progress: s.progress, stage: 'seated' };
  }

  checkInSet(): null {
    return null;
  }
  input(m: Measures): number | null {
    return m.kneeFlexion ?? null;
  }
  step(t: number, flexion: number): ExerciseStep {
    const r = this.engine.step(t, flexion);
    this.best = this.best === null ? flexion : Math.min(this.best, flexion);
    return {
      startedAttempt: r.startedAttempt,
      ended: r.ended,
      events: r.repCounted ? [{ ruleId: 'KE-HOLD-DONE', attemptIndex: r.countedAttempt }] : [],
    };
  }
  conditions(): CueCandidate[] {
    return this.engine.conditions();
  }
  discard(t: number): AttemptRecord | null {
    return this.engine.discard(t);
  }
  live(flexion: number | null): LiveReadout {
    return { angle: flexion, holdRemainingMs: this.engine.holdRemainingMs(), lastRiseMs: null, lastLowerMs: null };
  }
  summary(attempts: readonly AttemptRecord[], trackingLosses: number): KneeSummary {
    const ke = this.config.exercises.kneeExtension;
    return buildSummary({
      side: this.side,
      targetReps: ke.reps,
      holdSeconds: ke.holdSeconds,
      attempts,
      bestFlexion: round1(this.best),
      trackingLosses,
    });
  }
}
