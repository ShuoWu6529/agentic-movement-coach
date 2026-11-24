import { useEffect, useReducer } from 'react';
import { Disclaimer } from './components/Disclaimer';
import { ConfigError } from './screens/ConfigError';
import { ExerciseSelect } from './screens/ExerciseSelect';
import { initialPhase, phaseReducer } from './session/phase';
import { loadTargets } from './session/loadTargets';
import styles from './App.module.css';

export function App() {
  const [state, dispatch] = useReducer(phaseReducer, initialPhase);

  useEffect(() => {
    const ctrl = new AbortController();
    loadTargets(ctrl.signal).then(
      (r) => dispatch(r.ok ? { type: 'configLoaded', config: r.config } : { type: 'configFailed', problems: r.problems }),
      () => {}, // aborted on unmount
    );
    return () => ctrl.abort();
  }, []);

  return (
    <div className={styles.shell}>
      <Disclaimer />
      <main className={styles.main}>
        {state.phase === 'loading' && <p aria-live="polite">Loading exercise settings…</p>}
        {state.phase === 'configError' && <ConfigError problems={state.problems} />}
        {state.phase === 'select' && <ExerciseSelect />}
      </main>
    </div>
  );
}
