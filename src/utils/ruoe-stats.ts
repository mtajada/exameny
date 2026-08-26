import { RuoEQuestion } from '@/types/ruoe';

export interface EvaluationStats {
  total: number;
  answered: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  percentage: number;
}

/**
 * Compute evaluation statistics in a single place to avoid duplication.
 * - correct: questions with a user answer AND evaluation true
 * - answered: questions with a non-empty user answer
 * - incorrect: answered - correct
 * - unanswered: total - answered
 */
export function computeEvaluationStats(
  questions: RuoEQuestion[],
  userAnswers: Readonly<Record<number, string>>,
  evaluationResults?: Readonly<Record<number, boolean>>
): EvaluationStats {
  const total = questions.length;
  const answered = questions.filter(q => {
    const a = userAnswers[q.id];
    return typeof a === 'string' && a.trim().length > 0;
  }).length;

  const correct = questions.filter(q => {
    const a = userAnswers[q.id];
    const hasAnswer = typeof a === 'string' && a.trim().length > 0;
    return hasAnswer && Boolean(evaluationResults?.[q.id]);
  }).length;

  const incorrect = Math.max(0, answered - correct);
  const unanswered = Math.max(0, total - answered);
  const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;

  return { total, answered, correct, incorrect, unanswered, percentage };
}
