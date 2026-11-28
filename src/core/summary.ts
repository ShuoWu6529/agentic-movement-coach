// Set summary (R-F9, AC 6). Always at least one "went well" or "adjust" note, including for a set with
// no repetitions. Notes are neutral and refer to the therapist's target; they never diagnose, suggest
// other targets or prescribe (R-S2, R-S3).

import type { AttemptRecord } from './exercises/exercise';
import type { IssueCategory } from './rules/registry';
import type { Side } from './types';

export type SetSummary = KneeSummary | SitToStandSummary;

export interface KneeSummary {
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
}): KneeSummary {
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
    holdsMs: counted.map((a) => a.holdMs ?? 0),
    bestFlexion: input.bestFlexion,
    issueCounts,
    trackingLosses: input.trackingLosses,
    wentWell,
    adjust,
  };
}

export interface SitToStandSummary {
  exercise: 'sitToStand';
  reps: number;
  targetReps: number;
  attempts: number;
  /** Rise and lower time of each counted repetition, ms, in order. */
  riseMs: number[];
  lowerMs: number[];
  /** Means over the counted repetitions, ms; null with no repetitions (AC 11). */
  meanRiseMs: number | null;
  meanLowerMs: number | null;
  /** The configured ranges the times were compared with. */
  riseRange: readonly [number, number];
  lowerRange: readonly [number, number];
  /** Attempts that never reached standing. */
  partialRises: number;
  issueCounts: Partial<Record<IssueCategory, number>>;
  trackingLosses: number;
  wentWell: string[];
  adjust: string[];
}

const mean = (xs: readonly number[]): number | null => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const inRange = (ms: number, [lo, hi]: readonly [number, number]) => ms >= lo && ms <= hi;

export function buildSitToStandSummary(input: {
  targetReps: number;
  riseRange: readonly [number, number];
  lowerRange: readonly [number, number];
  attempts: readonly AttemptRecord[];
  trackingLosses: number;
}): SitToStandSummary {
  const counted = input.attempts.filter((a) => a.counted);
  const riseMs = counted.map((a) => a.riseMs ?? 0);
  const lowerMs = counted.map((a) => a.lowerMs ?? 0);
  const issueCounts: Partial<Record<IssueCategory, number>> = {};
  for (const a of input.attempts) for (const i of a.issues) issueCounts[i] = (issueCounts[i] ?? 0) + 1;
  const partialRises = input.attempts.filter((a) => !a.counted).length;

  const wentWell: string[] = [];
  const adjust: string[] = [];
  if (counted.length > 0) {
    wentWell.push(
      counted.length >= input.targetReps
        ? `You completed all ${input.targetReps} repetitions.`
        : `You completed ${plural(counted.length, 'repetition', 'repetitions')} of ${input.targetReps}.`,
    );
    const even = counted.filter((a) => inRange(a.riseMs ?? 0, input.riseRange) && inRange(a.lowerMs ?? 0, input.lowerRange)).length;
    if (even > 0) wentWell.push(`${plural(even, 'repetition was', 'repetitions were')} at the target pace, standing up and sitting down.`);
  }
  const count = (xs: readonly number[], pred: (ms: number) => boolean) => xs.filter(pred).length;
  const [rLo, rHi] = input.riseRange;
  const [lLo, lHi] = input.lowerRange;
  const notes: Array<[number, string]> = [
    [count(riseMs, (ms) => ms < rLo), 'quicker than the target time to stand up'],
    [count(riseMs, (ms) => ms > rHi), 'slower than the target time to stand up'],
    [count(lowerMs, (ms) => ms < lLo), 'quicker than the target time to sit down'],
    [count(lowerMs, (ms) => ms > lHi), 'slower than the target time to sit down'],
  ];
  for (const [n, what] of notes) if (n > 0) adjust.push(`${plural(n, 'repetition was', 'repetitions were')} ${what}.`);
  if (partialRises > 0) adjust.push(`${plural(partialRises, 'rise', 'rises')} did not reach standing, so ${partialRises === 1 ? 'it was' : 'they were'} not counted.`);
  if (input.trackingLosses > 0) {
    adjust.push(
      `The camera lost sight of you ${plural(input.trackingLosses, 'time', 'times')}. Movements during those moments were not counted.`,
    );
  }
  if (wentWell.length === 0 && adjust.length === 0) {
    adjust.push('No repetitions were counted this time. Check that the camera faces you, turned about 45° to one side, with your shoulders and hips in view.');
  }

  return {
    exercise: 'sitToStand',
    reps: counted.length,
    targetReps: input.targetReps,
    attempts: input.attempts.length,
    riseMs,
    lowerMs,
    meanRiseMs: mean(riseMs),
    meanLowerMs: mean(lowerMs),
    riseRange: input.riseRange,
    lowerRange: input.lowerRange,
    partialRises,
    issueCounts,
    trackingLosses: input.trackingLosses,
    wentWell,
    adjust,
  };
}
