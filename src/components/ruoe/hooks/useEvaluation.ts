import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { UseEvaluationReturn, EvaluationResult, RuoEQuestion } from '@/types/ruoe';

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isBooleanRecord = (value: unknown): value is Record<number, boolean> =>
  isPlainRecord(value) && Object.values(value).every((entry) => typeof entry === 'boolean');

const isStringArrayRecord = (value: unknown): value is Record<number, string[]> =>
  isPlainRecord(value)
  && Object.values(value).every((entry) => Array.isArray(entry) && entry.every((item) => typeof item === 'string'));

const isStringRecord = (value: unknown): value is Record<number, string> =>
  isPlainRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');

const isEvaluationResult = (value: unknown): value is EvaluationResult => {
  if (!isPlainRecord(value)) {
    return false;
  }
  return isFiniteNumber(value.score)
    && isFiniteNumber(value.maxScore)
    && isFiniteNumber(value.scorePoints)
    && isFiniteNumber(value.maxScorePoints)
    && isFiniteNumber(value.pointsPerQuestion)
    && isFiniteNumber(value.totalQuestions)
    && isFiniteNumber(value.correctAnswers)
    && isBooleanRecord(value.questionResults)
    && isStringArrayRecord(value.correctAnswersData)
    && isStringRecord(value.explanations);
};

export const useEvaluation = (
  attemptId: number | null,
  questions: RuoEQuestion[]
): UseEvaluationReturn => {
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [evaluationResults, setEvaluationResults] = useState<Record<number, boolean>>({});
  const [score, setScore] = useState<number | null>(null);
  const [maxScore, setMaxScore] = useState<number | null>(null);

  const evaluateAnswers = useCallback(async (): Promise<EvaluationResult> => {
    if (!attemptId || questions.length === 0) {
      throw new Error('Cannot evaluate: missing attempt ID or questions');
    }

    setIsEvaluating(true);

    try {
      // Call the backend RPC function to evaluate the attempt
      const { data, error: evaluationError } = await supabase
        .rpc('evaluate_ruoe_attempt', { p_attempt_id: attemptId });

      if (evaluationError) {
        throw new Error(`Evaluation failed: ${evaluationError.message}`);
      }

      if (!data) {
        throw new Error('No evaluation data returned from server');
      }

      if (!isEvaluationResult(data)) {
        throw new Error('Invalid evaluation data returned from server');
      }
      const evaluation = data;

      // Update local state with evaluation results
      setEvaluationResults(evaluation.questionResults);
      setScore(evaluation.score);
      setMaxScore(evaluation.maxScore);

      return evaluation;

    } catch (error) {
      console.error('Error in evaluateAnswers:');
      throw error;
    } finally {
      setIsEvaluating(false);
    }
  }, [attemptId, questions]);

  return {
    evaluateAnswers,
    isEvaluating,
    evaluationResults,
    score,
    maxScore,
  };
};

// Helper function to normalize answers for comparison
const normalizeAnswer = (answer: string): string => {
  return answer.toLowerCase().trim().replace(/\s+/g, ' ');
};
