export const RUOE_PRACTICE_BASE_PATH = '/ruoe-practice';

export const RUOE_MISSING_EXERCISE_PLACEHOLDER = 'missing';

export const buildRuoEPracticePath = (
  exerciseId: number | string | null | undefined,
): string => {
  if (typeof exerciseId === 'number' && Number.isFinite(exerciseId)) {
    return `${RUOE_PRACTICE_BASE_PATH}/${exerciseId}`;
  }

  if (typeof exerciseId === 'string') {
    const numericId = Number.parseInt(exerciseId, 10);
    if (Number.isFinite(numericId)) {
      return `${RUOE_PRACTICE_BASE_PATH}/${numericId}`;
    }
  }

  return `${RUOE_PRACTICE_BASE_PATH}/${RUOE_MISSING_EXERCISE_PLACEHOLDER}`;
};

export const isMissingRuoEExerciseId = (
  exerciseId: string | null | undefined,
): boolean => exerciseId === RUOE_MISSING_EXERCISE_PLACEHOLDER;
