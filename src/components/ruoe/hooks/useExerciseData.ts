import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/useAuth';
import { ExerciseData, UseExerciseDataReturn } from '@/types/ruoe';
import { buildDisplayOrder } from '@/utils/ruoe-question-order';
import type { Database } from '@/integrations/supabase/types';
import { RUOE_MISSING_EXERCISE_PLACEHOLDER } from '@/constants/ruoeRoutes';

type RuoeExerciseRow = Database['public']['Tables']['ruoe_exercises']['Row'];
type RuoeQuestionRow = Database['public']['Tables']['ruoe_questions']['Row'];
type RuoeOptionRow = Database['public']['Tables']['ruoe_options']['Row'];
type ExamTaskTypeRow = Database['public']['Tables']['exam_task_types']['Row'];

type RuoeQuestionWithOptions = RuoeQuestionRow & {
  ruoe_options?: RuoeOptionRow[] | null;
};

type RuoeExerciseQueryRow = RuoeExerciseRow & {
  ruoe_questions: RuoeQuestionWithOptions[] | null;
  exam_task_types: ExamTaskTypeRow | null;
};

export const useExerciseData = (exerciseId: string): UseExerciseDataReturn => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const isMissingPlaceholder = exerciseId === RUOE_MISSING_EXERCISE_PLACEHOLDER;
  const parsedExerciseId = useMemo(() => {
    if (isMissingPlaceholder) {
      return null;
    }
    const numericId = Number.parseInt(exerciseId, 10);
    return Number.isFinite(numericId) ? numericId : null;
  }, [exerciseId, isMissingPlaceholder]);

  const [exerciseData, setExerciseData] = useState<ExerciseData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const exerciseDataRef = useRef<ExerciseData | null>(null);
  // Tracks the dataset currently rendered so we can drop stale data during context switches.
  const dataContextRef = useRef<{ exerciseId: number | null; userId: string | null }>(
    { exerciseId: null, userId: null }
  );
  // Stores the in-flight request metadata to ignore late responses from prior contexts.
  const activeRequestRef = useRef<{
    requestId: number;
    exerciseId: number;
    userId: string;
  } | null>(null);
  const requestCounterRef = useRef(0);

  const fetchExerciseData = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      setError('Missing student authentication');
      exerciseDataRef.current = null;
      dataContextRef.current = { exerciseId: null, userId: null };
      setExerciseData(null);
      return;
    }

    if (parsedExerciseId === null) {
      setIsLoading(false);
      setError(
        isMissingPlaceholder
          ? 'This exercise is no longer available or you may no longer have access to it.'
          : 'Invalid exercise identifier.',
      );
      exerciseDataRef.current = null;
      dataContextRef.current = { exerciseId: null, userId: null };
      setExerciseData(null);
      return;
    }

    const contextChanged =
      dataContextRef.current.exerciseId !== parsedExerciseId ||
      dataContextRef.current.userId !== userId;

    if (contextChanged) {
      exerciseDataRef.current = null;
      dataContextRef.current = { exerciseId: null, userId: null };
      setExerciseData(null);
    }

    const shouldBlockUI = !exerciseDataRef.current;
    if (shouldBlockUI) {
      setIsLoading(true);
    }
    setError(null);
    const requestId = requestCounterRef.current + 1;
    requestCounterRef.current = requestId;
    const requestContext = {
      requestId,
      exerciseId: parsedExerciseId,
      userId,
    };
    activeRequestRef.current = requestContext;

    try {
      // Fetch exercise with related data using JOIN queries
      const { data, error: fetchError } = await supabase
        .from('ruoe_exercises')
        .select(`
          *,
          ruoe_questions (
            *,
            ruoe_options (*)
          ),
          exam_task_types (*)
        `)
        .eq('id', parsedExerciseId)
        .single();

      if (fetchError) {
        console.error('Error fetching exercise:');
        throw new Error(`Failed to load exercise: ${fetchError.message}`);
      }

      const exerciseRecord = data as RuoeExerciseQueryRow | null;

      if (!exerciseRecord) {
        throw new Error('Exercise not found or access denied');
      }

      // Validate that exercise belongs to user's academy (RLS should handle this, but extra check)
      if (!exerciseRecord.exam_task_types) {
        throw new Error('Exercise task type not found');
      }

      // Transform the data to match our ExerciseData interface
      const questionRecords = exerciseRecord.ruoe_questions ?? [];
      const allOptions: RuoeOptionRow[] = [];

      // Extract all options from questions
      questionRecords.forEach((question) => {
        if (question.ruoe_options) {
          allOptions.push(...question.ruoe_options);
        }
      });

      const baseQuestions = questionRecords.map((q) => ({
        id: q.id,
        exercise_id: q.exercise_id,
        order: q.order,
        question_text: q.question_text,
        correct_answers: q.correct_answers,
        explanation: q.explanation,
        original_sentence: q.original_sentence ?? null,
        transformation_sentence: q.transformation_sentence ?? null,
      }));

      const { ordered: orderedQuestions, lookup: displayOrderByQuestionId } = buildDisplayOrder(baseQuestions);

      // Ensure options maintain stable ordering per question and letter
      allOptions.sort((a, b) => {
        if (a.question_id !== b.question_id) {
          return a.question_id - b.question_id;
        }
        return a.option_letter.localeCompare(b.option_letter);
      });

      const transformedData: ExerciseData = {
        exercise: {
          id: exerciseRecord.id,
          task_type_id: exerciseRecord.task_type_id,
          academy_id: exerciseRecord.academy_id,
        author_id: exerciseRecord.author_id,
        title: exerciseRecord.title,
        content_text: exerciseRecord.content_text,
        is_public: exerciseRecord.is_public,
        created_at: exerciseRecord.created_at,
        updated_at: exerciseRecord.updated_at,
        teacher_theme: exerciseRecord.teacher_theme ?? null,
        teacher_skill_focus: exerciseRecord.teacher_skill_focus ?? null,
      },
        questions: orderedQuestions,
        options: allOptions,
        taskType: exerciseRecord.exam_task_types,
        displayOrderByQuestionId,
      };

      if (activeRequestRef.current?.requestId !== requestContext.requestId) {
        return;
      }

      exerciseDataRef.current = transformedData;
      dataContextRef.current = {
        exerciseId: requestContext.exerciseId,
        userId: requestContext.userId,
      };
      setExerciseData(transformedData);
    } catch (err: unknown) {
      if (activeRequestRef.current?.requestId !== requestContext.requestId) {
        return;
      }
      console.error('Error in useExerciseData:');
      const errorMessage = err instanceof Error ? err.message : 'Failed to load exercise data';
      setError(errorMessage);
      exerciseDataRef.current = null;
      dataContextRef.current = { exerciseId: null, userId: null };
      setExerciseData(null);
    } finally {
      const isLatestRequest = activeRequestRef.current?.requestId === requestContext.requestId;
      if (isLatestRequest && shouldBlockUI) {
        setIsLoading(false);
      }
    }
  }, [isMissingPlaceholder, parsedExerciseId, userId]);

  const refetch = useCallback(async () => {
    await fetchExerciseData();
  }, [fetchExerciseData]);

  useEffect(() => {
    fetchExerciseData();
  }, [fetchExerciseData]);

  return {
    exerciseData,
    isLoading,
    error,
    refetch,
  };
};
