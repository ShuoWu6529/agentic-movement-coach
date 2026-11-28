// M0 exit behavior (PLANS.md §8): opening the app loads the therapist config and shows the
// exercise list with the disclaimer. Also the load step of PLANS.md §6: a missing or invalid config
// names the problem and offers no way to start (AC 15), with the disclaimer still visible (AC 7).

import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';

const defaultConfig = JSON.parse(readFileSync('public/config/targets.json', 'utf8'));
const EXERCISES = [/seated knee extension/i, /sit-to-stand/i, /shoulder raise/i];
const BUTTONS = [/seated knee extension, left leg/i, /seated knee extension, right leg/i, /sit-to-stand/i, /shoulder raise/i];

function serveConfig(body: unknown, status = 200, headers?: HeadersInit) {
  const fetchMock = vi.fn(async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function expectDisclaimer() {
  const note = screen.getByRole('note', { name: /disclaimer/i });
  expect(note).toHaveTextContent(/experimental/i);
  expect(note).toHaveTextContent(/not clinically validated/i);
  expect(note).toHaveTextContent(/does not diagnose or prescribe/i);
}

describe('App start-up', () => {
  it('loads the therapist config and shows the three exercises with the disclaimer', async () => {
    const fetchMock = serveConfig(defaultConfig);
    render(<App />);

    expectDisclaimer(); // already visible while the config loads

    for (const name of BUTTONS) {
      expect(await screen.findByRole('button', { name })).toBeInTheDocument();
    }
    for (const name of EXERCISES) expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    // Knee extension is built (M1); the other two follow in M2 and M3 (SPEC 4.1 build order).
    expect(screen.getByRole('button', { name: /seated knee extension, left leg/i })).toBeEnabled();
    expectDisclaimer();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/config\/targets\.json$/);
    expect(init).toMatchObject({ cache: 'no-store' });
  });

  it('names the field at fault and offers no exercise when a value is out of range', async () => {
    const bad = structuredClone(defaultConfig);
    bad.exercises.kneeExtension.holdSeconds = -1;
    serveConfig(bad);
    render(<App />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('exercises.kneeExtension.holdSeconds');
    for (const name of BUTTONS) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expectDisclaimer();
  });

  it('rejects an unknown schemaVersion', async () => {
    serveConfig({ ...defaultConfig, schemaVersion: 3 });
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('schemaVersion');
  });

  it('reports a missing config file', async () => {
    serveConfig('not found', 404);
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/targets\.json.*404/);
    expectDisclaimer();
  });

  it('reports a missing config file when the server falls back to index.html', async () => {
    // What `vite dev`, `vite preview` and SPA hosts do for a missing file: HTTP 200 with the app page.
    serveConfig('<!doctype html><html></html>', 200, { 'content-type': 'text/html' });
    render(<App />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/targets\.json.*probably missing/);
    expect(alert).not.toHaveTextContent(/not valid JSON/i);
    expectDisclaimer();
  });

  it('reports a response body that fails to arrive, instead of loading forever', async () => {
    const failing = new Response('{}');
    vi.spyOn(failing, 'text').mockRejectedValue(new Error('connection reset'));
    vi.stubGlobal('fetch', vi.fn(async () => failing));
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/targets\.json.*connection reset/);
  });

  it('reports malformed JSON', async () => {
    serveConfig('{ "schemaVersion": 1,');
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/not valid JSON/i);
  });
});
