import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { PoseFrame } from '../core/pose';
import { startWatchdog, stallMsFor } from './watchdog';

const config = JSON.parse(readFileSync('public/config/targets.json', 'utf8'));

afterEach(() => vi.useRealTimers());

describe('watchdog', () => {
  it('injects "no pose" frames when frames stop arriving, and stops when they resume', () => {
    vi.useFakeTimers();
    let wall = 0;
    const injected: PoseFrame[] = [];
    const stallMs = stallMsFor(config.tracking);
    const wd = startWatchdog({ stallMs, inject: (f) => injected.push(f), wallNow: () => wall, intervalMs: 20 });

    for (let t = 0; t <= 1000; t += 33) {
      wall = t;
      wd.seen(t);
      vi.advanceTimersByTime(33);
    }
    expect(injected).toEqual([]);

    // Stall: no frames for 1 s.
    const lastT = 990;
    for (let k = 0; k < 50; k++) {
      wall += 20;
      vi.advanceTimersByTime(20);
    }
    expect(injected.length).toBeGreaterThan(3);
    expect(injected.every((f) => f.lm === null && f.world === null)).toBe(true);
    expect(injected[0]!.t - lastT).toBeGreaterThan(stallMs);
    expect(injected[0]!.t - lastT).toBeLessThan(stallMs + 60);
    for (let i = 1; i < injected.length; i++) expect(injected[i]!.t).toBeGreaterThan(injected[i - 1]!.t);

    const before = injected.length;
    wd.seen(injected.at(-1)!.t + 10);
    vi.advanceTimersByTime(40);
    expect(injected.length).toBe(before);
    wd.stop();
  });

  it('allows two frame intervals at the minimum frame rate', () => {
    expect(stallMsFor({ ...config.tracking, minFps: 10 })).toBe(200);
  });
});
