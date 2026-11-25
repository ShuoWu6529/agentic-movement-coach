// Set summary (R-F9, AC 6). Always at least one "went well" or "adjust" note, including for a set with
// no repetitions. Notes are neutral and refer to the therapist's target; they never diagnose, suggest
// other targets or prescribe (R-S2, R-S3).

import type { AttemptRecord } from './exercises/kneeExtension';
import type { IssueCategory } from './rules/registry';
import type { Side } from './types';

export interface SetSummary {
  exercise: 'kneeExtension';
  side: Side;
  reps: number;
  targetReps: number;
  attempts: number;
  /** Hold durations of the counted repetitions, ms. */
  holdsMs: number[];
  /** Best (smallest) knee flexion over reliable frames of the set, degrees; null if none. */
  bestFlexion: number | null;
  issueCounts: Partial<Record<IssueCategory, number>>;
  trackingLosses: number;
  wentWell: string[];
  adjust: string[];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function buildSummary(input: {
  side: Side;
  targetReps: number;
  holdSeconds: number;
  attempts: readonly AttemptRecord[];
  bestFlexion: number | null;
  trackingLosses: number;
}): SetSummary {
  const counted = input.attempts.filter((a) => a.counted);
  const issueCounts: Partial<Record<IssueCategory, number>> = {};
  for (const a of input.attempts) for (const i of a.issues) issueCounts[i] = (issueCounts[i] ?? 0) + 1;

  const wentWell: string[] = [];
  const adjust: string[] = [];
  if (counted.length > 0) {
    wentWell.push(
      counted.length >= input.targetReps
        ? `You completed all ${input.targetReps} repetitions.`
        : `You completed ${plural(counted.length, 'repetition', 'repetitions')} of ${input.targetReps}.`,
    );
    wentWell.push(`${plural(counted.length, 'hold', 'holds')} reached the full ${input.holdSeconds} seconds.`);
  }
  const range = issueCounts.insufficient_range ?? 0;
  if (range > 0) adjust.push(`${plural(range, 'attempt', 'attempts')} stopped short of the target angle.`);
  const breaks = issueCounts.hold_break ?? 0;
  if (breaks > 0) adjust.push(`${plural(breaks, 'hold', 'holds')} ended before the timer finished.`);
  if (input.trackingLosses > 0) {
    adjust.push(
      `The camera lost sight of you ${plural(input.trackingLosses, 'time', 'times')}. Movements during those moments were not counted.`,
    );
  }
  if (wentWell.length === 0 && adjust.length === 0) {
    adjust.push('No repetitions were counted this time. Check that the camera is to your side and your whole leg is in view.');
  }

  return {
    exercise: 'kneeExtension',
    side: input.side,
    reps: counted.length,
    targetReps: input.targetReps,
    attempts: input.attempts.length,
    holdsMs: counted.map((a) => a.holdMs),
    bestFlexion: input.bestFlexion,
    issueCounts,
    trackingLosses: input.trackingLosses,
    wentWell,
    adjust,
  };
}
