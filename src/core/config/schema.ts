// Targets config schema (R-F3, PLANS.md §5). zod is the single source of truth: the JSON loader,
// and later the settings form (M4), read min, max and unit from here. Every threshold is config (R-E9).
// Ranges are sanity bounds to catch typos, not clinical limits.
// v2 (M2): `exercises.sitToStand.minStandRise`, for the standing pose of sit-to-stand calibration.
// v3 (M2 manual checks): `exercises.sitToStand.maxScaleChange`, the body-size guard.
// Older shapes are kept only to read session logs recorded with them (log/schema.ts); the app loads v3.

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

const SitToStandV1 = z.strictObject({
  reps: num(1, 50, 'reps', { int: true }),
  riseMs: range(100, 20000, 'ms'),
  lowerMs: range(100, 20000, 'ms'),
  standFrac: num(0, 1, 'fraction'),
  sitFrac: num(0, 1, 'fraction'),
});

const SitToStandV2 = SitToStandV1.extend({
  // Calibration accepts a still standing pose only if the shoulders rose at least this far above
  // the seated height, as a fraction of the seated trunk length (docs/definitions.md).
  minStandRise: num(0.05, 2, 'trunk lengths'),
});

const SitToStandV3 = SitToStandV2.extend({
  // During the set, a frame whose shoulder width differs from the calibrated width by more than this
  // fraction is unreliable: the patient has moved toward or away from the camera (docs/definitions.md).
  maxScaleChange: num(0.05, 1, 'fraction'),
});

const sitToStandChecks = <T extends typeof SitToStandV1>(schema: T) =>
  schema.refine((s) => s.sitFrac < s.standFrac, {
    path: ['sitFrac'],
    message: 'Must be less than standFrac, or seated and standing overlap',
  });

export const TargetsConfigSchema = z.strictObject({
  schemaVersion: z.literal(3),
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
    sitToStand: sitToStandChecks(SitToStandV3),
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

/** Config v2 (M2, before the manual checks): v3 without `maxScaleChange`. Only for reading logs. */
export const TargetsConfigV2Schema = TargetsConfigSchema.extend({
  schemaVersion: z.literal(2),
  exercises: TargetsConfigSchema.shape.exercises.extend({ sitToStand: sitToStandChecks(SitToStandV2) }),
});

/** Config v1 (M0–M1): v2 without `sitToStand.minStandRise`. Only for reading logs recorded then. */
export const TargetsConfigV1Schema = TargetsConfigSchema.extend({
  schemaVersion: z.literal(1),
  exercises: TargetsConfigSchema.shape.exercises.extend({ sitToStand: sitToStandChecks(SitToStandV1) }),
});
