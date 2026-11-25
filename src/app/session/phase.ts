// Phase machine (PLANS.md §6). M0 covers loading → select, plus the blocking config-error state.
// permission, framing, calibration, countdown, active, trackingLost and summary arrive in M1.

import type { TargetsConfig } from '../../core/config/schema';

export type PhaseState =
  | { phase: 'loading' }
  | { phase: 'select'; config: TargetsConfig }
  | { phase: 'configError'; problems: string[] };

export type PhaseAction =
  | { type: 'configLoaded'; config: TargetsConfig }
  | { type: 'configFailed'; problems: string[] };

export const initialPhase: PhaseState = { phase: 'loading' };

export function phaseReducer(state: PhaseState, action: PhaseAction): PhaseState {
  switch (action.type) {
    case 'configLoaded':
      return state.phase === 'loading' ? { phase: 'select', config: action.config } : state;
    case 'configFailed':
      return state.phase === 'loading' ? { phase: 'configError', problems: action.problems } : state;
  }
}
