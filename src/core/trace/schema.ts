// Pose trace v1 (SPEC 8.5): recorded landmark sequences for TraceSource, tests, fixtures and replay.
// Drafted from the M0.5 spike's v0 format. Landmarks are flat arrays to keep traces compact.

import { z } from 'zod';

export const NUM_LANDMARKS = 33;
/** Values per image landmark in `lm`: x, y (normalized 0..1), z, visibility, presence. */
export const LM_STRIDE = 5;
/** Values per world landmark in `world`: x, y, z in metres, hip-centred. */
export const WORLD_STRIDE = 3;

const flat = (n: number) => z.array(z.number()).length(n);

export const TraceFrameSchema = z.strictObject({
  /** ms from trace start, frame capture time (or media time for video replay). */
  t: z.number().nonnegative(),
  lm: flat(NUM_LANDMARKS * LM_STRIDE).nullable(),
  world: flat(NUM_LANDMARKS * WORLD_STRIDE).nullable(),
});

export const PoseTraceSchema = z.strictObject({
  schemaVersion: z.literal(1),
  model: z.strictObject({
    variant: z.enum(['full', 'lite']),
    delegate: z.enum(['GPU', 'CPU']),
  }),
  video: z.strictObject({ width: z.number().int().positive(), height: z.number().int().positive() }),
  frames: z.array(TraceFrameSchema),
});

export type TraceFrame = z.infer<typeof TraceFrameSchema>;
export type PoseTrace = z.infer<typeof PoseTraceSchema>;
