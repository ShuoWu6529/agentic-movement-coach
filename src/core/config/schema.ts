// Targets config schema (R-F3, SPEC 8.5). zod is the single source of truth: the JSON loader,
// and later the settings form (M4), read min, max and unit from here. Every threshold is config (R-E9).
// Ranges are sanity bounds to catch typos, not clinical limits.

import { z } from 'zod';
import { isRuleId, RULES } from '../rules/registry';

const ADVICE_RULE_IDS = RULES.filter((r) => r.kind === 'advice').map((r) => r.ruleId);

const num = (min: number, max: number, unit: string, opts: { int?: boolean } = {}) =>
  (opts.int ? z.number().int() : z.number()).min(min).max(max).meta({ unit });

const range = (min: number, max: number, unit: string) =>
  z
    .tuple([num(min, max, unit), num(min, max, unit)])
    .refine(([lo, hi]) => lo <= hi, { message: 'Lower bound must not exceed upper bound' })
    .meta({ unit });

export const TargetsConfigSchema = z.strictObject({
  schemaVersion: z.literal(1),
  configVersion: z.string().min(1),
  tracking: z.strictObject({
    minVisibility: num(0, 1, 'score'),
    boundsMargin: num(0, 0.2, 'frame fraction'),
    unreliableAfterMs: num(0, 1000, 'ms', { int: true }),
    recoverAfterMs: num(0, 10000, 'ms', { int: true }),
    minFps: num(1, 60, 'fps'),
  }),
  framing: z.strictObject({
    stableMs: num(0, 10000, 'ms', { int: true }),
    minLuma: num(0, 255, 'luma'),
  }),
  calibration: z.strictObject({
    durationMs: num(250, 10000, 'ms', { int: true }),
    maxMotion: num(0, 1, 'frame fraction'),
  }),
  smoothing: z.strictObject({
    kind: z.literal('ema'),
    alpha: num(0.01, 1, 'factor'),
  }),
  cues: z.strictObject({
    displayMs: num(0, 30000, 'ms', { int: true }),
    cooldownMs: num(0, 60000, 'ms', { int: true }),
    // Every advice rule needs its own dwell, so the cue gate never falls back to a guessed value (AC 15).
    dwellMs: z
      .record(z.string().refine(isRuleId, { message: 'Unknown rule ID' }), num(0, 5000, 'ms', { int: true }))
      .superRefine((dwell, ctx) => {
        for (const id of ADVICE_RULE_IDS) {
          if (!(id in dwell)) ctx.addIssue({ code: 'custom', path: [id], message: 'Missing dwell time for advice rule' });
        }
      }),
  }),
  countdownSeconds: num(0, 10, 's', { int: true }),
  // Cross-field checks (docs/definitions.md): each one rejects a config whose attempt or cycle could never work.
  exercises: z.strictObject({
    kneeExtension: z
      .strictObject({
        targetFlexionAtMostDeg: num(0, 90, 'deg'),
        toleranceDeg: num(0, 30, 'deg'),
        holdSeconds: num(0, 60, 's'),
        reps: num(1, 50, 'reps', { int: true }),
        startFlexionDeg: num(0, 150, 'deg'),
        reversalDeg: num(1, 45, 'deg'),
      })
      .refine((k) => k.startFlexionDeg > k.targetFlexionAtMostDeg + k.toleranceDeg, {
        path: ['startFlexionDeg'],
        message: 'Must be greater than targetFlexionAtMostDeg + toleranceDeg, or an attempt starts inside the target band',
      }),
    sitToStand: z
      .strictObject({
        reps: num(1, 50, 'reps', { int: true }),
        riseMs: range(100, 20000, 'ms'),
        lowerMs: range(100, 20000, 'ms'),
        standFrac: num(0, 1, 'fraction'),
        sitFrac: num(0, 1, 'fraction'),
      })
      .refine((s) => s.sitFrac < s.standFrac, {
        path: ['sitFrac'],
        message: 'Must be less than standFrac, or seated and standing overlap',
      }),
    shoulderRaise: z
      .strictObject({
        targetElevationDeg: num(0, 180, 'deg'),
        toleranceDeg: num(0, 30, 'deg'),
        reps: num(1, 50, 'reps', { int: true }),
        leanToleranceDeg: num(0, 45, 'deg'),
        resetElevationDeg: num(0, 180, 'deg'),
      })
      .refine((s) => s.resetElevationDeg < s.targetElevationDeg - s.toleranceDeg, {
        path: ['resetElevationDeg'],
        message: 'Must be less than targetElevationDeg − toleranceDeg, or an attempt starts already at the target',
      }),
  }),
});

export type TargetsConfig = z.infer<typeof TargetsConfigSchema>;
