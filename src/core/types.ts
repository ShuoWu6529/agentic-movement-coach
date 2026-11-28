export const EXERCISE_IDS = ['kneeExtension', 'sitToStand', 'shoulderRaise'] as const;
export type ExerciseId = (typeof EXERCISE_IDS)[number];
export type Side = 'left' | 'right';
/** Exercises built so far (SPEC 4.1 build order: knee extension in M1, sit-to-stand in M2). */
export const BUILT_EXERCISE_IDS = ['kneeExtension', 'sitToStand'] as const satisfies readonly ExerciseId[];
export type BuiltExerciseId = (typeof BUILT_EXERCISE_IDS)[number];
