// Assembles the downloadable session log (R-F10, AC 20) from a finished set. Everything here stays on
// the device: the app offers the log as a local download only (C-2).

import type { TargetsConfig } from '../config/schema';
import type { SetResult } from '../session/setSession';
import type { Side } from '../types';
import type { SessionLog } from './schema';

export interface SessionMeta {
  app: { version: string; gitSha: string };
  config: { hash: string; value: TargetsConfig };
  side: Side;
  device: SessionLog['device'];
  model: SessionLog['model'];
}

export function buildSessionLog(result: SetResult, meta: SessionMeta, observerNote: string): SessionLog {
  return {
    schemaVersion: 2,
    app: meta.app,
    config: meta.config,
    exercise: 'kneeExtension',
    side: meta.side,
    device: meta.device,
    model: meta.model,
    calibration: result.calibration,
    frames: result.frames,
    events: result.events,
    observerNote,
  };
}
