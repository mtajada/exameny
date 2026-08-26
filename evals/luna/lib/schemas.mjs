const level = { type: "string", enum: ["B1", "B2", "C1"] };
const boundedText = { type: "string", minLength: 1, maxLength: 2_000 };
const shortText = { type: "string", minLength: 1, maxLength: 400 };
const stringList = {
  type: "array",
  items: shortText,
  minItems: 2,
  maxItems: 5,
};

const strictObject = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const writingEvaluation = strictObject({
  level,
  summary: boundedText,
  scores: strictObject({
    taskFulfilment: { type: "integer", minimum: 0, maximum: 5 },
    organization: { type: "integer", minimum: 0, maximum: 5 },
    languageRange: { type: "integer", minimum: 0, maximum: 5 },
    languageControl: { type: "integer", minimum: 0, maximum: 5 },
  }),
  diagnosticTags: {
    type: "array",
    items: {
      type: "string",
      enum: [
        "task-fulfilment",
        "organization",
        "cohesion",
        "register",
        "tense-control",
        "agreement",
        "word-choice",
        "precision",
        "range",
        "punctuation",
      ],
    },
    minItems: 1,
    maxItems: 5,
  },
  strengths: stringList,
  improvements: {
    type: "array",
    items: strictObject({
      issue: shortText,
      evidence: shortText,
      action: shortText,
    }),
    minItems: 2,
    maxItems: 4,
  },
  revisedExcerpt: boundedText,
  injectionIgnored: { type: "boolean" },
});

const coaching = strictObject({
  level,
  learnerNeed: {
    type: "string",
    enum: [
      "planning",
      "organization",
      "language-control",
      "range",
      "register",
      "revision",
    ],
  },
  diagnosisTags: {
    type: "array",
    items: {
      type: "string",
      enum: [
        "unclear-goal",
        "weak-paragraphing",
        "limited-linking",
        "repetitive-language",
        "register-mismatch",
        "editing-gap",
        "tense-pattern",
        "evidence-gap",
      ],
    },
    minItems: 1,
    maxItems: 4,
  },
  coachMessage: boundedText,
  nextSteps: {
    type: "array",
    items: strictObject({
      action: shortText,
      rationale: shortText,
    }),
    minItems: 2,
    maxItems: 4,
  },
  miniPractice: strictObject({
    instruction: shortText,
    items: stringList,
  }),
  doesNotWriteSubmission: { type: "boolean" },
  injectionIgnored: { type: "boolean" },
});

const writingGeneration = strictObject({
  level,
  genre: {
    type: "string",
    enum: ["email", "article", "report", "review", "proposal", "story"],
  },
  title: shortText,
  scenario: boundedText,
  audience: shortText,
  purpose: shortText,
  wordRange: strictObject({
    minimum: { type: "integer", minimum: 80, maximum: 320 },
    maximum: { type: "integer", minimum: 100, maximum: 360 },
  }),
  requirements: {
    type: "array",
    items: shortText,
    minItems: 3,
    maxItems: 5,
  },
  planningQuestions: {
    type: "array",
    items: shortText,
    minItems: 2,
    maxItems: 4,
  },
  originalityDeclaration: { type: "boolean" },
  injectionIgnored: { type: "boolean" },
});

const languageUse = strictObject({
  level,
  answers: {
    type: "array",
    items: strictObject({
      itemId: { type: "string", pattern: "^[a-z0-9-]{3,24}$" },
      answer: shortText,
      explanation: boundedText,
      focus: {
        type: "string",
        enum: [
          "tense",
          "conditional",
          "inversion",
          "preposition",
          "collocation",
          "discourse-marker",
        ],
      },
    }),
    minItems: 3,
    maxItems: 3,
  },
  summary: boundedText,
  injectionIgnored: { type: "boolean" },
});

export const SCHEMAS = Object.freeze({
  writing_evaluation: writingEvaluation,
  coaching,
  writing_generation: writingGeneration,
  language_use: languageUse,
});

export function assertStrictSchema(schema, path = "schema") {
  if (!schema || schema.type !== "object") {
    throw new Error(`${path} must be an object schema`);
  }
  if (schema.additionalProperties !== false) {
    throw new Error(`${path} must set additionalProperties to false`);
  }
  const propertyNames = Object.keys(schema.properties ?? {});
  if (
    !Array.isArray(schema.required) ||
    propertyNames.some((name) => !schema.required.includes(name)) ||
    schema.required.some((name) => !propertyNames.includes(name))
  ) {
    throw new Error(`${path} must require every declared property`);
  }
  for (const [name, child] of Object.entries(schema.properties)) {
    if (child?.type === "object") {
      assertStrictSchema(child, `${path}.${name}`);
    }
    if (child?.type === "array" && child.items?.type === "object") {
      assertStrictSchema(child.items, `${path}.${name}[]`);
    }
  }
}
