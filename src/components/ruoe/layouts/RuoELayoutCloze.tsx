import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { LayoutProps } from '@/types/ruoe';
import { useAnswerTracking } from '@/components/ruoe/hooks/useAnswerTracking';
import { ContentZone } from '@/components/ruoe/zones/ContentZone';
import { UnifiedRightPanel } from '@/components/ruoe/layouts/UnifiedRightPanel';
import ExamTwoPaneFrame from '@/components/ruoe/layouts/ExamTwoPaneFrame';
import { useNavigate } from 'react-router-dom';
import { usePendingSaveGuard } from '@/hooks/usePendingSaveGuard';
import { usePersistedQuestionCursor } from '@/components/ruoe/hooks/usePersistedQuestionCursor';
import { Skeleton } from '@/components/ui/skeleton';

export const RuoELayoutCloze: React.FC<LayoutProps> = ({
  exerciseData,
  attemptId,
  onEvaluate,
  isEvaluated,
  evaluationResults,
  isEvaluating,
  evaluationData
}) => {
  const [activeQuestionId, setActiveQuestionId] = useState<number | null>(null);
  const [optimisticAnswers, setOptimisticAnswers] = useState<{[key: number]: string}>({});
  const [isCursorReady, setIsCursorReady] = useState<boolean>(false);
  const normalizedQuestionsRef = useRef<Set<number>>(new Set());
  const { snapshot: persistedCursor, setQuestionId: persistQuestionId, hydrated: cursorHydrated } = usePersistedQuestionCursor(attemptId);
  const hydrationLogRef = useRef(false);

  useEffect(() => {
    if (!cursorHydrated) {
      return;
    }
    const questions = exerciseData.questions;
    if (!questions || questions.length === 0) {
      setActiveQuestionId(null);
      persistQuestionId(null, null);
      setIsCursorReady(true);
      return;
    }

    const storedId = persistedCursor?.questionId ?? null;
    const storedIndex = typeof persistedCursor?.questionIndex === 'number'
      ? Math.min(Math.max(persistedCursor.questionIndex, 0), questions.length - 1)
      : null;

    let nextId: number | null = null;

    if (storedId != null && questions.some(q => q.id === storedId)) {
      nextId = storedId;
    } else if (storedIndex != null) {
      nextId = questions[storedIndex]?.id ?? null;
    }

    if (nextId == null) {
      nextId = questions[0]?.id ?? null;
    }

    if (nextId !== activeQuestionId) {
      setActiveQuestionId(nextId);
    }

    if (nextId == null) {
      persistQuestionId(null, null);
      setIsCursorReady(true);
      return;
    }

    const resolvedIndex = questions.findIndex(q => q.id === nextId);
    const snapshotId = persistedCursor?.questionId ?? null;
    const snapshotIndex = persistedCursor?.questionIndex ?? null;

    if (snapshotId !== nextId || snapshotIndex !== resolvedIndex) {
      persistQuestionId(nextId, resolvedIndex >= 0 ? resolvedIndex : null);
    }

    if (!hydrationLogRef.current && import.meta.env.DEV) {
      console.debug('[RUOE cursor] cloze hydration completed');
      hydrationLogRef.current = true;
    }

    setIsCursorReady(true);
  }, [exerciseData, persistedCursor, activeQuestionId, persistQuestionId, cursorHydrated, attemptId]);

  const letterToTextByQuestion = useMemo(() => {
    if (!exerciseData) return null;

    const mapping = new Map<number, Map<string, string>>();

    exerciseData.options.forEach((option) => {
      const questionId = option.question_id;
      if (!questionId) return;
      const letter = option.option_letter?.trim();
      const text = option.option_text?.trim();
      if (!letter || !text) return;

      const uppercaseLetter = letter.toUpperCase();
      const existing = mapping.get(questionId) ?? new Map<string, string>();
      const previous = existing.get(uppercaseLetter);

      // Prefer a longer, non-trivial replacement when duplicates exist.
      const isTrivial = !previous || previous.length <= 1;
      if (isTrivial || text.length > previous.length) {
        existing.set(uppercaseLetter, text);
      }

      mapping.set(questionId, existing);
    });

    return mapping;
  }, [exerciseData]);

  const getDisplayAnswer = useCallback((questionId: number, answer: string | null) => {
    if (!answer) return null;
    const trimmed = answer.trim();
    if (!trimmed || !letterToTextByQuestion) return trimmed;
    const lookup = letterToTextByQuestion.get(questionId);
    if (!lookup) return trimmed;
    const replacement = lookup.get(trimmed.toUpperCase());
    return replacement ?? trimmed;
  }, [letterToTextByQuestion]);

  const { userAnswers, updateAnswer, hasPendingChanges, isSaving, flushPendingSaves } = useAnswerTracking(
    attemptId,
    { readOnly: isEvaluated }
  );
  const navigate = useNavigate();
  usePendingSaveGuard(hasPendingChanges || isSaving);
  useEffect(() => {
    setActiveQuestionId(null);
    setOptimisticAnswers({});
    normalizedQuestionsRef.current.clear();
    hydrationLogRef.current = false;
    setIsCursorReady(false);
  }, [attemptId]);

  // Sync optimistic answers with userAnswers when they change
  useEffect(() => {
    setOptimisticAnswers(prev => ({ ...prev, ...userAnswers }));
  }, [userAnswers]);

  // Persist legacy letter-based answers using their normalized option text
  useEffect(() => {
    if (!attemptId || isEvaluated) return;
    if (!letterToTextByQuestion) return;
    if (!userAnswers || Object.keys(userAnswers).length === 0) return;

    const updates: Array<{ questionId: number; normalized: string }> = [];

    Object.entries(userAnswers).forEach(([key, value]) => {
      const questionId = Number(key);
      if (Number.isNaN(questionId)) return;
      const raw = typeof value === 'string' ? value.trim() : '';
      if (!raw) return;

      const lookup = letterToTextByQuestion.get(questionId);
      if (!lookup) return;

      const normalized = lookup.get(raw.toUpperCase());
      if (!normalized) return;

      // Skip if already normalized during this session or the values match
      if (normalized.trim() === raw.trim()) return;
      if (normalizedQuestionsRef.current.has(questionId) && userAnswers[questionId] === normalized) return;

      updates.push({ questionId, normalized });
    });

    if (updates.length === 0) return;

    const persistNormalizedAnswers = async () => {
      for (const { questionId, normalized } of updates) {
        normalizedQuestionsRef.current.add(questionId);

        setOptimisticAnswers(prev => {
          if (prev[questionId] === normalized) return prev;
          return { ...prev, [questionId]: normalized };
        });

        try {
          await updateAnswer(questionId, normalized);
        } catch (error) {
          console.error('Error normalizing legacy MC cloze answer');
          normalizedQuestionsRef.current.delete(questionId);
        }
      }
    };

    void persistNormalizedAnswers();
  }, [attemptId, isEvaluated, letterToTextByQuestion, updateAnswer, userAnswers]);

  const displayAnswers = useMemo(() => {
    if (!letterToTextByQuestion) {
      return optimisticAnswers;
    }

    const result: Record<number, string> = {};
    Object.entries(optimisticAnswers).forEach(([key, value]) => {
      const questionId = Number(key);
      if (!Number.isNaN(questionId)) {
        result[questionId] = typeof value === 'string'
          ? getDisplayAnswer(questionId, value) ?? ''
          : '';
      }
    });

    return Object.keys(result).length > 0 ? result : optimisticAnswers;
  }, [getDisplayAnswer, letterToTextByQuestion, optimisticAnswers]);

  // Wrapper: optimistic update + single persistence via hook (no duplicate save)
  const handleAnswerSaveWithOptimistic = async (questionId: number, answer: string) => {
    if (isEvaluated) {
      return;
    }
    setOptimisticAnswers(prev => ({ ...prev, [questionId]: answer }));
    await updateAnswer(questionId, answer);
  };

  const handleGapClick = (questionId: number) => {
    const index = exerciseData.questions.findIndex(q => q.id === questionId);
    if (index === -1) return;
    setActiveQuestionId(questionId);
    persistQuestionId(questionId, index);
    setIsCursorReady(true);
  };

  const handleAnswerChange = async (answer: string) => {
    if (isEvaluated) {
      return;
    }
    if (activeQuestionId) {
      setOptimisticAnswers(prev => ({ ...prev, [activeQuestionId]: answer }));
      await updateAnswer(activeQuestionId, answer);
      // onAnswerSave is not needed here; persistence handled by hook
    }
  };

  const handleEvaluate = async () => {
    try {
      const flushResult = await flushPendingSaves();
      if (flushResult === 'timeout') {
        console.warn('Evaluation proceeding with pending answers that did not finish syncing in time.');
      }
      await onEvaluate();
    } catch (error) {
      console.error('Error evaluating exercise:');
    }
  };

  const handleSaveAndBack = useCallback(async () => {
    const result = await flushPendingSaves(3000);
    if (result === 'flushed') {
      navigate('/dashboard');
      return;
    }
    // Timed out: allow leaving or cancel via simple confirm for now
    // In future, could replace with a nicer dialog
    const leave = window.confirm('Some answers are still syncing. Leave anyway?');
    if (leave) navigate('/dashboard');
  }, [flushPendingSaves, navigate]);

  if (!cursorHydrated || !isCursorReady) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <Skeleton className="h-12 w-12 rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-4">
      <ExamTwoPaneFrame
        left={(
          <ContentZone
            title={exerciseData.exercise.title}
            content={exerciseData.exercise.content_text}
            questions={exerciseData.questions}
            userAnswers={displayAnswers}
            onGapClick={handleGapClick}
            activeQuestionId={activeQuestionId}
            isEvaluated={isEvaluated}
            taskType={exerciseData.taskType.task_code}
            isEvaluating={isEvaluating}
            evaluationResults={evaluationResults}
            hasPendingChanges={hasPendingChanges}
            isSaving={isSaving}
            onSaveAndExit={handleSaveAndBack}
          />
        )}
        right={(
          <UnifiedRightPanel
            exerciseData={exerciseData}
            attemptId={attemptId}
            activeQuestionId={activeQuestionId}
            onGapClick={handleGapClick}
            userAnswers={optimisticAnswers}
            onAnswerSave={handleAnswerSaveWithOptimistic}
            isEvaluated={isEvaluated}
            evaluationResults={evaluationResults}
            onEvaluate={handleEvaluate}
            isEvaluating={isEvaluating}
            evaluationData={evaluationData}
            hasPendingChanges={hasPendingChanges}
            isSaving={isSaving}
            onSaveAndExit={handleSaveAndBack}
          />
        )}
      />
    </div>
  );
};
