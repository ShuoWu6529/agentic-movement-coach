// Session log v1 (R-F10, R-F11, SPEC 8.5). Shared with the Python scoring script, which will
// validate against a JSON Schema generated from this one (M6). No breaking changes after M7 starts.

import { z } from 'zod';
import { TargetsConfigSchema } from '../config/schema';
import { EXERCISE_IDS } from '../types';

export const FrameRowSchema = z.strictObject({
  /** ms from session start, frame capture time. */
  t: z.number().nonnegative(),
  /** Open-keyed, e.g. { kneeFlexion: 41.2 }; null when not computable this frame. */
  angles: z.record(z.string(), z.number().nullable()),
  /** Exercise engine state. */
  state: z.string(),
  /** Per-frame gate result. */
  trackingOk: z.boolean(),
  /** Lowest score over required joints. */
  conf: z.number(),
  /** Rule ID shown this frame. */
  cue: z.string().nullable(),
  /** Repetitions counted so far. */
  rep: z.number().int().nonnegative(),
});

export const LogEventSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('phase'), t: z.number(), phase: z.string() }),
  z.strictObject({
    type: z.literal('attempt'),
    t: z.number(),
    index: z.number().int().nonnegative(),
    counted: z.boolean(),
    peak: z.number(),
    holdMs: z.number().optional(),
    riseMs: z.number().optional(),
    lowerMs: z.number().optional(),
    issues: z.array(z.string()),
  }),
  z.strictObject({
    type: z.literal('cue'),
    ruleId: z.string(),
    attemptIndex: z.number().int().nonnegative().nullable(),
    onsetT: z.number(),
    confirmT: z.number(),
    shownAt: z.number(),
  }),
  z.strictObject({ type: z.literal('tracking_lost'), t: z.number(), firstBadT: z.number() }),
  z.strictObject({ type: z.literal('tracking_recovered'), t: z.number() }),
]);

export const SessionLogSchema = z.strictObject({
  schemaVersion: z.literal(1),
  app: z.strictObject({ version: z.string(), gitSha: z.string() }),
  config: z.strictObject({ hash: z.string().regex(/^[0-9a-f]{64}$/), value: TargetsConfigSchema }),
  exercise: z.enum(EXERCISE_IDS),
  /** Anatomical side, not mirrored. */
  side: z.enum(['left', 'right']).optional(),
  device: z.strictObject({
    userAgent: z.string(),
    camera: z.strictObject({ w: z.number(), h: z.number(), fps: z.number() }),
    clock: z.enum(['captureTime', 'callback']),
  }),
  model: z.strictObject({ variant: z.enum(['full', 'lite']), delegate: z.enum(['GPU', 'CPU']) }),
  calibration: z.strictObject({ t: z.number(), baseline: z.record(z.string(), z.number()) }),
  frames: z.array(FrameRowSchema),
  events: z.array(LogEventSchema),
  observerNote: z.string(),
});

export type FrameRow = z.infer<typeof FrameRowSchema>;
export type LogEvent = z.infer<typeof LogEventSchema>;
export type SessionLog = z.infer<typeof SessionLogSchema>;
