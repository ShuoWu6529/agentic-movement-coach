import { EXERCISE_INFO } from '../exercises';
import { EXERCISE_IDS } from '../../core/types';
import styles from './ExerciseSelect.module.css';

export function ExerciseSelect() {
  return (
    <section aria-labelledby="choose-heading">
      <h1 id="choose-heading" className={styles.heading}>Choose an exercise</h1>
      <ul className={styles.list}>
        {EXERCISE_IDS.map((id) => (
          <li key={id}>
            {/* Selecting leads to the camera step, which is built in M1. */}
            <button type="button" className={styles.option} disabled aria-describedby={`${id}-camera`}>
              <span className={styles.name}>{EXERCISE_INFO[id].name}</span>
              <span id={`${id}-camera`} className={styles.camera}>{EXERCISE_INFO[id].camera}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className={styles.pending}>Camera setup is not built yet (milestone M1).</p>
    </section>
  );
}
