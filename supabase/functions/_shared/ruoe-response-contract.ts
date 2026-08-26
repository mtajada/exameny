import type { StrictJsonSchema } from "./openai-responses.ts";
import { validateRuoeExercise } from "./ruoe-service.ts";
import type { RUoEExercise } from "./ruoe-types.ts";

export type PublicExerciseLayout =
  | "ruoe-mc-cloze"
  | "ruoe-open-cloze"
  | "ruoe-word-formation"
  | "ruoe-keyword-transformation"
  | "ruoe-reading-mcq"
  | "ruoe-gapped-text"
  | "ruoe-multiple-matching"
  | "ruoe-cross-text";

type SchemaNode = Readonly<Record<string, unknown>>;

const nonEmptyString: SchemaNode = { type: "string", minLength: 1 };
const positiveInteger: SchemaNode = { type: "integer", minimum: 1 };

function object(properties: Readonly<Record<string, SchemaNode>>): SchemaNode {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

function array(items: SchemaNode, minItems = 1): SchemaNode {
  return { type: "array", items, minItems };
}

const answerList = array(nonEmptyString);

const multipleChoiceOption = object({
  letter: nonEmptyString,
  text: nonEmptyString,
  isCorrect: { type: "boolean" },
  feedback: nonEmptyString,
});

const simpleAnswerQuestion = object({
  questionNumber: positiveInteger,
  placeholder: nonEmptyString,
  correctAnswers: answerList,
});

const wordFormationQuestion = object({
  questionNumber: positiveInteger,
  placeholder: nonEmptyString,
  questionText: nonEmptyString,
  correctAnswers: answerList,
});

const transformationQuestion = object({
  questionNumber: positiveInteger,
  placeholder: nonEmptyString,
  questionText: nonEmptyString,
  originalSentence: nonEmptyString,
  transformationSentence: nonEmptyString,
  explanation: nonEmptyString,
  correctAnswers: answerList,
});

const mcqQuestion = object({
  questionNumber: positiveInteger,
  placeholder: nonEmptyString,
  options: array(multipleChoiceOption),
});

const readingMcqQuestion = object({
  questionNumber: positiveInteger,
  placeholder: nonEmptyString,
  questionText: nonEmptyString,
  options: array(multipleChoiceOption),
});

const matchingQuestion = object({
  questionNumber: positiveInteger,
  placeholder: nonEmptyString,
  questionText: nonEmptyString,
  explanation: nonEmptyString,
  correctAnswers: answerList,
});

const crossTextQuestion = object({
  questionNumber: positiveInteger,
  placeholder: nonEmptyString,
  questionText: nonEmptyString,
  correctAnswers: answerList,
});

const gappedOption = object({
  letter: nonEmptyString,
  text: nonEmptyString,
  isDistractor: { type: "boolean" },
});

const matchingOption = object({
  letter: nonEmptyString,
  text: nonEmptyString,
});

const crossText = object({
  letter: nonEmptyString,
  title: nonEmptyString,
  content: nonEmptyString,
});

function exerciseRoot(
  questionSchema: SchemaNode,
  extension: Readonly<Record<string, SchemaNode>> = {},
): StrictJsonSchema {
  return object({
    title: nonEmptyString,
    mainTextWithPlaceholders: nonEmptyString,
    questions: array(questionSchema),
    ...extension,
  }) as unknown as StrictJsonSchema;
}

const SCHEMAS: Readonly<Record<PublicExerciseLayout, StrictJsonSchema>> = {
  "ruoe-mc-cloze": exerciseRoot(mcqQuestion),
  "ruoe-open-cloze": exerciseRoot(simpleAnswerQuestion),
  "ruoe-word-formation": exerciseRoot(wordFormationQuestion),
  "ruoe-keyword-transformation": exerciseRoot(transformationQuestion),
  "ruoe-reading-mcq": exerciseRoot(readingMcqQuestion),
  "ruoe-gapped-text": exerciseRoot(simpleAnswerQuestion, {
    options: array(gappedOption),
  }),
  "ruoe-multiple-matching": exerciseRoot(matchingQuestion, {
    options: array(matchingOption),
  }),
  "ruoe-cross-text": exerciseRoot(crossTextQuestion, {
    texts: array(crossText),
  }),
};

export function getRuoeResponseSchema(
  layout: PublicExerciseLayout,
): StrictJsonSchema {
  return SCHEMAS[layout];
}

export function parseRuoeResponse(
  taskCode: string,
  value: unknown,
): RUoEExercise {
  const validation = validateRuoeExercise(taskCode, value);
  if (!validation.isValid || !validation.data) {
    throw new Error("Generated exercise failed the application contract");
  }
  return validation.data as RUoEExercise;
}
