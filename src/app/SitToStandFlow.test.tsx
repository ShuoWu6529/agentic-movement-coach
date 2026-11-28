// Component tests of the M2 flow on trace-driven sources (PLANS.md §8 M2): the sit-to-stand set from
// selection through two-stage calibration to the summary, with tempo shown in the summary (AC 11),
// the counter per cycle (AC 5, AC 10), tracking loss (AC 16) and log export (AC 20).

import { readFileSync } from 'node:fs';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { manualSource, type ManualSource } from '../../test/fakes';
import { cycle, sitToStandTrace, STS_SETTLE, type StsSegment } from '../../fixtures/synthetic/sitToStandTrace';
import { SessionLogSchema } from '../core/log/schema';
import type { PoseFrame } from '../core/pose';
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

function feeder(src: ManualSource) {
  let lastT = 0;
  return (segments: StsSegment[]) => {
    const frames = sitToStandTrace({ segments, seed: Math.round(lastT) + 1 }).frames.map((f): PoseFrame => ({ ...f, t: f.t + lastT + 1 }));
    act(() => src.pushAll(frames));
    lastT = frames.at(-1)!.t;
  };
}

describe('sit-to-stand set in the app', () => {
  it('walks framing, seated and standing calibration, countdown and the set, with the disclaimer throughout', async () => {
    serveConfig();
    const user = userEvent.setup();
    const src = manualSource();
    render(<App deps={deps(async () => src)} />);

    await user.click(await screen.findByRole('button', { name: /sit-to-stand/i }));
    const feed = feeder(src);
    feed([{ ms: 1200, p: 0 }]);
    await user.click(screen.getByRole('button', { name: /start set/i }));

    expect(screen.getByRole('heading', { name: /sit still/i })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/sit upright/i);
    expectDisclaimer();
    feed([{ ms: 2200, p: 0 }]);
    expect(screen.getByRole('heading', { name: /now stand still/i })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/stand up and hold still/i);
    feed([{ ms: 1500, from: 0, to: 1 }, { ms: 2600, p: 1 }]);
    expect(screen.getByRole('heading', { name: /get ready/i })).toBeInTheDocument();
    expect(screen.getByText(/sit down when you are ready/i)).toBeInTheDocument();
    expectDisclaimer();
    feed([{ ms: 1500, from: 1, to: 0 }, { ms: 1600, p: 0 }]);

    // Active: the counter rises by one per full cycle; the last rise and lower times are shown (AC 5, 10).
    expect(screen.getByLabelText('Repetitions')).toHaveTextContent('0');
    expect(screen.getByText(/up 1–3 s, down 1.5–4 s/i)).toBeInTheDocument();
    feed([{ ms: 3000, from: 0, to: 1 }, { ms: 1000, p: 1 }]);
    expect(screen.getByLabelText('Repetitions')).toHaveTextContent('0'); // standing is not yet a repetition
    feed([{ ms: 3500, from: 1, to: 0 }, { ms: 500, p: 0 }]);
    expect(screen.getByLabelText('Repetitions')).toHaveTextContent('1');
    expect(screen.getByLabelText('Last rise time').textContent).toMatch(/^\d\.\d s$/);
    expect(screen.getByLabelText('Feedback')).toHaveTextContent(/even pace/i);

    // A fast rise shows the tempo cue as soon as standing is reached (AC 11).
    feed([{ ms: 4000, p: 0 }, { ms: 1000, from: 0, to: 1 }, { ms: 200, p: 1 }]);
    expect(screen.getByLabelText('Feedback')).toHaveTextContent(/take your time standing up/i);

    // Covering the camera clears the cue and pauses the set (AC 16).
    feed([{ ms: 100, noPose: true }]);
    expect(screen.getByLabelText('Feedback').textContent?.trim()).toBe('');
    feed([{ ms: 500, noPose: true }]);
    expect(screen.getByRole('alert')).toHaveTextContent(/can't see you well/i);
    expectDisclaimer();

    await user.click(screen.getByRole('button', { name: /end set/i }));
    expect(screen.getByRole('heading', { name: /set summary/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Repetitions completed')).toHaveTextContent(`1 / ${config.exercises.sitToStand.reps}`);
    expectDisclaimer();
  });

  it('shows tempo in the summary and exports a valid log without a side (AC 6, 11, 20)', async () => {
    serveConfig();
    const user = userEvent.setup();
    const trace = sitToStandTrace({ segments: [...STS_SETTLE, ...cycle(), ...cycle({ up: 1000 }), ...cycle({ peak: 0.6 })] });
    render(<App deps={deps(async () => openTrace(trace, { speed: Infinity }))} />);
    await user.click(await screen.findByRole('button', { name: /sit-to-stand/i }));

    expect(await screen.findByRole('heading', { name: /set summary/i })).toBeInTheDocument();
    expect(screen.getByText('Sit-to-stand')).toBeInTheDocument();
    expect(screen.getByLabelText('Repetitions completed')).toHaveTextContent('2 /');
    expect(screen.getByLabelText('Average rise time')).toHaveTextContent(/^\d\.\d s \(target 1–3 s\)$/);
    expect(screen.getByLabelText('Average lower time')).toHaveTextContent(/^\d\.\d s \(target 1.5–4 s\)$/);
    expect(screen.getByLabelText('Tempo per repetition').textContent).toMatch(/^\d\.\d s \/ \d\.\d s, \d\.\d s \/ \d\.\d s$/);
    expect(screen.queryByLabelText('Best knee angle')).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: /to adjust/i })).toHaveTextContent(/quicker than the target time to stand up/);
    expect(screen.getByRole('list', { name: /to adjust/i })).toHaveTextContent(/did not reach standing/);
    expectDisclaimer();

    const blobs: Blob[] = [];
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn((b: Blob) => (blobs.push(b), 'blob:x')), revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toMatch(/^session-sit-to-stand-.*\.json$/);
    });
    await user.click(screen.getByText(/research export/i));
    await user.click(screen.getByRole('button', { name: /download session log/i }));
    expect(click).toHaveBeenCalledTimes(1);
    const log = JSON.parse(await blobs[0]!.text());
    expect(SessionLogSchema.safeParse(log).success).toBe(true);
    expect(log.exercise).toBe('sitToStand');
    expect(log).not.toHaveProperty('side');
  });

  it('replays a sit-to-stand pose trace chosen on the select screen', async () => {
    serveConfig();
    const user = userEvent.setup();
    const trace = sitToStandTrace({ segments: [...STS_SETTLE, ...cycle()] });
    render(<App deps={deps(async () => Promise.reject(new Error('camera not used')))} />);
    await user.click(await screen.findByText(/replay a recorded pose trace/i));
    await user.upload(screen.getByLabelText(/pose trace file/i), new File([JSON.stringify(trace)], 'sts.json', { type: 'application/json' }));
    await user.selectOptions(screen.getByLabelText(/^exercise$/i), 'sitToStand');
    expect(screen.queryByLabelText(/^leg$/i)).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /replay trace/i }));
    expect(await screen.findByLabelText('Repetitions completed')).toHaveTextContent('1 /');
    expect(screen.getByText('Sit-to-stand')).toBeInTheDocument();
  });
});
