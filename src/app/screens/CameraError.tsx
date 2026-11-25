import { cameraErrorText, type CameraErrorKind } from '../../pose/cameraErrors';
import styles from './ConfigError.module.css';

/** AC 2: says what went wrong and how to allow access. No set can start from here. */
export function CameraError({ kind, onRetry, onBack }: { kind: CameraErrorKind; onRetry: () => void; onBack: () => void }) {
  const { title, help } = cameraErrorText(kind);
  return (
    <section role="alert" className={styles.error}>
      <h1 className={styles.heading}>{title}</h1>
      <p>{help}</p>
      <p>
        <button type="button" onClick={onRetry}>Try again</button>{' '}
        <button type="button" onClick={onBack}>Back to exercises</button>
      </p>
    </section>
  );
}
