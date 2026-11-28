// Builds the exercise a set runs. Only the exercises built so far are accepted (SPEC 4.1 build order).

import type { TargetsConfig } from '../config/schema';
import type { BuiltExerciseId, Side } from '../types';
import type { Exercise } from './exercise';
import { KneeExtensionExercise } from './kneeExtension';
import { SitToStandExercise } from './sitToStand';

export function createExercise(
  id: BuiltExerciseId,
  config: TargetsConfig,
  side: Side | null,
  video: { width: number; height: number },
): Exercise {
  switch (id) {
    case 'kneeExtension':
      if (!side) throw new Error('Knee extension needs a side');
      return new KneeExtensionExercise(config, side, video);
    case 'sitToStand':
      return new SitToStandExercise(config, video);
  }
}
