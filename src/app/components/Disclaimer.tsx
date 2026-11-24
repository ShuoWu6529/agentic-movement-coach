import styles from './Disclaimer.module.css';

/** R-F12: persistent on every screen, including error states (AC 7). */
export function Disclaimer() {
  return (
    <aside role="note" aria-label="Disclaimer" className={styles.disclaimer}>
      <strong>Experimental pilot, not clinically validated.</strong> This app supports the care plan from
      your physical therapist. It does not diagnose or prescribe exercise.
    </aside>
  );
}
