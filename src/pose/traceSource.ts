// TraceSource: plays a recorded pose trace (schema v1) through the same pipeline as the camera.
// Frames keep their recorded `t`. `speed` scales playback; Infinity plays every frame at once.

import type { PoseFrame } from '../core/pose';
import type { PoseTrace } from '../core/trace/schema';
import type { FrameSource } from './types';

function medianFps(trace: PoseTrace): number {
  const d = trace.frames.slice(1).map((f, i) => f.t - trace.frames[i]!.t).sort((a, b) => a - b);
  const m = d[Math.floor(d.length / 2)];
  return m ? Math.round(1000 / m) : 0;
}

/** v1 replays only traces from the "full" model, the only one the gate was measured on (SPEC R-F1, O-6). */
export function unsupportedTraceReason(trace: PoseTrace): string | null {
  return trace.model.variant === 'full'
    ? null
    : `This trace was recorded with the "${trace.model.variant}" model. v1 supports the "full" model only.`;
}

export function openTrace(trace: PoseTrace, opts: { speed?: number } = {}): FrameSource {
  const unsupported = unsupportedTraceReason(trace);
  if (unsupported) throw new Error(unsupported);
  const speed = opts.speed ?? 1;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  return {
    info: {
      kind: 'trace',
      size: { width: trace.video.width, height: trace.video.height },
      camera: { w: trace.video.width, h: trace.video.height, fps: medianFps(trace) },
      model: { variant: 'full', delegate: trace.model.delegate },
      clock: () => 'trace',
    },
    video: null,
    mirrored: false,
    now: null,
    start(onFrame: (f: PoseFrame) => void, onEnd?: () => void) {
      running = true;
      const frames = trace.frames;
      const t0 = frames[0]?.t ?? 0;
      const wall0 = performance.now();
      let i = 0;
      const tick = () => {
        timer = null;
        const due = speed === Infinity ? Infinity : (performance.now() - wall0) * speed;
        while (running && i < frames.length && frames[i]!.t - t0 <= due) onFrame(frames[i++]!);
        if (!running) return;
        if (i < frames.length) timer = setTimeout(tick, 15);
        else onEnd?.();
      };
      tick();
    },
    stop() {
      running = false;
      if (timer !== null) clearTimeout(timer);
    },
  };
}
