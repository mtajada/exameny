import { describe, expect, it, vi } from 'vitest';
import type { MutableRefObject } from 'react';
import type { AttemptView, EvaluationResult, RuoEUserAttempt } from '@/types/ruoe';
import { applyRetryResult, buildRetrySearchString } from '../ruoeRetryHelpers';

describe('buildRetrySearchString', () => {
  it('rewrites attempt and view while preserving other params', () => {
    const search = '?attempt=10&view=results&foo=bar';
    const rewritten = buildRetrySearchString(search, 42, 'practice');
    const params = new URLSearchParams(rewritten);

    expect(params.get('attempt')).toBe('42');
    expect(params.get('view')).toBe('practice');
    expect(params.get('foo')).toBe('bar');
    expect(Array.from(params.keys())).toEqual(['attempt', 'view', 'foo']);
  });

  it('handles empty search string', () => {
    const rewritten = buildRetrySearchString('', 5, 'practice');
    expect(rewritten).toBe('attempt=5&view=practice');
  });
});

describe('applyRetryResult', () => {
  const createSetter = <T,>() => vi.fn<(value: T) => void>();

  it('updates attempt state and clears evaluation context', () => {
    const setAttemptId = createSetter<number | null>();
    const setAttemptNumber = createSetter<number | null>();
    const setAttemptStatus = createSetter<'in_progress' | 'completed' | null>();
    const setAttemptError = createSetter<string | null>();
    const setEvaluationResults = createSetter<Record<number, boolean>>();
    const setEvaluationData = createSetter<EvaluationResult | null>();
    const setShowScoreModal = createSetter<boolean>();
    const setViewMode = createSetter<AttemptView>();
    const setIsEvaluating = createSetter<boolean>();
    const lastHydratedAttemptRef = { current: 99 } as MutableRefObject<number | null>;

	    const nextAttempt: RuoEUserAttempt = {
	      id: 11,
	      exercise_id: 501,
	      student_id: 'student-1',
	      membership_id: 99,
	      status: 'in_progress',
	      score: null,
	      max_score: null,
	      started_at: '2024-07-10T10:00:00.000Z',
	      completed_at: null,
      attempt_number: 3,
      restarted_from_attempt_id: 8,
    };

    applyRetryResult({
      nextAttempt,
      setAttemptId,
      setAttemptNumber,
      setAttemptStatus,
      setAttemptError,
      setEvaluationResults,
      setEvaluationData,
      setShowScoreModal,
      setViewMode,
      setIsEvaluating,
      lastHydratedAttemptRef,
    });

    expect(setAttemptId).toHaveBeenCalledWith(11);
    expect(setAttemptNumber).toHaveBeenCalledWith(3);
    expect(setAttemptStatus).toHaveBeenCalledWith('in_progress');
    expect(setAttemptError).toHaveBeenCalledWith(null);
    expect(lastHydratedAttemptRef.current).toBeNull();
    expect(setEvaluationResults).toHaveBeenCalledWith({});
    expect(setEvaluationData).toHaveBeenCalledWith(null);
    expect(setShowScoreModal).toHaveBeenCalledWith(false);
    expect(setViewMode).toHaveBeenCalledWith('practice');
    expect(setIsEvaluating).toHaveBeenCalledWith(false);
  });
});
