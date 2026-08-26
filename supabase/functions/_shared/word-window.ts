import type { KeyWordTransformationExercise } from "./ruoe-types.ts";
import type { KeywordCueLevel } from "./keyword-cue-types.ts";
import { computeAnswerWordCount, getWordWindow } from "./keyword-cue-plan.ts";

export type WindowLevel = "B2" | "C1" | "C2";
const WINDOW_LEVELS: readonly WindowLevel[] = ["B2", "C1", "C2"] as const;

export function isWindowLevel(
  value: string | null | undefined,
): value is WindowLevel {
  if (!value) return false;
  return (WINDOW_LEVELS as readonly string[]).includes(value.toUpperCase());
}

export function collectWordWindowViolations(
  exercise: KeyWordTransformationExercise,
  levelCode: string | null | undefined,
): string[] {
  if (!exercise || !isWindowLevel(levelCode)) {
    return [];
  }
  const normalizedLevel = levelCode.toUpperCase() as KeywordCueLevel;
  const { minWords, maxWords } = getWordWindow(normalizedLevel);
  const violations: string[] = [];
  exercise.questions.forEach((question, index) => {
    const answers = Array.isArray(question.correctAnswers)
      ? question.correctAnswers
      : [];
    answers.forEach((answer) => {
      const wordCount = computeAnswerWordCount(answer);
      if (wordCount < minWords || wordCount > maxWords) {
        violations.push(
          `Q${
            index + 1
          } answer "${answer}" has ${wordCount} words; expected ${minWords}–${maxWords} for level ${normalizedLevel}`,
        );
      }
    });
  });
  return violations;
}
