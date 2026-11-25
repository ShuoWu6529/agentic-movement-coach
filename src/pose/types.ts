// The FrameSource boundary (PLANS.md §2 principle 3): the session runs the same pipeline on live
// camera frames and on recorded pose traces.

import type { PoseFrame } from '../core/pose';

export type ClockKind = 'captureTime' | 'callback' | 'trace';

export interface SourceInfo {
  kind: 'camera' | 'trace';
  /** Frame size in pixels, for image-plane angles and the overlay. */
  size: { width: number; height: number };
  camera: { w: number; h: number; fps: number };
  model: { variant: 'full' | 'lite'; delegate: 'GPU' | 'CPU' };
  /** Which clock frame `t` comes from; known after the first frame for a camera. */
  clock(): ClockKind;
}

export interface FrameSource {
  info: SourceInfo;
  /** The live preview, when there is one. */
  video: HTMLVideoElement | null;
  /** Mirror the preview (and overlay with it) for a user-facing camera. Data stays unmirrored. */
  mirrored: boolean;
  /** Current time on the frame clock (ms from session start), or null for a source without a live clock. */
  now: (() => number) | null;
  start(onFrame: (f: PoseFrame) => void, onEnd?: () => void): void;
  stop(): void;
}
