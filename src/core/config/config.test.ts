import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RULES } from '../rules/registry';
import { canonicalJson, configHash } from './hash';
import { parseConfig, parseConfigText } from './load';

const text = readFileSync('public/config/targets.json', 'utf8');
const base = () => JSON.parse(text);

function problemsOf(value: unknown): string[] {
  const r = parseConfig(value);
  return r.ok ? [] : r.problems;
}

describe('targets config', () => {
  it('accepts the shipped default config', () => {
    expect(parseConfigText(text)).toMatchObject({ ok: true });
  });

  it('names the field path of an out-of-range value', () => {
    const c = base();
    c.tracking.minVisibility = 1.5;
    expect(problemsOf(c).join('\n')).toMatch(/^tracking\.minVisibility: /m);
  });

  it('rejects a wrong type, a missing field and an unknown key', () => {
    const c = base();
    c.exercises.kneeExtension.reps = '10';
    delete c.framing.stableMs;
    c.tracking.minVisibilty = 0.5; // typo
    const p = problemsOf(c).join('\n');
    expect(p).toContain('exercises.kneeExtension.reps');
    expect(p).toContain('framing.stableMs');
    expect(p).toContain('minVisibilty');
  });

  it('rejects an inverted tempo range', () => {
    const c = base();
    c.exercises.sitToStand.riseMs = [3000, 1000];
    expect(problemsOf(c).join('\n')).toContain('exercises.sitToStand.riseMs');
  });

  it('rejects dwell times for unknown rule IDs', () => {
    const c = base();
    c.cues.dwellMs['KE-NOT-A-RULE'] = 100;
    expect(problemsOf(c).join('\n')).toContain('cues.dwellMs');
  });

  it('rejects an unknown schemaVersion', () => {
    expect(problemsOf({ ...base(), schemaVersion: 2 }).join('\n')).toMatch(/^schemaVersion: /m);
  });

  it('only sets dwell times for advice rules that exist', () => {
    const advice = new Set<string>(RULES.filter((r) => r.kind === 'advice').map((r) => r.ruleId));
    for (const id of Object.keys(base().cues.dwellMs)) expect(advice).toContain(id);
  });
});

describe('config hash', () => {
  it('ignores key order and whitespace', async () => {
    const a = base();
    const reordered = Object.fromEntries(Object.entries(a).reverse());
    expect(canonicalJson(reordered)).toBe(canonicalJson(a));
    expect(await configHash(reordered)).toBe(await configHash(JSON.parse(JSON.stringify(a, null, 4))));
  });

  it('changes when any value changes', async () => {
    const a = base();
    const b = base();
    b.exercises.kneeExtension.holdSeconds += 1;
    const [ha, hb] = await Promise.all([configHash(a), configHash(b)]);
    expect(ha).toMatch(/^[0-9a-f]{64}$/);
    expect(ha).not.toBe(hb);
  });
});
