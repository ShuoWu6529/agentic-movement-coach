// One set of an exercise, frame by frame (PLANS.md §3, §6). Pure and clock-free: the only time it
// sees is each frame's `t`, so the same code runs live, on traces in tests, and in replay.
//
// Per frame: smoothing → per-frame gate → phase logic → CueGate → log row. The exercise (knee
// extension, sit-to-stand) supplies measurements, calibration, counting and conditions; gating is the
// same for every exercise.
// - A bad frame in the active set closes the cue gate at once and discards the attempt in progress.
//   If bad frames last `tracking.unreliableAfterMs`, the phase changes to trackingLost.
// - In trackingLost, only status messages show. After `tracking.recoverAfterMs` of reliable frames the
//   patient may Resume, which runs a short framing check and the countdown. Completed reps are kept.
// - Losing tracking in calibration restarts calibration; in the countdown it returns to framing.
// - The frame that completes the last repetition ends the set, unless an advice condition about the
//   final attempt holds on it (a sit-to-stand lowered too fast, say). Then counting stops and the set
//   screen stays up until that cue has been shown for `cues.displayMs` (or can no longer be shown),
//   and an unreliable frame ends it at once (docs/definitions.md).

import type { Baseline } from '../calibration';
import type { TargetsConfig } from '../config/schema';
import type { AttemptRecord, CalibrationStage, Exercise } from '../exercises/exercise';
import { createExercise } from '../exercises';
import { FramingCheck, framingMessage, gateIssue, type FramingStatus } from '../framing';
import type { FrameRow, LogEvent } from '../log/schema';
import type { PoseFrame } from '../pose';
import { gateFrame, type GateResult } from '../reliability';
import { CueGate, type CueCandidate, type CueCommit } from '../rules/cueGate';
import type { RuleId } from '../rules/registry';
import { EmaSmoother } from '../smoothing';
import type { SetSummary } from '../summary';
import type { BuiltExerciseId, Side } from '../types';
import { isLegalSetTransition, type SetPhase } from './phases';

export interface SetSessionOptions {
  config: TargetsConfig;
  exercise: BuiltExerciseId;
  /** Anatomical side for knee extension; null for sit-to-stand. */
  side: Side | null;
  /** Frame size in pixels, for image-plane measurements. */
  video: { width: number; height: number };
}

export interface SetSnapshot {
  t: number;
  phase: SetPhase;
  /** True between Resume and the restart of the set. */
  resuming: boolean;
  gate: GateResult;
  /** Smoothed image landmarks, for the overlay. */
  lm: readonly number[] | null;
  framing: FramingStatus | null;
  framingText: string | null;
  canStart: boolean;
  calibrationProgress: number;
  /** Calibration stage while calibrating, otherwise null. */
  calibrationStage: CalibrationStage | null;
  /** What to fix when tracking fails during calibration. */
  calibrationText: string | null;
  countdownRemainingS: number | null;
  /** Primary knee flexion this frame; null when tracking is unreliable or for other exercises. */
  angle: number | null;
  reps: number;
  targetReps: number;
  holdRemainingMs: number | null;
  /** Rise and lower time of the last sit-to-stand repetition; null when tracking is unreliable. */
  lastRiseMs: number | null;
  lastLowerMs: number | null;
  /** Cue or status rule shown this frame. */
  shown: RuleId | null;
  commit: CueCommit | null;
  readyToResume: boolean;
  /** True after the last repetition while its final advice cue is on screen. */
  finishing: boolean;
}

export interface SetResult {
  exercise: BuiltExerciseId;
  side: Side | null;
  summary: SetSummary;
  frames: FrameRow[];
  events: LogEvent[];
  calibration: Baseline;
}

const round = (v: number | null, digits: number): number | null =>
  v === null ? null : Math.round(v * 10 ** digits) / 10 ** digits;

export class SetSession {
  private readonly cfg: TargetsConfig;
  private readonly ex: Exercise;
  private readonly smoother: EmaSmoother;
  private readonly framing: FramingCheck;
  private calibrated: Baseline | null = null;
  private readonly cueGate: CueGate;

  private phaseNow: SetPhase = 'framing';
  private resuming = false;
  private setStarted = false;
  private lastT: number | null = null;
  private lastFraming: FramingStatus | null = null;
  private countdownStart = 0;
  private badSince: number | null = null;
  private goodSince: number | null = null;
  private ready = false;
  private trackingLosses = 0;
  /** Advice conditions held on the frame that completed the last repetition, still to be shown. */
  private finalCues: CueCandidate[] | null = null;

  private readonly frames: FrameRow[] = [];
  private readonly events: LogEvent[] = [];
  private readonly attempts: AttemptRecord[] = [];
  private readonly cueEvents = new Map<number, Extract<LogEvent, { type: 'cue' }>>();
  private summary: SetSummary | null = null;
  private last: SetSnapshot | null = null;

  constructor(opts: SetSessionOptions) {
    this.cfg = opts.config;
    this.ex = createExercise(opts.exercise, opts.config, opts.side, opts.video);
    this.smoother = new EmaSmoother(opts.config.smoothing.alpha);
    this.framing = new FramingCheck(opts.config, this.ex.framingSide);
    this.cueGate = new CueGate(opts.config.cues);
  }

  get phase(): SetPhase {
    return this.phaseNow;
  }

  /** Joints the gate requires, for the overlay. */
  get joints(): readonly number[] {
    return this.ex.joints;
  }

  /** True between Resume and the restart of the set. */
  get isResuming(): boolean {
    return this.resuming;
  }

  get snapshot(): SetSnapshot | null {
    return this.last;
  }

  /** Processes one frame. Returns null for a frame that is not newer than the last one, or after the set. */
  step(raw: PoseFrame): SetSnapshot | null {
    if (this.phaseNow === 'summary') return null;
    if (this.lastT !== null && raw.t <= this.lastT) return null;
    const t = raw.t;
    if (this.lastT === null) this.events.push({ type: 'phase', t, phase: 'framing' });
    this.lastT = t;

    const ex = this.ex;
    const f = this.smoother.apply(raw);
    let gate = gateFrame(f.lm, ex.joints, this.cfg.tracking);
    let m = gate.ok && f.lm && f.world ? ex.measure(f) : ex.blank();
    // In the active set the exercise may refuse a frame the joint gate passed (sit-to-stand's
    // body-size guard). It is then unreliable in every respect: no angles, no cue, attempt discarded.
    const refused = this.phaseNow === 'active' && gate.ok ? ex.checkInSet(m) : null;
    if (refused) {
      gate = { ok: false, reason: refused, conf: gate.conf, joint: null };
      m = ex.blank();
    }
    const value = gate.ok ? ex.input(m) : null;
    let framing: FramingStatus | null = null;
    let calibrationProgress = 0;
    let calibrationText: string | null = null;
    let events: CueCandidate[] = [];
    let attemptStarted: number | null = null;

    switch (this.phaseNow) {
      case 'framing':
        framing = this.framing.step(f, gate);
        this.lastFraming = framing;
        if (framing.passed && this.resuming) this.enterCountdown(t);
        break;
      case 'calibration':
        if (!gate.ok) {
          ex.resetCalibration();
          calibrationText = framingMessage(gateIssue(f, gate, this.cfg), ex.framingSide);
        } else {
          const s = ex.calibrate(f, m);
          calibrationProgress = s.progress;
          if (s.done) {
            this.calibrated = ex.calibration;
            this.enterCountdown(t);
          }
        }
        break;
      case 'countdown':
        if (!gate.ok) {
          this.framing.reset();
          this.setPhase('framing', t);
        } else if (t - this.countdownStart >= this.cfg.countdownSeconds * 1000) {
          this.setPhase('active', t);
          this.setStarted = true;
          this.resuming = false;
          this.badSince = null;
        }
        break;
      case 'active':
        if (this.finalCues) break; // counting has stopped after the last repetition
        if (value === null) {
          this.badSince ??= t;
          const kept = ex.discard(t);
          if (kept) this.recordAttempt(kept);
          if (t - this.badSince >= this.cfg.tracking.unreliableAfterMs) {
            this.events.push({ type: 'tracking_lost', t, firstBadT: this.badSince });
            this.trackingLosses++;
            this.goodSince = null;
            this.ready = false;
            this.setPhase('trackingLost', t);
          }
        } else {
          this.badSince = null;
          const r = ex.step(t, value);
          attemptStarted = r.startedAttempt;
          if (r.ended) this.recordAttempt(r.ended);
          events = r.events;
        }
        break;
      case 'trackingLost':
        if (gate.ok) {
          this.goodSince ??= t;
          if (!this.ready && t - this.goodSince >= this.cfg.tracking.recoverAfterMs) {
            this.ready = true;
            this.events.push({ type: 'tracking_recovered', t });
          }
        } else {
          this.goodSince = null;
          this.ready = false;
        }
        break;
    }

    const lost = this.phaseNow === 'trackingLost';
    const usable = this.phaseNow === 'active' && value !== null;
    let open = false;
    let conditions: CueCandidate[] = [];
    let finishNow = false;
    if (this.phaseNow === 'active') {
      if (this.finalCues) {
        open = usable;
        conditions = usable ? this.finalCues : [];
        finishNow = !usable;
      } else if (ex.reps >= ex.targetReps) {
        // The frame that completes the last repetition. Positive feedback is not shown on it, because
        // the summary replaces the set screen; advice about the final attempt is shown first.
        const final = ex.conditions();
        if (final.length > 0) {
          this.finalCues = final;
          open = true;
          conditions = final;
        } else {
          finishNow = true;
        }
        events = [];
      } else {
        open = usable;
        conditions = open ? ex.conditions() : [];
      }
    }
    const out = this.cueGate.step(t, {
      open: open && !finishNow,
      conditions,
      events: open ? events : [],
      status: lost ? (this.ready ? 'ST-READY-RESUME' : 'ST-TRACKING-LOST') : null,
      attemptStarted: open ? attemptStarted : null,
    });
    if (this.finalCues && !finishNow) {
      const waiting = this.finalCues.some((c) => this.cueGate.isPending(c) || c.ruleId === out.shown);
      finishNow = !waiting;
    }
    // A frame that ends the set shows no cue: the summary replaces the set screen on it.
    const shown = finishNow ? null : out.shown;
    const commit = finishNow ? null : out.commit;
    if (commit) {
      const c = commit;
      const ev = { type: 'cue' as const, ruleId: c.ruleId, attemptIndex: c.attemptIndex, onsetT: c.onsetT, confirmT: c.confirmT, shownAt: c.confirmT };
      this.cueEvents.set(c.seq, ev);
      this.events.push(ev);
    }

    const inSet = this.phaseNow === 'active' || this.phaseNow === 'trackingLost';
    this.frames.push({
      t,
      angles: ex.logged(m),
      state: inSet ? ex.state : this.phaseNow,
      trackingOk: gate.ok,
      conf: round(gate.conf, 3) ?? 0,
      cue: shown,
      rep: ex.reps,
    });

    const finishing = this.finalCues !== null && !finishNow;
    if (finishNow) this.finish(t);

    const live = this.phaseNow === 'active' ? ex.live(open ? value : null) : null;
    this.last = {
      t,
      phase: this.phaseNow,
      resuming: this.resuming,
      gate,
      lm: f.lm,
      framing,
      framingText: framing?.issue ? framingMessage(framing.issue, ex.framingSide) : null,
      canStart: this.phaseNow === 'framing' && !this.resuming && (framing?.passed ?? false),
      calibrationProgress,
      calibrationStage: this.phaseNow === 'calibration' ? ex.calibrationStage() : null,
      calibrationText,
      countdownRemainingS:
        this.phaseNow === 'countdown'
          ? Math.max(0, Math.ceil((this.cfg.countdownSeconds * 1000 - (t - this.countdownStart)) / 1000))
          : null,
      angle: open ? (live?.angle ?? null) : null,
      reps: ex.reps,
      targetReps: ex.targetReps,
      holdRemainingMs: live?.holdRemainingMs ?? null,
      lastRiseMs: open ? (live?.lastRiseMs ?? null) : null,
      lastLowerMs: open ? (live?.lastLowerMs ?? null) : null,
      shown,
      commit,
      readyToResume: lost && this.ready,
      finishing,
    };
    return this.last;
  }

  /** "Start set": only once the framing check passes (AC 3); calibration comes first (AC 4). */
  startSet(): boolean {
    if (this.phaseNow !== 'framing' || this.resuming || !this.lastFraming?.passed || this.lastT === null) return false;
    this.ex.beginCalibration();
    this.setPhase('calibration', this.lastT);
    return true;
  }

  /** "Resume" after tracking loss: a short framing check, then the countdown (PLANS.md §3). */
  resume(): boolean {
    if (this.phaseNow !== 'trackingLost' || !this.ready || this.lastT === null) return false;
    this.framing.reset();
    this.lastFraming = null;
    this.resuming = true;
    this.setPhase('framing', this.lastT);
    return true;
  }

  /** "End set". Only after the set has started; before that the patient simply goes back. */
  endSet(): boolean {
    if (!this.setStarted || this.phaseNow === 'summary' || this.lastT === null) return false;
    this.finish(this.lastT);
    return true;
  }

  /** The display adapter reports when a committed cue reached the screen (R-F11). */
  markCueShown(seq: number, shownAt: number): void {
    const ev = this.cueEvents.get(seq);
    if (ev && shownAt >= ev.confirmT) ev.shownAt = shownAt;
  }

  result(): SetResult | null {
    if (!this.summary || !this.calibrated) return null;
    return {
      exercise: this.ex.id,
      side: this.ex.side,
      summary: this.summary,
      frames: this.frames,
      events: this.events,
      calibration: this.calibrated,
    };
  }

  private enterCountdown(t: number): void {
    this.countdownStart = t;
    this.setPhase('countdown', t);
  }

  private recordAttempt(a: AttemptRecord): void {
    this.attempts.push(a);
    const ev: Extract<LogEvent, { type: 'attempt' }> = {
      type: 'attempt', t: a.tEnd, tStart: a.tStart, index: a.index, counted: a.counted,
      peak: round(a.peak, this.ex.id === 'sitToStand' ? 3 : 1) ?? a.peak, issues: a.issues,
    };
    if (a.holdMs !== undefined) ev.holdMs = Math.round(a.holdMs);
    if (a.riseMs !== undefined) ev.riseMs = Math.round(a.riseMs);
    if (a.lowerMs !== undefined) ev.lowerMs = Math.round(a.lowerMs);
    this.events.push(ev);
  }

  private finish(t: number): void {
    const kept = this.ex.discard(t);
    if (kept) this.recordAttempt(kept);
    this.finalCues = null;
    this.setPhase('summary', t);
    this.summary = this.ex.summary(this.attempts, this.trackingLosses);
  }

  private setPhase(to: SetPhase, t: number): void {
    if (!isLegalSetTransition(this.phaseNow, to)) throw new Error(`Illegal phase change ${this.phaseNow} → ${to}`);
    this.phaseNow = to;
    this.events.push({ type: 'phase', t, phase: to });
  }
}
