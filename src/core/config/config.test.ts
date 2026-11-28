import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RULES } from '../rules/registry';
import { canonicalJson, configHash } from './hash';
import { parseConfig, parseConfigText } from './load';
import type { TargetsConfig } from './schema';

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

  it('requires a dwell time for every advice rule', () => {
    const c = base();
    delete c.cues.dwellMs['KE-RANGE-LOW'];
    expect(problemsOf(c).join('\n')).toMatch(/^cues\.dwellMs\.KE-RANGE-LOW: /m);
    c.cues.dwellMs = {};
    const advice = RULES.filter((r) => r.kind === 'advice');
    expect(problemsOf(c)).toHaveLength(advice.length);
  });

  it.each([
    ['knee start angle inside the target band', 'exercises.kneeExtension.startFlexionDeg',
      (c: TargetsConfig) => { c.exercises.kneeExtension.startFlexionDeg = 15; }], // target 10 + tolerance 5
    ['sit threshold at or above stand threshold', 'exercises.sitToStand.sitFrac',
      (c: TargetsConfig) => { c.exercises.sitToStand.sitFrac = 0.85; }], // standFrac 0.85
    ['shoulder reset at or above the target', 'exercises.shoulderRaise.resetElevationDeg',
      (c: TargetsConfig) => { c.exercises.shoulderRaise.resetElevationDeg = 80; }], // target 90 − tolerance 10
  ])('rejects a %s', (_name, path, edit) => {
    const c = base();
    edit(c);
    expect(problemsOf(c).join('\n')).toMatch(new RegExp(`^${path.replaceAll('.', '\\.')}: `, 'm'));
  });

  it('rejects an unknown schemaVersion, and the older v1 and v2 shapes', () => {
    expect(problemsOf({ ...base(), schemaVersion: 4 }).join('\n')).toMatch(/^schemaVersion: /m);
    const v2 = base();
    v2.schemaVersion = 2;
    delete v2.exercises.sitToStand.maxScaleChange;
    const p2 = problemsOf(v2).join('\n');
    expect(p2).toMatch(/^schemaVersion: /m);
    expect(p2).toMatch(/^exercises\.sitToStand\.maxScaleChange: /m);
    const v1 = structuredClone(v2);
    v1.schemaVersion = 1;
    delete v1.exercises.sitToStand.minStandRise;
    const p1 = problemsOf(v1).join('\n');
    expect(p1).toMatch(/^schemaVersion: /m);
    expect(p1).toMatch(/^exercises\.sitToStand\.minStandRise: /m);
  });

  it.each([
    ['minStandRise', [0, 3]],
    ['maxScaleChange', [0, 1.5]],
  ] as const)('range-checks %s', (field, values) => {
    for (const v of values) {
      const c = base();
      c.exercises.sitToStand[field] = v;
      expect(problemsOf(c).join('\n')).toMatch(new RegExp(`^exercises\\.sitToStand\\.${field}: `, 'm'));
    }
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
