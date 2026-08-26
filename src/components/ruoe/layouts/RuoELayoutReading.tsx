import React, { useState, useCallback, useEffect, useRef } from 'react';
import { LayoutProps } from '@/types/ruoe';
import { useAnswerTracking } from '@/components/ruoe/hooks/useAnswerTracking';
import { ReadingContentZone } from '@/components/ruoe/zones/ReadingContentZone';
import { UnifiedRightPanel } from '@/components/ruoe/layouts/UnifiedRightPanel';
import ExamTwoPaneFrame from '@/components/ruoe/layouts/ExamTwoPaneFrame';
import { useNavigate } from 'react-router-dom';
import { usePendingSaveGuard } from '@/hooks/usePendingSaveGuard';
import { usePersistedQuestionCursor } from '@/components/ruoe/hooks/usePersistedQuestionCursor';
import { Skeleton } from '@/components/ui/skeleton';

export const RuoELayoutReading: React.FC<LayoutProps> = ({
  exerciseData,
  attemptId,
  onEvaluate,
  isEvaluated,
  evaluationResults,
  isEvaluating,
  evaluationData
}) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [isCursorReady, setIsCursorReady] = useState<boolean>(false);
  // Use optimistic tracking so UI reflects selections immediately
  const { userAnswers, updateAnswer, hasPendingChanges, isSaving, flushPendingSaves } = useAnswerTracking(
    attemptId,
    { readOnly: isEvaluated }
  );
  const navigate = useNavigate();
  usePendingSaveGuard(hasPendingChanges || isSaving);
  const { snapshot: persistedCursor, setQuestionIndex: persistQuestionIndex, hydrated: cursorHydrated } = usePersistedQuestionCursor(attemptId);
  const hasLoggedHydrationRef = useRef(false);

  useEffect(() => {
    if (!cursorHydrated) {
      return;
    }
    const questions = exerciseData.questions;
    if (!questions || questions.length === 0) {
      setIsCursorReady(true);
      return;
    }

    const storedIndex = typeof persistedCursor?.questionIndex === 'number'
      ? Math.min(Math.max(persistedCursor.questionIndex, 0), questions.length - 1)
      : null;
    const storedId = persistedCursor?.questionId ?? null;

    let nextIndex = storedIndex;

    if (storedId != null) {
      const matchIndex = questions.findIndex(q => q.id === storedId);
      if (matchIndex >= 0) {
        nextIndex = matchIndex;
      }
    }

    if (nextIndex == null) {
      nextIndex = 0;
    }

    if (nextIndex !== currentQuestionIndex) {
      setCurrentQuestionIndex(nextIndex);
    }

    const resolvedQuestionId = questions[nextIndex]?.id ?? null;
    if (resolvedQuestionId == null) {
      persistQuestionIndex(null, null);
      setIsCursorReady(true);
      return;
    }

    const snapshotIndex = persistedCursor?.questionIndex ?? null;
    const snapshotId = persistedCursor?.questionId ?? null;

    if (snapshotIndex !== nextIndex || snapshotId !== resolvedQuestionId) {
      persistQuestionIndex(nextIndex, resolvedQuestionId);
    }

    if (!hasLoggedHydrationRef.current && import.meta.env.DEV) {
      console.debug('[RUOE cursor] reading hydration completed');
      hasLoggedHydrationRef.current = true;
    }

    setIsCursorReady(true);
  }, [exerciseData, persistedCursor, currentQuestionIndex, persistQuestionIndex, cursorHydrated, attemptId]);

  const handleQuestionSelect = (index: number) => {
    const questions = exerciseData.questions;
    if (!questions || index < 0 || index >= questions.length) {
      return;
    }
    const question = questions[index];
    if (!question) return;
    setCurrentQuestionIndex(index);
    persistQuestionIndex(index, question.id);
    setIsCursorReady(true);
  };

  const handleGapClick = useCallback((questionId: number) => {
    const idx = exerciseData.questions.findIndex(q => q.id === questionId);
    if (idx >= 0) {
      setCurrentQuestionIndex(idx);
      persistQuestionIndex(idx, questionId);
      setIsCursorReady(true);
    }
  }, [exerciseData.questions, persistQuestionIndex]);

  // Optimistic save: updates local state and persists to DB via hook
  const handleAnswerSaveWithOptimistic = async (questionId: number, answer: string) => {
    if (isEvaluated) {
      return;
    }
    await updateAnswer(questionId, answer);
  };

  const handleEvaluate = useCallback(async () => {
    try {
      const flushResult = await flushPendingSaves();
      if (flushResult === 'timeout') {
        console.warn('Evaluation proceeding with pending answers that did not finish syncing in time.');
      }
      await onEvaluate();
    } catch (error) {
      console.error('Error evaluating exercise:');
    }
  }, [flushPendingSaves, onEvaluate]);

  const handleSaveAndBack = useCallback(async () => {
    const result = await flushPendingSaves(3000);
    if (result === 'flushed') {
      navigate('/dashboard');
      return;
    }
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
          <ReadingContentZone
            title={exerciseData.exercise.title}
            content={exerciseData.exercise.content_text}
            taskType={exerciseData.taskType.task_code}
            isEvaluated={isEvaluated}
            exerciseData={exerciseData}
            userAnswers={userAnswers}
            evaluationResults={evaluationResults}
            onGapClick={handleGapClick}
            hasPendingChanges={hasPendingChanges}
            isSaving={isSaving}
            onSaveAndExit={handleSaveAndBack}
          />
        )}
        right={(
          <UnifiedRightPanel
            exerciseData={exerciseData}
            attemptId={attemptId}
            currentQuestionIndex={currentQuestionIndex}
            onQuestionSelect={handleQuestionSelect}
            userAnswers={userAnswers}
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
