import { useState } from 'react';
import { PoseTraceSchema } from '../../core/trace/schema';
import { unsupportedTraceReason } from '../../pose/traceSource';
import type { BuiltExerciseId, Side } from '../../core/types';
import { EXERCISE_INFO } from '../exercises';
import type { Selection } from '../session/phase';
import styles from './ExerciseSelect.module.css';

const SIDES: Side[] = ['left', 'right'];

export function ExerciseSelect({ onChoose }: { onChoose: (s: Selection) => void }) {
  return (
    <section aria-labelledby="choose-heading">
      <h1 id="choose-heading" className={styles.heading}>Choose an exercise</h1>
      <ul className={styles.list}>
        <li className={styles.option}>
          <span className={styles.name}>{EXERCISE_INFO.kneeExtension.name}</span>
          <span className={styles.camera}>{EXERCISE_INFO.kneeExtension.camera} Which leg is this set for?</span>
          <span className={styles.sides}>
            {SIDES.map((side) => (
              <button
                key={side}
                type="button"
                className={styles.side}
                aria-label={`${EXERCISE_INFO.kneeExtension.name}, ${side} leg`}
                onClick={() => onChoose({ exercise: 'kneeExtension', side, source: { kind: 'camera' } })}
              >
                {side === 'left' ? 'Left leg' : 'Right leg'}
              </button>
            ))}
          </span>
        </li>
        <li>
          <button
            type="button"
            className={styles.option}
            aria-describedby="sitToStand-camera"
            onClick={() => onChoose({ exercise: 'sitToStand', side: null, source: { kind: 'camera' } })}
          >
            <span className={styles.name}>{EXERCISE_INFO.sitToStand.name}</span>
            <span id="sitToStand-camera" className={styles.camera}>{EXERCISE_INFO.sitToStand.camera}</span>
          </button>
        </li>
        <li>
          {/* Built in milestone M3 (SPEC 4.1 build order). */}
          <button type="button" className={styles.option} disabled aria-describedby="shoulderRaise-camera">
            <span className={styles.name}>{EXERCISE_INFO.shoulderRaise.name}</span>
            <span id="shoulderRaise-camera" className={styles.camera}>{EXERCISE_INFO.shoulderRaise.camera} Coming soon.</span>
          </button>
        </li>
      </ul>
      <TraceReplay onChoose={onChoose} />
    </section>
  );
}

/** Research use: replay a pose trace file from this device through the same pipeline as the camera. */
function TraceReplay({ onChoose }: { onChoose: (s: Selection) => void }) {
  const [loaded, setLoaded] = useState<{ name: string; trace: Selection['source'] & { kind: 'trace' } } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [side, setSide] = useState<Side>('left');
  const [exercise, setExercise] = useState<BuiltExerciseId>('kneeExtension');

  async function onFile(file: File | undefined) {
    setLoaded(null);
    setError(null);
    if (!file) return;
    let value: unknown;
    try {
      value = JSON.parse(await file.text());
    } catch {
      setError('The file is not valid JSON.');
      return;
    }
    const r = PoseTraceSchema.safeParse(value);
    if (!r.success) {
      const i = r.error.issues[0]!;
      setError(`Not a pose trace (v1): ${i.path.join('.') || '(root)'}: ${i.message}`);
      return;
    }
    const unsupported = unsupportedTraceReason(r.data);
    if (unsupported) {
      setError(unsupported);
      return;
    }
    setLoaded({ name: file.name, trace: { kind: 'trace', name: file.name, trace: r.data } });
  }

  return (
    <details className={styles.research}>
      <summary>Research: replay a recorded pose trace</summary>
      <p className={styles.camera}>
        Plays a pose trace file from this device through a set of the chosen exercise, pressing Start and Resume automatically.
      </p>
      <label className={styles.field}>
        Pose trace file (.json)
        <input type="file" accept="application/json,.json" onChange={(e) => void onFile(e.target.files?.[0])} />
      </label>
      <label className={styles.field}>
        Exercise
        <select aria-label="Exercise" value={exercise} onChange={(e) => setExercise(e.target.value as BuiltExerciseId)}>
          <option value="kneeExtension">{EXERCISE_INFO.kneeExtension.name}</option>
          <option value="sitToStand">{EXERCISE_INFO.sitToStand.name}</option>
        </select>
      </label>
      {exercise === 'kneeExtension' && (
        <label className={styles.field}>
          Leg
          <select value={side} onChange={(e) => setSide(e.target.value as Side)}>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        </label>
      )}
      {error && <p role="alert">{error}</p>}
      <button
        type="button"
        className={styles.side}
        disabled={!loaded}
        onClick={() => loaded && onChoose({ exercise, side: exercise === 'kneeExtension' ? side : null, source: loaded.trace })}
      >
        Replay trace
      </button>
    </details>
  );
}
