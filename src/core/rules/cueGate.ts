// CueGate: the one choke point for cues (PLANS.md §2 principle 5). Nothing else decides what the cue
// display shows or what goes in a log row's `cue` field.
//
// - While the gate is closed (tracking unreliable on this frame, or outside the active set), any
//   visible movement cue is cleared at once and every pending condition is forgotten (R-S1, AC 16).
// - A `status` message may be shown while the gate is closed; it replaces any cue.
// - A condition must hold for `cues.dwellMs[ruleId]` before its cue is committed. Each episode of a
//   condition commits at most once. Instant events (positive feedback) commit on the frame they occur.
// - The same rule is not committed again within `cues.cooldownMs`; a committed cue shows for
//   `cues.displayMs` or until replaced.
// - When a new attempt starts, a visible advice cue about an earlier attempt is cleared, so advice is
//   never on screen during an attempt it does not describe (for example "straighten more" while the
//   next attempt is already at the target, AC 9).

import type { TargetsConfig } from '../config/schema';
import { getRule, type RuleId } from './registry';

/** A rule whose condition holds (or whose event happened) on this frame. */
export interface CueCandidate {
  ruleId: RuleId;
  attemptIndex: number | null;
}

export interface CueCommit {
  seq: number;
  ruleId: RuleId;
  attemptIndex: number | null;
  onsetT: number;
  confirmT: number;
}

export interface CueGateInput {
  /** True only for a reliable frame in the active set. */
  open: boolean;
  conditions: readonly CueCandidate[];
  events: readonly CueCandidate[];
  status: RuleId | null;
  /** Index of an attempt that started on this frame, if any. */
  attemptStarted?: number | null;
}

export interface CueGateOutput {
  shown: RuleId | null;
  commit: CueCommit | null;
}

interface Pending {
  candidate: CueCandidate;
  onsetT: number;
  done: boolean;
}

const key = (c: CueCandidate) => `${c.ruleId}#${c.attemptIndex ?? ''}`;

export class CueGate {
  private pending = new Map<string, Pending>();
  private current: { ruleId: RuleId; attemptIndex: number | null; until: number } | null = null;
  private lastShown = new Map<RuleId, number>();
  private seq = 0;

  constructor(private readonly cfg: TargetsConfig['cues']) {}

  step(t: number, input: CueGateInput): CueGateOutput {
    if (input.status !== null) {
      if (getRule(input.status)?.kind !== 'status') throw new Error(`${input.status} is not a status rule`);
    }
    if (!input.open || input.status !== null) {
      this.current = null;
      this.pending.clear();
      return { shown: input.status, commit: null };
    }

    const seen = new Set<string>();
    for (const c of input.conditions) {
      const k = key(c);
      seen.add(k);
      if (!this.pending.has(k)) this.pending.set(k, { candidate: c, onsetT: t, done: false });
    }
    for (const k of [...this.pending.keys()]) if (!seen.has(k)) this.pending.delete(k);

    const ready: Array<{ candidate: CueCandidate; onsetT: number; pending?: Pending }> = [];
    for (const p of this.pending.values()) {
      if (!p.done && t - p.onsetT >= this.dwell(p.candidate.ruleId)) ready.push({ candidate: p.candidate, onsetT: p.onsetT, pending: p });
    }
    for (const e of input.events) ready.push({ candidate: e, onsetT: t });
    // Advice before positive feedback; then the earliest onset.
    ready.sort((a, b) => this.rank(a.candidate.ruleId) - this.rank(b.candidate.ruleId) || a.onsetT - b.onsetT);

    if (this.current && t >= this.current.until) this.current = null;
    const started = input.attemptStarted ?? null;
    if (started !== null && this.current && this.rank(this.current.ruleId) === 0 && this.current.attemptIndex !== started) {
      this.current = null;
    }
    let commit: CueCommit | null = null;
    for (const r of ready) {
      if (r.pending) r.pending.done = true;
      const last = this.lastShown.get(r.candidate.ruleId);
      if (last !== undefined && t - last < this.cfg.cooldownMs) continue;
      commit = { seq: this.seq++, ruleId: r.candidate.ruleId, attemptIndex: r.candidate.attemptIndex, onsetT: r.onsetT, confirmT: t };
      this.lastShown.set(r.candidate.ruleId, t);
      this.current = { ruleId: r.candidate.ruleId, attemptIndex: r.candidate.attemptIndex, until: t + this.cfg.displayMs };
      break;
    }
    return { shown: this.current?.ruleId ?? null, commit };
  }

  /** True while a condition is waiting out its dwell and may still commit. */
  isPending(c: CueCandidate): boolean {
    const p = this.pending.get(key(c));
    return p !== undefined && !p.done;
  }

  /** Advice rules have a configured dwell (the schema requires it). Other kinds respond to events. */
  private dwell(ruleId: RuleId): number {
    return this.cfg.dwellMs[ruleId] ?? 0;
  }

  private rank(ruleId: RuleId): number {
    return getRule(ruleId)?.kind === 'advice' ? 0 : 1;
  }
}
