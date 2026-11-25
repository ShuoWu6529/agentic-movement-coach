// Browser edges the app depends on, injectable so component tests can drive the app from traces.

import type { PoseTrace } from '../core/trace/schema';
import { openCamera } from '../pose/camera';
import { openTrace } from '../pose/traceSource';
import type { FrameSource } from '../pose/types';

export interface AppDeps {
  openCamera(): Promise<FrameSource>;
  openTrace(trace: PoseTrace): FrameSource;
}

export const defaultDeps: AppDeps = {
  openCamera: () => openCamera(),
  openTrace: (trace) => openTrace(trace, { speed: 1 }),
};
