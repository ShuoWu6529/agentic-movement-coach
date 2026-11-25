// PoseEngine (R-F1, PLANS.md §2 principle 4): MediaPipe PoseLandmarker in VIDEO mode, on the device.
// `detect` is async from day one so inference can move to a worker without changing callers.
// Model and wasm are self-hosted under BASE_URL (C-2): no third-party requests at runtime.

import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { LM_STRIDE, NUM_LANDMARKS, WORLD_STRIDE } from '../core/trace/schema';

export interface PoseResult {
  lm: number[];
  world: number[];
}

export interface PoseEngine {
  readonly variant: 'full' | 'lite';
  readonly delegate: 'GPU' | 'CPU';
  detect(frame: HTMLVideoElement, timestampMs: number): Promise<PoseResult | null>;
  close(): void;
}

const BASE = import.meta.env.BASE_URL;

export async function createPoseEngine(variant: 'full' | 'lite' = 'full'): Promise<PoseEngine> {
  const fileset = await FilesetResolver.forVisionTasks(`${BASE}wasm`);
  const create = (delegate: 'GPU' | 'CPU') =>
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${BASE}models/pose_landmarker_${variant}.task`, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      outputSegmentationMasks: false,
    });
  let delegate: 'GPU' | 'CPU' = 'GPU';
  let landmarker: PoseLandmarker;
  try {
    landmarker = await create('GPU');
  } catch {
    delegate = 'CPU';
    landmarker = await create('CPU');
  }

  return {
    variant,
    delegate,
    async detect(frame, timestampMs) {
      let out: PoseResult | null = null;
      landmarker.detectForVideo(frame, timestampMs, (res) => {
        const img = res.landmarks[0];
        const world = res.worldLandmarks[0];
        if (!img || !world || img.length < NUM_LANDMARKS || world.length < NUM_LANDMARKS) return;
        const lm = new Array<number>(NUM_LANDMARKS * LM_STRIDE);
        const w = new Array<number>(NUM_LANDMARKS * WORLD_STRIDE);
        for (let i = 0; i < NUM_LANDMARKS; i++) {
          const p = img[i]!;
          lm[i * LM_STRIDE] = p.x;
          lm[i * LM_STRIDE + 1] = p.y;
          lm[i * LM_STRIDE + 2] = p.z;
          lm[i * LM_STRIDE + 3] = p.visibility ?? 0;
          lm[i * LM_STRIDE + 4] = p.presence ?? 0;
          const q = world[i]!;
          w[i * WORLD_STRIDE] = q.x;
          w[i * WORLD_STRIDE + 1] = q.y;
          w[i * WORLD_STRIDE + 2] = q.z;
        }
        out = { lm, world: w };
      });
      return out;
    },
    close() {
      landmarker.close();
    },
  };
}
