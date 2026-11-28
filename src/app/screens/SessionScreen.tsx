// The camera-to-summary part of the flow (SPEC §3 steps 2–6). Stays mounted from the permission
// request through the set, so the camera and model are opened once per attempt.

import { useEffect, useRef, useState, type Dispatch } from 'react';
import type { SessionMeta } from '../../core/log/build';
import { getRule } from '../../core/rules/registry';
import { CameraStartError } from '../../pose/cameraErrors';
import type { FrameSource } from '../../pose/types';
import type { AppDeps } from '../deps';
import type { PhaseAction, PhaseState } from '../session/phase';
import { useLiveView, type LiveView } from '../session/liveStore';
import { SetRunner } from '../session/setRunner';
import styles from './SessionScreen.module.css';

type SessionState = Extract<PhaseState, { phase: 'permission' | 'framing' | 'calibration' | 'countdown' | 'active' | 'trackingLost' }>;

export function SessionScreen({ state, deps, dispatch }: { state: SessionState; deps: AppDeps; dispatch: Dispatch<PhaseAction> }) {
  const [running, setRunning] = useState<{ runner: SetRunner; source: FrameSource } | null>(null);
  const [replayEnded, setReplayEnded] = useState(false);
  const { config, configHash, selection } = state;

  useEffect(() => {
    let cancelled = false;
    let runner: SetRunner | null = null;
    const src = selection.source;
    // A trace the app refuses (openTrace throws) becomes a rejected promise, handled like a camera error.
    const open =
      src.kind === 'camera' ? deps.openCamera() : new Promise<FrameSource>((resolve) => resolve(deps.openTrace(src.trace)));
    open.then(
      (source) => {
        if (cancelled) {
          source.stop();
          return;
        }
        const replay = source.info.kind === 'trace';
        runner = new SetRunner(
          config,
          selection,
          source,
          {
            onPhase: (phase) => dispatch({ type: 'setPhase', phase }),
            onFinish: (result, trace) => {
              const meta: SessionMeta = {
                app: { version: __APP_VERSION__, gitSha: __GIT_SHA__ },
                config: { hash: configHash, value: config },
                device: { userAgent: navigator.userAgent, camera: source.info.camera, clock: source.info.clock() },
                model: source.info.model,
              };
              dispatch({ type: 'finished', finished: { result, meta, trace } });
            },
            onSourceEnded: () => setReplayEnded(true),
          },
          { start: replay, resume: replay },
        );
        dispatch({ type: 'sourceReady' });
        setRunning({ runner, source });
      },
      (e: unknown) => {
        if (!cancelled) dispatch({ type: 'sourceFailed', error: e instanceof CameraStartError ? e.kind : 'other' });
      },
    );
    return () => {
      cancelled = true;
      runner?.stop();
    };
    // One source per camera attempt; config and selection are fixed for the attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.attempt]);

  useEffect(() => {
    running?.runner.start();
  }, [running]);

  if (state.phase === 'permission' || !running) {
    return (
      <section className={styles.panel} aria-live="polite">
        <h1 className={styles.heading}>Starting the camera</h1>
        <p>Allow camera access when your browser asks. The pose model then loads on this device; no video is uploaded.</p>
        <button type="button" className={styles.secondary} onClick={() => dispatch({ type: 'back' })}>
          Back to exercises
        </button>
      </section>
    );
  }

  return <LiveSet state={state} runner={running.runner} source={running.source} dispatch={dispatch} replayEnded={replayEnded} />;
}

function LiveSet({
  state,
  runner,
  source,
  dispatch,
  replayEnded,
}: {
  state: SessionState;
  runner: SetRunner;
  source: FrameSource;
  dispatch: Dispatch<PhaseAction>;
  replayEnded: boolean;
}) {
  const view = useLiveView(runner.store);
  const stageRef = useRef<HTMLDivElement>(null);
  const { width, height } = source.info.size;

  useEffect(() => {
    const v = source.video;
    const stage = stageRef.current;
    if (!v || !stage) return;
    stage.prepend(v);
    return () => v.remove();
  }, [source]);

  return (
    <section className={styles.session} aria-label="Exercise set">
      <div
        ref={stageRef}
        className={`${styles.stage} ${source.mirrored ? styles.mirrored : ''}`}
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        <canvas
          ref={(c) => runner.attachCanvas(c)}
          className={styles.overlay}
          aria-label="Skeleton overlay"
          data-required-joints={runner.joints.join(',')}
        />
        {state.phase === 'countdown' && view?.countdownRemainingS != null && (
          <div className={styles.countdown} aria-live="assertive" aria-label="Countdown">
            {view.countdownRemainingS}
          </div>
        )}
      </div>
      <Hud state={state} view={view} runner={runner} dispatch={dispatch} replayEnded={replayEnded} />
    </section>
  );
}

function Hud({
  state,
  view,
  runner,
  dispatch,
  replayEnded,
}: {
  state: SessionState;
  view: LiveView | null;
  runner: SetRunner;
  dispatch: Dispatch<PhaseAction>;
  replayEnded: boolean;
}) {
  const { exercise, side } = state.selection;
  const ke = state.config.exercises.kneeExtension;
  const sts = state.config.exercises.sitToStand;
  const targetReps = exercise === 'sitToStand' ? sts.reps : ke.reps;
  const resuming = view?.resuming ?? false;
  const back = (
    <button type="button" className={styles.secondary} onClick={() => dispatch({ type: 'back' })}>
      Back to exercises
    </button>
  );
  const endSet = (
    <button type="button" className={styles.secondary} onClick={() => runner.endSet()}>
      End set
    </button>
  );
  const counter = (
    <p className={styles.counter}>
      <output aria-label="Repetitions">{view?.reps ?? 0}</output>
      <span className={styles.counterOf}> / {targetReps}</span>
    </p>
  );
  const seconds = (s: number | null | undefined) => (s != null ? `${s.toFixed(1)} s` : '–');
  const range = ([lo, hi]: readonly [number, number]) => `${lo / 1000}–${hi / 1000} s`;

  switch (state.phase) {
    case 'framing':
      return (
        <div className={styles.hud}>
          <h1 className={styles.heading}>{resuming ? 'Get back into position' : 'Check your position'}</h1>
          <p role="status" className={styles.message}>
            {view?.framingText ?? (resuming ? 'Hold still for a moment…' : 'Ready when you are.')}
          </p>
          {replayEnded && <p role="status">The trace ended before a set started.</p>}
          {resuming ? (
            <div className={styles.actions}>{endSet}</div>
          ) : (
            <div className={styles.actions}>
              <button type="button" className={styles.primary} disabled={!view?.canStart} onClick={() => runner.startSet()}>
                Start set
              </button>
              {back}
            </div>
          )}
        </div>
      );
    case 'calibration': {
      const standing = view?.calibrationStage === 'standing';
      const prompt =
        exercise === 'sitToStand'
          ? standing
            ? 'Stand up and hold still while we note your standing position.'
            : 'Sit upright with your feet on the floor while we note your seated position.'
          : `Rest your ${side} foot on the floor with the knee bent while we note your starting position.`;
      return (
        <div className={styles.hud}>
          <h1 className={styles.heading}>{standing ? 'Now stand still for a moment' : 'Sit still for a moment'}</h1>
          <p role="status" className={styles.message}>
            {view?.calibrationText ?? prompt}
          </p>
          <progress max={1} value={view?.calibrationProgress ?? 0} aria-label="Calibration progress" />
          <div className={styles.actions}>{back}</div>
        </div>
      );
    }
    case 'countdown':
      return (
        <div className={styles.hud}>
          <h1 className={styles.heading}>Get ready</h1>
          {exercise === 'sitToStand' && (
            <p role="status" className={styles.message}>Sit down when you are ready. Counting starts once you are seated.</p>
          )}
          {counter}
          <div className={styles.actions}>{resuming ? endSet : back}</div>
        </div>
      );
    case 'active': {
      const rule = view?.shown ? getRule(view.shown) : undefined;
      return (
        <div className={styles.hud}>
          {counter}
          {exercise === 'sitToStand' ? (
            <dl className={styles.readouts}>
              <div>
                <dt>Last stand-up</dt>
                <dd aria-label="Last rise time">{seconds(view?.lastRiseS)}</dd>
              </div>
              <div>
                <dt>Last sit-down</dt>
                <dd aria-label="Last lower time">{seconds(view?.lastLowerS)}</dd>
              </div>
              <div>
                <dt>Target pace</dt>
                <dd>Up {range(sts.riseMs)}, down {range(sts.lowerMs)}</dd>
              </div>
            </dl>
          ) : (
            <dl className={styles.readouts}>
              <div>
                <dt>Knee bend</dt>
                <dd aria-label="Knee angle">{view?.angle != null ? `${view.angle}°` : '–'}</dd>
              </div>
              <div>
                <dt>Target</dt>
                <dd>{ke.targetFlexionAtMostDeg}° or less</dd>
              </div>
              <div>
                <dt>Hold</dt>
                <dd aria-label="Hold timer">{view?.holdRemainingS != null ? `${view.holdRemainingS.toFixed(1)} s` : `${ke.holdSeconds} s`}</dd>
              </div>
            </dl>
          )}
          {view?.finishing && <p role="status" className={styles.message}>Set complete.</p>}
          <p role="status" aria-label="Feedback" className={`${styles.cue} ${rule?.kind === 'positive' ? styles.positive : ''}`}>
            {rule && rule.kind !== 'status' ? rule.text : ' '}
          </p>
          <div className={styles.actions}>{endSet}</div>
        </div>
      );
    }
    case 'trackingLost': {
      const rule = getRule(view?.shown ?? 'ST-TRACKING-LOST');
      return (
        <div className={styles.hud}>
          {counter}
          <p role="alert" className={styles.lost}>
            {rule?.kind === 'status' ? rule.text : getRule('ST-TRACKING-LOST')!.text}
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} disabled={!view?.readyToResume} onClick={() => runner.resume()}>
              Resume
            </button>
            {endSet}
          </div>
        </div>
      );
    }
    case 'permission':
      return null;
  }
}
