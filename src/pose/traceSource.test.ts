import { describe, expect, it } from 'vitest';
import { kneeTrace } from '../../fixtures/synthetic/kneeTrace';
import { openTrace, unsupportedTraceReason } from './traceSource';

describe('trace source', () => {
  it('replays "full" traces and reports the full model', () => {
    const trace = kneeTrace({ side: 'left', segments: [{ ms: 200, flexion: 90 }] });
    expect(unsupportedTraceReason(trace)).toBeNull();
    expect(openTrace(trace).info.model).toEqual({ variant: 'full', delegate: 'CPU' });
  });

  it('refuses a "lite" trace: v1 runs and logs the full model only (SPEC R-F1, O-6)', () => {
    const trace = { ...kneeTrace({ side: 'left', segments: [{ ms: 200, flexion: 90 }] }), model: { variant: 'lite' as const, delegate: 'GPU' as const } };
    expect(unsupportedTraceReason(trace)).toMatch(/"full" model only/);
    expect(() => openTrace(trace)).toThrow(/"full" model only/);
  });
});
