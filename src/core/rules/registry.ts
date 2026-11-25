// Draft rule registry (R-F4, PLANS.md §5). Rule IDs and categories are the vocabulary of the therapist's
// labels and of feedback scoring, so they settle before M7 (PLANS.md §10). Texts are drafts: neutral and
// encouraging (R-S3), and they never diagnose or touch the therapist's targets (R-S2).
// A therapist read-through of every text is still to come (PLANS.md §9).

import type { ExerciseId } from '../types';

/** `advice` and `positive` are movement feedback; only `status` may show while tracking is unreliable. */
export type RuleKind = 'advice' | 'positive' | 'status';

/** Issue categories shared with therapist labels (docs/definitions.md). */
export const ISSUE_CATEGORIES = [
  'insufficient_range',
  'hold_break',
  'too_fast',
  'too_slow',
  'trunk_lean',
] as const;
export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];

export interface Rule {
  ruleId: string;
  exercise: ExerciseId | null;
  kind: RuleKind;
  /** Set for `advice` rules only; precision and recall (R-E5) count advice cues against these. */
  category: IssueCategory | null;
  text: string;
}

export const RULES = [
  { ruleId: 'KE-RANGE-LOW', exercise: 'kneeExtension', kind: 'advice', category: 'insufficient_range',
    text: 'Try to straighten your knee a little more.' },
  { ruleId: 'KE-HOLD-BREAK', exercise: 'kneeExtension', kind: 'advice', category: 'hold_break',
    text: 'Keep your leg steady until the timer finishes.' },
  { ruleId: 'KE-HOLD-DONE', exercise: 'kneeExtension', kind: 'positive', category: null,
    text: 'Nice steady hold.' },
  { ruleId: 'STS-RISE-FAST', exercise: 'sitToStand', kind: 'advice', category: 'too_fast',
    text: 'Take your time standing up.' },
  { ruleId: 'STS-RISE-SLOW', exercise: 'sitToStand', kind: 'advice', category: 'too_slow',
    text: 'Try standing up in one smooth movement.' },
  { ruleId: 'STS-LOWER-FAST', exercise: 'sitToStand', kind: 'advice', category: 'too_fast',
    text: 'Lower yourself down slowly.' },
  { ruleId: 'STS-LOWER-SLOW', exercise: 'sitToStand', kind: 'advice', category: 'too_slow',
    text: 'Sit down in one smooth movement.' },
  { ruleId: 'STS-TEMPO-GOOD', exercise: 'sitToStand', kind: 'positive', category: null,
    text: 'Good, even pace.' },
  { ruleId: 'SR-RANGE-LOW', exercise: 'shoulderRaise', kind: 'advice', category: 'insufficient_range',
    text: 'Try lifting your arm a little higher.' },
  { ruleId: 'SR-LEAN', exercise: 'shoulderRaise', kind: 'advice', category: 'trunk_lean',
    text: 'Keep your body upright as you lift.' },
  { ruleId: 'SR-RANGE-GOOD', exercise: 'shoulderRaise', kind: 'positive', category: null,
    text: 'Good height on that one.' },
  { ruleId: 'ST-TRACKING-LOST', exercise: null, kind: 'status', category: null,
    text: "Can't see you well. Check that you're in the picture and the room is bright enough." },
  { ruleId: 'ST-READY-RESUME', exercise: null, kind: 'status', category: null,
    text: 'Ready to continue. Press Resume when you are.' },
] as const satisfies readonly Rule[];

export type RuleId = (typeof RULES)[number]['ruleId'];
export const RULE_IDS = RULES.map((r) => r.ruleId) as RuleId[];

const byId = new Map<string, Rule>(RULES.map((r) => [r.ruleId, r]));
export function getRule(ruleId: string): Rule | undefined {
  return byId.get(ruleId);
}
export function isRuleId(id: string): id is RuleId {
  return byId.has(id);
}
