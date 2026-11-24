import type { ExerciseId } from '../core/types';

export const EXERCISE_INFO: Record<ExerciseId, { name: string; camera: string }> = {
  kneeExtension: { name: 'Seated knee extension', camera: 'Camera to your side, one leg per set.' },
  sitToStand: { name: 'Sit-to-stand', camera: 'Camera in front of you, turned about 45° to one side.' },
  shoulderRaise: { name: 'Shoulder raise', camera: 'Camera facing you, one arm per set.' },
};
