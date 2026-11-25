// Set summary (SPEC §3 step 7, AC 6) and research export (step 8, AC 20). The log and trace are
// local downloads only (C-2).

import { useId, useState } from 'react';
import { buildSessionLog } from '../../core/log/build';
import { SessionLogSchema } from '../../core/log/schema';
import { compactTrace, downloadJson, fileStamp } from '../download';
import type { FinishedSet } from '../session/phase';
import styles from './Summary.module.css';

export function Summary({ finished, onBack }: { finished: FinishedSet; onBack: () => void }) {
  const { summary } = finished.result;
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const noteId = useId();
  const stamp = fileStamp();
  const base = `knee-extension-${summary.side}-${stamp}`;

  function downloadLog() {
    const log = buildSessionLog(finished.result, finished.meta, note);
    const parsed = SessionLogSchema.safeParse(log);
    if (!parsed.success) {
      const i = parsed.error.issues[0]!;
      setProblem(`The session log failed validation (${i.path.join('.')}: ${i.message}), so it was not saved.`);
      return;
    }
    setProblem(null);
    downloadJson(`session-${base}.json`, log);
  }

  return (
    <section aria-labelledby="summary-heading" className={styles.summary}>
      <h1 id="summary-heading" className={styles.heading}>Set summary</h1>
      <p className={styles.sub}>Seated knee extension, {summary.side} leg</p>
      <dl className={styles.stats}>
        <div>
          <dt>Repetitions</dt>
          <dd aria-label="Repetitions completed">{summary.reps} / {summary.targetReps}</dd>
        </div>
        <div>
          <dt>Best knee angle</dt>
          <dd aria-label="Best knee angle">{summary.bestFlexion !== null ? `${Math.round(summary.bestFlexion)}° from straight` : '–'}</dd>
        </div>
        <div>
          <dt>Holds</dt>
          <dd>{summary.holdsMs.length > 0 ? summary.holdsMs.map((h) => `${(h / 1000).toFixed(1)} s`).join(', ') : '–'}</dd>
        </div>
      </dl>
      {summary.wentWell.length > 0 && (
        <>
          <h2 className={styles.subheading}>Went well</h2>
          <ul aria-label="Went well">{summary.wentWell.map((n) => <li key={n}>{n}</li>)}</ul>
        </>
      )}
      {summary.adjust.length > 0 && (
        <>
          <h2 className={styles.subheading}>To adjust</h2>
          <ul aria-label="To adjust">{summary.adjust.map((n) => <li key={n}>{n}</li>)}</ul>
        </>
      )}

      <details className={styles.export}>
        <summary>Research export</summary>
        <label htmlFor={noteId}>Observer note</label>
        <textarea id={noteId} value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
        <p>
          <button type="button" onClick={downloadLog}>Download session log</button>{' '}
          {finished.trace && (
            <button type="button" onClick={() => downloadJson(`trace-${base}.json`, compactTrace(finished.trace!))}>
              Download pose trace
            </button>
          )}
        </p>
        <p className={styles.sub}>Files are saved to this device only. No video is included.</p>
        {problem && <p role="alert">{problem}</p>}
      </details>

      <p>
        <button type="button" className={styles.primary} onClick={onBack}>Back to exercises</button>
      </p>
    </section>
  );
}
