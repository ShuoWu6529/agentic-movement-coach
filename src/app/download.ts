// Local downloads only (C-2): the session log and pose trace are handed to the user as files and are
// never sent anywhere.

import type { PoseTrace } from '../core/trace/schema';

export function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function fileStamp(d = new Date()): string {
  return d.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/** Rounds landmark values so an exported trace stays compact. */
export function compactTrace(trace: PoseTrace): PoseTrace {
  const r = (v: number) => Math.round(v * 1e5) / 1e5;
  return {
    ...trace,
    frames: trace.frames.map((f) => ({
      t: Math.round(f.t * 10) / 10,
      lm: f.lm ? f.lm.map(r) : null,
      world: f.world ? f.world.map(r) : null,
    })),
  };
}
