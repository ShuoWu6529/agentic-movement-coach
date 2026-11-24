export const EXERCISE_IDS = ['kneeExtension', 'sitToStand', 'shoulderRaise'] as const;
export type ExerciseId = (typeof EXERCISE_IDS)[number];
export type Side = 'left' | 'right';
