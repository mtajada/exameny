import { ClarificationAnswerDetail, ClarificationRequestContext } from '@/types/ruoe';

const normalize = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const equalsIgnoreCase = (a: string | null, b: string | null): boolean => {
  if (!a || !b) return false;
  return a.trim().toUpperCase() === b.trim().toUpperCase();
};

const formatAnswerDetail = (
  detail: ClarificationAnswerDetail,
  fallback: string
): string => {
  const letter = normalize(detail.letter);
  const text = normalize(detail.text);
  const raw = normalize(detail.raw);

  if (!letter && !text && !raw) {
    return fallback;
  }

  if (letter && text && !equalsIgnoreCase(letter, text)) {
    return `${letter} - ${text}`;
  }

  if (letter && raw && !equalsIgnoreCase(letter, raw) && (!text || equalsIgnoreCase(letter, text))) {
    return `${letter} - ${raw}`;
  }

  if (letter && (!text || equalsIgnoreCase(letter, text)) && !raw) {
    return `${letter}${text ? '' : ' (no associated text)'}`;
  }

  if (letter) {
    return `${letter}${text ? ` - ${text}` : raw ? ` - ${raw}` : ''}`.trim();
  }

  if (text) {
    return text;
  }

  if (raw) {
    return raw;
  }

  return fallback;
};

const formatCorrectAnswers = (
  answers: readonly ClarificationAnswerDetail[]
): string => {
  const formatted = answers
    .map((answer) => formatAnswerDetail(answer, ''))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return formatted.length > 0 ? formatted.join(', ') : '(no data available)';
};

const buildMetadataSuffix = (context: ClarificationRequestContext): string => {
  const segments: string[] = [];
  segments.push(`Code ${context.taskCode}`);
  if (context.levelId != null) {
    segments.push(`Level ${context.levelId}`);
  }
  if (context.examTypeId != null) {
    segments.push(`Exam ${context.examTypeId}`);
  }
  return segments.length > 0 ? ` (${segments.join(' | ')})` : '';
};

const buildQuestionContextLines = (context: ClarificationRequestContext): string[] => {
  const lines: string[] = [];
  const promptText = normalize(context.question.questionText);
  const originalSentence = normalize(context.question.originalSentence);
  const transformationSentence = normalize(context.question.transformationSentence);

  if (promptText) {
    lines.push(`Prompt: ${promptText}`);
  }

  if (originalSentence && !equalsIgnoreCase(originalSentence, promptText)) {
    lines.push(`Original sentence: ${originalSentence}`);
  }

  if (transformationSentence && !equalsIgnoreCase(transformationSentence, promptText)) {
    lines.push(`Transformation target: ${transformationSentence}`);
  }

  return lines;
};

export const buildClarificationPrompt = (
  context: ClarificationRequestContext
): string => {
  const taskLabel = context.taskName || context.taskCode;
  const taskLine = `Task: ${taskLabel}${buildMetadataSuffix(context)}`;
  const questionLine = `Question ${context.question.displayOrder}`;
  const exerciseLine = normalize(context.exerciseTitle) ? `Exercise: ${context.exerciseTitle?.trim()}` : null;

  const questionContextLines = buildQuestionContextLines(context);

  const studentAnswer = formatAnswerDetail(context.studentAnswer, '(blank response)');
  const correctAnswers = formatCorrectAnswers(context.correctAnswers);

  const lines: string[] = [taskLine, questionLine];
  if (exerciseLine) {
    lines.push(exerciseLine);
  }
  lines.push(...questionContextLines);
  lines.push('');
  lines.push(`Student answer: "${studentAnswer}"`);
  lines.push(`Accepted answer(s): ${correctAnswers}`);

  if (context.studentAnswerStatus === 'blank') {
    lines.push('Your answer was left blank.');
  } else if (context.studentAnswerStatus === 'correct') {
    lines.push('Your answer matches the accepted solution.');
  }

  if (context.correctAnswerExplanation || context.correctAnswerAdditionalNotes.length > 0) {
    lines.push('');
    lines.push('Correct answer insight:');
    if (context.correctAnswerExplanation) {
      lines.push(`- ${context.correctAnswerExplanation}`);
    }
    context.correctAnswerAdditionalNotes.forEach(note => {
      lines.push(`- ${note}`);
    });
  }

  if (context.studentAnswerStatus === 'incorrect' && context.incorrectAnswerFeedback) {
    lines.push('');
    lines.push('Why your answer may be incorrect:');
    lines.push(`- ${context.incorrectAnswerFeedback}`);
  }

  lines.push('');
  const requestLine = context.studentAnswerStatus === 'blank'
    ? 'Please explain the correct answer and outline how to approach this question.'
    : 'Please explain why my answer is incorrect compared to the correct one and share additional guidance.';
  lines.push(requestLine);

  return lines.join('\n');
};
