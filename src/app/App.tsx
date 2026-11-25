import { useEffect, useReducer } from 'react';
import { configHash } from '../core/config/hash';
import { Disclaimer } from './components/Disclaimer';
import { defaultDeps, type AppDeps } from './deps';
import { CameraError } from './screens/CameraError';
import { ConfigError } from './screens/ConfigError';
import { ExerciseSelect } from './screens/ExerciseSelect';
import { SessionScreen } from './screens/SessionScreen';
import { Summary } from './screens/Summary';
import { initialPhase, phaseReducer } from './session/phase';
import { loadTargets } from './session/loadTargets';
import styles from './App.module.css';

export function App({ deps = defaultDeps }: { deps?: AppDeps }) {
  const [state, dispatch] = useReducer(phaseReducer, initialPhase);

  useEffect(() => {
    const ctrl = new AbortController();
    loadTargets(ctrl.signal)
      .then(async (r) => {
        if (!r.ok) return dispatch({ type: 'configFailed', problems: r.problems });
        const hash = await configHash(r.config);
        if (!ctrl.signal.aborted) dispatch({ type: 'configLoaded', config: r.config, configHash: hash });
      })
      .catch((e: unknown) => {
        // An abort on unmount is expected. Anything else fails closed with a message, never a stuck loading screen.
        if (!ctrl.signal.aborted) {
          dispatch({ type: 'configFailed', problems: [`Could not load config/targets.json (${String(e)})`] });
        }
      });
    return () => ctrl.abort();
  }, []);

  return (
    <div className={styles.shell}>
      <Disclaimer />
      <main className={styles.main}>
        {state.phase === 'loading' && <p aria-live="polite">Loading exercise settings…</p>}
        {state.phase === 'configError' && <ConfigError problems={state.problems} />}
        {state.phase === 'select' && <ExerciseSelect onChoose={(selection) => dispatch({ type: 'choose', selection })} />}
        {state.phase === 'cameraError' && (
          <CameraError kind={state.error} onRetry={() => dispatch({ type: 'retry' })} onBack={() => dispatch({ type: 'back' })} />
        )}
        {(state.phase === 'permission' ||
          state.phase === 'framing' ||
          state.phase === 'calibration' ||
          state.phase === 'countdown' ||
          state.phase === 'active' ||
          state.phase === 'trackingLost') && (
          <SessionScreen key={state.attempt} state={state} deps={deps} dispatch={dispatch} />
        )}
        {state.phase === 'summary' && <Summary finished={state.finished} onBack={() => dispatch({ type: 'back' })} />}
      </main>
    </div>
  );
}
