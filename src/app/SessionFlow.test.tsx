// Component tests of the M1 flow on trace-driven sources (PLANS.md §8 M1): full phase walk, framing
// from bad to good frames, overlay and counter per repetition (AC 5), Resume (AC 17), summary with
// zero repetitions (AC 6), disclaimer in every phase (AC 7), camera denied (AC 2), log export (AC 20).

import { readFileSync } from 'node:fs';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { contexts, manualSource, type ManualSource } from '../../test/fakes';
import { extension, kneeTrace, SETTLE, type Segment } from '../../fixtures/synthetic/kneeTrace';
import { SessionLogSchema } from '../core/log/schema';
import type { PoseFrame } from '../core/pose';
import { CameraStartError } from '../pose/cameraErrors';
import { openTrace } from '../pose/traceSource';
import { App } from './App';
import type { AppDeps } from './deps';

const config = JSON.parse(readFileSync('public/config/targets.json', 'utf8'));

function serveConfig() {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(config), { status: 200 })));
}

function expectDisclaimer() {
  expect(screen.getByRole('note', { name: /disclaimer/i })).toHaveTextContent(/not clinically validated/i);
}

function deps(source: () => Promise<ManualSource | ReturnType<typeof openTrace>>): AppDeps {
  return { openCamera: source as AppDeps['openCamera'], openTrace: (t) => openTrace(t, { speed: Infinity }) };
}

/** Frames continue from the last pushed `t`. */
function feeder(src: ManualSource) {
  let lastT = 0;
  return (segments: Segment[]) => {
    const frames = kneeTrace({ side: 'left', segments, seed: Math.round(lastT) + 1 }).frames.map((f): PoseFrame => ({ ...f, t: f.t + lastT + 1 }));
    act(() => src.pushAll(frames));
    lastT = frames.at(-1)!.t;
  };
}

describe('knee extension set in the app', () => {
  it('walks every phase with manual control, showing the disclaimer throughout (AC 3, 4, 5, 7, 16, 17)', async () => {
    serveConfig();
    const user = userEvent.setup();
    const src = manualSource();
    let resolve!: (s: ManualSource) => void;
    render(<App deps={deps(() => new Promise((r) => (resolve = r)))} />);

    await user.click(await screen.findByRole('button', { name: /seated knee extension, left leg/i }));
    expect(screen.getByRole('heading', { name: /starting the camera/i })).toBeInTheDocument();
    expectDisclaimer();
    await act(async () => resolve(src));
    expect(src.started).toBe(true);
    const feed = feeder(src);

    // Framing: no pose → message and Start disabled; then a good position enables it (AC 3).
    feed([{ ms: 600, noPose: true }]);
    expect(screen.getByRole('status')).toHaveTextContent(/can't see you/i);
    expect(screen.getByRole('button', { name: /start set/i })).toBeDisabled();
    expectDisclaimer();
    feed([{ ms: 1200, flexion: 90 }]);
    const start = screen.getByRole('button', { name: /start set/i });
    expect(start).toBeEnabled();
    await user.click(start);

    // Calibration, then countdown (AC 4).
    expect(screen.getByRole('heading', { name: /sit still/i })).toBeInTheDocument();
    expectDisclaimer();
    feed([{ ms: 2100, flexion: 90 }]);
    expect(screen.getByRole('heading', { name: /get ready/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Countdown')).toHaveTextContent('3');
    expectDisclaimer();
    feed([{ ms: 3100, flexion: 90 }]);

    // Active: overlay drawn, angle shown, counter rises by one per held rep (AC 5, 8).
    expect(screen.getByLabelText('Repetitions')).toHaveTextContent('0');
    expectDisclaimer();
    feed([{ ms: 1200, from: 90, to: 5 }, { ms: 1000, flexion: 5 }]);
    expect(screen.getByLabelText('Knee angle').textContent).toMatch(/^\d+°$/);
    expect(screen.getByLabelText('Hold timer').textContent).toMatch(/^\d\.\d s$/); // throttled readout
    const ctx = contexts.get(screen.getByLabelText('Skeleton overlay') as HTMLCanvasElement)!;
    expect(ctx.calls.some((c) => c.op === 'arc')).toBe(true);
    feed([{ ms: 2500, flexion: 5 }]);
    expect(screen.getByLabelText('Repetitions')).toHaveTextContent('1');
    expect(screen.getByLabelText('Feedback')).toHaveTextContent(/nice steady hold/i);
    feed([{ ms: 1200, from: 5, to: 90 }, { ms: 500, flexion: 90 }]);

    // Cover the camera mid-rep: the cue clears at once, then "can't see you well" (AC 16).
    feed([{ ms: 800, from: 90, to: 30 }]);
    feed([{ ms: 100, noPose: true }]);
    expect(screen.getByLabelText('Feedback').textContent?.trim()).toBe('');
    feed([{ ms: 500, noPose: true }]);
    expect(screen.getByRole('alert')).toHaveTextContent(/can't see you well/i);
    expect(screen.queryByLabelText('Feedback')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resume/i })).toBeDisabled();
    expectDisclaimer();

    // Recovery → Resume → short framing check → countdown → active; the rep is kept (AC 17).
    feed([{ ms: 1100, flexion: 90 }]);
    expect(screen.getByRole('alert')).toHaveTextContent(/press resume/i);
    await user.click(screen.getByRole('button', { name: /resume/i }));
    expect(screen.getByRole('heading', { name: /get back into position/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start set/i })).not.toBeInTheDocument();
    feed([{ ms: 1100, flexion: 90 }]);
    expect(screen.getByRole('heading', { name: /get ready/i })).toBeInTheDocument();
    feed([{ ms: 3100, flexion: 90 }]);
    expect(screen.getByLabelText('Repetitions')).toHaveTextContent('1');

    await user.click(screen.getByRole('button', { name: /end set/i }));
    expect(screen.getByRole('heading', { name: /set summary/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Repetitions completed')).toHaveTextContent(`1 / ${config.exercises.kneeExtension.reps}`);
    expect(screen.getByLabelText('Best knee angle')).toHaveTextContent(/° from straight/);
    expect(within(screen.getByRole('list', { name: /to adjust/i })).getByText(/lost sight/i)).toBeInTheDocument();
    expect(src.stopped).toBe(true);
    expectDisclaimer();
  });

  it('runs a whole replayed set to the summary and exports a valid log with the observer note (AC 6, 20)', async () => {
    serveConfig();
    const user = userEvent.setup();
    const trace = kneeTrace({ side: 'right', segments: [...SETTLE, ...extension(5, 3500), ...extension(25, 1500)] });
    render(<App deps={deps(async () => openTrace(trace, { speed: Infinity }))} />);
    await user.click(await screen.findByRole('button', { name: /seated knee extension, right leg/i }));

    expect(await screen.findByRole('heading', { name: /set summary/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Repetitions completed')).toHaveTextContent('1 /');
    expect(screen.getByRole('list', { name: /went well/i })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: /to adjust/i })).toHaveTextContent(/short of the target/);
    expectDisclaimer();

    const blobs: Blob[] = [];
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn((b: Blob) => (blobs.push(b), 'blob:x')), revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await user.click(screen.getByText(/research export/i));
    await user.type(screen.getByLabelText(/observer note/i), 'synthetic run');
    await user.click(screen.getByRole('button', { name: /download session log/i }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /download pose trace/i })).not.toBeInTheDocument(); // replay: no new trace

    const log = JSON.parse(await blobs[0]!.text());
    expect(SessionLogSchema.safeParse(log).success).toBe(true);
    expect(log).toMatchObject({ exercise: 'kneeExtension', side: 'right', observerNote: 'synthetic run', device: { clock: 'trace' } });
    expect(log.events.map((e: { ruleId?: string }) => e.ruleId).filter(Boolean)).toEqual(['KE-HOLD-DONE', 'KE-RANGE-LOW']);
  });

  it('shows a summary with a note for a set with no repetitions (AC 6)', async () => {
    serveConfig();
    const user = userEvent.setup();
    const trace = kneeTrace({ side: 'left', segments: [...SETTLE, { ms: 2000, flexion: 90 }] });
    render(<App deps={deps(async () => openTrace(trace, { speed: Infinity }))} />);
    await user.click(await screen.findByRole('button', { name: /seated knee extension, left leg/i }));
    expect(await screen.findByLabelText('Repetitions completed')).toHaveTextContent('0 /');
    expect(screen.getByRole('list', { name: /to adjust/i })).toHaveTextContent(/no repetitions were counted/i);
  });

  it('says camera access was denied and how to allow it, with no way to start (AC 2)', async () => {
    serveConfig();
    const user = userEvent.setup();
    render(<App deps={deps(async () => Promise.reject(new CameraStartError('denied')))} />);
    await user.click(await screen.findByRole('button', { name: /seated knee extension, left leg/i }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/camera access was denied/i);
    expect(alert).toHaveTextContent(/allow/i);
    expect(screen.queryByRole('button', { name: /start set/i })).not.toBeInTheDocument();
    expectDisclaimer();

    await user.click(screen.getByRole('button', { name: /back to exercises/i }));
    expect(screen.getByRole('heading', { name: /choose an exercise/i })).toBeInTheDocument();
  });

  it('replays a pose trace file chosen on the select screen', async () => {
    serveConfig();
    const user = userEvent.setup();
    const trace = kneeTrace({ side: 'left', segments: [...SETTLE, ...extension(5, 3500)] });
    render(<App deps={deps(async () => Promise.reject(new Error('camera not used')))} />);
    await user.click(await screen.findByText(/replay a recorded pose trace/i));
    const file = new File([JSON.stringify(trace)], 'trace.json', { type: 'application/json' });
    await user.upload(screen.getByLabelText(/pose trace file/i), file);
    await user.click(await screen.findByRole('button', { name: /replay trace/i }));
    expect(await screen.findByLabelText('Repetitions completed')).toHaveTextContent('1 /');
  });

  it('rejects a trace recorded with the "lite" model (SPEC R-F1)', async () => {
    serveConfig();
    const user = userEvent.setup();
    render(<App />);
    const trace = { ...kneeTrace({ side: 'left', segments: [...SETTLE] }), model: { variant: 'lite', delegate: 'GPU' } };
    await user.click(await screen.findByText(/replay a recorded pose trace/i));
    await user.upload(screen.getByLabelText(/pose trace file/i), new File([JSON.stringify(trace)], 'lite.json', { type: 'application/json' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/"full" model only/);
    expect(screen.getByRole('button', { name: /replay trace/i })).toBeDisabled();
  });

  it('rejects a file that is not a pose trace', async () => {
    serveConfig();
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByText(/replay a recorded pose trace/i));
    await user.upload(screen.getByLabelText(/pose trace file/i), new File(['{"schemaVersion": 1}'], 'x.json', { type: 'application/json' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/not a pose trace/i);
    expect(screen.getByRole('button', { name: /replay trace/i })).toBeDisabled();
  });
});
