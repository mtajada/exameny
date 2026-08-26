import type React from 'react';
import type { AttemptView, EvaluationResult, RuoEUserAttempt } from '@/types/ruoe';

// Shared state helpers used by RuoEPracticePage retry flow and co-located tests.

type Setter<T> = React.Dispatch<React.SetStateAction<T>>;

export interface ApplyRetryResultParams {
  nextAttempt: RuoEUserAttempt;
  setAttemptId: Setter<number | null>;
  setAttemptNumber: Setter<number | null>;
  setAttemptStatus: Setter<'in_progress' | 'completed' | null>;
  setAttemptError: Setter<string | null>;
  setEvaluationResults: Setter<Record<number, boolean>>;
  setEvaluationData: Setter<EvaluationResult | null>;
  setShowScoreModal: Setter<boolean>;
  setViewMode: Setter<AttemptView>;
  setIsEvaluating: Setter<boolean>;
  lastHydratedAttemptRef: React.MutableRefObject<number | null>;
}

export const applyRetryResult = (params: ApplyRetryResultParams): void => {
  const {
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
  } = params;

  setAttemptId(nextAttempt.id);
  setAttemptNumber(
    typeof nextAttempt.attempt_number === 'number'
      ? nextAttempt.attempt_number
      : null,
  );
  setAttemptStatus('in_progress');
  setAttemptError(null);
  lastHydratedAttemptRef.current = null;
  setEvaluationResults({});
  setEvaluationData(null);
  setShowScoreModal(false);
  setViewMode('practice');
  setIsEvaluating(false);
};

export const buildRetrySearchString = (
  currentSearch: string,
  nextAttemptId: number,
  view: AttemptView = 'practice',
): string => {
  const normalized = currentSearch.startsWith('?')
    ? currentSearch.slice(1)
    : currentSearch;
  const params = new URLSearchParams(normalized);
  params.set('attempt', String(nextAttemptId));
  params.set('view', view);
  return params.toString();
};
