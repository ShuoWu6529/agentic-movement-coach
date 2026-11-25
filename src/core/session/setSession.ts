// One set of seated knee extension, frame by frame (PLANS.md §3, §6). Pure and clock-free: the only
// time it sees is each frame's `t`, so the same code runs live, on traces in tests, and in replay.
//
// Per frame: smoothing → per-frame gate → phase logic → CueGate → log row.
// - A bad frame in the active set closes the cue gate at once and discards the attempt in progress.
//   If bad frames last `tracking.unreliableAfterMs`, the phase changes to trackingLost.
// - In trackingLost, only status messages show. After `tracking.recoverAfterMs` of reliable frames the
//   patient may Resume, which runs a short framing check and the countdown. Completed reps are kept.
// - Losing tracking in calibration restarts calibration; in the countdown it returns to framing.

import { Calibration } from '../calibration';
import type { TargetsConfig } from '../config/schema';
import { KneeExtensionEngine, type AttemptRecord } from '../exercises/kneeExtension';
import { FramingCheck, framingMessage, type FramingStatus } from '../framing';
import { kneeFlexion2d, kneeFlexion3d } from '../geometry';
import type { FrameRow, LogEvent } from '../log/schema';
import type { PoseFrame } from '../pose';
import { gateFrame, requiredJoints, type GateResult } from '../reliability';
import { CueGate, type CueCandidate, type CueCommit } from '../rules/cueGate';
import type { RuleId } from '../rules/registry';
import { EmaSmoother } from '../smoothing';
import { buildSummary, type SetSummary } from '../summary';
import type { Side } from '../types';
import { isLegalSetTransition, type SetPhase } from './phases';

export interface SetSessionOptions {
  config: TargetsConfig;
  side: Side;
  /** Frame size in pixels, for image-plane angles. */
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
  countdownRemainingS: number | null;
  /** Primary knee flexion this frame; null when tracking is unreliable. */
  angle: number | null;
  reps: number;
  targetReps: number;
  holdRemainingMs: number | null;
  holdTargetMs: number;
  /** Cue or status rule shown this frame. */
  shown: RuleId | null;
  commit: CueCommit | null;
  readyToResume: boolean;
}

export interface SetResult {
  summary: SetSummary;
  frames: FrameRow[];
  events: LogEvent[];
  calibration: { t: number; baseline: Record<string, number> };
}

const round = (v: number | null, digits: number): number | null =>
  v === null ? null : Math.round(v * 10 ** digits) / 10 ** digits;

export class SetSession {
  private readonly cfg: TargetsConfig;
  private readonly side: Side;
  private readonly video: { width: number; height: number };
  private readonly joints: number[];
  private readonly smoother: EmaSmoother;
  private readonly framing: FramingCheck;
  private calibration: Calibration | null = null;
  private calibrated: { t: number; baseline: Record<string, number> } | null = null;
  private readonly engine: KneeExtensionEngine;
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
  private bestFlexion: number | null = null;

  private readonly frames: FrameRow[] = [];
  private readonly events: LogEvent[] = [];
  private readonly attempts: AttemptRecord[] = [];
  private readonly cueEvents = new Map<number, Extract<LogEvent, { type: 'cue' }>>();
  private summary: SetSummary | null = null;
  private last: SetSnapshot | null = null;

  constructor(opts: SetSessionOptions) {
    this.cfg = opts.config;
    this.side = opts.side;
    this.video = opts.video;
    this.joints = requiredJoints('kneeExtension', opts.side);
    this.smoother = new EmaSmoother(opts.config.smoothing.alpha);
    this.framing = new FramingCheck(opts.config, opts.side);
    this.engine = new KneeExtensionEngine(opts.config.exercises.kneeExtension);
    this.cueGate = new CueGate(opts.config.cues);
  }

  get phase(): SetPhase {
    return this.phaseNow;
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

    const f = this.smoother.apply(raw);
    const gate = gateFrame(f.lm, this.joints, this.cfg.tracking);
    const angles: Record<string, number | null> = { kneeFlexion: null, kneeFlexion3d: null };
    if (gate.ok && f.lm && f.world) {
      angles.kneeFlexion = kneeFlexion2d(f.lm, this.side, this.video.width, this.video.height);
      angles.kneeFlexion3d = kneeFlexion3d(f.world, this.side);
    }
    const flexion = angles.kneeFlexion ?? null;
    let framing: FramingStatus | null = null;
    let calibrationProgress = 0;
    const events: CueCandidate[] = [];

    switch (this.phaseNow) {
      case 'framing':
        framing = this.framing.step(f, gate);
        this.lastFraming = framing;
        if (framing.passed && this.resuming) this.enterCountdown(t);
        break;
      case 'calibration': {
        const cal = this.calibration!;
        if (!gate.ok || flexion === null) {
          cal.reset();
        } else {
          const s = cal.step(f, angles);
          calibrationProgress = s.progress;
          if (s.done) {
            this.calibrated = cal.baseline;
            this.enterCountdown(t);
          }
        }
        break;
      }
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
        if (!gate.ok || flexion === null) {
          this.badSince ??= t;
          const kept = this.engine.discard(t);
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
          const r = this.engine.step(t, flexion);
          if (r.ended) this.recordAttempt(r.ended);
          if (r.repCounted) events.push({ ruleId: 'KE-HOLD-DONE', attemptIndex: r.countedAttempt });
          this.bestFlexion = this.bestFlexion === null ? flexion : Math.min(this.bestFlexion, flexion);
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
    const open = this.phaseNow === 'active' && gate.ok && flexion !== null;
    const out = this.cueGate.step(t, {
      open,
      conditions: open ? this.engine.conditions() : [],
      events: open ? events : [],
      status: lost ? (this.ready ? 'ST-READY-RESUME' : 'ST-TRACKING-LOST') : null,
    });
    if (out.commit) {
      const c = out.commit;
      const ev = { type: 'cue' as const, ruleId: c.ruleId, attemptIndex: c.attemptIndex, onsetT: c.onsetT, confirmT: c.confirmT, shownAt: c.confirmT };
      this.cueEvents.set(c.seq, ev);
      this.events.push(ev);
    }

    const inSet = this.phaseNow === 'active' || this.phaseNow === 'trackingLost';
    this.frames.push({
      t,
      angles: { kneeFlexion: round(angles.kneeFlexion ?? null, 1), kneeFlexion3d: round(angles.kneeFlexion3d ?? null, 1) },
      state: inSet ? this.engine.state : this.phaseNow,
      trackingOk: gate.ok,
      conf: round(gate.conf, 3) ?? 0,
      cue: out.shown,
      rep: this.engine.reps,
    });

    if (this.phaseNow === 'active' && this.engine.reps >= this.cfg.exercises.kneeExtension.reps) this.finish(t);

    const hold = this.phaseNow === 'active' ? this.engine.holdRemainingMs() : null;
    this.last = {
      t,
      phase: this.phaseNow,
      resuming: this.resuming,
      gate,
      lm: f.lm,
      framing,
      framingText: framing?.issue ? framingMessage(framing.issue, this.side) : null,
      canStart: this.phaseNow === 'framing' && !this.resuming && (framing?.passed ?? false),
      calibrationProgress,
      countdownRemainingS:
        this.phaseNow === 'countdown'
          ? Math.max(0, Math.ceil((this.cfg.countdownSeconds * 1000 - (t - this.countdownStart)) / 1000))
          : null,
      angle: open ? flexion : null,
      reps: this.engine.reps,
      targetReps: this.cfg.exercises.kneeExtension.reps,
      holdRemainingMs: hold,
      holdTargetMs: this.cfg.exercises.kneeExtension.holdSeconds * 1000,
      shown: out.shown,
      commit: out.commit,
      readyToResume: lost && this.ready,
    };
    return this.last;
  }

  /** "Start set": only once the framing check passes (AC 3); calibration comes first (AC 4). */
  startSet(): boolean {
    if (this.phaseNow !== 'framing' || this.resuming || !this.lastFraming?.passed || this.lastT === null) return false;
    this.calibration = new Calibration(this.cfg.calibration, this.joints);
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
    return { summary: this.summary, frames: this.frames, events: this.events, calibration: this.calibrated };
  }

  private enterCountdown(t: number): void {
    this.countdownStart = t;
    this.setPhase('countdown', t);
  }

  private recordAttempt(a: AttemptRecord): void {
    this.attempts.push(a);
    this.events.push({
      type: 'attempt', t: a.tEnd, tStart: a.tStart, index: a.index, counted: a.counted,
      peak: round(a.peak, 1) ?? a.peak, holdMs: Math.round(a.holdMs), issues: a.issues,
    });
  }

  private finish(t: number): void {
    const kept = this.engine.discard(t);
    if (kept) this.recordAttempt(kept);
    this.setPhase('summary', t);
    const ke = this.cfg.exercises.kneeExtension;
    this.summary = buildSummary({
      side: this.side,
      targetReps: ke.reps,
      holdSeconds: ke.holdSeconds,
      attempts: this.attempts,
      bestFlexion: round(this.bestFlexion, 1),
      trackingLosses: this.trackingLosses,
    });
  }

  private setPhase(to: SetPhase, t: number): void {
    if (!isLegalSetTransition(this.phaseNow, to)) throw new Error(`Illegal phase change ${this.phaseNow} → ${to}`);
    this.phaseNow = to;
    this.events.push({ type: 'phase', t, phase: to });
  }
}
