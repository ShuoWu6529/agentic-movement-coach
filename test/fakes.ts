// Test doubles for the browser edges: a 2D canvas context that records drawing calls (jsdom has no
// canvas) and a FrameSource the test pushes frames into by hand.

import { vi } from 'vitest';
import type { PoseFrame } from '../src/core/pose';
import type { PoseTrace } from '../src/core/trace/schema';
import type { FrameSource } from '../src/pose/types';

export interface RecordingContext {
  calls: Array<{ op: string; args: unknown[] }>;
  [k: string]: unknown;
}

export function recordingContext(canvas?: HTMLCanvasElement): CanvasRenderingContext2D & RecordingContext {
  const calls: RecordingContext['calls'] = [];
  const op = (name: string) => (...args: unknown[]) => void calls.push({ op: name, args });
  return {
    canvas,
    calls,
    clearRect: op('clearRect'),
    beginPath: op('beginPath'),
    moveTo: op('moveTo'),
    lineTo: op('lineTo'),
    stroke: op('stroke'),
    arc: op('arc'),
    fill: op('fill'),
    drawImage: op('drawImage'),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    lineWidth: 1,
    strokeStyle: '',
    fillStyle: '',
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D & RecordingContext;
}

export const contexts = new WeakMap<HTMLCanvasElement, ReturnType<typeof recordingContext>>();

export function installCanvasStub(): void {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    let ctx = contexts.get(this);
    if (!ctx) {
      ctx = recordingContext(this);
      contexts.set(this, ctx);
    }
    return ctx as never;
  });
}

export interface ManualSource extends FrameSource {
  push(f: PoseFrame): void;
  pushAll(frames: readonly PoseFrame[]): void;
  started: boolean;
  stopped: boolean;
}

/**
 * A camera-like source driven by the test: Start and Resume are pressed by hand, as with a camera.
 * `now` is null, which keeps the wall-clock watchdog off.
 */
export function manualSource(size = { width: 640, height: 480 }): ManualSource {
  let sink: ((f: PoseFrame) => void) | null = null;
  const src: ManualSource = {
    info: {
      kind: 'camera',
      size,
      camera: { w: size.width, h: size.height, fps: 30 },
      model: { variant: 'full', delegate: 'CPU' },
      clock: () => 'callback',
    },
    video: null,
    mirrored: false,
    now: null,
    started: false,
    stopped: false,
    start(onFrame) {
      sink = onFrame;
      src.started = true;
    },
    stop() {
      src.stopped = true;
    },
    push(f) {
      sink?.(f);
    },
    pushAll(frames) {
      for (const f of frames) sink?.(f);
    },
  };
  return src;
}

/** Shifts a trace's frames so they follow on from `afterT`. */
export function after(trace: PoseTrace, afterT: number): PoseFrame[] {
  return trace.frames.map((f) => ({ ...f, t: f.t + afterT + 1 }));
}
