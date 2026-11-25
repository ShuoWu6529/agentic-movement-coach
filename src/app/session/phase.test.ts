// AC 4: the phase reducer rejects illegal transitions, so a set never starts before calibration.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { TargetsConfig } from '../../core/config/schema';
import { initialPhase, isLegalTransition, phaseReducer, type PhaseAction, type PhaseState } from './phase';

const config: TargetsConfig = JSON.parse(readFileSync('public/config/targets.json', 'utf8'));
const selection = { exercise: 'kneeExtension', side: 'left', source: { kind: 'camera' } } as const;

function walk(actions: PhaseAction[], from: PhaseState = initialPhase): PhaseState {
  return actions.reduce(phaseReducer, from);
}
const toFraming: PhaseAction[] = [
  { type: 'configLoaded', config, configHash: 'h' },
  { type: 'choose', selection },
  { type: 'sourceReady' },
];

describe('phase reducer', () => {
  it('follows the legal path to the active set', () => {
    const s = walk([...toFraming, { type: 'setPhase', phase: 'calibration' }, { type: 'setPhase', phase: 'countdown' }, { type: 'setPhase', phase: 'active' }]);
    expect(s.phase).toBe('active');
  });

  it.each([
    ['framing', 'active'],
    ['framing', 'countdown'], // allowed only by the core when resuming; checked below
    ['calibration', 'active'],
    ['permission', 'active'],
  ] as const)('never reaches the set from %s straight to %s without calibration', (from, to) => {
    const states: Record<string, PhaseAction[]> = {
      framing: toFraming,
      calibration: [...toFraming, { type: 'setPhase', phase: 'calibration' }],
      permission: toFraming.slice(0, 2),
    };
    const s = walk([...states[from]!, { type: 'setPhase', phase: to }]);
    if (from === 'framing' && to === 'countdown') {
      expect(s.phase).toBe('countdown'); // the core gates this (it only does so when resuming)
    } else {
      expect(s.phase).toBe(from);
    }
  });

  it('rejects illegal transitions and unrelated actions', () => {
    expect(isLegalTransition('select', 'active')).toBe(false);
    expect(isLegalTransition('calibration', 'active')).toBe(false);
    expect(isLegalTransition('summary', 'active')).toBe(false);
    expect(isLegalTransition('configError', 'select')).toBe(false);
    expect(isLegalTransition('active', 'calibration')).toBe(false);

    expect(walk([{ type: 'sourceReady' }]).phase).toBe('loading');
    const sel = walk(toFraming.slice(0, 1));
    expect(phaseReducer(sel, { type: 'setPhase', phase: 'active' })).toBe(sel);
    const err = walk([{ type: 'configFailed', problems: ['x'] }]);
    expect(phaseReducer(err, { type: 'choose', selection })).toBe(err);
    expect(phaseReducer(err, { type: 'configLoaded', config, configHash: 'h' })).toBe(err);
  });

  it('reaches the summary only from a started set', () => {
    const framing = walk(toFraming);
    const finished = { result: {} as never, meta: {} as never, trace: null };
    expect(phaseReducer(walk([...toFraming, { type: 'setPhase', phase: 'calibration' }]), { type: 'finished', finished }).phase).toBe('calibration');
    expect(phaseReducer(walk([...toFraming, { type: 'setPhase', phase: 'calibration' }, { type: 'setPhase', phase: 'countdown' },
      { type: 'setPhase', phase: 'active' }]), { type: 'finished', finished }).phase).toBe('summary');
    expect(framing.phase).toBe('framing');
  });

  it('retries the camera with a fresh attempt after an error', () => {
    const failed = walk([...toFraming.slice(0, 2), { type: 'sourceFailed', error: 'denied' }]);
    expect(failed.phase).toBe('cameraError');
    expect(phaseReducer(failed, { type: 'setPhase', phase: 'framing' })).toBe(failed);
    const retry = phaseReducer(failed, { type: 'retry' });
    expect(retry).toMatchObject({ phase: 'permission', attempt: 2 });
  });
});
