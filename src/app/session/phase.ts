// App phase machine (PLANS.md §6): loading → select → permission → framing → calibration → countdown →
// active ⇄ trackingLost → summary, plus the blocking config-error and camera-error states.
// Set phases come from the core session; this reducer accepts only legal transitions (AC 4) and
// ignores anything else, so a set can never start before calibration completes.

import type { TargetsConfig } from '../../core/config/schema';
import type { SessionMeta } from '../../core/log/build';
import { SET_TRANSITIONS, type SetPhase } from '../../core/session/phases';
import type { SetResult } from '../../core/session/setSession';
import type { PoseTrace } from '../../core/trace/schema';
import type { BuiltExerciseId, Side } from '../../core/types';
import type { CameraErrorKind } from '../../pose/cameraErrors';

export interface Selection {
  exercise: BuiltExerciseId;
  /** Anatomical side for knee extension; null for sit-to-stand. */
  side: Side | null;
  source: { kind: 'camera' } | { kind: 'trace'; name: string; trace: PoseTrace };
}

export interface FinishedSet {
  result: SetResult;
  meta: SessionMeta;
  /** Pose trace recorded from the camera, for research export; null for a replay. */
  trace: PoseTrace | null;
}

type LiveSetPhase = Exclude<SetPhase, 'summary'>;
export type AppPhase = 'loading' | 'configError' | 'select' | 'permission' | 'cameraError' | SetPhase;

interface Ready {
  config: TargetsConfig;
  configHash: string;
}
interface InSession extends Ready {
  selection: Selection;
  /** Bumped on each camera attempt, so a retry starts a fresh source. */
  attempt: number;
}

export type PhaseState =
  | { phase: 'loading' }
  | { phase: 'configError'; problems: string[] }
  | ({ phase: 'select' } & Ready)
  | ({ phase: 'permission' } & InSession)
  | ({ phase: 'cameraError'; error: CameraErrorKind } & InSession)
  | ({ phase: LiveSetPhase } & InSession)
  | ({ phase: 'summary'; finished: FinishedSet } & InSession);

export type PhaseAction =
  | { type: 'configLoaded'; config: TargetsConfig; configHash: string }
  | { type: 'configFailed'; problems: string[] }
  | { type: 'choose'; selection: Selection }
  | { type: 'sourceReady' }
  | { type: 'sourceFailed'; error: CameraErrorKind }
  | { type: 'retry' }
  | { type: 'setPhase'; phase: LiveSetPhase }
  | { type: 'finished'; finished: FinishedSet }
  | { type: 'back' };

const APP_TRANSITIONS: Readonly<Record<AppPhase, readonly AppPhase[]>> = {
  loading: ['select', 'configError'],
  configError: [],
  select: ['permission'],
  permission: ['framing', 'cameraError', 'select'],
  cameraError: ['permission', 'select'],
  framing: [...SET_TRANSITIONS.framing, 'select'],
  calibration: [...SET_TRANSITIONS.calibration, 'select'],
  countdown: [...SET_TRANSITIONS.countdown, 'select'],
  active: SET_TRANSITIONS.active,
  trackingLost: SET_TRANSITIONS.trackingLost,
  summary: ['select'],
};

export function isLegalTransition(from: AppPhase, to: AppPhase): boolean {
  return APP_TRANSITIONS[from].includes(to);
}

export const initialPhase: PhaseState = { phase: 'loading' };

export function phaseReducer(state: PhaseState, action: PhaseAction): PhaseState {
  const can = (to: AppPhase) => isLegalTransition(state.phase, to);
  switch (action.type) {
    case 'configLoaded':
      return can('select') ? { phase: 'select', config: action.config, configHash: action.configHash } : state;
    case 'configFailed':
      return can('configError') ? { phase: 'configError', problems: action.problems } : state;
    case 'choose':
      if (state.phase !== 'select') return state;
      return { phase: 'permission', config: state.config, configHash: state.configHash, selection: action.selection, attempt: 1 };
    case 'sourceReady':
      return state.phase === 'permission' ? { ...state, phase: 'framing' } : state;
    case 'sourceFailed':
      return state.phase === 'permission' ? { ...state, phase: 'cameraError', error: action.error } : state;
    case 'retry':
      if (state.phase !== 'cameraError') return state;
      return { phase: 'permission', config: state.config, configHash: state.configHash, selection: state.selection, attempt: state.attempt + 1 };
    case 'setPhase':
      if (!('selection' in state) || state.phase === 'summary' || !can(action.phase)) return state;
      if (state.phase === 'permission' || state.phase === 'cameraError') return state;
      return { phase: action.phase, config: state.config, configHash: state.configHash, selection: state.selection, attempt: state.attempt };
    case 'finished':
      if (!('selection' in state) || !can('summary')) return state;
      return { phase: 'summary', config: state.config, configHash: state.configHash, selection: state.selection, attempt: state.attempt, finished: action.finished };
    case 'back':
      if (!('config' in state) || !can('select')) return state;
      return { phase: 'select', config: state.config, configHash: state.configHash };
  }
}
