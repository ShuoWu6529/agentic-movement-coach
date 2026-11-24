import styles from './ConfigError.module.css';

/** Blocking state: a missing or invalid config offers no way to start a set (AC 15). */
export function ConfigError({ problems }: { problems: string[] }) {
  return (
    <section role="alert" className={styles.error}>
      <h1 className={styles.heading}>The exercise settings could not be loaded</h1>
      <ul>
        {problems.map((p) => (
          <li key={p}><code>{p}</code></li>
        ))}
      </ul>
      <p>Fix <code>config/targets.json</code> and reload the page. No set can start until the settings load.</p>
    </section>
  );
}
