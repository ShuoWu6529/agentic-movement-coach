// Phases of a set (PLANS.md §6) and the legal transitions between them. Shared by the core session
// and the app's phase reducer, so both agree on what may follow what.

export const SET_PHASES = ['framing', 'calibration', 'countdown', 'active', 'trackingLost', 'summary'] as const;
export type SetPhase = (typeof SET_PHASES)[number];

/**
 * framing → calibration (Start set) or → countdown (when resuming after tracking loss);
 * calibration → countdown (a set never starts before calibration completes, AC 4);
 * countdown → active, or back to framing if tracking drops;
 * active ⇄ trackingLost via framing (Resume → short framing check → countdown);
 * summary when the reps are done or the patient ends the set.
 */
export const SET_TRANSITIONS: Readonly<Record<SetPhase, readonly SetPhase[]>> = {
  framing: ['calibration', 'countdown', 'summary'],
  calibration: ['countdown'],
  countdown: ['active', 'framing', 'summary'],
  active: ['trackingLost', 'summary'],
  trackingLost: ['framing', 'summary'],
  summary: [],
};

export function isLegalSetTransition(from: SetPhase, to: SetPhase): boolean {
  return SET_TRANSITIONS[from].includes(to);
}
