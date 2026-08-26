import {
  ClarificationAnswerDetail,
  ClarificationAnswerStatus,
  ClarificationRequestContext,
  ClarificationQuestionContext,
  ExerciseData,
  EvaluationResult,
  RuoEOption,
  RuoEQuestion,
} from '@/types/ruoe';
import { findOptionByAnswerValue, isLetterBased } from '@/utils/ruoe-task-logic';

interface ClarificationContextParams {
  exerciseData: ExerciseData;
  question: RuoEQuestion;
  questionOptions: RuoEOption[];
  allOptions: RuoEOption[];
  taskCode: string;
  userAnswer: string | null | undefined;
  explanation: string | null | undefined;
  wasCorrect: boolean | null | undefined;
  evaluationData?: Readonly<EvaluationResult> | null | undefined;
}

const sanitize = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const isPlaceholderText = (value: string | null): boolean => {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return (
    normalized === 'sin explicación disponible' ||
    normalized === 'respuesta en blanco' ||
    normalized === 'respuesta incorrecta' ||
    normalized === 'no explanation available'
  );
};

const sanitizeNarrative = (value: string | null | undefined): string | null => {
  const cleaned = sanitize(value);
  if (!cleaned) return null;
  return isPlaceholderText(cleaned) ? null : cleaned;
};

const sanitizeFeedback = (value: string | null | undefined): string | null => {
  const cleaned = sanitizeNarrative(value);
  if (!cleaned) return null;
  const normalized = cleaned.toLowerCase();
  if (
    normalized === 'global option for exercise with shared option set.' ||
    normalized === 'global option for exercise with shared option set'
  ) {
    return null;
  }
  return cleaned;
};

const addUnique = (target: string[], note: string, compareAgainst?: string | null) => {
  const normalized = note.toLowerCase();
  if (compareAgainst && compareAgainst.toLowerCase() === normalized) {
    return;
  }
  if (target.some(item => item.toLowerCase() === normalized)) {
    return;
  }
  target.push(note);
};

const buildLetterMap = (options: RuoEOption[]): Map<string, string> => {
  const map = new Map<string, string>();
  for (const option of options) {
    const letter = sanitize(option.option_letter)?.toUpperCase();
    const text = sanitize(option.option_text);
    if (!letter || !text) continue;
    const current = map.get(letter);
    if (!current || text.length > current.length) {
      map.set(letter, text);
    }
  }
  return map;
};

const resolveOption = (
  taskCode: string,
  answer: string | null,
  questionOptions: RuoEOption[],
  fallbackOptions: RuoEOption[]
): RuoEOption | undefined => {
  if (!answer) return undefined;
  const normalized = answer.trim();
  if (!normalized) return undefined;
  const direct = findOptionByAnswerValue(taskCode, questionOptions, normalized);
  if (direct) return direct;
  return findOptionByAnswerValue(taskCode, fallbackOptions, normalized);
};

const buildAnswerDetail = (
  params: {
    taskCode: string;
    rawAnswer: string | null;
    questionOptions: RuoEOption[];
    allOptions: RuoEOption[];
    questionLetterMap: Map<string, string>;
    globalLetterMap: Map<string, string>;
  }
): ClarificationAnswerDetail => {
  const {
    taskCode,
    rawAnswer,
    questionOptions,
    allOptions,
    questionLetterMap,
    globalLetterMap,
  } = params;

  const normalized = sanitize(rawAnswer);
  const option = resolveOption(taskCode, normalized, questionOptions, allOptions);

  let letter = sanitize(option?.option_letter)?.toUpperCase() ?? null;
  let text = sanitize(option?.option_text);

  if (!letter && isLetterBased(taskCode) && normalized) {
    letter = normalized.toUpperCase();
  }

  if (letter) {
    const questionText = questionLetterMap.get(letter);
    const globalText = globalLetterMap.get(letter);
    const candidate = questionText || globalText;
    if (!text || text.length <= 1) {
      text = candidate ?? text;
    } else if (candidate && candidate.length > text.length) {
      text = candidate;
    }
  }

  if (!text && normalized && !isLetterBased(taskCode)) {
    text = normalized;
  }

  return {
    raw: rawAnswer ?? null,
    letter,
    text,
  };
};

const buildQuestionContext = (question: RuoEQuestion): ClarificationQuestionContext => ({
  questionId: question.id,
  order: question.order,
  displayOrder: question.displayOrder,
  questionText: question.question_text,
  originalSentence: question.original_sentence,
  transformationSentence: question.transformation_sentence,
});

export const buildClarificationContext = (
  params: ClarificationContextParams
): ClarificationRequestContext | null => {
  const {
    exerciseData,
    question,
    questionOptions,
    allOptions,
    taskCode,
    userAnswer,
    explanation,
    wasCorrect,
    evaluationData,
  } = params;

  if (!exerciseData || !question) {
    return null;
  }

  const questionLetterMap = buildLetterMap(questionOptions);
  const globalLetterMap = buildLetterMap(allOptions);

  const studentAnswerDetail = buildAnswerDetail({
    taskCode,
    rawAnswer: userAnswer ?? null,
    questionOptions,
    allOptions,
    questionLetterMap,
    globalLetterMap,
  });

  const correctAnswersSource = evaluationData?.correctAnswersData?.[question.id] ?? question.correct_answers ?? [];

  const correctAnswerDetails = (Array.isArray(correctAnswersSource) ? correctAnswersSource : [])
    .map((answer) => buildAnswerDetail({
      taskCode,
      rawAnswer: answer,
      questionOptions,
      allOptions,
      questionLetterMap,
      globalLetterMap,
    }))
    .filter((detail) => {
      return Boolean(detail.letter || detail.text || detail.raw);
    });

  const dedupedCorrectAnswers = Array.from(new Map(
    correctAnswerDetails.map((detail) => {
      const key = `${detail.letter ?? ''}::${detail.text ?? ''}::${detail.raw ?? ''}`;
      return [key, detail] as const;
    })
  ).values());

  const uniqueCorrectFeedbacks = Array.from(new Set(
    questionOptions
      .filter(option => option.is_correct)
      .map(option => sanitizeFeedback(option.feedback))
      .filter((note): note is string => Boolean(note))
  ));

  let primaryCorrectExplanation = sanitizeNarrative(explanation);
  const additionalCorrectNotes: string[] = [];

  if (!primaryCorrectExplanation && uniqueCorrectFeedbacks.length > 0) {
    primaryCorrectExplanation = uniqueCorrectFeedbacks[0];
    uniqueCorrectFeedbacks.slice(1).forEach(note => addUnique(additionalCorrectNotes, note));
  } else if (primaryCorrectExplanation) {
    uniqueCorrectFeedbacks.forEach(note => addUnique(additionalCorrectNotes, note, primaryCorrectExplanation));
  }

  const studentOption = resolveOption(taskCode, userAnswer ?? null, questionOptions, allOptions);
  const studentOptionFeedback = sanitizeFeedback(studentOption?.feedback);

  const normalizedAnswer = sanitize(userAnswer);
  let studentAnswerStatus: ClarificationAnswerStatus = 'blank';
  if (normalizedAnswer) {
    studentAnswerStatus = wasCorrect === true ? 'correct' : 'incorrect';
  }

  if (!primaryCorrectExplanation && additionalCorrectNotes.length > 0) {
    primaryCorrectExplanation = additionalCorrectNotes[0];
    additionalCorrectNotes.splice(0, 1);
  }

  return {
    taskCode,
    taskName: exerciseData.taskType.name ?? null,
    taskTypeId: exerciseData.taskType.id,
    levelId: exerciseData.taskType.level_id ?? null,
    examTypeId: exerciseData.taskType.exam_type_id ?? null,
    exerciseTitle: exerciseData.exercise.title ?? null,
    question: buildQuestionContext(question),
    studentAnswer: studentAnswerDetail,
    correctAnswers: dedupedCorrectAnswers,
    studentAnswerStatus,
    correctAnswerExplanation: primaryCorrectExplanation ?? null,
    correctAnswerAdditionalNotes: additionalCorrectNotes,
    incorrectAnswerFeedback: studentOptionFeedback,
    wasCorrect,
  };
};
