import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { TargetsConfig } from '../config/schema';
import { CueGate, type CueGateInput } from './cueGate';

const config: TargetsConfig = JSON.parse(readFileSync('public/config/targets.json', 'utf8'));
const range = { ruleId: 'KE-RANGE-LOW', attemptIndex: 0 } as const;
const open = (conditions: CueGateInput['conditions'] = [], events: CueGateInput['events'] = []): CueGateInput => ({
  open: true, conditions, events, status: null,
});

describe('cue gate', () => {
  it('commits a condition only after its dwell time, with onset and confirmation times', () => {
    const g = new CueGate(config.cues);
    const dwell = config.cues.dwellMs['KE-RANGE-LOW']!;
    expect(g.step(1000, open([range])).shown).toBeNull();
    expect(g.step(1000 + dwell - 1, open([range])).shown).toBeNull();
    const out = g.step(1000 + dwell, open([range]));
    expect(out.shown).toBe('KE-RANGE-LOW');
    expect(out.commit).toMatchObject({ ruleId: 'KE-RANGE-LOW', attemptIndex: 0, onsetT: 1000, confirmT: 1000 + dwell });
  });

  it('forgets a condition that ends before its dwell', () => {
    const g = new CueGate(config.cues);
    g.step(0, open([range]));
    g.step(100, open([]));
    expect(g.step(1000, open([range])).commit).toBeNull();
  });

  it('clears a visible cue at once when the gate closes, and shows only status (R-S1)', () => {
    const g = new CueGate(config.cues);
    g.step(0, open([range]));
    expect(g.step(400, open([range])).shown).toBe('KE-RANGE-LOW');
    expect(g.step(433, { ...open([range]), open: false }).shown).toBeNull();
    expect(g.step(466, { ...open([range]), open: false, status: 'ST-TRACKING-LOST' }).shown).toBe('ST-TRACKING-LOST');
  });

  it('clears advice about an earlier attempt when a new attempt starts, but keeps positive feedback', () => {
    const g = new CueGate(config.cues);
    const dwell = config.cues.dwellMs['KE-RANGE-LOW']!;
    g.step(0, open([range]));
    expect(g.step(dwell, open([range])).shown).toBe('KE-RANGE-LOW');
    expect(g.step(dwell + 100, open()).shown).toBe('KE-RANGE-LOW'); // still within displayMs
    expect(g.step(dwell + 133, { ...open(), attemptStarted: 1 }).shown).toBeNull();

    const h = new CueGate(config.cues);
    h.step(0, open([], [{ ruleId: 'KE-HOLD-DONE', attemptIndex: 0 }]));
    expect(h.step(100, { ...open(), attemptStarted: 1 }).shown).toBe('KE-HOLD-DONE');
  });

  it('rejects a movement rule passed as status', () => {
    const g = new CueGate(config.cues);
    expect(() => g.step(0, { ...open(), status: 'KE-RANGE-LOW' })).toThrow(/not a status rule/);
  });

  it('commits each condition episode once, hides the cue after displayMs, and honours the cooldown', () => {
    const g = new CueGate(config.cues);
    let commits = 0;
    for (let t = 0; t <= 10000; t += 100) if (g.step(t, open([range])).commit) commits++;
    expect(commits).toBe(1);
    expect(g.step(10100, open([range])).shown).toBeNull();

    const h = new CueGate(config.cues);
    h.step(0, open([], [{ ruleId: 'KE-HOLD-DONE', attemptIndex: 0 }]));
    expect(h.step(100, open([], [{ ruleId: 'KE-HOLD-DONE', attemptIndex: 1 }])).commit).toBeNull();
    expect(h.step(config.cues.cooldownMs + 1, open([], [{ ruleId: 'KE-HOLD-DONE', attemptIndex: 2 }])).commit).not.toBeNull();
  });
});
