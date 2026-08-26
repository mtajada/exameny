import { collectWordWindowViolations } from "../_shared/word-window.ts";
import type { KeyWordTransformationExercise } from "../_shared/ruoe-types.ts";

function createExercise(answer: string): KeyWordTransformationExercise {
  return {
    title: "Test Exercise",
    mainTextWithPlaceholders: "Instructions here.",
    questions: [
      {
        questionNumber: 1,
        placeholder: "{{GAP_1}}",
        questionText: "TEST",
        originalSentence: "Original sentence.",
        transformationSentence: "Sentence _______ with gap.",
        correctAnswers: [answer],
        explanation: "Explanation.",
      },
    ],
  };
}

Deno.test("collectWordWindowViolations returns empty array for compliant answers", () => {
  const exercise = createExercise("ARE REQUIRED TO");
  const violations = collectWordWindowViolations(exercise, "C1");
  if (violations.length !== 0) {
    throw new Error(
      `Expected no violations, received ${violations.join(", ")}`,
    );
  }
});

Deno.test("collectWordWindowViolations flags answers outside the level window", () => {
  const exercise = createExercise("LIKELIHOOD THAT THE NEW POLICY WILL BE");
  const violations = collectWordWindowViolations(exercise, "C1");
  if (violations.length === 0) {
    throw new Error(
      "Expected a violation when answer length exceeds the C1 window.",
    );
  }
  if (!violations[0].includes("has 7 words")) {
    throw new Error(`Unexpected violation message: ${violations[0]}`);
  }
});
