// Runs a pose trace through a SetSession, pressing "Start set" as soon as the framing check passes and
// "Resume" as soon as it is offered. Used by tests, by the in-app trace replay, and later by the offline
// `replay` script (PLANS.md §7), so all three run the same pipeline.

import type { TargetsConfig } from '../config/schema';
import type { PoseFrame } from '../pose';
import type { PoseTrace } from '../trace/schema';
import type { Side } from '../types';
import { SetSession, type SetSnapshot } from './setSession';

export interface AutoAdvance {
  start: boolean;
  resume: boolean;
}

/** Feeds one frame and applies the automatic presses. Returns the frame's snapshot. */
export function stepWithAutoAdvance(session: SetSession, frame: PoseFrame, auto: AutoAdvance): SetSnapshot | null {
  const snap = session.step(frame);
  if (snap?.canStart && auto.start) session.startSet();
  if (snap?.readyToResume && auto.resume) session.resume();
  return snap;
}

export function replayTrace(
  trace: PoseTrace,
  opts: { config: TargetsConfig; side: Side; auto?: AutoAdvance; endAtTraceEnd?: boolean },
): { session: SetSession; snapshots: SetSnapshot[] } {
  const session = new SetSession({ config: opts.config, side: opts.side, video: trace.video });
  const auto = opts.auto ?? { start: true, resume: true };
  const snapshots: SetSnapshot[] = [];
  for (const f of trace.frames) {
    const s = stepWithAutoAdvance(session, f, auto);
    if (s) snapshots.push(s);
    if (session.phase === 'summary') break;
  }
  if ((opts.endAtTraceEnd ?? true) && session.phase !== 'summary') session.endSet();
  return { session, snapshots };
}
