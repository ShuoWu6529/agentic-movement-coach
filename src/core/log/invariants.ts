// Session log invariants (AC 18, R-S1). Checked in tests on fixture sessions; M6's
// validate_logs.py applies the same rules to every real log.

import { getRule } from '../rules/registry';
import type { SessionLog } from './schema';

export function logInvariantProblems(log: SessionLog): string[] {
  const problems: string[] = [];
  let prevT = -Infinity;
  let prevRep = 0;
  const okAt = new Map<number, boolean>();

  log.frames.forEach((f, i) => {
    if (f.t <= prevT) problems.push(`frames[${i}]: t ${f.t} does not increase`);
    prevT = f.t;
    if (f.rep < prevRep) problems.push(`frames[${i}]: rep went down`);
    prevRep = f.rep;
    okAt.set(f.t, f.trackingOk);
    if (f.cue !== null) {
      const rule = getRule(f.cue);
      if (!rule) problems.push(`frames[${i}]: unknown rule ID ${f.cue}`);
      else if (!f.trackingOk && rule.kind !== 'status') {
        problems.push(`frames[${i}]: ${rule.kind} cue ${f.cue} on a frame with unreliable tracking`);
      }
    }
  });

  let counted = 0;
  log.events.forEach((e, i) => {
    if (e.type === 'cue') {
      const rule = getRule(e.ruleId);
      if (!rule || rule.kind === 'status') problems.push(`events[${i}]: cue event for ${e.ruleId} is not advice or positive`);
      if (!(e.onsetT <= e.confirmT && e.confirmT <= e.shownAt)) problems.push(`events[${i}]: cue times out of order`);
      if (okAt.get(e.confirmT) !== true) problems.push(`events[${i}]: cue ${e.ruleId} committed on a frame without reliable tracking`);
    } else if (e.type === 'attempt') {
      if (e.counted) counted++;
      if (e.tStart > e.t) problems.push(`events[${i}]: attempt ends before it starts`);
    } else if (e.type === 'tracking_lost') {
      if (e.firstBadT > e.t) problems.push(`events[${i}]: tracking_lost before its first bad frame`);
    }
  });

  const finalRep = log.frames.at(-1)?.rep ?? 0;
  if (finalRep !== counted) problems.push(`final rep count ${finalRep} differs from ${counted} counted attempts`);
  return problems;
}
