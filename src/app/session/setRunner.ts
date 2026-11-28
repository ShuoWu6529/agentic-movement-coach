// SetRunner: the per-frame loop outside React (PLANS.md §6). FrameSource (+ watchdog) → SetSession →
// overlay drawing, cue display timing and the live store. React sees only phase changes, the finished
// set and the throttled live view.

import type { TargetsConfig } from '../../core/config/schema';
import type { PoseFrame } from '../../core/pose';
import { stepWithAutoAdvance, type AutoAdvance } from '../../core/session/replay';
import type { SetPhase } from '../../core/session/phases';
import { SetSession, type SetResult, type SetSnapshot } from '../../core/session/setSession';
import type { PoseTrace, TraceFrame } from '../../core/trace/schema';
import { startWatchdog, stallMsFor, type Watchdog } from '../../pose/watchdog';
import type { FrameSource } from '../../pose/types';
import { drawPose, type Ctx2d } from '../components/overlay';
import { LiveStore, type LiveView } from './liveStore';
import type { Selection } from './phase';

export interface RunnerCallbacks {
  onPhase(phase: Exclude<SetPhase, 'summary'>): void;
  onFinish(result: SetResult, trace: PoseTrace | null): void;
  /** A replay ran out of frames before the set started. */
  onSourceEnded?(): void;
}

const nextFrame: (cb: () => void) => void =
  typeof requestAnimationFrame === 'function' ? (cb) => requestAnimationFrame(() => cb()) : (cb) => setTimeout(cb, 16);

export class SetRunner {
  readonly store = new LiveStore();
  private readonly session: SetSession;
  /** Joints the gate requires for this exercise, highlighted on the overlay. */
  readonly joints: readonly number[];
  private ctx: Ctx2d | null = null;
  private watchdog: Watchdog | null = null;
  private traceFrames: TraceFrame[] = [];
  private lastPhase: SetPhase = 'framing';
  private finished = false;
  private stopped = false;

  constructor(
    private readonly config: TargetsConfig,
    selection: Pick<Selection, 'exercise' | 'side'>,
    private readonly source: FrameSource,
    private readonly cb: RunnerCallbacks,
    private readonly auto: AutoAdvance = { start: false, resume: false },
  ) {
    this.session = new SetSession({ config, exercise: selection.exercise, side: selection.side, video: source.info.size });
    this.joints = this.session.joints;
  }

  private canvas: HTMLCanvasElement | null = null;
  private started = false;

  attachCanvas(canvas: HTMLCanvasElement | null): void {
    if (canvas === this.canvas) return;
    this.canvas = canvas;
    if (!canvas) {
      this.ctx = null;
      return;
    }
    canvas.width = this.source.info.size.width;
    canvas.height = this.source.info.size.height;
    this.ctx = canvas.getContext('2d');
  }

  start(): void {
    if (this.started || this.stopped) return;
    this.started = true;
    if (this.source.now) {
      this.watchdog = startWatchdog({ stallMs: stallMsFor(this.config.tracking), inject: (f) => this.onFrame(f, false) });
    }
    this.source.start(
      (f) => this.onFrame(f, true),
      () => {
        if (this.finished || this.stopped) return;
        if (!this.session.endSet()) this.cb.onSourceEnded?.();
        else this.afterChange();
      },
    );
  }

  stop(): void {
    this.stopped = true;
    this.watchdog?.stop();
    this.source.stop();
  }

  startSet(): void {
    if (this.session.startSet()) this.afterChange();
  }

  resume(): void {
    if (this.session.resume()) this.afterChange();
  }

  endSet(): void {
    if (this.session.endSet()) this.afterChange();
  }

  private onFrame(f: PoseFrame, real: boolean): void {
    if (this.finished || this.stopped) return;
    if (real) this.watchdog?.seen(f.t);
    const snap = stepWithAutoAdvance(this.session, f, this.auto);
    if (!snap) return;
    // The exported trace holds exactly the frames the session processed, including the watchdog's
    // "no pose" frames, so replaying it reproduces the live session's gating and counts.
    if (this.source.info.kind === 'camera') this.traceFrames.push({ t: f.t, lm: f.lm ? [...f.lm] : null, world: f.world ? [...f.world] : null });
    if (this.ctx) drawPose(this.ctx, snap.lm, this.source.info.size, this.joints, snap.gate.ok);
    const commit = snap.commit;
    const now = this.source.now;
    // Only a cue that is published to the display gets a display time (R-F11).
    if (commit && now && this.session.phase !== 'summary') nextFrame(() => this.session.markCueShown(commit.seq, now()));
    this.afterChange(snap);
  }

  private afterChange(snap: SetSnapshot | null = this.session.snapshot): void {
    const phase = this.session.phase;
    if (phase === 'summary') {
      if (this.finished) return;
      this.finished = true;
      this.stop();
      const result = this.session.result();
      if (result) this.cb.onFinish(result, this.trace());
      return;
    }
    if (phase !== this.lastPhase) {
      this.lastPhase = phase;
      this.cb.onPhase(phase);
    }
    if (snap) this.store.publish(this.view(snap, phase));
  }

  private view(s: SetSnapshot, phase: SetPhase): LiveView {
    const same = s.phase === phase;
    return {
      phase,
      resuming: this.session.isResuming,
      trackingOk: s.gate.ok,
      framingText: same ? s.framingText : null,
      canStart: same && s.canStart,
      calibrationProgress: same ? s.calibrationProgress : 0,
      calibrationStage: same ? s.calibrationStage : null,
      calibrationText: same ? s.calibrationText : null,
      countdownRemainingS: same ? s.countdownRemainingS : null,
      angle: same && s.angle !== null ? Math.round(s.angle) : null,
      reps: s.reps,
      targetReps: s.targetReps,
      holdRemainingS: same && s.holdRemainingMs !== null ? Math.ceil(s.holdRemainingMs / 100) / 10 : null,
      lastRiseS: same && s.lastRiseMs !== null ? Math.round(s.lastRiseMs / 100) / 10 : null,
      lastLowerS: same && s.lastLowerMs !== null ? Math.round(s.lastLowerMs / 100) / 10 : null,
      shown: same ? s.shown : null,
      readyToResume: same && s.readyToResume,
    };
  }

  private trace(): PoseTrace | null {
    if (this.source.info.kind !== 'camera' || this.traceFrames.length === 0) return null;
    return { schemaVersion: 1, model: this.source.info.model, video: this.source.info.size, frames: this.traceFrames };
  }
}
