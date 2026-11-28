// Sit-to-stand (R-EX2, AC 10, AC 11). Implements docs/definitions.md:
//
// - Progress is the height of the shoulders (mean of both, image y) between the calibrated seated
//   height (0) and standing height (1). Only trunk joints are used, because the chair can hide the
//   legs (M0.5 S6). Both shoulders are averaged, so left and right are treated alike.
// - Calibration has two stages: a still seated hold, then a still standing hold whose shoulders are at
//   least `minStandRise` seated trunk lengths above the seated height.
// - An attempt starts when progress rises above `sitFrac` and ends when it returns to `sitFrac` or
//   below. It counts as a repetition when progress reached `standFrac` in between; the counter
//   increments when the patient is seated again (one full sit, stand, sit cycle, AC 10).
// - Rise time: from leaving `sitFrac` to reaching `standFrac`. Lower time: from the last time progress
//   left `standFrac` to reaching `sitFrac`. Outside `riseMs` / `lowerMs` gives too_fast / too_slow.
//
// The engine only sees reliable frames. Counting happens at the end of an attempt, so an attempt in
// progress when tracking is lost is always discarded; a new one can start only once seated again.

import { Calibration, type Baseline } from '../calibration';
import type { TargetsConfig } from '../config/schema';
import { imagePoint, LM, TRUNK_JOINTS, type PoseFrame } from '../pose';
import type { CueCandidate } from '../rules/cueGate';
import type { IssueCategory, RuleId } from '../rules/registry';
import { buildSitToStandSummary, type SitToStandSummary } from '../summary';
import type { AttemptRecord, CalibrationStage, CalibrationStep, Exercise, ExerciseStep, LiveReadout, Measures } from './exercise';

type StsConfig = TargetsConfig['exercises']['sitToStand'];

export type SitToStandState = 'reset' | 'seated' | 'rising' | 'standing' | 'lowering';

interface Attempt {
  index: number;
  tStart: number;
  peak: number;
  riseMs: number | null;
  /** First frame below `standFrac` after the last standing frame; null while standing or before. */
  leftStandT: number | null;
}

export interface SitToStandStep extends ExerciseStep {
  repCounted: boolean;
}

/** Which side of a [lo, hi] range a duration falls on. */
function tempo(ms: number, [lo, hi]: readonly [number, number]): 'fast' | 'slow' | null {
  if (ms < lo) return 'fast';
  if (ms > hi) return 'slow';
  return null;
}

const RISE_RULE: Record<'fast' | 'slow', RuleId> = { fast: 'STS-RISE-FAST', slow: 'STS-RISE-SLOW' };
const LOWER_RULE: Record<'fast' | 'slow', RuleId> = { fast: 'STS-LOWER-FAST', slow: 'STS-LOWER-SLOW' };
const CATEGORY: Record<'fast' | 'slow', IssueCategory> = { fast: 'too_fast', slow: 'too_slow' };

export class SitToStandEngine {
  private st: SitToStandState = 'reset';
  private attempt: Attempt | null = null;
  private nextIndex = 0;
  private repCount = 0;
  /** Live tempo conditions for the cue gate; each lasts until the next attempt starts. */
  private riseCue: CueCandidate | null = null;
  private lowerCue: CueCandidate | null = null;
  private lastRep: { riseMs: number; lowerMs: number } | null = null;

  constructor(private readonly cfg: StsConfig) {}

  get state(): SitToStandState {
    return this.st;
  }

  get reps(): number {
    return this.repCount;
  }

  get lastRepTempo(): { riseMs: number; lowerMs: number } | null {
    return this.lastRep;
  }

  conditions(): CueCandidate[] {
    const out: CueCandidate[] = [];
    if (this.riseCue) out.push(this.riseCue);
    if (this.lowerCue) out.push(this.lowerCue);
    return out;
  }

  step(t: number, progress: number): SitToStandStep {
    const result: SitToStandStep = { startedAttempt: null, ended: null, events: [], repCounted: false };
    const seated = progress <= this.cfg.sitFrac;

    if (this.st === 'reset') {
      if (seated) this.st = 'seated';
      return result;
    }
    if (this.st === 'seated') {
      if (seated) return result;
      this.attempt = { index: this.nextIndex++, tStart: t, peak: progress, riseMs: null, leftStandT: null };
      this.riseCue = null;
      this.lowerCue = null;
      this.st = 'rising';
      result.startedAttempt = this.attempt.index;
    }

    const a = this.attempt!;
    a.peak = Math.max(a.peak, progress);
    if (progress >= this.cfg.standFrac) {
      if (a.riseMs === null) {
        a.riseMs = t - a.tStart;
        const r = tempo(a.riseMs, this.cfg.riseMs);
        if (r) this.riseCue = { ruleId: RISE_RULE[r], attemptIndex: a.index };
      }
      a.leftStandT = null;
      this.st = 'standing';
    } else if (a.riseMs !== null) {
      a.leftStandT ??= t;
      this.st = 'lowering';
    } else {
      this.st = 'rising';
    }

    if (seated) {
      result.ended = this.close(t);
      if (result.ended.counted) {
        result.repCounted = true;
        if (result.ended.issues.length === 0) result.events.push({ ruleId: 'STS-TEMPO-GOOD', attemptIndex: a.index });
      }
      this.st = 'seated';
    }
    return result;
  }

  private close(t: number): AttemptRecord {
    const a = this.attempt!;
    this.attempt = null;
    const counted = a.riseMs !== null;
    const issues = new Set<IssueCategory>();
    const record: AttemptRecord = { index: a.index, tStart: a.tStart, tEnd: t, counted, peak: a.peak, issues: [] };
    if (counted) {
      const riseMs = a.riseMs!;
      // leftStandT is set on the first frame below standFrac; a frame cannot be standing and seated at once.
      const lowerMs = t - (a.leftStandT ?? t);
      const r = tempo(riseMs, this.cfg.riseMs);
      const l = tempo(lowerMs, this.cfg.lowerMs);
      if (r) issues.add(CATEGORY[r]);
      if (l) {
        issues.add(CATEGORY[l]);
        this.lowerCue = { ruleId: LOWER_RULE[l], attemptIndex: a.index };
      }
      record.riseMs = riseMs;
      record.lowerMs = lowerMs;
      this.repCount++;
      this.lastRep = { riseMs, lowerMs };
    }
    record.issues = [...issues];
    return record;
  }

  /**
   * Tracking loss or end of set. The attempt in progress is discarded (a repetition only counts once
   * the patient is seated again, so it never counted). Live conditions are cleared, and a new attempt
   * can start only once the patient is seated.
   */
  discard(): null {
    this.attempt = null;
    this.riseCue = null;
    this.lowerCue = null;
    this.st = 'reset';
    return null;
  }
}

/** Mean image y of the shoulders, in pixels (y grows downwards). Null when not computable. */
function shoulderY(lm: readonly number[], height: number): number | null {
  const y = ((imagePoint(lm, LM.leftShoulder).y + imagePoint(lm, LM.rightShoulder).y) / 2) * height;
  return Number.isFinite(y) ? y : null;
}

/** Distance from the shoulder midpoint to the hip midpoint, in pixels. */
function trunkPx(lm: readonly number[], width: number, height: number): number | null {
  const ls = imagePoint(lm, LM.leftShoulder);
  const rs = imagePoint(lm, LM.rightShoulder);
  const lh = imagePoint(lm, LM.leftHip);
  const rh = imagePoint(lm, LM.rightHip);
  const d = Math.hypot(((ls.x + rs.x - lh.x - rh.x) / 2) * width, ((ls.y + rs.y - lh.y - rh.y) / 2) * height);
  return Number.isFinite(d) && d > 0 ? d : null;
}

/**
 * Two-stage calibration: a still seated hold gives the seated shoulder height and trunk length; then a
 * still standing hold, at least `minStandRise` trunk lengths higher, gives the standing height. A still
 * pose below that height is not accepted (the patient has not stood up yet). Any restart begins again
 * from the seated stage.
 */
export class SitToStandCalibration {
  private stageNow: CalibrationStage = 'seated';
  private seated: Calibration;
  private standing: Calibration;
  private seatedBaseline: Baseline | null = null;
  private result: Baseline | null = null;

  constructor(
    private readonly cfg: TargetsConfig['calibration'],
    private readonly minStandRise: number,
  ) {
    this.seated = new Calibration(cfg, TRUNK_JOINTS);
    this.standing = new Calibration(cfg, TRUNK_JOINTS);
  }

  get stage(): CalibrationStage {
    return this.stageNow;
  }

  get baseline(): Baseline | null {
    return this.result;
  }

  reset(): void {
    if (this.result) return;
    this.stageNow = 'seated';
    this.seated = new Calibration(this.cfg, TRUNK_JOINTS);
    this.standing = new Calibration(this.cfg, TRUNK_JOINTS);
    this.seatedBaseline = null;
  }

  step(f: PoseFrame, m: Measures): CalibrationStep {
    if (this.result) return { done: true, progress: 1, stage: 'standing' };
    const y = m.shoulderY ?? null;
    const trunk = m.trunkPx ?? null;
    if (y === null || trunk === null) {
      this.reset();
      return { done: false, progress: 0, stage: this.stageNow };
    }
    if (this.stageNow === 'seated') {
      const s = this.seated.step(f, { seatedShoulderY: y, trunkPx: trunk });
      if (!s.done) return { done: false, progress: s.progress, stage: 'seated' };
      this.seatedBaseline = this.seated.baseline;
      this.stageNow = 'standing';
      return { done: false, progress: 0, stage: 'standing' };
    }
    const seated = this.seatedBaseline!.baseline;
    const rise = seated.seatedShoulderY! - y;
    if (rise < this.minStandRise * seated.trunkPx!) {
      this.standing.reset();
      return { done: false, progress: 0, stage: 'standing' };
    }
    const s = this.standing.step(f, { standingShoulderY: y });
    if (!s.done) return { done: false, progress: s.progress, stage: 'standing' };
    this.result = { t: f.t, baseline: { ...seated, ...this.standing.baseline!.baseline } };
    return { done: true, progress: 1, stage: 'standing' };
  }
}

const round = (v: number | null, digits: number): number | null =>
  v === null ? null : Math.round(v * 10 ** digits) / 10 ** digits;

export class SitToStandExercise implements Exercise {
  readonly id = 'sitToStand' as const;
  readonly side = null;
  readonly framingSide = null;
  readonly joints = TRUNK_JOINTS;
  private readonly engine: SitToStandEngine;
  private cal: SitToStandCalibration;

  constructor(
    private readonly config: TargetsConfig,
    private readonly video: { width: number; height: number },
  ) {
    this.engine = new SitToStandEngine(config.exercises.sitToStand);
    this.cal = this.newCalibration();
  }

  private newCalibration(): SitToStandCalibration {
    return new SitToStandCalibration(this.config.calibration, this.config.exercises.sitToStand.minStandRise);
  }

  get targetReps(): number {
    return this.config.exercises.sitToStand.reps;
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
    const m = this.blank();
    if (!f.lm) return m;
    m.shoulderY = shoulderY(f.lm, this.video.height);
    m.trunkPx = trunkPx(f.lm, this.video.width, this.video.height);
    const b = this.cal.baseline?.baseline;
    if (b && m.shoulderY !== null) {
      m.standProgress = (b.seatedShoulderY! - m.shoulderY) / (b.seatedShoulderY! - b.standingShoulderY!);
    }
    return m;
  }

  blank(): Measures {
    return { standProgress: null, shoulderY: null, trunkPx: null };
  }

  logged(m: Measures): Measures {
    return { standProgress: round(m.standProgress ?? null, 3), shoulderY: round(m.shoulderY ?? null, 1) };
  }

  beginCalibration(): void {
    this.cal = this.newCalibration();
  }
  resetCalibration(): void {
    this.cal.reset();
  }
  calibrationStage(): CalibrationStage {
    return this.cal.stage;
  }
  calibrate(f: PoseFrame, m: Measures): CalibrationStep {
    return this.cal.step(f, m);
  }

  input(m: Measures): number | null {
    return m.standProgress ?? null;
  }
  step(t: number, value: number): ExerciseStep {
    return this.engine.step(t, value);
  }
  conditions(): CueCandidate[] {
    return this.engine.conditions();
  }
  discard(): AttemptRecord | null {
    return this.engine.discard();
  }
  live(): LiveReadout {
    const last = this.engine.lastRepTempo;
    return { angle: null, holdRemainingMs: null, lastRiseMs: last?.riseMs ?? null, lastLowerMs: last?.lowerMs ?? null };
  }
  summary(attempts: readonly AttemptRecord[], trackingLosses: number): SitToStandSummary {
    const s = this.config.exercises.sitToStand;
    return buildSitToStandSummary({ targetReps: s.reps, riseRange: s.riseMs, lowerRange: s.lowerMs, attempts, trackingLosses });
  }
}
