import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { UseAnswerTrackingReturn } from '@/types/ruoe';

export interface UseAnswerTrackingOptions {
  readOnly?: boolean;
  initialAnswers?: Record<number, string> | null;
}

export const useAnswerTracking = (
  attemptId: number | null,
  options: UseAnswerTrackingOptions = {},
): UseAnswerTrackingReturn => {
  const readOnly = options.readOnly ?? false;
  const initialAnswers = options.initialAnswers ?? null;
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [pendingAnswers, setPendingAnswers] = useState<Record<number, string>>({});
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const activeSavesCount = useRef(0);

  const loadExistingAnswers = useCallback(async () => {
    if (!attemptId) return;

    try {
      const { data, error } = await supabase
        .from('ruoe_user_answers')
        .select('question_id, user_answer')
        .eq('attempt_id', attemptId);

      if (error) {
        console.error('Error loading existing answers:');
        return;
      }

      const answers: Record<number, string> = {};
      data.forEach((answer) => {
        const raw = answer.user_answer;
        if (typeof raw === 'string') {
          answers[answer.question_id] = raw;
        }
      });

      setUserAnswers(answers);
    } catch (error) {
      console.error('Error in loadExistingAnswers:');
    }
  }, [attemptId]);

  // Load existing answers when attemptId changes
  useEffect(() => {
    if (attemptId) {
      loadExistingAnswers();
    }
  }, [attemptId, loadExistingAnswers]);

  useEffect(() => {
    if (!attemptId || !initialAnswers) {
      return;
    }
    setUserAnswers(initialAnswers);
    setPendingAnswers({});
  }, [attemptId, initialAnswers]);

  const updateAnswer = useCallback(async (questionId: number, answer: string) => {
    if (readOnly) {
      return;
    }

    if (!attemptId) {
      console.error('Cannot save answer: no attempt ID');
      return;
    }

    // Update local state immediately for responsive UI
    setUserAnswers(prev => ({
      ...prev,
      [questionId]: answer
    }));

    // Add to pending answers for auto-save
    setPendingAnswers(prev => ({
      ...prev,
      [questionId]: answer
    }));

    try {
      activeSavesCount.current += 1;
      setIsSaving(true);
      // Save to database
      const { error } = await supabase
        .from('ruoe_user_answers')
        .upsert({
          attempt_id: attemptId,
          question_id: questionId,
          user_answer: answer
        }, {
          onConflict: 'attempt_id, question_id'
        });

      if (error) {
        console.error('Error saving answer:');
        throw error;
      }

      // Remove from pending answers on successful save
      setPendingAnswers(prev => {
        const updated = { ...prev };
        delete updated[questionId];
        return updated;
      });

    } catch (error) {
      console.error('Error in updateAnswer:');
      // On error, revert local state
      setUserAnswers(prev => {
        const updated = { ...prev };
        delete updated[questionId];
        return updated;
      });
    } finally {
      activeSavesCount.current = Math.max(0, activeSavesCount.current - 1);
      if (activeSavesCount.current === 0) {
        setIsSaving(false);
      }
    }
  }, [attemptId, readOnly]);

  const hasPendingChanges = Object.keys(pendingAnswers).length > 0;

  const flushPendingSaves = useCallback(async (timeoutMs: number = 3000): Promise<'flushed' | 'timeout'> => {
    if (readOnly) {
      return 'flushed';
    }

    const start = Date.now();
    // Quick exit if nothing pending
    if (!hasPendingChanges && activeSavesCount.current === 0) return 'flushed';

    return new Promise((resolve) => {
      const interval = setInterval(() => {
        const elapsed = Date.now() - start;
        const stillPending = Object.keys(pendingAnswers).length > 0 || activeSavesCount.current > 0;
        if (!stillPending) {
          clearInterval(interval);
          resolve('flushed');
        } else if (elapsed >= timeoutMs) {
          clearInterval(interval);
          resolve('timeout');
        }
      }, 75);
    });
  }, [hasPendingChanges, pendingAnswers, readOnly]);

  return {
    userAnswers,
    updateAnswer,
    hasPendingChanges,
    isSaving,
    flushPendingSaves,
  };
};
