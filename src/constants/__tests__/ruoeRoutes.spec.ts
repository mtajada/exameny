import { describe, expect, it } from 'vitest';
import {
  buildRuoEPracticePath,
  RUOE_MISSING_EXERCISE_PLACEHOLDER,
  RUOE_PRACTICE_BASE_PATH,
} from '../ruoeRoutes';

describe('buildRuoEPracticePath', () => {
  it('builds a numeric path when a number is provided', () => {
    expect(buildRuoEPracticePath(42)).toBe(`${RUOE_PRACTICE_BASE_PATH}/42`);
  });

  it('builds a numeric path when a numeric string is provided', () => {
    expect(buildRuoEPracticePath('7')).toBe(`${RUOE_PRACTICE_BASE_PATH}/7`);
  });

  it('falls back to the missing placeholder when exercise id is absent', () => {
    const fallbackPath = buildRuoEPracticePath(undefined);
    expect(fallbackPath).toBe(
      `${RUOE_PRACTICE_BASE_PATH}/${RUOE_MISSING_EXERCISE_PLACEHOLDER}`,
    );
  });

  it('falls back to the missing placeholder when exercise id is not numeric', () => {
    const fallbackPath = buildRuoEPracticePath('not-a-number');
    expect(fallbackPath).toBe(
      `${RUOE_PRACTICE_BASE_PATH}/${RUOE_MISSING_EXERCISE_PLACEHOLDER}`,
    );
  });
});
