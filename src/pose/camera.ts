// CameraSource: getUserMedia → requestVideoFrameCallback → PoseEngine.detect → PoseFrame.
// Frame `t` is the rVFC captureTime where the browser provides it, and the callback time otherwise
// (PLANS.md §5); `info.clock()` reports which. Video frames never leave this module except to the
// on-device model and the local preview (C-2).

import type { PoseFrame } from '../core/pose';
import { CameraStartError, classifyGetUserMediaError } from './cameraErrors';
import { createPoseEngine, type PoseEngine } from './poseEngine';
import type { ClockKind, FrameSource } from './types';

const LUMA_EVERY_MS = 500;

function measureLuma(video: HTMLVideoElement, ctx: CanvasRenderingContext2D): number | undefined {
  const { width, height } = ctx.canvas;
  try {
    ctx.drawImage(video, 0, 0, width, height);
    const d = ctx.getImageData(0, 0, width, height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
    return sum / (d.length / 4);
  } catch {
    return undefined;
  }
}

export async function openCamera(createEngine: () => Promise<PoseEngine> = () => createPoseEngine('full')): Promise<FrameSource> {
  if (!window.isSecureContext) throw new CameraStartError('insecure');
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraStartError('unsupported');

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
    });
  } catch (e) {
    throw new CameraStartError(classifyGetUserMediaError(e), e instanceof Error ? e.message : String(e));
  }
  const stopStream = () => stream.getTracks().forEach((t) => t.stop());

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.srcObject = stream;
  try {
    await video.play();
    if (!video.videoWidth) await new Promise((r) => video.addEventListener('loadedmetadata', r, { once: true }));
  } catch (e) {
    stopStream();
    throw new CameraStartError('other', String(e));
  }

  let engine: PoseEngine;
  try {
    engine = await createEngine();
  } catch (e) {
    stopStream();
    throw new CameraStartError('model', String(e));
  }

  const settings = stream.getVideoTracks()[0]?.getSettings() ?? {};
  const width = video.videoWidth;
  const height = video.videoHeight;
  let clock: ClockKind = 'callback';
  let origin = 0;
  let running = false;
  let handle: number | null = null;
  const lumaCtx = (() => {
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 18;
    return c.getContext('2d', { willReadFrequently: true });
  })();
  let luma: number | undefined;
  let lumaAt = -Infinity;

  const hasRvfc = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
  let lastAbs = -Infinity;
  let lastMediaTime = -1;
  let busy = false;

  const source: FrameSource = {
    info: {
      kind: 'camera',
      size: { width, height },
      camera: { w: width, h: height, fps: settings.frameRate ?? 0 },
      model: { variant: engine.variant, delegate: engine.delegate },
      clock: () => clock,
    },
    video,
    mirrored: true,
    now: () => performance.now() - origin,
    start(onFrame) {
      origin = performance.now();
      running = true;

      const process = async (now: number, captureTime: number | undefined) => {
        if (busy) return;
        const abs = captureTime ?? now;
        if (captureTime !== undefined) clock = 'captureTime';
        if (abs <= lastAbs) return;
        lastAbs = abs;
        busy = true;
        try {
          if (lumaCtx && now - lumaAt >= LUMA_EVERY_MS) {
            luma = measureLuma(video, lumaCtx);
            lumaAt = now;
          }
          const pose = await engine.detect(video, abs);
          if (!running) return;
          const frame: PoseFrame = { t: Math.max(0, abs - origin), lm: pose?.lm ?? null, world: pose?.world ?? null, luma };
          onFrame(frame);
        } finally {
          busy = false;
        }
      };

      const schedule = () => {
        if (!running) return;
        if (hasRvfc) {
          handle = video.requestVideoFrameCallback((now, meta) => {
            void process(now, meta.captureTime).finally(schedule);
          });
        } else {
          handle = requestAnimationFrame((now) => {
            if (video.currentTime !== lastMediaTime) {
              lastMediaTime = video.currentTime;
              void process(now, undefined).finally(schedule);
            } else schedule();
          });
        }
      };
      schedule();
    },
    stop() {
      running = false;
      if (handle !== null) {
        if (hasRvfc) video.cancelVideoFrameCallback(handle);
        else cancelAnimationFrame(handle);
      }
      stopStream();
      video.srcObject = null;
      engine.close();
    },
  };
  return source;
}
